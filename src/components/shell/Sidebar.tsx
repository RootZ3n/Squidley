"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BugReportLink } from "@/components/BugReportLink";
import { MODULE_TERMINOLOGY, type ModuleKey } from "@/lib/ui/terminology";
import {
  ArchelonIcon,
  ArchivumIcon,
  ChatIcon,
  FabricaIcon,
  HomeIcon,
  ImaginaniumIcon,
  ImperiumIcon,
  LegatusIcon,
  LockIcon,
  ModulesIcon,
  MoreInputIcon,
  NousIcon,
  OculusIcon,
  PraertoriumIcon,
  ProbatioIcon,
  SettingsIcon,
  TabulariumIcon,
  VelumIcon,
} from "./icons";

interface NavItem {
  href: string;
  /** Beginner-readable primary label (e.g. "Chat"). */
  label: string;
  /** Optional advanced/lore name (e.g. "Colloquium"). Shown as subtitle. */
  subtitle?: string;
  accent: string;
  accentDim: string;
  icon: ReactNode;
  status?: "active" | "future" | "locked";
  hint?: string;
}

function termHint(key: ModuleKey, statusNote?: string): string {
  const term = MODULE_TERMINOLOGY[key];
  const base = term.tooltip;
  if (statusNote) return `${base} ${statusNote}`;
  return base;
}

const PRIMARY: NavItem[] = [
  {
    href: "/",
    label: "Welcome",
    accent: "#bc8cff",
    accentDim: "rgba(188,140,255,0.18)",
    icon: <HomeIcon />,
    hint: "Start here. Overview of what Squidley can do today.",
  },
  {
    href: "/colloquium",
    label: MODULE_TERMINOLOGY.colloquium.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.colloquium.latinName,
    accent: "#4df5c8",
    accentDim: "rgba(77,245,200,0.18)",
    icon: <ChatIcon />,
    hint: termHint("colloquium"),
  },
  {
    href: "/fabrica",
    label: MODULE_TERMINOLOGY.fabrica.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.fabrica.latinName,
    accent: "#fb923c",
    accentDim: "rgba(251,146,60,0.18)",
    icon: <FabricaIcon />,
    hint: termHint("fabrica"),
  },
  {
    href: "/archivum",
    label: MODULE_TERMINOLOGY.archivum.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.archivum.latinName,
    accent: "#7bffdd",
    accentDim: "rgba(123,255,221,0.18)",
    icon: <ArchivumIcon />,
    hint: termHint("archivum"),
  },
  {
    href: "/archivum?focus=more-input",
    label: MODULE_TERMINOLOGY.moreInput.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.moreInput.latinName,
    accent: "#a78bfa",
    accentDim: "rgba(167,139,250,0.18)",
    icon: <MoreInputIcon />,
    hint: termHint("moreInput"),
  },
  {
    href: "/velum",
    label: MODULE_TERMINOLOGY.velum.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.velum.latinName,
    accent: "#f472b6",
    accentDim: "rgba(244,114,182,0.18)",
    icon: <VelumIcon />,
    hint: termHint("velum"),
  },
  {
    href: "/oculus",
    label: MODULE_TERMINOLOGY.oculus.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.oculus.latinName,
    accent: "#bc8cff",
    accentDim: "rgba(188,140,255,0.18)",
    icon: <OculusIcon />,
    hint: termHint("oculus"),
  },
  {
    href: "/tabularium",
    label: MODULE_TERMINOLOGY.tabularium.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.tabularium.latinName,
    accent: "#f59e0b",
    accentDim: "rgba(245,158,11,0.18)",
    icon: <TabulariumIcon />,
    hint: termHint("tabularium"),
  },
  {
    href: "/nous",
    label: MODULE_TERMINOLOGY.nous.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.nous.latinName,
    accent: "#60a5fa",
    accentDim: "rgba(96,165,250,0.18)",
    icon: <NousIcon />,
    hint: termHint("nous"),
  },
];

const SECONDARY: NavItem[] = [
  {
    href: "/modules",
    label: MODULE_TERMINOLOGY.modules.friendlyLabel,
    accent: "#a78bfa",
    accentDim: "rgba(167,139,250,0.16)",
    icon: <ModulesIcon />,
    hint: termHint("modules"),
  },
  {
    href: "/settings",
    label: MODULE_TERMINOLOGY.settings.friendlyLabel,
    accent: "#cbd7ea",
    accentDim: "rgba(203,215,234,0.14)",
    icon: <SettingsIcon />,
    hint: termHint("settings"),
  },
];

