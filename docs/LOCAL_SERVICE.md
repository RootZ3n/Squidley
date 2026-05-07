# Local User Service

Public Squidley can run as a local user-level systemd service. This is useful
when you want to treat the app like a local product instead of starting the
Next.js process by hand every time.

This setup does not add cloud behavior, accounts, telemetry, a backend
database, agents, tools, or shell execution inside the product. It only starts
the existing production Next.js app locally.

## What the Service Runs

The service file lives in:

```text
ops/systemd/squidley-public.service
```

It is intended to be installed at:

```text
~/.config/systemd/user/squidley-public.service
```

It runs:

```bash
npm run start
```

from:

```text
/mnt/ai/squidley
```

with:

```text
NODE_ENV=production
PORT=3000
```

The service expects the app to be built before it starts. It does not run
`npm install` or `npm run build` inside `ExecStart`.

## Install the User Service

From the repo root:

```bash
chmod +x ops/install-user-service.sh
./ops/install-user-service.sh
```

The installer:

- creates `~/.config/systemd/user` if needed
- copies the service file
- runs `systemctl --user daemon-reload`
- enables `squidley-public.service`

It does not require root and does not use `sudo`.

Build and start the service:

```bash
npm run build
systemctl --user start squidley-public.service
```

Open:

```text
http://localhost:3000
```

## Start, Stop, Restart, Status

```bash
systemctl --user start squidley-public.service
systemctl --user stop squidley-public.service
systemctl --user restart squidley-public.service
systemctl --user status squidley-public.service
```

## Logs

Follow logs:

```bash
journalctl --user -u squidley-public.service -f
```

Show recent logs:

```bash
journalctl --user -u squidley-public.service --no-pager -n 80
```

## Rebuild Flow

Use the rebuild helper after code changes:

```bash
chmod +x ops/squidley-public-rebuild.sh
./ops/squidley-public-rebuild.sh
```

It runs:

```bash
npm run typecheck
npm test
npm run build
systemctl --user restart squidley-public.service
systemctl --user --no-pager status squidley-public.service
```

If any check fails, the script stops before restarting the service.

## Shell Aliases

Source the alias file from your shell:

```bash
source /mnt/ai/squidley/ops/squidley-public-aliases.sh
```

Available aliases:

```bash
sqpub-status
sqpub-start
sqpub-stop
sqpub-restart
sqpub-logs
sqpub-build
sqpub-check
sqpub-rebuild
```

To load them automatically, add this to your shell profile:

```bash
source /mnt/ai/squidley/ops/squidley-public-aliases.sh
```

## Keeping the Service Running After Logout

Some systems stop user services when you log out. To keep the user service
available after logout:

```bash
loginctl enable-linger "$USER"
```

This is optional for local development.

## Ollama

Ollama must run separately. Public Squidley expects the local model server at:

```text
http://localhost:11434
```

Start Ollama if needed:

```bash
ollama serve
```

Pull a basic chat model:

```bash
ollama pull llama3.2
```

## Troubleshooting

### Port 3000 Is Already in Use

Check what is listening:

```bash
ss -ltnp | grep ':3000'
```

Stop the other process or change the service `PORT` value before starting.

### Service Fails Because the Build Is Missing

Run:

```bash
cd /mnt/ai/squidley
npm run build
systemctl --user restart squidley-public.service
```

### npm or node Is Not Found Under systemd

User services may have a smaller `PATH` than your interactive shell. Check logs:

```bash
journalctl --user -u squidley-public.service --no-pager -n 80
```

If `npm` is not found, update the service `ExecStart` to use the absolute path
shown by:

```bash
command -v npm
```

Then reload and restart:

```bash
systemctl --user daemon-reload
systemctl --user restart squidley-public.service
```

### Ollama Is Not Running

The app can still load, but Colloquium/Oculus/Fabrica local model actions will
show local server guidance until Ollama is reachable.

Start Ollama:

```bash
ollama serve
```
