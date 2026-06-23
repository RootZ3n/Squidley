/**
 * Peh — Electron main process.
 *
 * Starts the Next.js standalone server on a free port, then opens an
 * Electron BrowserWindow pointing at the local server. No cloud calls,
 * no telemetry, no auto-updates.
 *
 * Security:
 *  - nodeIntegration OFF
 *  - contextIsolation ON
 *  - Navigation restricted to localhost only
 *  - No remote module
 */

const { app, BrowserWindow, shell, ipcMain } = require("electron");
const { createServer } = require("net");
const { spawn } = require("child_process");
const path = require("path");

/** Find a free TCP port by binding to port 0. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

/** Wait for the Next.js server to respond on the given port. */
async function waitForServer(port, timeoutMs = 30_000) {
  const start = Date.now();
  const url = `http://127.0.0.1:${port}/api/local/health`;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 503) return; // 503 = Ollama down, but server is up
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Next.js server did not start within ${timeoutMs}ms`);
}

let serverProcess = null;

async function startNextServer(port) {
  const standaloneDir = path.join(__dirname, "..", ".next", "standalone");
  const serverScript = path.join(standaloneDir, "server.js");

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
  };

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: standaloneDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (data) => {
    process.stdout.write(`[next] ${data}`);
  });

  serverProcess.stderr.on("data", (data) => {
    process.stderr.write(`[next] ${data}`);
  });

  serverProcess.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`Next.js server exited with code ${code}`);
    }
    serverProcess = null;
  });

  await waitForServer(port);
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Peh",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Restrict navigation to localhost only
  win.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  // Open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
        shell.openExternal(url);
      }
    } catch {
      // ignore invalid URLs
    }
    return { action: "deny" };
  });

  // First-run detection: open /setup if no flag, /colloquium otherwise.
  // The flag is written by the renderer via IPC (preload.js exposes
  // electronAPI.markSetupComplete → setup:complete channel).
  const fs = require("fs");
  const startPath = fs.existsSync(setupFlagPath) ? "/colloquium" : "/setup";

  win.loadURL(`http://127.0.0.1:${port}${startPath}`);

  return win;
}

// IPC handler: renderer calls electronAPI.markSetupComplete() → writes flag file.
const setupFlagPath = path.join(app.getPath("userData"), "setup-complete");
ipcMain.handle("setup:complete", () => {
  const fs = require("fs");
  try {
    fs.writeFileSync(setupFlagPath, new Date().toISOString(), "utf8");
    return { ok: true };
  } catch (err) {
    console.error("Failed to write setup-complete flag:", err);
    return { ok: false, error: String(err) };
  }
});

app.whenReady().then(async () => {
  try {
    const port = await findFreePort();
    console.log(`Starting Next.js server on port ${port}...`);
    await startNextServer(port);
    console.log(`Next.js server ready on http://127.0.0.1:${port}`);
    createWindow(port);
  } catch (err) {
    console.error("Failed to start Peh:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
});