const FUTURE: NavItem[] = [
  {
    href: "/modules",
    label: MODULE_TERMINOLOGY.archelon.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.archelon.latinName,
    accent: "#7bffdd",
    accentDim: "rgba(123,255,221,0.14)",
    icon: <ArchelonIcon />,
    status: "future",
    hint: termHint("archelon", "Planned for a future release."),
  },
];

const LOCKED: NavItem[] = [
  {
    href: "/modules",
    label: MODULE_TERMINOLOGY.legatus.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.legatus.latinName,
    accent: "#60a5fa",
    accentDim: "rgba(96,165,250,0.12)",
    icon: <LegatusIcon />,
    status: "locked",
    hint: termHint("legatus"),
  },
  {
    href: "/modules",
    label: MODULE_TERMINOLOGY.probatio.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.probatio.latinName,
    accent: "#f472b6",
    accentDim: "rgba(244,114,182,0.12)",
    icon: <ProbatioIcon />,
    status: "locked",
    hint: termHint("probatio"),
  },
  {
    href: "/modules",
    label: MODULE_TERMINOLOGY.imperium.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.imperium.latinName,
    accent: "#a78bfa",
    accentDim: "rgba(167,139,250,0.12)",
    icon: <ImperiumIcon />,
    status: "locked",
    hint: termHint("imperium"),
  },
  {
    href: "/modules",
    label: MODULE_TERMINOLOGY.praertorium.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.praertorium.latinName,
    accent: "#fb923c",
    accentDim: "rgba(251,146,60,0.12)",
    icon: <PraertoriumIcon />,
    status: "locked",
    hint: termHint("praertorium"),
  },
  {
    href: "/modules",
    label: MODULE_TERMINOLOGY.imaginanium.friendlyLabel,
    subtitle: MODULE_TERMINOLOGY.imaginanium.latinName,
    accent: "#bc8cff",
    accentDim: "rgba(188,140,255,0.12)",
    icon: <ImaginaniumIcon />,
    status: "locked",
    hint: termHint("imaginanium"),
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  const target = href.split("?")[0];
  return pathname === target || pathname.startsWith(`${target}/`);
}

function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 26 26" fill="none" width={size} height={size}>
      <defs>
        <linearGradient id="sq-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4df5c8" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <circle cx="13" cy="13" r="11" stroke="url(#sq-logo-grad)" strokeWidth="1" opacity="0.3" />
      <circle cx="13" cy="13" r="7" stroke="url(#sq-logo-grad)" strokeWidth="1" opacity="0.5" />
      <circle cx="13" cy="13" r="3" fill="url(#sq-logo-grad)" />
      <line x1="13" y1="2" x2="13" y2="6" stroke="#4df5c8" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="13" y1="20" x2="13" y2="24" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="2" y1="13" x2="6" y2="13" stroke="#f472b6" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="20" y1="13" x2="24" y2="13" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function SectionLabel({ label, expanded }: { label: string; expanded: boolean }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.18em",
        color: "rgba(240,160,80,0.78)",
        padding: "16px 18px 6px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        opacity: expanded ? 1 : 0,
        height: expanded ? "auto" : 0,
        overflow: "hidden",
        transition: "opacity 140ms ease",
        fontFamily: "var(--font-mono)",
      }}
    >
      {label}
    </div>
  );
}

