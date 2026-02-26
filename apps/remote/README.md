# Squidley Remote Cockpit

**Part of the `extras` track — not required for core Squidley operation.**

A mobile-friendly remote control panel for Squidley. Designed to be used over Tailscale from your phone or iPad while away from your desk.

## What it does

- Shows Squidley's live status — online/offline, active zone, cloud access, active model
- Heartbeat ping — confirm the local model is alive and responding
- Quick Launch — trigger common tool plans (repo check, build, tests) with one tap
- Activity Log — plain-English summary of recent events, no raw JSON
- Auto-refreshes every 15 seconds

## What it does NOT do

- No arbitrary shell access
- No zone changes (use the main UI for that)
- No memory editing
- No chat (use the main UI for that)

This is a control surface, not a full UI.

## Setup

### 1. Install dependencies

From the repo root:
```bash
pnpm install
```

### 2. Environment

The remote cockpit reads from the same env as the API. Make sure `ZENSQUID_ADMIN_TOKEN` is set in your environment or `/etc/zensquid/env`.

No new secrets needed.

### 3. Run in dev mode

```bash
./ops/scripts/zensquid-remote-run.sh
```

Or directly:
```bash
pnpm --filter @zensquid/remote dev
```

Opens on **port 3002**.

### 4. Access over Tailscale

With Tailscale running on ZenPop, access from any device on your tailnet:

```
http://<your-tailscale-hostname>:3002
```

Find your Tailscale hostname with:
```bash
tailscale status
```

### 5. Run as a systemd service (optional)

```bash
sudo cp ops/systemd/zensquid-remote.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zensquid-remote
```

## Architecture

```
[iPad / Phone]
     |
  Tailscale
     |
[apps/remote — port 3002]  ← Next.js server
     |
  localhost
     |
[apps/api — port 18790]    ← Squidley core API
     |
  Ollama / local models
```

The remote app is a thin proxy — it never talks to Ollama directly. All intelligence stays in the core API. The remote just reads state and triggers approved tool plans.

## Adding more Quick Launch buttons

Edit `apps/remote/app/page.tsx` — find the `LAUNCHES` array near the top and add entries:

```typescript
{
  id: "my-task",
  title: "My Task",
  sub: "tool.id",
  steps: [{ tool: "tool.id" }],
  goal: "Description of what this does",
},
```

The tool must already be in Squidley's allowlist.

## Future extras (not built yet)

- Push notifications when approval is needed
- Pending approval queue with approve/deny buttons
- Session continuity — attach to a running plan midstream
- Diff preview for file changes
- Cost / token meter
