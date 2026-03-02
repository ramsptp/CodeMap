# CodeMap

CodeMap is a powerful architectural visualization and analysis tool designed to help developers untangle and document complex codebases. It provides an intuitive, interactive environment to explore large projects locally or directly from GitHub, turning source code into interactive flowcharts, dependency graphs, and health insights.

### Table of Contents
1. [Core Capabilities](#core-capabilities)
2. [Technology Stack](#technology-stack)
3. [Key Features](#key-features)
4. [Supported Languages](#supported-languages)
5. [Architecture Details](#architecture-details)

---

## Core Capabilities

CodeMap takes raw code files and converts them into structured Abstract Syntax Trees (ASTs), mapping out functions, classes, and their cross-file dependencies. It visualizes these structures using interactive node-based graphs, allowing developers to visually navigate code execution paths rather than reading thousands of lines sequentially.

**Primary Modes:**
1. **Local Project Explorer:** Upload a single file, a folder, or a `.zip` archive to dynamically explore file dependencies and generate interactive control-flow graphs for specific functions.
2. **GitHub Repo Explorer:** Paste any public GitHub repository URL to securely fetch and analyze its architecture, view commit histories, and drill down into deeply nested code logic seamlessly without cloning.

---

## Technology Stack

The application is split into a robust Python backend for static code analysis and a highly interactive React frontend for visualization.

### Backend (`/Backend/main_v2.py`)
- **FastAPI:** High-performance asynchronous web framework driving the REST APIs.
- **Tree-sitter:** Fast, robust, incremental parsing engine used to build ASTs across multiple programming languages.
- **Radon (Python) / Custom Heuristics (Other Languages):** Calculates Cyclomatic Complexity to help identify tech debt.
- **Google Gemini API:** Provides AI-driven code summarizations and explanations.
- **Uvicorn:** ASGI web server used for development and internal hosting.

### Frontend (`/Frontend/codemap-frontend/src/App_v2.js`)
- **React 18:** Functional components and hooks for state management.
- **React Flow (`reactflow`):** The core rendering engine for generating node-based graphs, custom nodes (like logic blocks and external calls), and edges.
- **Dagre:** Directed graph layout algorithm used to auto-arrange complex dependency graphs logically.
- **Lucide React:** Minimalist, consistent icon library.
- **Axios:** Handles all external API requests to the backend and the GitHub REST API.
- **HTML-to-Image:** Enables exporting graph canvases to `.png` files.

---

## Key Features

### 1. Interactive Dependency Graphs
- **File Dependency Map (`FileDepGraph`):** Visualizes how files interact with each other across a codebase.
- **Function Dependency Map (`FuncDepGraph`):** A granular look at function declarations within a selected file and their internal dependencies.
- **Control Flow Graph (`FlowGraph`):** Generates line-by-line flowcharts for any specific function, illustrating logic gates (`if`, `for`, `while`) and standard statement executions.

### 2. Cross-File Analysis
- CodeMap parses multiple files simultaneously to track import paths and function calls across boundaries.
- **External Call Nodes:** When exploring a function's logic, calls to external files are explicitly rendered as purple dashed nodes indicating where the function resides (e.g., `helper() from utils.py`), and clicking them navigates directly to the target file.

### 3. GitHub Integration
- Natively compiles and renders repository `README.md` files upon load.
- Seamlessly fetches the entire remote directory tree.
- Clicking any active file polls the GitHub Commits API to show the latest 10 commits dynamically inside the sidebar.

### 4. Technical Debt Heatmaps
- **Complexity Heatmaps:** Toggle node colors based on cyclomatic complexity rather than language. Follows a `green → yellow → orange → red` gradient. Highly complex functions (score > 10) glow red, allowing you to instantly spot refactoring targets.
- **Inspector Panel:** Displays file-level stats alongside a list of all functions inside a file, ranked alongside their complexity badges. Highlights potential import cycles and isolated files.

### 5. UI & Polish
- **Global Canvas Search:** A floating glassmorphism search bar securely dims non-matching nodes across any active graph, highlighting your exact query.
- **Collapsible Layout:** Both the left Activity Sidebar and right Inspector panel can be entirely collapsed to give the graph canvas 100% execution width.
- **Vertical Hierarchy:** Drag handles on sidebar sections (like the Analyzed Files list) allow for custom vertical resizing.
- **Image Exporting:** Instantly snapshot the active canvas layout via the camera toolbar icon.
- **AI Integrations:** Inject your own Gemini API key or tap into GitHub Personal Access tokens directly through a unified API Settings modal.

---

## Supported Languages

The parser engine dynamically selects AST grammar rules based on file extensions:
- **Python** (`.py`)
- **JavaScript** (`.js`, `.jsx`)
- **TypeScript** (`.ts`, `.tsx`)
- **Java** (`.java`)
- **C/C++** (`.c`, `.cpp`, `.h`, `.hpp`)

---

## Architecture Details

To bypass legacy limitations ("the first versions"), CodeMap uses a highly capable `v2` architecture:

- **Frontend:** Centralized predominantly in `App_v2.js`, maintaining unified state controls for split panes and dynamic component switching depending on the active context (`sidebarView`).
- **Backend:** `main_v2.py` isolates language-specific syntax parsers (`parse_python_code`, `parse_java_structure`, `parse_js_structure`, `parse_cpp_structure`) while sharing a unified generic interface returning a standardized `{"nodes": [], "edges": []}` JSON payload.
- **Cross-File Data Caching:** Instead of re-analyzing everything per click, the frontend holds `blueprintTree` and `githubBlueprintData` states in memory, effectively mapping the entire project's function registry to minimize backend requests during deep drill-downs.