function SidebarLink({
  item,
  active,
  expanded,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
}) {
  const locked = item.status === "locked" || item.status === "future";
  return (
    <Link
      href={item.href}
      title={item.hint ?? item.label}
      aria-disabled={locked ? "true" : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        height: 50,
        padding: "0 18px",
        gap: 14,
        textDecoration: "none",
        whiteSpace: "nowrap",
        color: active
          ? "var(--text-primary)"
          : locked
            ? "rgba(203,215,234,0.45)"
            : "#cdd5e3",
        background: active
          ? `linear-gradient(90deg, ${item.accentDim} 0%, rgba(7,16,34,0.32) 100%)`
          : "transparent",
        transition: "background 160ms ease, color 160ms ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: active ? "6px 8px 6px 6px" : "8px 10px 8px 10px",
          borderRadius: 14,
          border: active
            ? `1px solid ${item.accent}33`
            : "1px solid transparent",
          background: active
            ? `linear-gradient(90deg, ${item.accent}11 0%, rgba(4,10,24,0.22) 100%)`
            : "transparent",
          transition: "inset 160ms ease, border-color 160ms ease, background 160ms ease",
        }}
      />
      {active && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: "0 3px 3px 0",
            background: item.accent,
            boxShadow: `0 0 14px ${item.accent}, 0 0 28px ${item.accent}`,
          }}
        />
      )}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          width: 24,
          height: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: active ? item.accent : locked ? "currentColor" : "currentColor",
          filter: active ? `drop-shadow(0 0 6px ${item.accent})` : "none",
          flexShrink: 0,
        }}
      >
        <span style={{ width: 20, height: 20, display: "block" }}>{item.icon}</span>
      </span>
      <span
        style={{
          position: "relative",
          zIndex: 1,
          opacity: expanded ? 1 : 0,
          transform: expanded ? "translateX(0)" : "translateX(-6px)",
          transition: "opacity 120ms 50ms, transform 160ms ease",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: active ? 600 : 500,
            letterSpacing: "0.01em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.label}
        </span>
        {item.subtitle && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
              color: "rgba(186,212,255,0.42)",
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            aria-hidden="true"
          >
            {item.subtitle}
          </span>
        )}
      </span>
      {locked && (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            color: "rgba(245,158,11,0.7)",
            opacity: expanded ? 1 : 0,
            transition: "opacity 120ms 50ms",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
          }}
          aria-hidden
        >
          <span style={{ width: 14, height: 14, display: "block" }}>
            <LockIcon />
          </span>
        </span>
      )}
    </Link>
  );
}

export function DesktopSidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  return (
    <nav
      aria-label="Squidley primary navigation"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      style={{
        width: expanded ? "var(--sidebar-w-open)" : "var(--sidebar-w)",
        flexShrink: 0,
        minHeight: "100dvh",
        background: "linear-gradient(180deg, rgba(7,16,34,0.92) 0%, rgba(3,8,20,0.96) 100%)",
        borderRight: "1px solid rgba(132,201,255,0.14)",
        display: "flex",
        flexDirection: "column",
        transition: "width 320ms cubic-bezier(0.4,0,0.2,1), box-shadow 240ms ease",
        overflow: "hidden",
        position: "relative",
        zIndex: 10,
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        boxShadow: expanded
          ? "inset -1px 0 0 rgba(186,236,255,0.06), 20px 0 48px rgba(0,0,0,0.24)"
          : "inset -1px 0 0 rgba(186,236,255,0.04), 10px 0 30px rgba(0,0,0,0.18)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 0%, rgba(111,217,255,0.08), transparent 32%), radial-gradient(circle at 0% 42%, rgba(77,245,200,0.07), transparent 28%), radial-gradient(circle at 100% 78%, rgba(188,140,255,0.08), transparent 34%)",
        }}
      />

      <Link
        href="/"
        style={{
          height: "var(--topbar-h)",
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 14,
          borderBottom: "1px solid rgba(132,201,255,0.12)",
          flexShrink: 0,
          textDecoration: "none",
          position: "relative",
        }}
      >
        <span style={{ flexShrink: 0 }}>
          <LogoMark />
        </span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "0.12em",
            whiteSpace: "nowrap",
            textTransform: "uppercase",
            background:
              "linear-gradient(135deg,#4df5c8 0%,#a78bfa 50%,#f472b6 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            opacity: expanded ? 1 : 0,
            transform: expanded ? "translateX(0)" : "translateX(-6px)",
            transition: "opacity 180ms 80ms, transform 220ms ease",
          }}
        >
          SQUIDLEY
        </span>
      </Link>

      <div
        style={{
          padding: "10px 0",
          flex: 1,
          overflowY: "auto",
          position: "relative",
        }}
      >
        <SectionLabel label="Use freely" expanded={expanded} />
        {PRIMARY.map((item) => (
          <SidebarLink
            key={item.label}
            item={item}
            active={isActive(pathname, item.href)}
            expanded={expanded}
          />
        ))}

        <SectionLabel label="Settings" expanded={expanded} />
        {SECONDARY.map((item) => (
          <SidebarLink
            key={item.label}
            item={item}
            active={isActive(pathname, item.href)}
            expanded={expanded}
          />
        ))}

        <SectionLabel label="Planned · not built yet" expanded={expanded} />
        {FUTURE.map((item) => (
          <SidebarLink
            key={item.label}
            item={item}
            active={false}
            expanded={expanded}
          />
        ))}

        <SectionLabel label="Cloud-only · not implemented" expanded={expanded} />
        {LOCKED.map((item) => (
          <SidebarLink
            key={item.label}
            item={item}
            active={false}
            expanded={expanded}
          />
        ))}
      </div>

      <div
        style={{
          padding: "12px 0",
          borderTop: "1px solid rgba(132,201,255,0.12)",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 18px",
            gap: 12,
            minHeight: 38,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#4df5c8",
              boxShadow: "0 0 12px rgba(77,245,200,0.55)",
              flexShrink: 0,
              animation: "sq-dot-pulse 2.4s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
              color: "#4df5c8",
              whiteSpace: "nowrap",
              opacity: expanded ? 1 : 0,
              transition: "opacity 120ms 50ms",
            }}
          >
            Local · public
          </span>
        </div>
        <BugReportLink
          pageModule="Shell"
          issueSummary="Public Squidley issue"
          className="mt-1 flex min-h-8 items-center px-[18px] text-xs font-medium text-ink-300 no-underline hover:text-squid-200"
          unavailableChildren={
            <span
              style={{
                opacity: expanded ? 1 : 0,
                transition: "opacity 120ms 50ms",
                whiteSpace: "nowrap",
              }}
            >
              Report issue unavailable
            </span>
          }
        >
          <span
            style={{
              opacity: expanded ? 1 : 0,
              transition: "opacity 120ms 50ms",
              whiteSpace: "nowrap",
            }}
          >
            Report issue
          </span>
        </BugReportLink>
      </div>
    </nav>
  );
}

