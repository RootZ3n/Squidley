// apps/api/src/chat/sessionHistory.ts
//
// In-memory conversation history per session.
// Keeps last N turns, prunes by token estimate, expires after inactivity.

const MAX_TURNS = 12;
const MAX_CHARS = 8000; // ~2000 tokens, leaves room for system prompt
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

type Turn = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

type Session = {
  turns: Turn[];
  last_active: number;
};

const sessions = new Map<string, Session>();

// Prune expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.last_active > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

function getOrCreate(sessionId: string): Session {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { turns: [], last_active: Date.now() };
    sessions.set(sessionId, s);
  }
  return s;
}

function pruneToFit(turns: Turn[]): Turn[] {
  // Keep most recent turns that fit within MAX_CHARS
  let total = 0;
  const kept: Turn[] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    total += turns[i].content.length;
    if (total > MAX_CHARS) break;
    kept.unshift(turns[i]);
  }
  // Also enforce MAX_TURNS
  return kept.slice(-MAX_TURNS);
}

export function addTurn(sessionId: string, role: "user" | "assistant", content: string): void {
  if (!sessionId) return;
  const s = getOrCreate(sessionId);
  s.turns.push({ role, content, ts: Date.now() });
  s.last_active = Date.now();
  // Keep raw store bounded
  if (s.turns.length > MAX_TURNS * 2) {
    s.turns = s.turns.slice(-MAX_TURNS * 2);
  }
}

export function getHistory(sessionId: string): Array<{ role: "user" | "assistant"; content: string }> {
  if (!sessionId) return [];
  const s = sessions.get(sessionId);
  if (!s) return [];
  s.last_active = Date.now();
  const pruned = pruneToFit(s.turns);
  return pruned.map(t => ({ role: t.role, content: t.content }));
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function sessionCount(): number {
  return sessions.size;
}
