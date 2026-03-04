// apps/web/app/components/BuildPanel.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ZENSQUID_API } from "@/api/zensquid";

// ── Types ─────────────────────────────────────────────────────────────────────

type BuildMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tier?: string;
  provider?: string;
  model?: string;
  pending_tool?: string | null;
  pending_agent?: string | null;
  ts: number;
};

type FileNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function parseTree(raw: string): FileNode[] {
  const lines = raw.split("\n").filter(Boolean);
  const root: FileNode[] = [];
  const stack: { node: FileNode; depth: number }[] = [];

  for (const line of lines) {
    const indent = line.search(/\S/);
    const depth = Math.floor(indent / 2);
    const name = line.trim().replace(/^[├└│─\s]+/, "").replace(/\/$/, "");
    if (!name || name === "." || name.startsWith("#")) continue;

    const isDir = line.trim().endsWith("/") || line.includes("/");
    const node: FileNode = {
      name,
      path: name,
      type: isDir ? "dir" : "file",
      children: isDir ? [] : undefined,
    };

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      if (parent.children) {
        node.path = parent.path + "/" + name;
        parent.children.push(node);
      }
    }

    if (isDir) stack.push({ node, depth });
  }

  return root;
}

function syntaxHighlight(code: string, lang?: string): string {
  // Simple keyword highlighting for display
  return code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/(\/\/[^\n]*)/g, '<span style="color:rgba(120,200,120,0.8)">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span style="color:rgba(255,200,100,0.85)">$1</span>')
    .replace(/('(?:[^'\\]|\\.)*')/g, '<span style="color:rgba(255,200,100,0.85)">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|async|await|type|interface|class|extends|implements|new|this|null|undefined|true|false)\b/g,
      '<span style="color:rgba(150,180,255,0.9)">$1</span>');
}

function extractCodeBlocks(content: string): { pre: string; code: string; lang: string; post: string }[] {
  const blocks: { pre: string; code: string; lang: string; post: string }[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    blocks.push({ pre: "", code: match[2], lang: match[1], post: "" });
  }
  return blocks;
}

function renderContent(content: string) {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {content.slice(lastIndex, match.index)}
        </span>
      );
    }
    const lang = match[1];
    const code = match[2];
    parts.push(
      <div key={key++} style={codeBlock()}>
        {lang && <div style={codeLang()}>{lang}</div>}
        <pre style={{ margin: 0, overflowX: "auto", fontSize: 12, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: syntaxHighlight(code, lang) }} />
      </div>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(
      <span key={key++} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {content.slice(lastIndex)}
      </span>
    );
  }

  return parts;
}

// ── File Tree Component ───────────────────────────────────────────────────────

