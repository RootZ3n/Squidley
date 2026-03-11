// apps/api/src/http/routes/moreinput.ts
//
// More Input — context ingestion layer.
// Accepts uploads, analyzes them, optionally promotes to Archivum.

import type { FastifyInstance } from "fastify";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export interface MoreInputRouteOptions {
  zensquidRoot: string;
}

const UPLOADS_DIR = (root: string) => path.join(root, "data", "uploads");
const ARCHIVUM_DIR = (root: string) => path.join(root, "memory", "archivum");

function getOpenAIKey(): string {
  return (process.env.OPENAI_API_KEY ?? "").trim();
}

function getAnthropicKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim();
}

type FileCategory = "image" | "pdf" | "text" | "log" | "code" | "unknown";

function categorize(filename: string, mime: string): FileCategory {
  const ext = path.extname(filename).toLowerCase();
  if (mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"].includes(ext)) return "image";
  if (mime === "application/pdf" || ext === ".pdf") return "pdf";
  if ([".log", ".txt"].includes(ext) || mime === "text/plain") return ext === ".log" ? "log" : "text";
  if ([".ts", ".js", ".py", ".rs", ".go", ".cpp", ".json", ".yaml", ".toml", ".md"].includes(ext)) return "code";
  return "unknown";
}

async function analyzeImage(base64: string, mime: string, prompt: string): Promise<string> {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt || "Analyze this image. Tell me what app or UI this is, any visible errors, and the 3 most important things I should notice.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${base64}`,
                detail: "low",
              },
            },
          ],
        },
      ],
      max_completion_tokens: 1000,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI error ${res.status}`);
  return data.choices?.[0]?.message?.content ?? "No analysis returned.";
}

async function analyzeText(content: string, category: FileCategory, prompt: string): Promise<string> {
  const apiKey = getAnthropicKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const systemPrompt = category === "log"
    ? "You are a log analyst. Identify errors, warnings, and the most important events."
    : category === "code"
    ? "You are a code reviewer. Summarize what this code does, identify issues, and note anything important."
    : "You are a document analyst. Summarize the key points and most important information.";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_completion_tokens: 1000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: prompt
            ? `${prompt}\n\n---\n${content.slice(0, 8000)}`
            : `Analyze this ${category}:\n\n---\n${content.slice(0, 8000)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message ?? `Anthropic error ${res.status}`);
  return data.content?.[0]?.text ?? "No analysis returned.";
}

export async function registerMoreInputRoutes(
  app: FastifyInstance,
  opts: MoreInputRouteOptions
): Promise<void> {
  const { zensquidRoot } = opts;
  const uploadsDir = UPLOADS_DIR(zensquidRoot);
  const archivumDir = ARCHIVUM_DIR(zensquidRoot);

  await mkdir(uploadsDir, { recursive: true });
  await mkdir(archivumDir, { recursive: true });

  // POST /moreinput/analyze — upload + analyze a file
  app.post("/moreinput/analyze", async (req, reply) => {
    try {
      const body = req.body as any;
      const { filename, mime, data: base64Data, prompt } = body;

      if (!filename || !mime || !base64Data) {
        return reply.code(400).send({ error: "filename, mime, and data are required" });
      }

      const category = categorize(filename, mime);
      const uploadId = crypto.randomBytes(8).toString("hex");
      const uploadPath = path.join(uploadsDir, `${uploadId}_${filename}`);

      const buffer = Buffer.from(base64Data, "base64");
      await writeFile(uploadPath, buffer);

      let analysis = "";
      const startMs = Date.now();

      if (category === "image") {
        analysis = await analyzeImage(base64Data, mime, prompt ?? "");
      } else {
        const text = buffer.toString("utf8");
        analysis = await analyzeText(text, category, prompt ?? "");
      }

      const durationMs = Date.now() - startMs;

      return reply.send({
        ok: true,
        upload_id: uploadId,
        filename,
        category,
        analysis,
        duration_ms: durationMs,
        upload_path: uploadPath,
        size_bytes: buffer.length,
      });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message ?? "Analysis failed" });
    }
  });

  // POST /moreinput/promote — promote a temp upload to Archivum
  app.post("/moreinput/promote", async (req, reply) => {
    try {
      const body = req.body as any;
      const { upload_id, filename, category, analysis, tags, title } = body;

      if (!upload_id || !filename) {
        return reply.code(400).send({ error: "upload_id and filename are required" });
      }

      const uploadPath = path.join(uploadsDir, `${upload_id}_${filename}`);
      const archivumId = crypto.randomBytes(8).toString("hex");
      const entryDir = path.join(archivumDir, archivumId);
      await mkdir(entryDir, { recursive: true });

      let fileContent: Buffer;
      try {
        fileContent = await readFile(uploadPath);
        await writeFile(path.join(entryDir, filename), fileContent);
        await unlink(uploadPath).catch(() => {});
      } catch {
        return reply.code(404).send({ error: "Upload file not found — may have expired" });
      }

      const meta = {
        id: archivumId,
        filename,
        title: title || filename,
        category: category || "unknown",
        tags: tags || [],
        analysis: analysis || "",
        created_at: new Date().toISOString(),
        size_bytes: fileContent!.length,
      };
      await writeFile(path.join(entryDir, "meta.json"), JSON.stringify(meta, null, 2));

      return reply.send({ ok: true, archivum_id: archivumId, meta });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message ?? "Promotion failed" });
    }
  });

  // DELETE /moreinput/discard/:uploadId — clean up a temp upload
  app.delete("/moreinput/discard/:uploadId", async (req, reply) => {
    try {
      const { uploadId } = req.params as any;
      const { readdir } = await import("node:fs/promises");
      const uploadsEntries = await readdir(uploadsDir).catch(() => [] as string[]);
      const match = uploadsEntries.find((f: string) => f.startsWith(uploadId));
      if (match) {
        await unlink(path.join(uploadsDir, match)).catch(() => {});
      }
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
