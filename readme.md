# Repository Scanner Engine v2.0

An AI-powered codebase intelligence platform that indexes, analyses, and visualises software repositories. Combines AST parsing, interactive graph intelligence, isolated semantic vector search, Graph-RAG conversation with exact citations, incremental change detection, and code health analysis.

> **v2.0 Highlights:** Strict Canonical Path Validation · Per-Repository FAISS Isolation · Auto-Persistence · Incremental Rescanning · Async Background Scan Jobs · Public GitHub URL Scanning · JWT Auth Enforced · Rate Limiting · Scanner Resource Limits · Modular Health Dashboard · Production SPA Static Serving · 140+ Tests · Strict Mypy & Ruff CI

---

## 🌟 Core Features

### 📁 1. Repository Explorer & Multi-Language AST
- **AST-Based Parser**: Performs detailed static code analysis to extract directories, files, imports, classes, functions, methods, and relationships.
- **Language Extensibility**: Pluggable `LanguageParser` protocol supporting Python, TypeScript, and JavaScript with support for future language additions.
- **Incremental Rescanning**: Computes file manifests with SHA-256 hashes. Only modified and newly created files are parsed and re-embedded, while deleted files are purged immediately.
- **Strict Canonical Security**: File exploration enforces absolute canonical path containment inside the repository root, blocking `../` traversal, symlink escapes, and Windows device/UNC path tricks.

### 🌐 2. Public GitHub Scanning
- **Safe Remote Scanning**: Scan public GitHub repositories directly via `POST /api/repository/scan-github`.
- **Injection-Safe Shallow Clones**: Validates URLs with strict HTTPS patterns, prevents command injection, performs `--depth 1` shallow clones, and isolates temporary data.

### ⚡ 3. Asynchronous Scan Jobs
- **Background Task Processing**: Non-blocking scanning for large repositories via `POST /api/repository/scan/async`.
- **Status & Progress Polling**: Poll `GET /api/repository/scan/jobs/{job_id}` for real-time progress percentages, status stages, and completion diagnostics.

### 🕸️ 4. Dependency Graph Viewer
- **Interactive Visualizer**: Dynamic 2D rendering of class and module relationships powered by graph layout algorithms.
- **Relationship Filtering**: Highlight import statements, inheritance hierarchies, parent-child containments, and cross-module call graphs.

### 🔍 5. Semantic Code Search
- **Repository-Isolated Vector Store**: Independent FAISS index per repository. Searching Repository A never bleeds results into Repository B.
- **Auto-Persistence**: Vector indexes and metadata are automatically persisted to disk (`data/embeddings/<repo_id>/index.faiss`) and reloaded across restarts without re-embedding.
- **Deterministic Mock Encoder**: Optional `MOCK_EMBEDDINGS=true` mode for lightning-fast testing and CI execution without downloading multi-gigabyte models.

### 💬 6. Graph-RAG AI Chat with Source Citations
- **Context-Aware Assistance**: Chat with local or cloud LLMs (Groq, OpenAI, Ollama, OpenRouter) grounded in actual code structures.
- **Exact Source Citations**: Responses include explicit file, function, and line-range citations (`Sources: - <file_path>:<start_line>-<end_line>`) linking directly into the code explorer.

### 🩺 7. Health & Technical Debt Dashboard
- **Explainable Health Score**: Structured breakdown covering Documentation, Complexity, Architecture, Maintainability, and Security.
- **Comprehensive Secret Detection**: Scans entire source files and configuration files for exposed API keys and credentials, with automated redaction.
- **Modular Architecture**: Modular frontend components (`HealthOverview`, `HealthCategoryBreakdown`, `TechnicalDebtPanel`, `DependencyRiskPanel`).

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS v4, Zustand, Framer Motion |
| **Backend** | Python 3.12+, FastAPI, Uvicorn, Pydantic v2 |
| **Desktop Shell** | Electron |
| **Security** | JWT (python-jose), slowapi rate limiting, canonical path validation, input sanitization |
| **Database** | Optional PostgreSQL (SQLAlchemy 2.0 async, Alembic) — runs standalone by default |
| **Code Analysis** | Python AST, TypeScript/JavaScript parser, pluggable LanguageParser protocol |
| **Graph Processing** | NetworkX |
| **Vector Index** | Sentence Transformers (`all-MiniLM-L6-v2`), FAISS (CPU IndexFlatIP), Incremental Caching |
| **AI Providers** | Groq (default), Ollama (local offline), OpenAI, OpenRouter |
| **Infrastructure** | Docker multi-stage builds, Docker Compose, GitHub Actions CI/CD |

---

## 🏗️ System Architecture

