import type { ReactNode } from "react";

export type IconRender = ReactNode;

const stroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <circle cx="8.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FabricaIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M12 12v5" />
      <path d="M9.5 14.5h5" />
    </svg>
  );
}

export function ArchivumIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

export function MoreInputIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 18l4 3v-3" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
    </svg>
  );
}

export function VelumIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 2C7 2 4 6 4 11c0 6 8 11 8 11s8-5 8-11c0-5-3-9-8-9z" />
      <circle cx="12" cy="11" r="3" />
    </svg>
  );
}

export function ArchelonIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function OculusIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function TabulariumIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
    </svg>
  );
}

export function NousIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
    </svg>
  );
}

export function ModulesIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M3 12L12 4l9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function LegatusIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-4 0v2" />
      <circle cx="12" cy="14" r="2" />
    </svg>
  );
}

export function ProbatioIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M9 2h6" />
      <path d="M10 2v6l-5 11a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-11V2" />
    </svg>
  );
}

export function ImperiumIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="4" cy="6" r="2" />
      <circle cx="20" cy="6" r="2" />
      <circle cx="4" cy="18" r="2" />
      <circle cx="20" cy="18" r="2" />
      <path d="M5.5 7.5L9 10.5" />
      <path d="M18.5 7.5L15 10.5" />
      <path d="M5.5 16.5L9 13.5" />
      <path d="M18.5 16.5L15 13.5" />
    </svg>
  );
}

export function ImaginaniumIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="M21 16l-5-5L5 21" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" />
    </svg>
  );
}
