/**
 * Electron Main Process — Repository Scanner Engine v2.0
 *
 * Features:
 *  - Native OS menu with File / View / Window / Help
 *  - IPC: directory picker, open-in-browser, app info, backend logs stream
 *  - Backend child-process lifecycle with health polling and graceful teardown
 *  - Single-instance lock prevents duplicate windows
 *  - Crash handler notifies user via dialog
 */

'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  shell,
} = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Dev / prod detection
// ---------------------------------------------------------------------------
let isDev;
try {
  isDev = require('electron-is-dev');
} catch {
  isDev = !app.isPackaged;
}

const BACKEND_PORT = process.env.BACKEND_PORT || 8000;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// ---------------------------------------------------------------------------
// Backend child-process
// ---------------------------------------------------------------------------
let backendProcess = null;

function waitForBackend(url, timeout = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.setTimeout(2000);
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Backend failed to start within timeout'));
        } else {
          setTimeout(attempt, 600);
        }
      });
      req.end();
    };
    attempt();
  });
}

function startBackend() {
  const projectRoot = path.resolve(__dirname, '..');
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  backendProcess = spawn(
    pythonCmd,
    ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
    {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  );

  backendProcess.stdout.on('data', (d) =>
    console.log('[backend]', d.toString().trim())
  );
  backendProcess.stderr.on('data', (d) =>
    console.error('[backend:err]', d.toString().trim())
  );
  backendProcess.on('close', (code) => {
    console.log(`[backend] exited with code ${code}`);
    backendProcess = null;
  });
  backendProcess.on('error', (err) => {
    console.error('[backend] failed to spawn:', err);
    dialog.showErrorBox(
      'Backend Error',
      `Could not start the Python backend.\n\n${err.message}\n\nEnsure Python and uvicorn are installed.`
    );
  });
}

function killBackend() {
  if (!backendProcess) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(backendProcess.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      backendProcess.kill('SIGTERM');
    }
  } catch (err) {
    console.error('Failed to kill backend:', err);
  }
  backendProcess = null;
}

// ---------------------------------------------------------------------------
// Native application menu
// ---------------------------------------------------------------------------
function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // App menu (macOS only)
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),

    // File
    {
      label: 'File',
      submenu: [
        {
          label: 'Select Repository…',
          accelerator: 'CmdOrCtrl+O',
          async click() {
            const win = BrowserWindow.getFocusedWindow();
            if (!win) return;
            const result = await dialog.showOpenDialog(win, {
              properties: ['openDirectory'],
              title: 'Select Repository Directory',
            });
            if (!result.canceled && result.filePaths.length > 0) {
              win.webContents.send('open-repository', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // Edit
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },

    // View
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    // Window
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : [{ role: 'close' }]),
      ],
    },

    // Help
    {
      role: 'help',
      submenu: [
        {
          label: 'Open Backend API Docs',
          click() {
            shell.openExternal(`${BACKEND_URL}/api/docs`);
          },
        },
        {
          label: 'Open GitHub Repository',
          click() {
            shell.openExternal('https://github.com/Arnav-aka-guy/Repository-scanner-engine');
          },
        },
        { type: 'separator' },
        {
          label: 'About Repository Scanner Engine',
          click() {
            dialog.showMessageBox({
              type: 'info',
              title: 'About',
              message: 'Repository Scanner Engine',
              detail: `Version: ${app.getVersion()}\nPlatform: ${process.platform}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChromium: ${process.versions.chrome}`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#1e1e2e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Disallow navigation to external origins
      webSecurity: true,
    },
    // macOS traffic lights
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent navigation to external pages (security)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = [BACKEND_URL, 'http://localhost:5173'];
    const isAllowed = allowed.some((a) => url.startsWith(a)) || url.startsWith('file://');
    if (!isAllowed) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Open new-window links in OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function loadFrontend() {
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(
      path.join(__dirname, '..', 'frontend', 'dist', 'index.html')
    );
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function setupIPC() {
  // Native directory picker
  ipcMain.handle('select-directory', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Repository Directory',
    });
    return result.canceled || !result.filePaths.length ? null : result.filePaths[0];
  });

  // App metadata
  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    node: process.versions.node,
    backendUrl: BACKEND_URL,
  }));

  // Open OS file browser at path
  ipcMain.handle('show-in-folder', (_event, filePath) => {
    shell.showItemInFolder(filePath);
  });

  // Open external URL in OS default browser
  ipcMain.handle('open-external', (_event, url) => {
    const safe = url.startsWith('https://') || url.startsWith('http://');
    if (safe) shell.openExternal(url);
  });
}

// ---------------------------------------------------------------------------
// Second-instance handler (single-instance lock)
// ---------------------------------------------------------------------------
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  buildMenu();
  setupIPC();
  createWindow();

  startBackend();
  try {
    console.log('[main] Waiting for backend…');
    await waitForBackend(`${BACKEND_URL}/health`);
    console.log('[main] Backend ready.');
  } catch (err) {
    console.error('[main]', err.message);
    // Frontend will show its own disconnected state — don't block startup
  }

  loadFrontend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    loadFrontend();
  }
});

app.on('before-quit', killBackend);
app.on('will-quit', killBackend);
