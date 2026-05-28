/**
 * localStorage / sessionStorage compatibility layer (peh-pub migration).
 *
 * Peh is the active public identity; saved browser state from the Squidley era
 * must survive the rename. Every persisted key that used to be `squidley.*`
 * (or `squidley_*`) now has a canonical `peh.*` / `peh_*` name. This module
 * migrates a user's saved state ON READ:
 *
 *   1. read the canonical (peh) key — if present, use it,
 *   2. otherwise read the legacy (squidley) key,
 *   3. if the legacy key exists, copy its value to the canonical key and
 *      DELETE the legacy key (decision: copy-then-delete),
 *   4. return the value.
 *
 * No user data is lost: conversations, sessions, receipts, onboarding
 * progress, and tour state carry over the first time the new code reads them.
 *
 * The functions take a Storage-like object so they are testable without a DOM.
 */

/** Minimal subset of the Web Storage API this module relies on. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A canonical storage key paired with its legacy Squidley-era name. */
export interface StorageKeyAlias {
  /** Canonical Peh-era key. */
  readonly current: string;
  /** Legacy Squidley-era key migrated on first read. */
  readonly legacy: string;
}

/**
 * Every persisted public-app key and its legacy name. The `current` values are
 * the keys the app uses after the Phase 3 rename; the `legacy` values are what
 * existing users have saved. Keep this list exhaustive — anything missing here
 * silently loses its saved state on rename.
 */
export const STORAGE_KEY_ALIASES: readonly StorageKeyAlias[] = [
  { current: "peh.colloquium.conversation.v1", legacy: "squidley.colloquium.conversation.v1" },
  { current: "peh.colloquium.sessions.v2", legacy: "squidley.colloquium.sessions.v2" },
  { current: "peh.colloquium.velumDraft.v1", legacy: "squidley.colloquium.velumDraft.v1" },
  { current: "peh.archivum.entries.v1", legacy: "squidley.archivum.entries.v1" },
  { current: "peh.tabularium.receipts.v1", legacy: "squidley.tabularium.receipts.v1" },
  { current: "peh.nous.modelPreferences.v1", legacy: "squidley.nous.modelPreferences.v1" },
  { current: "peh.oculus.colloquiumAnalysis.v1", legacy: "squidley.oculus.colloquiumAnalysis.v1" },
  { current: "peh.velum.redactedDraft.v1", legacy: "squidley.velum.redactedDraft.v1" },
  { current: "peh.velum.moreInputRedacted.v1", legacy: "squidley.velum.moreInputRedacted.v1" },
  { current: "peh.moreInput.velumDraft.v1", legacy: "squidley.moreInput.velumDraft.v1" },
  { current: "peh_teaching_settings", legacy: "squidley_teaching_settings" },
  { current: "peh_onboarding_progress", legacy: "squidley_onboarding_progress" },
  { current: "peh.firstRun.completed", legacy: "squidley.firstRun.completed" },
  { current: "peh.tourMode", legacy: "squidley.tourMode" },
  { current: "peh.tourCompleted", legacy: "squidley.tourCompleted" },
] as const;

/** Lookup of canonical key -> legacy key, built from {@link STORAGE_KEY_ALIASES}. */
const LEGACY_BY_CURRENT = new Map(
  STORAGE_KEY_ALIASES.map((a) => [a.current, a.legacy] as const),
);

/**
 * Read a value, migrating from the legacy key on first read.
 *
 * If `currentKey` is registered in {@link STORAGE_KEY_ALIASES}, the legacy key
 * is derived automatically. Otherwise pass `legacyKey` explicitly. Migration is
 * copy-then-delete: the legacy key is removed once its value is copied across.
 */
export function migratedGetItem(
  storage: StorageLike,
  currentKey: string,
  legacyKey?: string,
): string | null {
  const current = storage.getItem(currentKey);
  if (current !== null) return current;

  const legacy = legacyKey ?? LEGACY_BY_CURRENT.get(currentKey);
  if (!legacy) return null;

  const legacyValue = storage.getItem(legacy);
  if (legacyValue === null) return null;

  storage.setItem(currentKey, legacyValue);
  storage.removeItem(legacy);
  return legacyValue;
}

export interface StorageMigrationResult {
  /** Canonical keys that received a value migrated from their legacy key. */
  readonly migrated: readonly string[];
}

/**
 * Eagerly migrate every known legacy key to its canonical key. Safe to call on
 * every app boot: it is idempotent (a key already migrated is skipped) and only
 * touches keys present in {@link STORAGE_KEY_ALIASES}. Returns which keys moved.
 */
export function runStorageMigrations(storage: StorageLike): StorageMigrationResult {
  const migrated: string[] = [];
  for (const { current, legacy } of STORAGE_KEY_ALIASES) {
    // Skip if already migrated (canonical present) or nothing to migrate.
    if (storage.getItem(current) !== null) {
      // Clean up a stale legacy duplicate if one lingers.
      if (storage.getItem(legacy) !== null) storage.removeItem(legacy);
      continue;
    }
    const legacyValue = storage.getItem(legacy);
    if (legacyValue === null) continue;
    storage.setItem(current, legacyValue);
    storage.removeItem(legacy);
    migrated.push(current);
  }
  return { migrated };
}
