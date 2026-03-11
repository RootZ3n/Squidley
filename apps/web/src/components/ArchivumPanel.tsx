// apps/web/src/components/ArchivumPanel.tsx
"use client";
import { useState, useEffect, useCallback } from "react";

const ZENSQUID_API = process.env.NEXT_PUBLIC_ZENSQUID_API ?? "http://100.78.201.54:18790";

type Category = "image" | "pdf" | "text" | "log" | "code" | "unknown";

interface ArchivumMeta {
  id: string; filename: string; title: string; category: Category;
  tags: string[]; analysis: string; created_at: string; size_bytes: number;
}

interface ArchivumEntry extends ArchivumMeta {
  content?: string; base64?: string;
}

const categoryColor: Record<Category, string> = {
  image: "100,200,255", pdf: "255,100,140", text: "80,220,160",
  log: "255,180,60", code: "180,100,255", unknown: "160,160,160",
};

const categoryIcon: Record<Category, string> = {
  image: "🖼️", pdf: "📄", text: "📝", log: "🪵", code: "💻", unknown: "📎",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function ArchivumPanel() {
  const [entries, setEntries] = useState<ArchivumMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [filterCat, setFilterCat] = useState<string>("");
  const [selected, setSelected] = useState<ArchivumEntry | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const panel: React.CSSProperties = {
    background: "rgba(10,10,20,0.95)", border: "1px solid rgba(100,200,255,0.2)",
    borderRadius: 12, padding: 24, color: "#e0e0e0", fontFamily: "monospace",
    maxWidth: 900, margin: "0 auto",
  };

  const btn = (color: string, disabled = false): React.CSSProperties => ({
    background: disabled ? "rgba(80,80,80,0.3)" : `rgba(${color},0.15)`,
    border: `1px solid rgba(${color},${disabled ? "0.2" : "0.5"})`,
    color: disabled ? "#666" : `rgb(${color})`,
    borderRadius: 6, padding: "5px 12px", cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "monospace", fontSize: 12, marginRight: 6,
  });

  const loadEntries = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const url = searchQ || filterCat
        ? `${ZENSQUID_API}/archivum/search?${searchQ ? `q=${encodeURIComponent(searchQ)}` : ""}${filterCat ? `&category=${filterCat}` : ""}`
        : `${ZENSQUID_API}/archivum`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setEntries(json.entries ?? json.results ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [searchQ, filterCat]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const openEntry = async (meta: ArchivumMeta) => {
    setLoadingEntry(true); setSelected(null);
    try {
      const res = await fetch(`${ZENSQUID_API}/archivum/${meta.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load entry");
      setSelected({ ...json.meta, content: json.content, base64: json.base64 });
      setTagInput(json.meta.tags?.join(", ") ?? "");
      setEditingTags(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingEntry(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry from Archivum permanently?")) return;
    setDeleting(id);
    try {
      await fetch(`${ZENSQUID_API}/archivum/${id}`, { method: "DELETE" });
      setEntries(e => e.filter(x => x.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleSaveTags = async () => {
    if (!selected) return;
    const tags = tagInput.split(",").map(t => t.trim()).filter(Boolean);
    await fetch(`${ZENSQUID_API}/archivum/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    setSelected(s => s ? { ...s, tags } : s);
    setEntries(e => e.map(x => x.id === selected.id ? { ...x, tags } : x));
    setEditingTags(false);
  };

  return (
    <div style={panel}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: "rgb(100,200,255)", margin: "0 0 4px 0", fontSize: 18 }}>📚 Archivum</h2>
        <p style={{ color: "#888", margin: 0, fontSize: 13 }}>Squidley's knowledge vault. Curated, searchable, inspectable.</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
          placeholder="Search title, tags, analysis..."
          style={{
            flex: 1, minWidth: 200, background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(100,200,255,0.2)", borderRadius: 6,
            padding: "7px 12px", color: "#e0e0e0", fontFamily: "monospace", fontSize: 13,
          }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(100,200,255,0.2)",
            borderRadius: 6, padding: "7px 10px", color: "#e0e0e0",
            fontFamily: "monospace", fontSize: 13,
          }}>
          <option value="">All types</option>
          <option value="image">🖼️ Images</option>
          <option value="pdf">📄 PDFs</option>
          <option value="text">📝 Text</option>
          <option value="log">🪵 Logs</option>
          <option value="code">💻 Code</option>
        </select>
        <button style={btn("100,200,255")} onClick={loadEntries}>↺ Refresh</button>
      </div>

      {error && (
        <div style={{
          background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)",
          borderRadius: 8, padding: 10, color: "rgb(255,120,120)", fontSize: 13, marginBottom: 12,
        }}>⚠️ {error}</div>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "0 0 300px", minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 32, color: "#555" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>🦑</div>
              <div style={{ fontSize: 12 }}>Loading...</div>
            </div>
          ) : entries.length === 0 ? (
            <div style={{
              textAlign: "center", padding: 32, color: "#444",
              border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8,
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 13 }}>Archivum is empty</div>
              <div style={{ fontSize: 11, marginTop: 4, color: "#333" }}>
                Analyze files in More Input and save them here
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {entries.map(entry => (
                <div key={entry.id} onClick={() => openEntry(entry)}
                  style={{
                    background: selected?.id === entry.id
                      ? `rgba(${categoryColor[entry.category]},0.1)`
                      : "rgba(255,255,255,0.03)",
                    border: `1px solid rgba(${categoryColor[entry.category]},${selected?.id === entry.id ? "0.5" : "0.2"})`,
                    borderRadius: 8, padding: "10px 12px", cursor: "pointer", transition: "all 0.15s",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{categoryIcon[entry.category]}</span>
                    <span style={{
                      color: `rgb(${categoryColor[entry.category]})`, fontSize: 13, fontWeight: "bold",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                    }}>{entry.title}</span>
                  </div>
                  <div style={{ color: "#555", fontSize: 11 }}>
                    {formatBytes(entry.size_bytes)} · {new Date(entry.created_at).toLocaleDateString()}
                  </div>
                  {entry.tags.length > 0 && (
                    <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {entry.tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{
                          background: `rgba(${categoryColor[entry.category]},0.1)`,
                          border: `1px solid rgba(${categoryColor[entry.category]},0.2)`,
                          borderRadius: 3, padding: "1px 5px", fontSize: 10,
                          color: `rgba(${categoryColor[entry.category]},0.8)`,
                        }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {loadingEntry && (
            <div style={{ textAlign: "center", padding: 32, color: "#555" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>🦑</div>
              <div style={{ fontSize: 12 }}>Loading entry...</div>
            </div>
          )}

          {!loadingEntry && !selected && (
            <div style={{
              textAlign: "center", padding: 48, color: "#333",
              border: "1px dashed rgba(255,255,255,0.05)", borderRadius: 8,
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>👈</div>
              <div style={{ fontSize: 13 }}>Select an entry to view</div>
            </div>
          )}

          {!loadingEntry && selected && (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid rgba(${categoryColor[selected.category]},0.25)`,
              borderRadius: 10, padding: 16,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ color: `rgb(${categoryColor[selected.category]})`, fontSize: 15, fontWeight: "bold", marginBottom: 2 }}>
                    {categoryIcon[selected.category]} {selected.title}
                  </div>
                  <div style={{ color: "#555", fontSize: 11 }}>
                    {selected.filename} · {formatBytes(selected.size_bytes)} · {formatDate(selected.created_at)}
                  </div>
                </div>
                <button style={btn("255,100,140", deleting === selected.id)}
                  onClick={() => handleDelete(selected.id)} disabled={deleting === selected.id}>
                  🗑️ Delete
                </button>
              </div>

              <div style={{ marginBottom: 12 }}>
                {!editingTags ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {selected.tags.length > 0
                      ? selected.tags.map(tag => (
                        <span key={tag} style={{
                          background: `rgba(${categoryColor[selected.category]},0.1)`,
                          border: `1px solid rgba(${categoryColor[selected.category]},0.2)`,
                          borderRadius: 3, padding: "2px 7px", fontSize: 11,
                          color: `rgba(${categoryColor[selected.category]},0.8)`,
                        }}>{tag}</span>
                      ))
                      : <span style={{ color: "#444", fontSize: 12 }}>No tags</span>
                    }
                    <button style={btn("160,160,160")} onClick={() => setEditingTags(true)}>✏️ Edit tags</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                      placeholder="tag1, tag2, tag3..."
                      style={{
                        flex: 1, background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(100,200,255,0.2)", borderRadius: 5,
                        padding: "5px 10px", color: "#e0e0e0", fontFamily: "monospace", fontSize: 12,
                      }} />
                    <button style={btn("80,220,160")} onClick={handleSaveTags}>Save</button>
                    <button style={btn("160,160,160")} onClick={() => setEditingTags(false)}>Cancel</button>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#666", fontSize: 11, marginBottom: 6 }}>SQUIDLEY ANALYSIS</div>
                <div style={{
                  background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: 12, fontSize: 13,
                  lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#d0d0d0",
                  maxHeight: 200, overflowY: "auto",
                }}>
                  {selected.analysis || "No analysis recorded."}
                </div>
              </div>

              {selected.base64 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: "#666", fontSize: 11, marginBottom: 6 }}>PREVIEW</div>
                  <img src={`data:image/png;base64,${selected.base64}`} alt={selected.filename}
                    style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 6, objectFit: "contain" }} />
                </div>
              )}

              {selected.content && (
                <div>
                  <div style={{ color: "#666", fontSize: 11, marginBottom: 6 }}>CONTENT</div>
                  <pre style={{
                    background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: 12, fontSize: 11,
                    lineHeight: 1.5, color: "#aaa", overflowX: "auto", overflowY: "auto",
                    maxHeight: 300, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {selected.content}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
