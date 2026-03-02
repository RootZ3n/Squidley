// apps/api/src/chat/pendingImages.ts
//
// Stores image generation requests awaiting user approval in chat.
// Keyed by session_id. 30-minute TTL.

export type PendingImage = {
  session_id: string;
  prompt: string;
  intent: string;
  negative: string;
  seed: number;
  steps: number;
  created_at: number;
  expires_at: number;
};

const IMAGE_TTL_MS = 30 * 60 * 1000;
const store = new Map<string, PendingImage>();

function purge() {
  const now = Date.now();
  for (const [id, p] of store) {
    if (p.expires_at < now) store.delete(id);
  }
}

export function storePendingImage(
  session_id: string,
  prompt: string,
  intent: string,
  negative = "blurry, bad anatomy, watermark, tiling, multiple subjects, text, logo",
  steps = 20
): PendingImage {
  purge();
  const now = Date.now();
  const p: PendingImage = {
    session_id,
    prompt,
    intent,
    negative,
    seed: Math.floor(Math.random() * 2 ** 32),
    steps,
    created_at: now,
    expires_at: now + IMAGE_TTL_MS,
  };
  store.set(session_id, p);
  return p;
}

export function getPendingImage(session_id: string): PendingImage | null {
  purge();
  const p = store.get(session_id);
  if (!p) return null;
  if (p.expires_at < Date.now()) {
    store.delete(session_id);
    return null;
  }
  return p;
}

export function clearPendingImage(session_id: string): void {
  store.delete(session_id);
}

export function hasPendingImage(session_id: string): boolean {
  return getPendingImage(session_id) !== null;
}
