/**
 * Electron Main Process
 *
 * Creates the BrowserWindow, spawns the FastAPI backend as a child process,
 * waits for it to become healthy, then loads the React frontend.
 */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

// ---------------------------------------------------------------------------
// Detect dev vs. production
// ---------------------------------------------------------------------------
let isDev;
try {
  isDev = require("electron-is-dev");
} catch {
  isDev = !app.isPackaged;
}

// ---------------------------------------------------------------------------
// Backend child-process handle
// ---------------------------------------------------------------------------
let backendProcess = null;

/**
 * Poll the FastAPI backend until it responds (or timeout).
 * @param {string} url    URL to poll (e.g. http://127.0.0.1:8000)
 * @param {number} timeout  Milliseconds before giving up
 * @returns {Promise<void>}
 */
function waitForBackend(url, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume(); // consume response so socket closes
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeout) {
          reject(new Error("Backend failed to start within timeout"));
        } else {
          setTimeout(attempt, 500);
        }
      });
      req.end();
    };
    attempt();
  });
}

/**
 * Spawn the FastAPI backend as a child process.
 */
function startBackend() {
  const projectRoot = path.resolve(__dirname, "..");

  backendProcess = spawn(
    "python",
    ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      // On Windows keep the child in the same console group so we can kill it.
      windowsHide: true,
    }
  );

  backendProcess.stdout.on("data", (data) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr.on("data", (data) => {
    console.error(`[backend:err] ${data.toString().trim()}`);
  });

  backendProcess.on("close", (code) => {
    console.log(`[backend] process exited with code ${code}`);
    backendProcess = null;
  });
}

/**
 * Forcefully kill the backend process (and any children on Windows).
 */
function killBackend() {
  if (!backendProcess) return;
  try {
    if (process.platform === "win32") {
      // taskkill /T kills the process tree on Windows
      spawn("taskkill", ["/pid", backendProcess.pid.toString(), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      backendProcess.kill("SIGTERM");
    }
  } catch (err) {
    console.error("Failed to kill backend:", err);
  }
  backendProcess = null;
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  const windowOptions = {
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#1e1e2e",
    show: false, // show after ready-to-show to avoid flash
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  };

  // macOS: use hidden inset title bar for a cleaner look
  if (process.platform === "darwin") {
    windowOptions.titleBarStyle = "hiddenInset";
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Graceful reveal
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Load the frontend into the BrowserWindow.
 * - Dev:  Vite dev server at http://localhost:5173
 * - Prod: built files from ../frontend/dist/index.html
 */
function loadFrontend() {
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    // Optionally open DevTools in dev mode
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "..", "frontend", "dist", "index.html")
    );
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function setupIPC() {
  // Open a native directory-picker dialog
  ipcMain.handle("select-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select Repository Directory",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Return basic app metadata
  ipcMain.handle("get-app-info", () => ({
    version: app.getVersion(),
    platform: process.platform,
  }));
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  setupIPC();
  
  createWindow();

  // Start backend and wait for it to be healthy
  startBackend();
  try {
    console.log("[main] Waiting for backend to become ready…");
    await waitForBackend("http://127.0.0.1:8000");
    console.log("[main] Backend is ready.");
  } catch (err) {
    console.error("[main]", err.message);
    // Load the frontend anyway — it can show a connection-error state
  }

  loadFrontend();
});

app.on("window-all-closed", () => {
  // On macOS apps typically stay active until Cmd+Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // Re-create window when dock icon is clicked (macOS)
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    loadFrontend();
  }
});

app.on("before-quit", () => {
  killBackend();
});

app.on("will-quit", () => {
  killBackend();
});
