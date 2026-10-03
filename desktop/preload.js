/**
 * Electron Preload Script — Repository Scanner Engine v2.0
 *
 * Exposes a minimal, typed API via contextBridge so the React frontend
 * can safely interact with native OS features without full Node access.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Flag so the frontend knows it is running inside Electron. */
  isElectron: true,

  /**
   * Open the native OS directory-picker dialog.
   * @returns {Promise<string | null>} Absolute path, or null if cancelled.
   */
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  /**
   * Get application and runtime metadata.
   * @returns {Promise<{version: string, platform: string, electron: string, node: string, backendUrl: string}>}
   */
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  /**
   * Reveal a file or folder in the OS file browser (Finder / Explorer).
   * @param {string} filePath Absolute path to reveal.
   */
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),

  /**
   * Open a URL in the system default browser.
   * Only http:// and https:// URLs are allowed.
   * @param {string} url
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /**
   * Listen for 'open-repository' messages pushed by the main process
   * (e.g. when the user picks a repo via the File menu).
   * @param {(path: string) => void} callback
   * @returns {() => void} Unsubscribe function.
   */
  onOpenRepository: (callback) => {
    const handler = (_event, repoPath) => callback(repoPath);
    ipcRenderer.on('open-repository', handler);
    return () => ipcRenderer.removeListener('open-repository', handler);
  },
});
