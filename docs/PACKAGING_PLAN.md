# Peh Public — Packaging Plan

Status: **Design complete, scaffolding started.**
Date: 2026-05-12

## Architecture Assessment

Peh Public is a Next.js 14 App Router application with 7 server-side API
routes that proxy local model requests. It **cannot** be statically exported —
it requires a live Node.js server at runtime.

Key facts:

| Property | Value |
|----------|-------|
| Framework | Next.js 14.2.35 (App Router) |
| Runtime | Node.js (server required for API routes) |
| API routes | 7 (chat, stream, fabrica, oculus, health, models, gauntlet) |
| Standalone build | Yes — `output: "standalone"` produces 25 MB server bundle |
| Static assets | 1.4 MB (.next/static/) |
| Public assets | 1.4 MB (public/) |
| Total packaged size | ~28 MB before Node.js runtime |
| Default port | 3000 (configurable via PORT env var) |
| Env vars (server) | PEH_LOCAL_ENDPOINT, PEH_LOCAL_MODEL, PEH_LOCAL_BACKEND |
| Env vars (client) | NEXT_PUBLIC_BUG_REPORT_EMAIL |
| Disk writes | None (browser-local storage only) |
| External network | None (local endpoints only, zero browser egress) |

## Packaging Strategy: Chosen Approach

### Electron (chosen)

**Why Electron wins for this project:**

1. **Node.js built-in.** Electron ships its own Node.js runtime. The Next.js
   standalone server runs natively inside the Electron main process — no
   separate Node install required from the user.

2. **Proven beginner path.** VS Code, Obsidian, Discord, and Slack all use
   Electron. Users on Windows, Linux, and macOS already trust .exe/.dmg/.deb
   installers from Electron apps.

3. **Single binary distribution.** electron-builder produces:
   - Windows: .exe installer (NSIS) or portable .exe
   - macOS: .dmg with .app bundle
   - Linux: .AppImage and .deb

4. **System tray integration.** A tray icon can show server status, Ollama
   health, and provide quick-launch to the UI.

5. **No port conflicts.** Electron can auto-select a free port for the
   internal Next.js server, then open the browser window to it. Users never
   see port numbers.

6. **Ollama detection.** The main process can probe localhost:11434 to detect
   Ollama and guide setup before showing the main UI.

### Alternatives Considered

| Option | Verdict | Why not |
|--------|---------|---------|
| **Tauri** | Rejected | Tauri's Rust backend cannot run a Node.js server. Would require spawning a separate Node process, losing the clean single-process model. Peh's API routes need Node.js. |
| **Standalone + native launcher** | Rejected for v1 | Requires users to install Node.js separately, or shipping a Node binary manually. More fragile than Electron's built-in Node. Good fallback if Electron size is unacceptable later. |
| **Static export + local proxy** | Impossible | 7 API routes require a Node server. Cannot use `output: "export"`. |
| **Docker** | Not beginner path | Docker is a developer tool. Beginners on Windows/macOS don't have it. Documented as an advanced option only. |
| **Neutralino** | Rejected | Lightweight but no built-in Node.js. Same spawning problem as Tauri. |

### Size Budget

| Component | Estimated Size |
|-----------|---------------|
| Electron runtime | ~85 MB (compressed) |
| Next.js standalone server | ~25 MB |
| Static + public assets | ~3 MB |
| Launcher/setup code | <1 MB |
| **Total installer** | **~110-120 MB** |

This is comparable to VS Code (~120 MB) and smaller than Slack (~170 MB).

## First-Run Guided Setup Flow

```
1. Welcome Screen
   "Welcome to Peh! Your local AI workspace."
   Brief: what Peh is, what local-first means.

2. Local Model Check
   Auto-detect: is Ollama installed and running?
   ├── Ollama found + model available → skip to step 5
   ├── Ollama found + no models → go to step 3
   └── Ollama not found → go to step 3

3. Setup Guide
   OS-detected instructions:
   ├── Windows: "Download Ollama from ollama.com" + link
   ├── macOS: "Download Ollama from ollama.com" + link
   └── Linux: copy-paste `curl -fsSL https://ollama.com/install.sh | sh`
   "After installing, click Verify below."

4. Model Pull
   "Pull your first model:"
   Copy-paste: `ollama pull llama3.2`
   Show progress indicator while waiting.
   "Click Verify when done."

5. Verify Setup
   Run health check → show green/red status
   Run model discovery → show available models
   Run smoke chat → "Ask Peh something to test"

6. Ready Screen
   "You're ready! Everything runs locally."
   Brief: receipts, no cloud, browser storage.
   "Open Peh" button → main app.
