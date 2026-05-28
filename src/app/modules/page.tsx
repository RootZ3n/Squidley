import Link from "next/link";
import { RatioCapabilityNote } from "@/components/RatioCapabilityNote";
import { AppPageShell } from "@/components/shell/AppPageShell";
import {
  getCloudUnlockModules,
  getCoreLocalModules,
  type PublicModule,
} from "@/lib/modules/registry";
import { ratioDecisionForPublicModule } from "@/lib/ratio";

export const metadata = {
  title: "Modules · Peh",
};

export default function ModulesPage() {
  const core = getCoreLocalModules();
  const cloud = getCloudUnlockModules();

  return (
    <AppPageShell
      eyebrow="Peh · modules"
      title="What Peh can do"
      intro="Peh is made of small, named modules. Core modules run locally and work without an account. Advanced modules are listed too — so you can see what is coming — but they are locked in public mode."
      accent="#a78bfa"
    >
      <Section
        title="Core Local Modules"
        accent="#4df5c8"
        subtitle="Beginner-safe. These work without a cloud account."
      >
        <Grid modules={core} variant="local" />
      </Section>

      <div style={{ height: 28 }} />

      <Section
        title="Cloud Unlock Modules"
        accent="#fb923c"
        subtitle="Advanced. Shown so you know they exist; locked in public mode."
      >
        <Grid modules={cloud} variant="locked" />
      </Section>

      <div
        style={{
          marginTop: 36,
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          fontSize: 13,
          color: "var(--text-dim)",
        }}
      >
        <Link
          href="/colloquium"
          style={{ color: "var(--accent-chat)", textDecoration: "underline", textDecorationStyle: "dotted" }}
        >
          ← Back to Colloquium
        </Link>
        <Link
          href="/settings"
          style={{ color: "var(--text-primary)", textDecoration: "underline", textDecorationStyle: "dotted" }}
        >
          Settings
        </Link>
        <Link
          href="/nous"
          style={{ color: "var(--accent-diag)", textDecoration: "underline", textDecorationStyle: "dotted" }}
        >
          Nous
        </Link>
      </div>
    </AppPageShell>
  );
}

function Section({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: accent,
            boxShadow: `0 0 10px ${accent}`,
          }}
        />
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-dim)" }}>{subtitle}</p>
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}

function Grid({
  modules,
  variant,
}: {
  modules: PublicModule[];
  variant: "local" | "locked";
}) {
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "grid",
        gap: 14,
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      }}
    >
      {modules.map((m) => (
        <ModuleCard key={m.id} module={m} variant={variant} />
      ))}
    </ul>
  );
}

function ModuleCard({
  module: m,
  variant,
}: {
  module: PublicModule;
  variant: "local" | "locked";
}) {
  const locked = variant === "locked";
  const accent = locked ? "#fb923c" : "#4df5c8";
  const ratioDecision = ratioDecisionForPublicModule(m.id, representativeModelForModule(m.id));
  return (
    <li
      className="sq-glass"
      style={{
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {m.displayName}
          </h3>
          {m.latinMeaning && (
            <p
              style={{
                marginTop: 2,
                fontSize: 12,
                fontStyle: "italic",
                color: "var(--text-muted)",
              }}
            >
              Latin: {m.latinMeaning}
            </p>
          )}
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 999,
            border: `1px solid ${accent}55`,
            background: locked ? "rgba(251,146,60,0.10)" : "rgba(77,245,200,0.10)",
            color: locked ? "#ffd28a" : "#cdfdec",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {locked ? "🔒 Locked" : "Local"}
        </span>
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(238,240,255,0.78)" }}>
        {m.beginnerDescription}
      </p>

      <RatioCapabilityNote
        decision={ratioDecision}
        title="Ratio status"
        compact
      />

      {m.limitations && m.limitations.length > 0 && (
        <div
          style={{
            marginTop: 4,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--border-lit)",
            background: "rgba(7,16,34,0.4)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            In public mode
          </p>
          <ul
            style={{
              marginTop: 6,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 13,
              color: "var(--text-dim)",
            }}
          >
            {m.limitations.map((l) => (
              <li key={l} style={{ display: "flex", gap: 8 }}>
                <span aria-hidden style={{ color: "var(--text-muted)" }}>•</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        style={{
          marginTop: "auto",
          paddingTop: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {locked ? "Available with Cloud Unlock" : "Runs locally"}
        </span>
        {!locked && m.route && (
          <Link
            href={m.route}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--accent-vision)",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              textUnderlineOffset: "3px",
            }}
          >
            Open →
          </Link>
        )}
      </div>
    </li>
  );
}

function representativeModelForModule(moduleId: string): string | undefined {
  if (moduleId === "colloquium" || moduleId === "fabrica") return "llama3.2:3b";
  if (moduleId === "oculus") return "qwen3-vl:4b";
  return undefined;
}