const MOBILE_TABS: NavItem[] = [
  PRIMARY[1]!, // Colloquium
  PRIMARY[2]!, // Fabrica
  PRIMARY[3]!, // Archivum
  PRIMARY[5]!, // Velum
];

export function MobileTabBar() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      {showMore && (
        <>
          <button
            type="button"
            aria-label="Close more menu"
            onClick={() => setShowMore(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 90,
              background: "rgba(2,4,12,0.5)",
              border: "none",
              padding: 0,
              cursor: "default",
            }}
          />
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
              zIndex: 91,
              background: "rgba(11,14,28,0.98)",
              borderTop: "1px solid var(--border-lit)",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              padding: "14px 14px calc(8px + env(safe-area-inset-bottom, 0px))",
              maxHeight: "62vh",
              overflowY: "auto",
              backdropFilter: "blur(22px)",
              WebkitBackdropFilter: "blur(22px)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: 10,
              }}
            >
              All modules
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              {[...PRIMARY, ...SECONDARY].map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      padding: "10px 6px",
                      borderRadius: 14,
                      textDecoration: "none",
                      background: active ? `${item.accentDim}` : "rgba(7,16,34,0.4)",
                      border: `1px solid ${active ? item.accent + "55" : "var(--border-lit)"}`,
                      color: active ? item.accent : "var(--text-primary)",
                    }}
                  >
                    <span style={{ width: 22, height: 22 }}>{item.icon}</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(245,158,11,0.72)",
                marginTop: 14,
                marginBottom: 8,
              }}
            >
              Cloud-only · not implemented
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {LOCKED.map((item) => (
                <span
                  key={item.label}
                  style={{
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(245,158,11,0.4)",
                    background: "rgba(245,158,11,0.10)",
                    color: "rgba(255,210,138,0.95)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ width: 12, height: 12 }}>
                    <LockIcon />
                  </span>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <nav
        aria-label="Squidley mobile navigation"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "calc(56px + env(safe-area-inset-bottom, 0px))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: "rgba(6,8,16,0.85)",
          backdropFilter: "blur(22px)",
          WebkitBackdropFilter: "blur(22px)",
          borderTop: "1px solid var(--border-lit)",
          display: "flex",
          alignItems: "stretch",
          zIndex: 80,
        }}
      >
        {MOBILE_TABS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setShowMore(false)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                textDecoration: "none",
                color: active ? item.accent : "var(--text-dim)",
                position: "relative",
              }}
            >
              {active && (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "20%",
                    right: "20%",
                    height: 2,
                    background: item.accent,
                    boxShadow: `0 0 8px ${item.accent}`,
                    borderRadius: "0 0 2px 2px",
                  }}
                />
              )}
              <span style={{ width: 22, height: 22 }}>{item.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          style={{
            flex: 1,
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            color: showMore ? "#a78bfa" : "var(--text-dim)",
          }}
        >
          <span style={{ width: 22, height: 22 }}>
            <ModulesIcon />
          </span>
          <span style={{ fontSize: 11, fontWeight: 600 }}>More</span>
        </button>
      </nav>
    </>
  );
}