```

This flow is implemented as a React page inside Peh itself
(`/setup` route), not as a separate Electron wizard. This means:
- Same UI framework, same theme, same code
- Works in dev mode too (not just packaged)
- Electron just opens this page on first run

## OS-Specific Installer Notes

### Windows (.exe — NSIS installer)

- electron-builder NSIS target
- Start Menu shortcut: "Peh"
- Optional desktop shortcut
- App data in `%LOCALAPPDATA%/Peh/`
- No admin required (per-user install by default)
- Firewall: Windows may prompt for Node.js/Electron network access on first
  launch. The setup guide should explain this is for localhost only.
- Ollama detection: probe `http://localhost:11434/api/tags`
- Ollama install: link to ollama.com/download (Windows .exe installer)

### macOS (.dmg with .app)

- electron-builder dmg target
- Drag-to-Applications flow
- Gatekeeper: unsigned apps show "unidentified developer" warning.
  First preview will be unsigned. Document the `xattr -cr` workaround.
  Code signing requires an Apple Developer account ($99/year) — defer
  to Phase 2.
- Ollama detection: same localhost probe
- Ollama install: link to ollama.com/download (macOS .dmg)

### Linux (.AppImage + .deb)

- electron-builder AppImage (universal) + deb (Ubuntu/Debian)
- AppImage: download, chmod +x, run. No install step.
- .deb: `sudo dpkg -i peh-pub_0.1.0_amd64.deb`
- Ollama detection: same localhost probe
- Ollama install: `curl -fsSL https://ollama.com/install.sh | sh`
- No system package conflicts (Electron bundles its own Node)

## Security / Honesty Requirements

The installer and packaged app MUST NOT:

- Silently install cloud providers or cloud SDKs
- Make any cloud API calls (same zero-egress guarantee as dev mode)
- Hide the local server port from the user
- Claim llama-server is fully validated (still pending)
- Claim Ollama is installed when it is not detected
- Require admin/root privileges unless installing a system package (.deb)
- Bundle telemetry, analytics, or crash reporters
- Auto-update without explicit user consent

The installer MUST:

- Clearly state "local-first — your data stays on your machine"
- Show the same receipts/Tabularium system as dev mode
- Use the same endpoint guard (isAllowedLocalEndpoint) in production
- Label the gauntlet as a smoke test, not a benchmark

## Phased Implementation Plan

### Phase 1: Scaffolding (current)

- [x] Enable `output: "standalone"` in next.config.mjs
- [x] Verify standalone build works (25 MB, server.js entry)
- [x] Verify tests/typecheck pass with standalone config
- [ ] Add electron/ directory with main process entry
- [ ] Add electron-builder config to package.json
- [ ] Add launcher script that starts Next.js server + opens window
- [ ] Add Ollama health probe to main process

### Phase 2: First-Run Setup Page

- [ ] Create /setup page with guided setup flow
- [ ] Ollama detection component (health + models)
- [ ] OS-detection for platform-specific instructions
- [ ] Model pull guidance
- [ ] Smoke chat verification
- [ ] "You are ready" completion screen
- [ ] Electron opens /setup on first launch, /colloquium thereafter

### Phase 3: Platform Builds

- [ ] Windows NSIS .exe build via electron-builder
- [ ] macOS .dmg build (unsigned preview)
- [ ] Linux .AppImage build
- [ ] Linux .deb build
- [ ] Test install/launch on each platform
- [ ] Document Gatekeeper workaround for unsigned macOS

### Phase 4: Polish

- [ ] System tray icon with Ollama status
- [ ] Auto-select free port (avoid conflicts)
- [ ] Graceful shutdown (stop Next.js server on quit)
- [ ] Window title and icon branding
- [ ] First-launch detection (localStorage or app data flag)

### Phase 5: Distribution

- [ ] macOS code signing (requires Apple Developer account)
- [ ] Windows code signing (optional, reduces SmartScreen warnings)
- [ ] GitHub Releases with platform-specific downloads
- [ ] README install instructions for each platform
- [ ] Docker image as advanced/developer option

## Risks

| Risk | Mitigation |
|------|------------|
| Electron size (~120 MB) | Acceptable for desktop app. Comparable to VS Code. |
| Unsigned macOS builds | Document xattr workaround. Sign in Phase 5. |
| Windows SmartScreen | Document "More info → Run anyway". Sign in Phase 5. |
| Port 3000 conflicts | Auto-select free port in Electron main process. |
| Electron security surface | Disable nodeIntegration, enable contextIsolation, restrict navigation to localhost only. |
| Node.js version drift | Electron pins its Node version. Standalone build is self-contained. |

## What Remains Before a Windows .exe Preview

1. Add electron dependency and main process script (~50 lines)
2. Add electron-builder config to package.json
3. Create `electron/main.js` launcher
4. Build standalone → package with electron-builder
5. Test .exe on a Windows machine

Estimated effort: small. The hard architecture work (standalone build,
API routes, local safety) is already done.
