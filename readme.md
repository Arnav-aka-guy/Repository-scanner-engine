# Antigravity Engine v2.0

An AI-powered codebase intelligence platform that indexes, analyses, and visualises software repositories. Combines AST parsing, interactive graph intelligence, semantic vector search, Graph-RAG conversation, and portfolio-grade code quality analysis.

> **v2.0 Highlights:** JWT auth · Rate limiting · Path validation · PostgreSQL persistence · Health scoring · Tech debt analysis · Dependency risk audit · Docker · CI/CD · 80%+ test coverage target

---


## 🌟 Core Features

### 📁 1. Repository Explorer
- **AST-Based Parser**: Performs detailed static code analysis to extract directories, files, imports, classes, functions, methods, and relationships.
- **Codebase Navigation**: Browse parsed code structures, explore inline docstrings, inspect defined classes/methods, and trace module dependencies in real time.

### 🕸️ 2. Dependency Graph Viewer
- **Interactive Visualizer**: Dynamic 2D rendering of class and module relationships powered by **Cytoscape.js** and **Dagre** layout algorithms.
- **Relationship Filtering**: Highlight import statements, inheritance hierarchies, parent-child containments, and cross-module call graphs.

### 🏛️ 3. Architecture Viewer
- **Automatic Diagrams**: Spits out system architecture layouts dynamically utilizing **Mermaid.js**.
- **Hub Analysis**: Analyzes graph centrality to locate topological code "hubs" (classes or modules with the highest number of imports and dependencies).

### 🔍 4. Semantic Code Search
- **Natural Language Querying**: Locate where features, functions, or concepts are implemented without exact keyword matching.
- **Local Embedding Pipeline**: Embeds chunks locally using the Hugging Face **`all-MiniLM-L6-v2`** model, indexed and searched in seconds via **FAISS** vector store.

### 💬 5. Graph-RAG AI Chat
- **Context-Aware Assistance**: Chat with a local or cloud LLM that understands the repository structure.
- **Relational Retrieval**: Combines semantic text retrieval (FAISS) with codebase graph structures (NetworkX) to resolve deep context, such as explaining a service's full request-response lifecycle.

### 📄 6. Documentation Generator
- **Automated Guides**: Generates professional developer onboarding guides, code architecture summaries, and module reference files.
- **Multi-Format Export**: Compile and write results directly to `Markdown` files or clean, styled `HTML` pages.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React (v19), TypeScript, Vite, TailwindCSS (v4) |
| **Backend** | Python 3.12+, FastAPI, Uvicorn, Pydantic |
| **Desktop Shell** | Electron (v32) |
| **Security** | JWT (python-jose), slowapi rate limiting, path validation |
| **Database** | PostgreSQL, SQLAlchemy 2.0 (async), Alembic migrations |
| **Code Analysis** | Python AST Parser |
| **Graph Processing** | NetworkX |
| **Embeddings & Vector DB** | Sentence Transformers (`all-MiniLM-L6-v2`), FAISS (CPU) |
| **AI / LLM Integration** | Groq (default), Ollama (local), OpenAI & OpenRouter |
| **Infrastructure** | Docker, GitHub Actions CI/CD |

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
       │   (Cytoscape.js, Tailwind, Health Dashboard, Chat)     │
       └─────────────────────────┬──────────────────────────────┘
                                 │ HTTP / REST
                                 v
       ┌────────────────────────────────────────────────────────┐
       │              Security Middleware Layer                  │
       │   (JWT Auth, Rate Limiting, Path Validation, CORS)     │
       └─────────────────────────┬──────────────────────────────┘
                                 │
                                 v
       ┌────────────────────────────────────────────────────────┐
       │                   FastAPI Backend                      │
       │          (DI Container, Structured Logging)             │
       └──┬──────────┬───────────┬──────────┬──────────────┬────┘
          │          │           │          │              │
          v          v           v          v              v
   ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐
   │  Parser  │ │  Graph   │ │Semantic │ │ Portfolio│ │    LLM   │
   │(AST/TS)  │ │(NetworkX)│ │ (FAISS) │ │ Services │ │ Manager  │
   └──────────┘ └──────────┘ └─────────┘ └──────────┘ └──────────┘
          │                        │          │              │
          └────────────┬───────────┘          │              │
                       v                      v              v
               ┌───────────────┐     ┌──────────────┐  ┌──────────┐
               │  PostgreSQL   │     │ Health Score  │  │Groq/OAI/ │
               │  (SQLAlchemy) │     │ Tech Debt     │  │Ollama    │
               └───────────────┘     │ Dep Risk      │  │OpenRouter│
                                     └──────────────┘  └──────────┘
