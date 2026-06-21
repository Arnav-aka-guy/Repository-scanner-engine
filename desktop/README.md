# AI Codebase Understanding Engine — Desktop Shell

Electron wrapper that hosts the React frontend and spawns the FastAPI backend.

## Prerequisites

| Tool       | Version  |
|------------|----------|
| Node.js    | 18+      |
| Python     | 3.12+    |
| npm        | 9+       |

## Install

```bash
cd desktop
npm install
```

## Running in Development

You need **three terminals** (or use a process manager):

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
npm start
```

> **Tip:** In dev mode, Electron will also attempt to start the backend automatically.
> If you already have it running, the health-check will pass immediately.

## Production Build

1. Build the frontend:
   ```bash
   cd ../frontend && npm run build
   ```
2. Package with [electron-builder](https://www.electron.build/) or [electron-forge](https://www.electronforge.io/) (not yet configured).

## Project Structure

```
desktop/
├── main.js        # Electron main process (window, IPC, backend spawn)
├── preload.js     # Context-isolated bridge to renderer
├── package.json   # Electron dependencies and scripts
└── README.md      # This file
```

## IPC API

| Channel             | Direction        | Description                                     |
|---------------------|------------------|-------------------------------------------------|
| `select-directory`  | renderer → main  | Opens native directory picker, returns path      |
| `get-app-info`      | renderer → main  | Returns `{ version, platform }`                  |

## Frontend Integration

The preload script exposes `window.electronAPI`:

```typescript
interface ElectronAPI {
  selectDirectory(): Promise<string | null>;
  getAppInfo(): Promise<{ version: string; platform: string }>;
  isElectron: true;
}
```

Check `window.electronAPI?.isElectron` in the React app to conditionally enable
Electron-only features (e.g., native dialogs).
