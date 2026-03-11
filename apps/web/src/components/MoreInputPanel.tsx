// apps/web/src/components/MoreInputPanel.tsx
"use client";
import { useState, useRef, useCallback } from "react";

const ZENSQUID_API = process.env.NEXT_PUBLIC_ZENSQUID_API ?? "http://100.78.201.54:18790";

type Category = "image" | "pdf" | "text" | "log" | "code" | "unknown";

interface AnalysisResult {
  upload_id: string;
  filename: string;
  category: Category;
  analysis: string;
  duration_ms: number;
  size_bytes: number;
  base64?: string;
  mime?: string;
}

const categoryColor: Record<Category, string> = {
  image: "100,200,255", pdf: "255,100,140", text: "80,220,160",
  log: "255,180,60", code: "180,100,255", unknown: "160,160,160",
};

const categoryIcon: Record<Category, string> = {
  image: "🖼️", pdf: "📄", text: "📝", log: "🪵", code: "💻", unknown: "📎",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function MoreInputPanel() {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoted, setPromoted] = useState(false);
  const [promotionTitle, setPromotionTitle] = useState("");
  const [promotionTags, setPromotionTags] = useState("");
  const [showPromoteForm, setShowPromoteForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const panel: React.CSSProperties = {
    background: "rgba(10,10,20,0.95)", border: "1px solid rgba(100,200,255,0.2)",
    borderRadius: 12, padding: 24, color: "#e0e0e0", fontFamily: "monospace",
    maxWidth: 800, margin: "0 auto",
  };

  const btn = (color: string, disabled = false): React.CSSProperties => ({
    background: disabled ? "rgba(80,80,80,0.3)" : `rgba(${color},0.15)`,
    border: `1px solid rgba(${color},${disabled ? "0.2" : "0.5"})`,
    color: disabled ? "#666" : `rgb(${color})`,
    borderRadius: 6, padding: "6px 14px", cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "monospace", fontSize: 13, marginRight: 8,
  });

  const processFile = useCallback(async (file: File) => {
    setLoading(true); setError(null); setResult(null);
    setPromoted(false); setShowPromoteForm(false);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(`${ZENSQUID_API}/moreinput/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name, mime: file.type || "application/octet-stream",
          data: base64, prompt: prompt.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult({
        ...json,
        base64: file.type.startsWith("image/") ? base64 : undefined,
        mime: file.type,
      });
      setPromotionTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (err: any) {
      setError(err.message ?? "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [prompt]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  const handleDiscard = async () => {
    if (!result) return;
    await fetch(`${ZENSQUID_API}/moreinput/discard/${result.upload_id}`, { method: "DELETE" });
    setResult(null); setPrompt("");
  };

  const handlePromote = async () => {
    if (!result) return;
    setPromoting(true);
    try {
      const tags = promotionTags.split(",").map(t => t.trim()).filter(Boolean);
      const res = await fetch(`${ZENSQUID_API}/moreinput/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          upload_id: result.upload_id, filename: result.filename,
          category: result.category, analysis: result.analysis,
          title: promotionTitle || result.filename, tags,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Promotion failed");
      setPromoted(true); setShowPromoteForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div style={panel}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: "rgb(100,200,255)", margin: "0 0 4px 0", fontSize: 18 }}>📥 More Input</h2>
        <p style={{ color: "#888", margin: 0, fontSize: 13 }}>
          Give Squidley more context — screenshots, documents, logs, code. Analyze now, save to Archivum later.
        </p>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="Optional: tell Squidley what to focus on..."
          style={{
            width: "100%", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(100,200,255,0.2)", borderRadius: 6,
            padding: "8px 12px", color: "#e0e0e0", fontFamily: "monospace",
            fontSize: 13, boxSizing: "border-box",
          }} />
      </div>

      <div
        style={{
          border: `2px dashed rgba(100,200,255,${dragging ? "0.8" : "0.3"})`,
          borderRadius: 10, padding: "40px 20px", textAlign: "center" as const,
          background: dragging ? "rgba(100,200,255,0.05)" : "rgba(255,255,255,0.02)",
          cursor: "pointer", transition: "all 0.2s", marginBottom: 16,
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
        <div style={{ color: "rgba(100,200,255,0.8)", fontSize: 14, marginBottom: 4 }}>
          Drop a file here or click to browse
        </div>
        <div style={{ color: "#555", fontSize: 12 }}>Images · PDFs · Text · Logs · Code · Screenshots</div>
        <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFileChange}
          accept="image/*,.pdf,.txt,.log,.md,.ts,.js,.py,.rs,.go,.json,.yaml,.toml" />
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 24, color: "rgba(100,200,255,0.7)" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🦑</div>
          <div style={{ fontSize: 13 }}>Analyzing...</div>
        </div>
      )}

      {error && (
        <div style={{
          background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)",
          borderRadius: 8, padding: 12, color: "rgb(255,120,120)", fontSize: 13, marginBottom: 12,
        }}>⚠️ {error}</div>
      )}

      {result && !loading && (
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: `1px solid rgba(${categoryColor[result.category]},0.3)`,
          borderRadius: 10, padding: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>{categoryIcon[result.category]}</span>
            <div>
              <div style={{ color: `rgb(${categoryColor[result.category]})`, fontSize: 14, fontWeight: "bold" }}>
                {result.filename}
              </div>
              <div style={{ color: "#555", fontSize: 11 }}>
                {result.category} · {formatBytes(result.size_bytes)} · {result.duration_ms}ms
              </div>
            </div>
          </div>

          {result.base64 && result.mime && (
            <img src={`data:${result.mime};base64,${result.base64}`} alt={result.filename}
              style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 6, marginBottom: 12, objectFit: "contain" }} />
          )}

          <div style={{
            background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: 12, fontSize: 13,
            lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 12, color: "#d0d0d0",
          }}>
            {result.analysis}
          </div>

          {promoted && (
            <div style={{
              background: "rgba(80,220,160,0.1)", border: "1px solid rgba(80,220,160,0.3)",
              borderRadius: 6, padding: 10, color: "rgb(80,220,160)", fontSize: 13, marginBottom: 12,
            }}>✅ Saved to Archivum</div>
          )}

          {showPromoteForm && !promoted && (
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(80,220,160,0.2)",
              borderRadius: 8, padding: 12, marginBottom: 12,
            }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Save to Archivum</div>
              <input type="text" value={promotionTitle} onChange={e => setPromotionTitle(e.target.value)}
                placeholder="Title..."
                style={{
                  width: "100%", background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(80,220,160,0.2)", borderRadius: 5,
                  padding: "6px 10px", color: "#e0e0e0", fontFamily: "monospace",
                  fontSize: 12, marginBottom: 8, boxSizing: "border-box",
                }} />
              <input type="text" value={promotionTags} onChange={e => setPromotionTags(e.target.value)}
                placeholder="Tags (comma separated)..."
                style={{
                  width: "100%", background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(80,220,160,0.2)", borderRadius: 5,
                  padding: "6px 10px", color: "#e0e0e0", fontFamily: "monospace",
                  fontSize: 12, marginBottom: 8, boxSizing: "border-box",
                }} />
              <button style={btn("80,220,160", promoting)} onClick={handlePromote} disabled={promoting}>
                {promoting ? "Saving..." : "✅ Confirm Save"}
              </button>
              <button style={btn("160,160,160")} onClick={() => setShowPromoteForm(false)}>Cancel</button>
            </div>
          )}

          {!promoted && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!showPromoteForm && (
                <button style={btn("80,220,160")} onClick={() => setShowPromoteForm(true)}>
                  📚 Save to Archivum
                </button>
              )}
              <button style={btn("255,100,140")} onClick={handleDiscard}>🗑️ Discard</button>
              <button style={btn("100,200,255")} onClick={() => { setResult(null); setPrompt(""); }}>
                ↩ Analyze Another
              </button>
            </div>
          )}

          {promoted && (
            <button style={btn("100,200,255")} onClick={() => { setResult(null); setPrompt(""); setPromoted(false); }}>
              ↩ Analyze Another
            </button>
          )}
        </div>
      )}
    </div>
  );
}
