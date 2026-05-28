/**
 * Public identity + persona compatibility layer (peh-pub migration).
 *
 * Peh (full name Pehlichi) is the active public-facing guide identity.
 * Squidley is retired — kept only as a compatibility alias so older saved
 * preferences, links, or references still resolve.
 *
 * This is the single source of truth for the active public brand name. UI and
 * copy should read from here rather than hardcoding a literal, so a future
 * identity change is a one-line edit and the legacy alias keeps resolving.
 *
 * Persona resolution is Peh-first, Squidley-fallback: a stored persona id of
 * "squidley" (or "public-squidley") resolves to the active Peh persona.
 */

/** The active public persona. */
export const ACTIVE_PERSONA_ID = "peh" as const;

/** Legacy persona ids that should resolve to the active persona. */
export const LEGACY_PERSONA_IDS = ["squidley", "public-squidley", "public_squidley"] as const;

export interface PublicIdentity {
  /** Active persona id. */
  readonly id: string;
  /** Short display name shown in UI ("Peh"). */
  readonly name: string;
  /** Full/canonical name ("Pehlichi"). */
  readonly fullName: string;
  /** Product/package identity for the public app. */
  readonly product: string;
  /** Legacy name retained for compatibility messaging. */
  readonly legacyName: string;
}

/** The active public identity. */
export const PEH_IDENTITY: PublicIdentity = {
  id: ACTIVE_PERSONA_ID,
  name: "Peh",
  fullName: "Pehlichi",
  product: "Peh Pub",
  legacyName: "Squidley",
} as const;

/**
 * Resolve a persona id, preferring Peh and falling back through legacy
 * Squidley-era ids. An unknown id resolves to the active persona (fail-safe to
 * the live identity rather than a dead one).
 */
export function resolvePersonaId(id: string | null | undefined): string {
  if (typeof id !== "string") return ACTIVE_PERSONA_ID;
  const normalized = id.trim().toLowerCase();
  if (normalized === ACTIVE_PERSONA_ID) return ACTIVE_PERSONA_ID;
  if ((LEGACY_PERSONA_IDS as readonly string[]).includes(normalized)) {
    return ACTIVE_PERSONA_ID;
  }
  return normalized.length > 0 ? normalized : ACTIVE_PERSONA_ID;
}

/** True if the given id refers to the active or a legacy public identity. */
export function isPublicIdentity(id: string | null | undefined): boolean {
  if (typeof id !== "string") return false;
  const normalized = id.trim().toLowerCase();
  return (
    normalized === ACTIVE_PERSONA_ID ||
    (LEGACY_PERSONA_IDS as readonly string[]).includes(normalized)
  );
}