```

---

## 🚀 Installation & Setup

Ensure you have **Node.js (v18+)** and **Python (3.12+)** installed.

### 1. Configure the Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (recommended):
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install the required Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the root of the project (`d:\projects\summer-project-1\.env`):
   ```env
   # Data storage root directory
   DATA_DIR=data

   # LLM Provider Configuration ("ollama" or "openai")
   LLM_PROVIDER=ollama
   LLM_MODEL=llama3
   LLM_BASE_URL=http://localhost:11434

   # If using OpenAI:
   # LLM_PROVIDER=openai
   # LLM_MODEL=gpt-4o
   # OPENAI_API_KEY=your_openai_api_key_here
   ```

### 2. Configure the Frontend

1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install the Node modules:
   ```bash
   npm install
   ```

### 3. Configure the Desktop Shell

1. Navigate to the desktop directory:
   ```bash
   cd ../desktop
   ```
2. Install the Electron dependencies:
   ```bash
   npm install
   ```

---

## 💻 Running the Application

### Quick Start

From the **project root**, install dependencies once and launch:

```bash
npm install            # installs concurrently (root orchestrator)
npm run dev            # starts backend + frontend in one terminal
```

> 💡 Make sure your Python virtual environment is active and frontend dependencies are installed (see [Installation & Setup](#-installation--setup)).

### Web Mode (Backend + Frontend)
```bash
npm run dev
```
Launches the FastAPI backend on `http://127.0.0.1:8000` and the Vite dev server on `http://localhost:5173`.

### Desktop Mode (Backend + Frontend + Electron)
```bash
npm run dev:desktop
```
Launches all three services. Electron will display the React app (connected via HMR) and automatically query the backend health endpoint.

### Advanced: Individual Services

If you prefer running services in separate terminals:

**Terminal 1 — FastAPI Backend** (run from project root):
```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — Vite Dev Server:**
```bash
cd frontend && npm run dev
```

**Terminal 3 — Electron:**
```bash
cd desktop && npm run dev
```

---

## 📖 How to Use

1. **Scan a Codebase**: Open the **Repository Explorer** and use the native folder picker to select a local codebase repository. The backend will parse the directories, build structural indexes, and register classes, modules, and functions.
2. **Visualize Architecture**: Head over to the **Dependency Graph** tab to navigate the interactive module diagram. Inspect which files import one another and search nodes to find components.
3. **Semantic Querying**: Open **Semantic Search** and type natural language queries like `"where does the backend authenticate users?"` or `"database connection pool configuration"`. It returns ranked code files and functions.
4. **Chat with Codebase (Graph-RAG)**: Open **AI Chat** and ask structural questions. The engine fetches vector chunks, extracts dependency relationships, and serves them to your configured LLM (via Ollama or OpenAI) to formulate an architecture-grounded response.
5. **Generate Documentation**: In the **Documentation Generator**, click to compile a repository guide. Choose to export it to clean Markdown files or self-contained HTML pages.

---

## 📂 Project Structure

```text
antigravity-engine/
├── backend/
│   ├── api/              # FastAPI REST endpoints (thin handlers + Depends())
│   ├── core/             # Config, constants, DI container, logging, models
│   ├── db/               # PostgreSQL (async SQLAlchemy, Alembic)
│   ├── middleware/        # Request logging, request-ID injection
│   ├── security/         # JWT auth, rate limiting, path validation, sanitiser
│   ├── services/         # Health score, tech debt, dep risk, comparison
│   ├── documentation/    # Markdown/HTML documentation compiler
│   ├── embeddings/       # SentenceTransformers + FAISS vector indexer
│   ├── graph/            # Dependency graph building (NetworkX)
│   ├── llm/              # Multi-provider manager (Groq/OAI/Ollama/OpenRouter)
│   ├── parser/           # AST-based static code analysers
│   ├── retrieval/        # Graph-RAG pipeline (vector + graph context)
│   ├── main.py           # Application entry point
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/   # Sidebar, StatusBar, ErrorBoundary, etc.
│   │   ├── pages/        # Explorer, Graph, Search, Chat, Docs, Health Dashboard
│   │   ├── services/     # REST API client layer
│   │   ├── stores/       # Zustand state management
│   │   └── App.tsx       # Application router + animated transitions
│   ├── package.json
│   └── vite.config.ts
├── desktop/
│   ├── main.js           # Electron main process
│   ├── preload.js        # Context isolation bridge
│   └── package.json
├── tests/                # 102 pytest tests (security, services, API, parser, graph)
├── alembic/              # Database migrations
├── .github/workflows/    # CI/CD pipeline (lint, test, build)
├── Dockerfile            # Multi-stage production build
├── docker-compose.yml    # App + PostgreSQL orchestration
├── pyproject.toml        # Ruff + pytest + mypy config
├── .env.example          # Environment variable template
└── package.json          # Root orchestrator (concurrently)
```

---

## 🧪 Testing

```bash
# Run all tests (102 tests)
python -m pytest tests/ -v

# Run specific test suites
python -m pytest tests/test_security.py -v    # Security & auth tests
python -m pytest tests/test_services.py -v    # Health score & tech debt
python -m pytest tests/test_portfolio.py -v   # Comparison & dependency risk
python -m pytest tests/test_api.py -v         # API integration tests
```

---

## 🐳 Docker

```bash
# Start the full stack (app + PostgreSQL)
docker compose up --build

# Or run just the backend
docker compose up backend
```

---

## 📜 License

MIT

