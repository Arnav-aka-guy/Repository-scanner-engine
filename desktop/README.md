# Repository Scanner Engine — Desktop Shell v2.0

Electron wrapper that hosts the React frontend and spawns the FastAPI backend as a child process.

## Prerequisites

| Tool    | Minimum version |
|---------|----------------|
| Node.js | 18+            |
| Python  | 3.12+          |
| npm     | 9+             |

## Install

```bash
cd desktop
npm install
```

## Running in Development

You need **three terminals** (or a process manager):

### 1. Start the Backend

```bash
cd ..
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Start the Frontend (Vite Dev Server)

```bash
cd ../frontend
npm run dev
```

### 3. Start Electron

```bash
cd desktop
npm start
```

> **Tip:** In dev mode Electron also tries to start the backend itself.  
> If you already have it running, the health-check passes immediately.

---

## Production Build

1. Build the frontend:
   ```bash
   cd ../frontend && npm run build
   ```
2. Package with [electron-builder](https://www.electron.build/) or [electron-forge](https://www.electronforge.io/).

---

## Project Structure

```
desktop/
├── main.js      # Electron main process (window, IPC, backend lifecycle, native menu)
├── preload.js   # Context-isolated bridge exposed to the React renderer
├── package.json # Dependencies and scripts
└── README.md    # This file
```

---

## IPC API (window.electronAPI)

Exposed by `preload.js` to the React renderer via `contextBridge`:

| Method / Property          | Direction       | Description                                                  |
|----------------------------|-----------------|--------------------------------------------------------------|
| `isElectron`               | property        | `true` — detect desktop shell vs plain browser               |
| `selectDirectory()`        | renderer → main | Opens native directory picker; returns selected path or null |
| `getAppInfo()`             | renderer → main | Returns `{ version, platform, electron, node, backendUrl }`  |
| `showInFolder(filePath)`   | renderer → main | Reveals a file in Finder / Explorer                          |
| `openExternal(url)`        | renderer → main | Opens URL in OS default browser (https/http only)            |
| `onOpenRepository(cb)`     | main → renderer | Subscribe to File → Open Repository menu action; returns unsub |

### Listening for menu-initiated repo opens

```typescript
useEffect(() => {
  if (!window.electronAPI?.isElectron) return;
  const unsub = window.electronAPI.onOpenRepository((repoPath) => {
    setActiveRepository(repoPath);
  });
  return unsub; // cleanup on unmount
}, []);
```

---

## Native Menu

| Menu  | Item                    | Shortcut        | Action                                  |
|-------|-------------------------|-----------------|-----------------------------------------|
| File  | Select Repository…      | Ctrl/Cmd+O      | Directory picker → sends `open-repository` to renderer |
| View  | Reload / DevTools       | F5 / F12        | Standard Electron roles                 |
| Help  | Open Backend API Docs   | —               | Opens `http://127.0.0.1:8000/docs`      |
| Help  | Open GitHub Repository  | —               | Opens project GitHub page               |
| Help  | About                   | —               | Shows version dialog                    |

---

## Environment Variables

| Variable       | Default | Description                                    |
|----------------|---------|------------------------------------------------|
| `BACKEND_PORT` | `8000`  | Port the Python backend listens on             |

---

## Security

- `nodeIntegration: false` — no Node access in renderer
- `contextIsolation: true` — preload runs in isolated context
- `webSecurity: true` — same-origin policy enforced
- `will-navigate` guard: external URLs are opened in OS browser, not in-app
- `setWindowOpenHandler`: new-window requests are denied in-app and opened in OS browser
