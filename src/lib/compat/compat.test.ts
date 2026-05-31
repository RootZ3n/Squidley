import { describe, it, expect } from "vitest";
import {
  ENV_ALIASES,
  readEnv,
  readAliasedEnv,
  resolveAliasedEnv,
} from "./env";
import {
  STORAGE_KEY_ALIASES,
  migratedGetItem,
  runStorageMigrations,
  type StorageLike,
} from "./storage";
import {
  PEH_IDENTITY,
  resolvePersonaId,
  isPublicIdentity,
  LEGACY_PERSONA_IDS,
} from "./identity";
import { resolveMode } from "../mode/resolver";
import { getLocalProviderConfig } from "../providers/local";

/** In-memory Storage stand-in for tests. */
function makeStorage(initial: Record<string, string> = {}): StorageLike & {
  dump(): Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe("env compatibility layer", () => {
  it("prefers the canonical PEH_* name", () => {
    const env = { PEH_MODE: "cloud", PEH_MODE: "local" };
    expect(readEnv(env, "mode")).toBe("cloud");
  });

  it("falls back to the legacy PEH_* name (old env vars still work)", () => {
    const env = { PEH_MODE: "cloud" };
    expect(readEnv(env, "mode")).toBe("cloud");
  });

  it("treats empty canonical values as unset and falls back", () => {
    const env = { PEH_LOCAL_MODEL: "   ", PEH_LOCAL_MODEL: "qwen2.5:3b" };
    expect(readAliasedEnv(env, ENV_ALIASES.localModel)).toBe("qwen2.5:3b");
  });

  it("returns undefined when neither name is set", () => {
    expect(readEnv({}, "localEndpoint")).toBeUndefined();
  });

  it("reports which name supplied the value", () => {
    expect(resolveAliasedEnv({ PEH_MODE: "cloud" }, ENV_ALIASES.mode).source).toBe("current");
    expect(resolveAliasedEnv({ PEH_MODE: "cloud" }, ENV_ALIASES.mode).source).toBe("legacy");
    expect(resolveAliasedEnv({}, ENV_ALIASES.mode).source).toBe("unset");
  });
});

describe("resolveMode respects the env fallback (old config still resolves)", () => {
  it("legacy PEH_MODE=cloud still enables cloud", () => {
    const res = resolveMode({ env: { PEH_MODE: "cloud" } });
    expect(res.state.mode).toBe("cloud");
    expect(res.source).toBe("env-var");
    expect(res.reasons.some((r) => r.includes("PEH_MODE"))).toBe(true);
  });

  it("canonical PEH_MODE=cloud enables cloud and is named in reasons", () => {
    const res = resolveMode({ env: { PEH_MODE: "cloud" } });
    expect(res.state.mode).toBe("cloud");
    expect(res.reasons.some((r) => r.includes("PEH_MODE"))).toBe(true);
  });

  it("PEH_MODE wins over PEH_MODE", () => {
    const res = resolveMode({ env: { PEH_MODE: "cloud", PEH_MODE: "local" } });
    expect(res.state.mode).toBe("cloud");
  });
});

describe("local provider config respects the env fallback", () => {
  it("legacy PEH_LOCAL_* still configure the provider", () => {
    const cfg = getLocalProviderConfig({
      PEH_LOCAL_ENDPOINT: "http://localhost:9999",
      PEH_LOCAL_MODEL: "llama3.2",
      PEH_LOCAL_BACKEND: "ollama",
    });
    expect(cfg.endpoint).toBe("http://localhost:9999");
    expect(cfg.model).toBe("llama3.2");
    expect(cfg.backendType).toBe("ollama");
  });

  it("canonical PEH_LOCAL_* take precedence", () => {
    const cfg = getLocalProviderConfig({
      PEH_LOCAL_MODEL: "qwen2.5:3b",
      PEH_LOCAL_MODEL: "llama3.2",
    });
    expect(cfg.model).toBe("qwen2.5:3b");
  });
});

describe("storage migration-on-read (old localStorage still loads)", () => {
  it("migrates a legacy conversation key on read and deletes the old key", () => {
    const storage = makeStorage({
      "peh.colloquium.conversation.v1": "[saved chat]",
    });
    const value = migratedGetItem(storage, "peh.colloquium.conversation.v1");
    expect(value).toBe("[saved chat]");
    const dump = storage.dump();
    expect(dump["peh.colloquium.conversation.v1"]).toBe("[saved chat]");
    expect(dump["peh.colloquium.conversation.v1"]).toBeUndefined();
  });

  it("prefers an existing canonical value over a legacy one", () => {
    const storage = makeStorage({
      "peh.tourMode": "off",
      "peh.tourMode": "on",
    });
    expect(migratedGetItem(storage, "peh.tourMode")).toBe("off");
  });

  it("returns null when neither key exists", () => {
    const storage = makeStorage();
    expect(migratedGetItem(storage, "peh.firstRun.completed")).toBeNull();
  });

  it("old onboarding + teaching state survives a full migration", () => {
    const storage = makeStorage({
      peh_onboarding_progress: '{"stage":3}',
      peh_teaching_settings: '{"teachWhileChatting":true}',
      "peh.firstRun.completed": "true",
    });
    const result = runStorageMigrations(storage);
    expect(result.migrated).toContain("peh_onboarding_progress");
    expect(result.migrated).toContain("peh_teaching_settings");
    expect(result.migrated).toContain("peh.firstRun.completed");
    const dump = storage.dump();
    expect(dump["peh_onboarding_progress"]).toBe('{"stage":3}');
    expect(dump["peh_teaching_settings"]).toBe('{"teachWhileChatting":true}');
    expect(dump["peh.firstRun.completed"]).toBe("true");
    // legacy keys removed
    expect(dump["peh_onboarding_progress"]).toBeUndefined();
    expect(dump["peh.firstRun.completed"]).toBeUndefined();
  });

  it("runStorageMigrations is idempotent", () => {
    const storage = makeStorage({ "peh.tourMode": "on" });
    const first = runStorageMigrations(storage);
    expect(first.migrated).toContain("peh.tourMode");
    const second = runStorageMigrations(storage);
    expect(second.migrated).toEqual([]);
    expect(storage.dump()["peh.tourMode"]).toBe("on");
  });

  it("every alias maps a peh.* / peh_* key to a peh.* / peh_* key", () => {
    for (const { current, legacy } of STORAGE_KEY_ALIASES) {
      expect(legacy.toLowerCase()).toContain("peh");
      expect(current.toLowerCase()).toContain("peh");
      expect(current).not.toBe(legacy);
    }
  });
});

describe("identity / persona fallback (peh first, peh fallback)", () => {
  it("exposes the active Peh identity", () => {
    expect(PEH_IDENTITY.name).toBe("Peh");
    expect(PEH_IDENTITY.fullName).toBe("Pehlichi");
    expect(PEH_IDENTITY.legacyName).toBe("Peh");
  });

  it("resolves legacy peh persona ids to peh", () => {
    for (const id of LEGACY_PERSONA_IDS) {
      expect(resolvePersonaId(id)).toBe("peh");
    }
    expect(resolvePersonaId("Peh")).toBe("peh");
  });

  it("recognizes both active and legacy public identities", () => {
    expect(isPublicIdentity("peh")).toBe(true);
    expect(isPublicIdentity("peh")).toBe(true);
    expect(isPublicIdentity("public-peh")).toBe(true);
    expect(isPublicIdentity("something-else")).toBe(false);
  });
});
