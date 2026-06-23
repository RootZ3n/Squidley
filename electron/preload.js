/**
 * Pehlichi — Electron preload script.
 *
 * Exposes a minimal, safe API to the renderer via contextBridge.
 * Only the operations the renderer actually needs are exposed:
 *   - markSetupComplete(): writes the setup-complete flag so the main process
 *     knows to skip the /setup page on next launch.
 *
 * Security: contextIsolation is ON, sandbox is ON, nodeIntegration is OFF.
 * The renderer cannot access Node.js APIs directly — only the functions
 * exposed here are available on `window.electronAPI`.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /** Tell the main process that setup is complete. Writes a flag file. */
  markSetupComplete: () => ipcRenderer.invoke("setup:complete"),
});
