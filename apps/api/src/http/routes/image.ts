// apps/api/src/http/routes/image.ts
//
// Image generation endpoint with 3-iteration VL feedback loop.
// Pipeline: generate → qwen3-vl describes → gpt-5-mini QC scores → refine or accept
// Human in the loop: after each accepted iteration, caller can send feedback to continue.

import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const COMFYUI_URL = (process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/+$/, "");
const OLLAMA_URL = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
const COMFYUI_OUTPUT_DIR = process.env.COMFYUI_OUTPUT_DIR ?? "/media/zen/AI/comfyui/output";
const CHECKPOINT = process.env.COMFYUI_CHECKPOINT ?? "sd_xl_base_1.0.safetensors";
const VL_MODEL = process.env.SQUIDLEY_VL_MODEL ?? "qwen3-vl:8b";
const PROMPT_MODEL = process.env.SQUIDLEY_PROMPT_MODEL ?? "qwen2.5:14b-instruct";

function adminTokenOk(req: any): boolean {
  const expected = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
  if (expected.length < 12) return false;
  const got = String(req.headers?.["x-zensquid-admin-token"] ?? "");
  if (got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch { return false; }
}

// ── ComfyUI helpers ───────────────────────────────────────────────────────────

async function comfyuiReady(): Promise<boolean> {
  try {
    const r = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(3_000) });
    return r.ok;
  } catch { return false; }
}

function buildSdxlWorkflow(prompt: string, negative: string, seed: number, steps: number, outputPrefix: string) {
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CHECKPOINT } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
    "5": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], seed, steps, cfg: 7.0, sampler_name: "euler", scheduler: "normal", denoise: 1.0 } },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: outputPrefix } },
  };
}

