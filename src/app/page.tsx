"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PehMascot } from "@/components/PehMascot";
import { AppPageShell } from "@/components/shell/AppPageShell";
import {
  readFirstRunCompleted,
  readTourCompleted,
  readTourMode,
  writeFirstRunChoice,
} from "@/lib/firstRun";
import {
  getCloudUnlockModules,
  getCoreLocalModules,
} from "@/lib/modules/registry";

const VALUE_POINTS = [
  {
    title: "Local-first",
    body: "Core modules run on your device. Nothing is sent anywhere unless you ask.",
    accent: "#4df5c8",
  },
  {
    title: "Peh teaches as you go",
    body: "A short tour shows you each part of the screen, in plain language.",
    accent: "#bc8cff",
  },
  {
    title: "Beginner-safe by default",
    body: "Calm defaults, no autonomous shells, no surprise cloud calls.",
    accent: "#fb923c",
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [returning, setReturning] = useState(false);
  const [tourCompleted, setTourCompleted] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setReturning(readFirstRunCompleted());
    setTourCompleted(readTourCompleted());
  }, []);

  function startTour() {
    writeFirstRunChoice("on");
    router.push("/colloquium?tour=1");
  }

  function skipTour() {
    writeFirstRunChoice("off");
    router.push("/colloquium");
  }

  function continueAsBefore() {
    const mode = readTourMode();
    router.push(mode === "on" ? "/colloquium?tour=1" : "/colloquium");
  }

  const core = getCoreLocalModules();
  const cloud = getCloudUnlockModules();

  return (
    <AppPageShell
      eyebrow="Peh · welcome"
      title="Hi, I'm Peh."
      intro="A friendly companion that runs on your device. Take a 60-second guided tour, or jump straight into Colloquium."
      accent="#bc8cff"
      headerRight={
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid rgba(77,245,200,0.42)",
            background: "rgba(77,245,200,0.08)",
            color: "#7bffdd",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#4df5c8",
              boxShadow: "0 0 8px rgba(77,245,200,0.55)",
            }}
          />
          Local-only · stays on this device
        </span>
      }
    >
      <section
        className="sq-glass sq-fade-in"
        style={{
          padding: "32px clamp(20px, 4vw, 48px)",
          display: "grid",
          gridTemplateColumns: "minmax(0, 220px) 1fr",
          gap: 32,
          alignItems: "center",
        }}
      >
        <div style={{ justifySelf: "center" }}>
          <PehMascot size={220} animated priority />
        </div>
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "clamp(22px, 2.4vw, 30px)",
              letterSpacing: "0.02em",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Start here.
          </h2>
          <p
            style={{
              marginTop: 10,
              fontSize: 16,
              lineHeight: 1.6,
              color: "rgba(238,240,255,0.78)",
              maxWidth: 560,
            }}
          >
            Peh is a calm, local-first AI workspace. Pick the tour and I&rsquo;ll
            walk you through every screen, or skip ahead and start chatting.
          </p>
          <div
            style={{
              marginTop: 22,
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={startTour}
              className="sq-btn sq-btn-primary"
              style={{ fontSize: 15, padding: "10px 22px", minWidth: 160 }}
            >
              Start Tour
            </button>
            <button
              type="button"
              onClick={skipTour}
              className="sq-btn"
              style={{ fontSize: 15, padding: "10px 22px", minWidth: 160 }}
            >
              Skip Tour
            </button>
            {hydrated && returning && (
              <button
                type="button"
                onClick={continueAsBefore}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent-vision)",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                  textUnderlineOffset: "4px",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                }}
              >
                {tourCompleted ? "Continue where I left off" : "Continue as before"}
              </button>
            )}
          </div>
          <p
            style={{
              marginTop: 14,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            About 60 seconds · choice saved on this device only
          </p>
        </div>
      </section>

      <section
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {VALUE_POINTS.map((p) => (
          <article
            key={p.title}
            className="sq-glass"
            style={{
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: `radial-gradient(circle, ${p.accent}66, transparent 70%)`,
                border: `1px solid ${p.accent}55`,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: p.accent,
              }}
            >
              ◆
            </span>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {p.title}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-dim)" }}>
              {p.body}
            </p>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 28 }}>
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Core modules
            </h2>
            <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-dim)" }}>
              Beginner-safe · work locally without a cloud account.
            </p>
          </div>
          <Link
            href="/modules"
            style={{
              color: "var(--accent-vision)",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              textUnderlineOffset: "4px",
              fontSize: 14,
            }}
          >
            See all →
          </Link>
        </header>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "14px 0 0",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {core.map((m) => (
            <li
              key={m.id}
              title={m.beginnerDescription}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid rgba(77,245,200,0.32)",
                background: "rgba(77,245,200,0.06)",
                color: "#cdfdec",
                fontSize: 13,
              }}
            >
              {m.displayName}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 24 }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Cloud Unlock
          </h2>
          <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-dim)" }}>
            Advanced modules · shown so you know they exist. Locked in public mode.
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "14px 0 0",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {cloud.map((m) => (
              <li
                key={m.id}
                title={`${m.beginnerDescription} (locked in public mode)`}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: "1px solid rgba(245,158,11,0.42)",
                  background: "rgba(245,158,11,0.08)",
                  color: "#ffd28a",
                  fontSize: 13,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span aria-hidden>🔒</span>
                {m.displayName}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </AppPageShell>
  );
}
