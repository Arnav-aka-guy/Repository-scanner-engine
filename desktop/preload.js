/**
 * Electron Preload Script
 *
 * Runs in the renderer process before web content loads.  Uses contextBridge
 * to safely expose a minimal API surface ("electronAPI") to the React frontend
 * without enabling full Node access.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * Open the native OS directory-picker dialog.
   * @returns {Promise<string | null>} Selected directory path, or null if cancelled.
   */
  selectDirectory: () => ipcRenderer.invoke("select-directory"),

  /**
   * Return basic information about the running application.
   * @returns {Promise<{version: string, platform: string}>}
   */
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),

  /**
   * Flag so the frontend can detect it is running inside Electron
   * (as opposed to a plain browser window during development).
   */
  isElectron: true,
});