async function generateImage(prompt: string, negative: string, seed: number, steps: number, outputPrefix: string): Promise<string> {
  const workflow = buildSdxlWorkflow(prompt, negative, seed, steps, outputPrefix);
  const submitResp = await fetch(`${COMFYUI_URL}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!submitResp.ok) throw new Error(`ComfyUI submit failed: ${submitResp.status}`);
  const { prompt_id } = await submitResp.json() as any;
  if (!prompt_id) throw new Error("No prompt_id returned");

  // Poll for completion
  const maxWait = 4 * 60_000;
  const started = Date.now();
  while (Date.now() - started < maxWait) {
    await new Promise(r => setTimeout(r, 2_000));
    const histResp = await fetch(`${COMFYUI_URL}/history/${prompt_id}`, { signal: AbortSignal.timeout(5_000) });
    if (!histResp.ok) continue;
    const hist = await histResp.json() as any;
    const entry = hist[prompt_id];
    if (!entry?.outputs) continue;
    for (const nodeOut of Object.values(entry.outputs) as any[]) {
      if (nodeOut?.images?.[0]?.filename) return nodeOut.images[0].filename;
    }
  }
  throw new Error("Timed out waiting for ComfyUI output");
}

// ── VL description ────────────────────────────────────────────────────────────

async function describeImage(imagePath: string): Promise<string> {
  // Fetch image from ComfyUI remote rather than reading local disk
  const filename = imagePath.split("/").pop()!;
  const viewResp = await fetch(`${COMFYUI_URL}/view?filename=${encodeURIComponent(filename)}`, { signal: AbortSignal.timeout(15_000) });
  if (!viewResp.ok) throw new Error(`ComfyUI /view failed: ${viewResp.status}`);
  const imageData = Buffer.from(await viewResp.arrayBuffer());
  const base64 = imageData.toString("base64");

  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: VL_MODEL,
      messages: [{
        role: "user",
        content: "Describe this image concisely and objectively. Focus on: subject, colors, composition, style, and any notable details or problems. Be specific.",
        images: [base64],
      }],
      stream: false,
      options: { temperature: 0.1, num_predict: 300 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`VL model failed: ${resp.status}`);
  const data = await resp.json() as any;
  return String(data?.message?.content ?? "").trim();
}

// ── QC scoring ────────────────────────────────────────────────────────────────

async function qcScore(intent: string, description: string, prompt: string): Promise<{ pass: boolean; notes: string; refined_prompt?: string }> {
  let apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    const keyFile = (process.env.OPENAI_API_KEY_FILE ?? "").trim();
    if (keyFile) {
      try { apiKey = (await fs.readFile(keyFile, "utf8")).trim(); } catch {}
    }
  }

  const useOpenAI = apiKey.length > 10;
  const systemPrompt = `You are a QC judge for AI-generated images. Given the original intent, what was actually generated, and the prompt used, decide if the image meets the intent.
Respond in JSON only: {"pass": true/false, "notes": "brief explanation", "refined_prompt": "improved prompt if pass is false, omit if pass is true"}`;

  const userMsg = `Intent: ${intent}\nActual description: ${description}\nPrompt used: ${prompt}`;

  if (useOpenAI) {
    const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) throw new Error(`QC model failed: ${resp.status}`);
    const data = await resp.json() as any;
    const content = String(data?.choices?.[0]?.message?.content ?? "{}");
    return JSON.parse(content);
  } else {
    // Fallback: local prompt refinement model
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: PROMPT_MODEL,
        system: systemPrompt,
        prompt: userMsg,
        stream: false,
        format: "json",
        options: { temperature: 0.2, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) throw new Error(`QC fallback model failed: ${resp.status}`);
    const data = await resp.json() as any;
    return JSON.parse(String(data?.response ?? "{}"));
  }
}

// ── Prompt refinement ─────────────────────────────────────────────────────────

async function refinePrompt(originalPrompt: string, intent: string, vlDescription: string, userFeedback: string, qcNotes: string): Promise<string> {
  const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: PROMPT_MODEL,
      prompt: `You are an expert Stable Diffusion prompt engineer. Rewrite the prompt to better match the intent.

Original prompt: ${originalPrompt}
Intent: ${intent}
What was generated: ${vlDescription}
QC notes: ${qcNotes}
User feedback: ${userFeedback || "none"}

Rules:
- Keep what worked
- Fix what didn't match
- Be specific and descriptive
- No explanations — output ONLY the new prompt text`,
      stream: false,
      options: { temperature: 0.3, num_predict: 200 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`Prompt refinement failed: ${resp.status}`);
  const data = await resp.json() as any;
  return String(data?.response ?? originalPrompt).trim();
}

// ── Route registration ────────────────────────────────────────────────────────

export async function registerImageRoutes(app: FastifyInstance) {

  // POST /image/generate
  // Runs the full 3-iteration VL feedback loop
  app.post("/image/generate", async (req, reply) => {


    const body = (req.body ?? {}) as any;
    const initialPrompt = String(body.prompt ?? "").trim();
    const negative = String(body.negative ?? "blurry, bad anatomy, watermark, tiling, multiple subjects, text, logo").trim();
    const intent = String(body.intent ?? initialPrompt).trim();
    const userFeedback = String(body.feedback ?? "").trim();
    const maxIterations = Math.min(5, Math.max(1, parseInt(String(body.max_iterations ?? "3"), 10)));
    const steps = Math.min(50, Math.max(1, parseInt(String(body.steps ?? "20"), 10)));
    const baseSeed = parseInt(String(body.seed ?? String(Math.floor(Math.random() * 2 ** 32))), 10);
    const outputBase = String(body.output ?? "squidley_gen").replace(/[^a-zA-Z0-9_\-]/g, "_");

    if (!initialPrompt) return reply.code(400).send({ ok: false, error: "prompt required" });

    if (!(await comfyuiReady())) {
      return reply.code(503).send({ ok: false, error: "ComfyUI is not running — use comfyui.start first" });
    }

    const iterations: Array<{
      n: number;
      prompt: string;
      file: string;
      vl_description: string;
      qc_pass: boolean;
      qc_notes: string;
      elapsed_ms: number;
    }> = [];

    let currentPrompt = initialPrompt;
    let finalFile = "";

    for (let n = 1; n <= maxIterations; n++) {
      const iterStart = Date.now();
      const seed = baseSeed + (n - 1); // vary seed each iteration
      const outputPrefix = `${outputBase}_iter${n}`;

      try {
        // Step 1: Generate
        const filename = await generateImage(currentPrompt, negative, seed, steps, outputPrefix);
        const filePath = path.join(COMFYUI_OUTPUT_DIR, filename);
        finalFile = path.basename(filePath);

        // Step 2: VL description
        const vlDescription = await describeImage(filePath);

        // Step 3: QC scoring
        const qc = await qcScore(intent, vlDescription, currentPrompt);

        iterations.push({
          n,
          prompt: currentPrompt,
          file: path.basename(filePath),
          vl_description: vlDescription,
          qc_pass: qc.pass,
          qc_notes: qc.notes,
          elapsed_ms: Date.now() - iterStart,
        });

        // Accept if QC passes or last iteration
        if (qc.pass || n === maxIterations) {
          break;
        }

        // Step 4: Refine prompt for next iteration
        currentPrompt = qc.refined_prompt
          ?? await refinePrompt(currentPrompt, intent, vlDescription, userFeedback, qc.notes);

      } catch (e: any) {
        return reply.code(500).send({
          ok: false,
          error: `Iteration ${n} failed: ${String(e?.message ?? e)}`,
          iterations,
        });
      }
    }

    const lastIter = iterations[iterations.length - 1];
    return reply.send({
      ok: true,
      file: finalFile,
      final_prompt: currentPrompt,
      intent,
      iterations,
      total_iterations: iterations.length,
      qc_passed: lastIter?.qc_pass ?? false,
      seed: baseSeed,
    });
  });

  // GET /image/output/:filename — proxy from ComfyUI remote
  app.get("/image/output/:filename", async (req, reply) => {
    const { filename } = req.params as any;
    const safe = path.basename(filename);
    if (!safe.endsWith(".png") && !safe.endsWith(".jpg") && !safe.endsWith(".webp")) {
      return reply.code(400).send({ ok: false, error: "Invalid filename" });
    }
    try {
      const viewResp = await fetch(`${COMFYUI_URL}/view?filename=${encodeURIComponent(safe)}`, { signal: AbortSignal.timeout(15_000) });
      if (!viewResp.ok) return reply.code(404).send({ ok: false, error: "Image not found on ComfyUI remote" });
      const contentType = viewResp.headers.get("content-type") ?? "image/png";
      const data = Buffer.from(await viewResp.arrayBuffer());
      return reply.type(contentType).send(data);
    } catch (e: any) {
      return reply.code(502).send({ ok: false, error: `ComfyUI proxy failed: ${String(e?.message ?? e)}` });
    }
  });

  // GET /image/list — list recent generated images
  app.get("/image/list", async (req, reply) => {

    try {
      const files = await fs.readdir(COMFYUI_OUTPUT_DIR);
      const images = files
        .filter(f => f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".webp"))
        .sort()
        .reverse()
        .slice(0, 50)
        .map(f => ({ filename: f, url: `/image/output/${f}` }));
      return reply.send({ ok: true, images });
    } catch {
      return reply.send({ ok: true, images: [] });
    }
  });
}
