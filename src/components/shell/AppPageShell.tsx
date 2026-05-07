import type { CSSProperties, ReactNode } from "react";

export interface AppPageShellProps {
  /** Page title rendered as the dominant heading. */
  title: string;
  /** Tiny eyebrow above the title — typically the Latin gloss or "Squidley · Module". */
  eyebrow?: string;
  /** One short sentence under the title. Plain text for beginners. */
  intro?: string;
  /** Accent colour for the title glow. Pick the module accent. */
  accent?: string;
  /** Content rendered in the header's right slot — chips, links, status notes. */
  headerRight?: ReactNode;
  /** Optional banner rendered between the header and content (e.g. local readiness). */
  banner?: ReactNode;
  /** Optional class for the outer wrapper. */
  className?: string;
  /** Override max content width. Defaults to 1180px. */
  maxWidth?: number | string;
  children: ReactNode;
}

/**
 * AppPageShell — canonical page wrapper used by every public module page.
 *
 * Visually it is a glass header band followed by a wide content column.
 * It does not handle navigation — that's owned by AppShell. It only
 * provides the title region, the optional banner, and the scrollable
 * content area so each module page reads as a finished surface rather
 * than a centred scaffold.
 */
export function AppPageShell({
  title,
  eyebrow,
  intro,
  accent = "#4df5c8",
  headerRight,
  banner,
  className = "",
  maxWidth = 1180,
  children,
}: AppPageShellProps) {
  const headerStyle: CSSProperties = {
    flexShrink: 0,
    padding: "26px clamp(16px, 4vw, 36px) 22px",
    borderRadius: 0,
    borderTop: "none",
    borderLeft: "none",
    borderRight: "none",
  };

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        color: "var(--text-primary)",
      }}
    >
      <header className="sq-glass" style={headerStyle}>
        <div
          style={{
            margin: "0 auto",
            width: "100%",
            maxWidth,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 18,
            position: "relative",
            zIndex: 2,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            {eyebrow && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                {eyebrow}
              </div>
            )}
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "clamp(28px, 3.4vw, 40px)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: accent,
                margin: 0,
                lineHeight: 1.05,
                textShadow: `0 0 22px ${accent}66, 0 0 56px ${accent}33`,
              }}
            >
              {title}
            </h1>
            {intro && (
              <p
                style={{
                  marginTop: 12,
                  fontSize: 16,
                  lineHeight: 1.55,
                  color: "rgba(238,240,255,0.78)",
                  maxWidth: 720,
                }}
              >
                {intro}
              </p>
            )}
          </div>
          {headerRight && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {headerRight}
            </div>
          )}
        </div>
      </header>

      {banner && (
        <div
          style={{
            padding: "16px clamp(16px, 4vw, 36px) 0",
            margin: "0 auto",
            width: "100%",
            maxWidth: typeof maxWidth === "number" ? maxWidth + 64 : maxWidth,
          }}
        >
          {banner}
        </div>
      )}

      <div
        style={{
          flex: 1,
          padding: "24px clamp(16px, 4vw, 36px) 48px",
          margin: "0 auto",
          width: "100%",
          maxWidth: typeof maxWidth === "number" ? maxWidth + 64 : maxWidth,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default AppPageShell;