```text
       ┌────────────────────────────────────────────────────────┐
       │                   Desktop Shell                        │
       │                    (Electron)                          │
       └─────────────────────────┬──────────────────────────────┘
                                 │ Hosts Frontend
                                 v
       ┌────────────────────────────────────────────────────────┐
       │                Vite React Frontend                     │
       │   (Health Dashboard, Dependency Graph, Search, Chat)   │
       └─────────────────────────┬──────────────────────────────┘
                                 │ HTTP / REST (SPA served by FastAPI in prod)
                                 v
       ┌────────────────────────────────────────────────────────┐
       │              Security Middleware Layer                  │
       │ (JWT Auth, slowapi Rate Limiter, Sanitizer, Validator) │
       └─────────────────────────┬──────────────────────────────┘
                                 │
                                 v
       ┌────────────────────────────────────────────────────────┐
       │                   FastAPI Backend                      │
       │    (Async Scan Jobs, SPA Fallback, Dependency Inject)  │
       └──┬──────────┬───────────┬──────────┬──────────────┬────┘
          │          │           │          │              │
          v          v           v          v              v
   ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐
   │  Parser  │ │  Graph   │ │Semantic │ │ Services │ │    LLM   │
   │ Service  │ │(NetworkX)│ │ (FAISS) │ │ (Health, │ │ Provider │
   │(Manifest)│ │          │ │Per-Repo │ │TechDebt) │ │ Manager  │
   └──────────┘ └──────────┘ └─────────┘ └──────────┘ └──────────┘
          │                        │          │              │
          └────────────┬───────────┘          │              │
                       v                      v              v
               ┌───────────────┐     ┌──────────────┐  ┌──────────┐
               │  Local Disk   │     │ Health Score │  │Groq/OAI/ │
               │(FAISS, Cache, │     │ Tech Debt    │  │Ollama/   │
               │  Manifests)   │     │ Dep Risk     │  │OpenRouter│
               └───────────────┘     └──────────────┘  └──────────┘
```

---

## 🚀 Installation & Setup

Prerequisites: **Node.js (v18+)** and **Python (3.12+)**.

### 1. Backend Setup

```bash
# Create and activate virtual environment
python -m venv venv

# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

### 2. Environment Configuration

Copy the example configuration:

```bash
cp .env.example .env
```

#### Authentication (Optional, Off by Default)

Authentication is completely optional and disabled by default (`AUTH_ENABLED=false`). When disabled, all routes are accessible without credentials.

To enable single-user admin authentication:

1. Set `AUTH_ENABLED=true` in `.env`.
2. Generate a secure secret for `JWT_SECRET_KEY` (≥ 32 chars):
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```
3. Generate an admin password bcrypt hash:
   ```bash
   python scripts/hash_password.py
   ```
4. Set the credentials in `.env`:
   ```env
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD_HASH=$2b$12$...
   ```

When enabled, the frontend prompts for administrator login, issues JWT tokens via `POST /api/auth/token`, and attaches `Authorization: Bearer <token>` to requests.

Configure your preferred LLM provider in `.env`:

```env
# LLM Provider: "groq", "openai", "openrouter", or "ollama"
LLM_PROVIDER=groq
GROQ_API_KEY=your_key_here
```

To restrict repository scanning and file exploration to trusted directories (path allowlist), set `ALLOWED_ROOTS` in `.env`:

```env
ALLOWED_ROOTS=/home/user/projects,/var/repos
```

When `ALLOWED_ROOTS` is configured, any repository outside these directories or symlinks pointing outside them are blocked with `403 Forbidden`. When left empty, the engine falls back to system blocklists while strictly forbidding access to the user's home directory root and sensitive hidden components (`.ssh`, `.aws`, `.gnupg`, `.config`, `.env`).

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run build
cd ..
```

---

## 💻 Running the Application

### Development Mode (Concurrent Backend + Frontend)

From project root:

```bash
npm install
npm run dev
```

- Backend API: `http://127.0.0.1:8000`
- API Interactive Docs: `http://127.0.0.1:8000/api/docs`
- Frontend UI: `http://localhost:5173`

### Production Mode (FastAPI Serving Compiled SPA)

```bash
cd frontend && npm run build && cd ..
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

> **Security Note:** Always bind to `127.0.0.1` for local usage. Only bind to `0.0.0.0` in production environments when `AUTH_ENABLED=true` is set and `ALLOWED_ROOTS` is configured.

FastAPI automatically mounts `frontend/dist/assets` and provides full client-side SPA routing on `http://127.0.0.1:8000`.

### Desktop Mode (Electron)

```bash
npm run dev:desktop
```

---

## 🧪 Testing & Quality Assurance

Run all test suites across the repository:

```bash
# Run backend tests (140+ tests)
pytest

# Run tests in ultra-fast mock mode (no model downloads)
MOCK_EMBEDDINGS=true pytest

# Run frontend tests (Vitest)
npm run test:frontend

# Run full test suite (backend + frontend)
npm test

# Linting and Type Checking
ruff check backend
ruff format --check backend
mypy backend
```

---

## 🐳 Docker Deployment

The multi-stage `Dockerfile` compiles the React frontend and packages the FastAPI backend into an optimized runtime container.

```bash
# Start full application stack
docker compose up --build
```

Mounted user repositories volume:
Place repositories into `./repos` to scan them directly from within the Docker container at `/repos/...`.

---

## 🔒 Security Model

- **File Containment**: Filesystem operations strictly require canonical validation anchored to the repository root. Path traversals, absolute escapes, and symlink breaks return HTTP 403.
- **Resource Constraints**: Maximum file count (`MAX_FILES`), file size (`MAX_FILE_SIZE`), and traversal depth (`MAX_DIRECTORY_DEPTH`) are enforced early during directory traversal.
- **Authentication**: When `AUTH_ENABLED=true`, all operational routes require a valid JWT Bearer token. Startup is rejected if default/placeholder secrets are detected.
- **Rate Limiting**: Critical endpoints (`/scan`, `/search`, `/chat`, `/file`) enforce rate limits via slowapi.
- **Input Sanitization**: User inputs are checked for control characters, maximum lengths, and malformed strings.
- **Error Sanitization**: API errors return stable generic messages without leaking server stack traces, absolute paths, or database configurations.

---

## 📜 License

MIT
