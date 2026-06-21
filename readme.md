# AI Codebase Understanding Engine

An intelligent, cross-platform desktop application designed to index, analyze, and visualize software repositories. Combining static code analysis (AST parsing), interactive graph intelligence, semantic vector search, and a Graph-RAG-powered conversational assistant, it serves as a powerful navigation and onboarding companion for complex codebases.

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
| **Code Analysis** | Python AST Parser |
| **Graph Processing** | NetworkX |
| **Embeddings & Vector Database** | Sentence Transformers (`all-MiniLM-L6-v2`), FAISS (CPU) |
| **AI / LLM Integration** | Ollama (Local), OpenAI & Anthropic-compatible API Clients |

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
       │        (Cytoscape.js, Tailwind, Routing)               │
       └─────────────────────────┬──────────────────────────────┘
                                 │ HTTP Requests
                                 v
       ┌────────────────────────────────────────────────────────┐
       │                   FastAPI Backend                      │
       └──────┬──────────────────┬───────────────────────┬──────┘
              │                  │                       │
              v                  v                       v
      ┌───────────────┐  ┌───────────────┐       ┌───────────────┐
      │  Code Parser  │  │ Graph Engine  │       │ Semantic Index│
      │  (Python AST) │  │  (NetworkX)   │       │ (FAISS Vector)│
      └───────────────┘  └───────────────┘       └───────────────┘
                                 │                       │
                                 v                       v
                         ┌───────────────┐       ┌───────────────┐
                         │ LLM Provider  │       │  Embeddings   │
                         │(Ollama/OpenAI)│       │ (MiniLM-L6-v2)│
                         └───────────────┘       └───────────────┘
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
ai-codebase-engine/
├── backend/
│   ├── api/             # FastAPI REST endpoints
│   ├── core/            # Config settings, dependencies container, models
│   ├── documentation/   # Documentation compiler (Markdown/HTML formats)
│   ├── embeddings/      # SentenceTransformers and FAISS vector indexer
│   ├── graph/           # Dependency building, central hubs, networkx structures
│   ├── llm/             # LLM provider clients (Ollama, OpenAI, custom models)
│   ├── parser/          # AST-based static codebase analyzers
│   ├── retrieval/       # Graph-RAG pipelines combining vector search with graph context
│   ├── main.py          # FastAPI application entry point
│   └── requirements.txt # Python dependency file
├── frontend/
│   ├── src/
│   │   ├── components/  # Shared layouts, visualizer assets, interactive graphs
│   │   ├── pages/       # AI Chat, Graph, Explorer, Search, Docs tabs
│   │   ├── services/    # REST API connectors to the backend
│   │   └── App.tsx      # Main application router
│   ├── package.json     # Node dev libraries and run scripts
│   └── vite.config.ts   # Vite frontend bundler config
└── desktop/
    ├── main.js          # Electron main lifecycle script
    ├── preload.js       # Desktop context isolation bridge
    └── package.json     # Desktop wrapper shell setup
```