function FileTree({ nodes, onSelect, selectedPath, depth = 0 }: {
  nodes: FileNode[];
  onSelect: (path: string) => void;
  selectedPath: string | null;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(path: string) {
    setCollapsed(s => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  }

  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {nodes.map(node => (
        <div key={node.path}>
          <div
            style={treeItem(node.path === selectedPath, node.type === "dir")}
            onClick={() => node.type === "dir" ? toggle(node.path) : onSelect(node.path)}
          >
            <span style={{ marginRight: 5, opacity: 0.7, fontSize: 11 }}>
              {node.type === "dir" ? (collapsed.has(node.path) ? "▶" : "▼") : "·"}
            </span>
            <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}>{node.name}</span>
          </div>
          {node.type === "dir" && !collapsed.has(node.path) && node.children && (
            <FileTree nodes={node.children} onSelect={onSelect} selectedPath={selectedPath} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BuildPanel({ adminToken }: { adminToken: string }) {
  const [messages, setMessages] = useState<BuildMessage[]>([{
    id: uid(),
    role: "system",
    content: "🔨 Squidley Build — Claude Sonnet · fs.read · fs.patch · fs.write · lint.check · pnpm.run",
    ts: Date.now()
  }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId] = useState(() => "build-" + uid());
  const [tier, setTier] = useState<"claude-sonnet" | "claude-opus">("claude-sonnet");
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadTree() {
    setTreeLoading(true);
    try {
      const res = await fetch(`${ZENSQUID_API}/tools/run`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
        body: JSON.stringify({ workspace: "squidley", tool_id: "fs.tree", args: { path: "apps/api/src" } })
      });
      const json = await res.json();
      if (json?.stdout) setFileTree(parseTree(json.stdout));
    } catch { /* ok */ } finally {
      setTreeLoading(false);
    }
  }

  async function loadFile(path: string) {
    setFileLoading(true);
    setSelectedFile(path);
    try {
      const res = await fetch(`${ZENSQUID_API}/tools/run`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
        body: JSON.stringify({ workspace: "squidley", tool_id: "fs.read", args: { path } })
      });
      const json = await res.json();
      setFileContent(json?.stdout ?? null);
    } catch { /* ok */ } finally {
      setFileLoading(false);
    }
  }

  useEffect(() => { loadTree(); }, []);

  useEffect(() => {
    const brief = sessionStorage.getItem("squidley_build_brief");
    if (brief) {
      sessionStorage.removeItem("squidley_build_brief");
      setInput(brief);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    const userMsg: BuildMessage = { id: uid(), role: "user", content: text, ts: Date.now() };
    setMessages(m => [...m, userMsg]);

    // Inject file context if a file is selected
    const fileContext = selectedFile && fileContent
      ? `\n\n[Current file: ${selectedFile}]\n\`\`\`\n${fileContent.slice(0, 3000)}${fileContent.length > 3000 ? "\n... (truncated)" : ""}\n\`\`\``
      : "";

    try {
      const res = await fetch(`${ZENSQUID_API}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
        body: JSON.stringify({
          input: text + fileContext,
          mode: "force_tier",
          force_tier: tier,
          reason: "build session",
          session_id: sessionId
        })
      });
      const json = await res.json();
      const out = json?.output ?? json?.error ?? `HTTP ${res.status}`;
      const assistantMsg: BuildMessage = {
        id: uid(),
        role: "assistant",
        content: out,
        tier: json?.tier,
        provider: json?.provider,
        model: json?.model,
        pending_tool: json?.pending_tool,
        pending_agent: json?.pending_agent,
        ts: Date.now()
      };
      setMessages(m => [...m, assistantMsg]);

      // If she proposed a tool, show approve button
    } catch (e: any) {
      setMessages(m => [...m, {
        id: uid(), role: "system",
        content: `⚠️ Error: ${String(e?.message ?? e)}`,
        ts: Date.now()
      }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function approve() {
    setInput("yes");
    await send();
  }

  const lastMsg = messages[messages.length - 1];
  const hasPending = lastMsg?.role === "assistant" && (lastMsg.pending_tool || lastMsg.pending_agent);

  return (
    <div style={shell()}>
      {/* Header */}
      <div style={header()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🔨</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5 }}>Squidley Build</div>
            <div style={{ fontSize: 11, opacity: 0.55 }}>Claude Code · local-first · approval gated</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Tier selector */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["claude-sonnet", "claude-opus"] as const).map(t => (
              <button key={t} style={tierBtn(tier === t)} onClick={() => setTier(t)}>
                {t === "claude-sonnet" ? "Sonnet" : "Opus"}
              </button>
            ))}
          </div>
          <button style={iconBtn()} onClick={() => setShowTree(s => !s)} title="Toggle file tree">
            {showTree ? "◀" : "▶"}
          </button>
          <button style={iconBtn()} onClick={loadTree} title="Refresh tree">
            ↺
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={body()}>
        {/* File tree panel */}
        {showTree && (
          <div style={treePanel()}>
            <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              {treeLoading ? "Loading…" : "apps/api/src"}
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              <FileTree nodes={fileTree} onSelect={loadFile} selectedPath={selectedFile} />
            </div>
            {selectedFile && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 11, opacity: 0.6, fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                {selectedFile}
              </div>
            )}
          </div>
        )}

        {/* Main area */}
        <div style={main()}>
          {/* File viewer */}
          {selectedFile && (
            <div style={fileViewer()}>
              <div style={fileViewerHeader()}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{selectedFile}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={iconBtn()} onClick={() => {
                    if (selectedFile) {
                      const msg = `read ${selectedFile}`;
                      setInput(msg);
                      setTimeout(() => send(msg), 10);
                    }
                  }} title="Ask about this file">Ask</button>
                  <button style={iconBtn()} onClick={() => { setSelectedFile(null); setFileContent(null); }} title="Close">✕</button>
                </div>
              </div>
              {fileLoading ? (
                <div style={{ padding: 12, opacity: 0.5, fontSize: 12 }}>Loading…</div>
              ) : fileContent ? (
                <pre style={fileViewerContent()}
                  dangerouslySetInnerHTML={{ __html: syntaxHighlight(fileContent) }} />
              ) : null}
            </div>
          )}

          {/* Messages */}
          <div style={messageArea()}>
            {messages.map(msg => (
              <div key={msg.id} style={messageBubble(msg.role)}>
                {msg.role === "assistant" && (
                  <div style={msgMeta()}>
                    <span style={{ color: providerColor(msg.provider) }}>
                      {msg.model ?? msg.tier ?? "assistant"}
                    </span>
                    {msg.pending_tool && (
                      <span style={{ color: "rgba(255,200,100,0.9)", marginLeft: 8 }}>
                        ⏳ {msg.pending_tool}
                      </span>
                    )}
                    {msg.pending_agent && (
                      <span style={{ color: "rgba(200,150,255,0.9)", marginLeft: 8 }}>
                        🤖 {msg.pending_agent}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 13, lineHeight: 1.65 }}>
                  {renderContent(msg.content)}
                </div>
              </div>
            ))}
            {busy && (
              <div style={messageBubble("assistant")}>
                <div style={msgMeta()}>
                  <span style={{ color: providerColor("anthropic") }}>
                    {tier === "claude-sonnet" ? "claude-sonnet-4-5" : "claude-opus-4-5"}
                  </span>
                </div>
                <div style={{ fontSize: 13, opacity: 0.6 }}>Thinking…</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Approve banner */}
          {hasPending && (
            <div style={approveBanner()}>
              <span style={{ fontSize: 13 }}>
                {lastMsg.pending_agent
                  ? `🤖 Run agent: ${lastMsg.pending_agent}`
                  : `🔧 Run tool: ${lastMsg.pending_tool}`}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnApprove()} onClick={() => approve()}>✓ Approve</button>
                <button style={btnDeny()} onClick={() => setMessages(m => [...m, {
                  id: uid(), role: "user", content: "no", ts: Date.now()
                }])}>✕ Deny</button>
              </div>
            </div>
          )}

          {/* Input */}
          <div style={inputArea()}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={selectedFile ? `Ask about ${selectedFile}… (Enter to send, Shift+Enter for newline)` : "Describe what to build or fix… (Enter to send)"}
              style={inputBox()}
              rows={3}
              disabled={busy}
            />
            <button style={sendBtn(busy)} onClick={() => send()} disabled={busy || !input.trim()}>
              {busy ? "…" : "▶"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function providerColor(p?: string) {
  if (p === "anthropic") return "rgba(255,140,80,0.95)";
  if (p === "ollama") return "rgba(120,255,190,0.9)";
  if (p === "modelstudio") return "rgba(255,200,100,0.9)";
  return "rgba(255,255,255,0.6)";
}

function shell() {
  return {
    display: "flex",
    flexDirection: "column" as const,
    height: "calc(100vh - 140px)",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(8, 10, 20, 0.60)",
    overflow: "hidden",
  };
}

function header() {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.20)",
    flexShrink: 0,
  } as const;
}

function body() {
  return {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  } as const;
}

function treePanel() {
  return {
    width: 200,
    flexShrink: 0,
    borderRight: "1px solid rgba(255,255,255,0.07)",
    padding: "10px 8px",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    background: "rgba(0,0,0,0.15)",
  };
}

function main() {
  return {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  };
}

function fileViewer() {
  return {
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    maxHeight: "35%",
    display: "flex",
    flexDirection: "column" as const,
    flexShrink: 0,
  };
}

function fileViewerHeader() {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 12px",
    background: "rgba(0,0,0,0.25)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  } as const;
}

function fileViewerContent() {
  return {
    margin: 0,
    padding: "10px 14px",
    fontSize: 11,
    lineHeight: 1.6,
    overflowY: "auto" as const,
    fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace",
    color: "rgba(220,230,255,0.85)",
    flex: 1,
  };
}

function messageArea() {
  return {
    flex: 1,
    overflowY: "auto" as const,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  };
}

function messageBubble(role: string) {
  const isUser = role === "user";
  const isSystem = role === "system";
  return {
    alignSelf: isUser ? "flex-end" : "flex-start",
    maxWidth: isSystem ? "100%" : "88%",
    borderRadius: 14,
    padding: "9px 13px",
    background: isSystem
      ? "rgba(255,255,255,0.04)"
      : isUser
      ? "rgba(80,120,255,0.18)"
      : "rgba(255,255,255,0.06)",
    border: isSystem
      ? "1px solid rgba(255,255,255,0.06)"
      : isUser
      ? "1px solid rgba(80,120,255,0.25)"
      : "1px solid rgba(255,255,255,0.09)",
    color: isSystem ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.92)",
    fontSize: isSystem ? 11 : 13,
  } as const;
}

function msgMeta() {
  return {
    fontSize: 11,
    marginBottom: 5,
    opacity: 0.8,
    fontWeight: 700,
    fontFamily: "ui-monospace, monospace",
  } as const;
}

function codeBlock() {
  return {
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.35)",
    margin: "8px 0",
    overflow: "hidden",
  } as const;
}

function codeLang() {
  return {
    fontSize: 10,
    fontWeight: 700,
    padding: "4px 10px",
    background: "rgba(255,255,255,0.05)",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    fontFamily: "ui-monospace, monospace",
  };
}

function approveBanner() {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 14px",
    background: "rgba(255,200,60,0.08)",
    borderTop: "1px solid rgba(255,200,60,0.20)",
    flexShrink: 0,
  } as const;
}

function inputArea() {
  return {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(0,0,0,0.20)",
    flexShrink: 0,
    alignItems: "flex-end",
  } as const;
}

function inputBox() {
  return {
    flex: 1,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    padding: "10px 14px",
    fontSize: 13,
    fontFamily: "inherit",
    resize: "none" as const,
    outline: "none",
    lineHeight: 1.5,
  };
}

function sendBtn(busy: boolean) {
  return {
    borderRadius: 12,
    width: 44,
    height: 44,
    border: "1px solid rgba(255,140,80,0.35)",
    background: busy ? "rgba(255,140,80,0.08)" : "rgba(255,140,80,0.18)",
    color: "rgba(255,200,150,0.9)",
    cursor: busy ? "not-allowed" : "pointer",
    fontSize: 16,
    fontWeight: 900,
    flexShrink: 0,
  } as const;
}

function btnApprove() {
  return {
    borderRadius: 10,
    padding: "5px 14px",
    border: "1px solid rgba(120,255,150,0.30)",
    background: "rgba(120,255,150,0.12)",
    color: "rgba(150,255,180,0.95)",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
  } as const;
}

function btnDeny() {
  return {
    borderRadius: 10,
    padding: "5px 14px",
    border: "1px solid rgba(255,100,100,0.25)",
    background: "rgba(255,100,100,0.08)",
    color: "rgba(255,130,130,0.9)",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
  } as const;
}

function tierBtn(active: boolean) {
  return {
    borderRadius: 10,
    padding: "4px 10px",
    border: `1px solid ${active ? "rgba(255,140,80,0.45)" : "rgba(255,255,255,0.10)"}`,
    background: active ? "rgba(255,140,80,0.15)" : "rgba(255,255,255,0.05)",
    color: active ? "rgba(255,200,150,0.95)" : "rgba(255,255,255,0.55)",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 800,
  } as const;
}

function iconBtn() {
  return {
    borderRadius: 8,
    padding: "4px 8px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.6)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  } as const;
}

function treeItem(selected: boolean, isDir: boolean) {
  return {
    padding: "3px 6px",
    borderRadius: 6,
    cursor: "pointer",
    background: selected ? "rgba(255,140,80,0.15)" : "transparent",
    border: selected ? "1px solid rgba(255,140,80,0.25)" : "1px solid transparent",
    color: isDir ? "rgba(255,255,255,0.75)" : "rgba(200,220,255,0.8)",
    display: "flex",
    alignItems: "center",
    marginBottom: 1,
  } as const;
}
