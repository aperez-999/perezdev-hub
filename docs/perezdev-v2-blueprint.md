# Product Specification Blueprint: Universal Agentic DevOps Toolkit

You are an elite Principal AI Systems Engineer and Terminal UI/UX Architect. Your task is to refactor and expand the "PerezDev Hub" architecture into a universal, cross-language, multi-purpose developer toolkit. 

The application must use a hybrid engine architecture:
1. A TypeScript/Node.js TUI frontend (handling cross-platform terminal states, event listeners, keyboard hooks, and interactive screens).
2. A Python 3 background daemon (handling OS-level automations, terminal history stream parsing, local LLM/Ollama model inference, and deep file/media system utilities).

Design the system behavior, integration adapter layers, and user interface according to the specifications below.

---

## 1. CROSS-LANGUAGE BEHAVIOR & INTERCOMMUNICATION

Implement a reliable communication protocol running via persistent standard input/output streams (`stdin`/`stdout`).

### TypeScript Controller Behavior
- Maintain a persistent background runtime process for Python.
- Serialize tasks, queue asynchronous actions, handle execution timeouts, and gracefully catch engine errors without crashing the interactive Node terminal.

### Python Engine Router Behavior
- Run an infinite event loop listening to standard input.
- Parse structured JSON messages, route them to background sub-routines (like agent execution, error troubleshooting, or utility pipelines), and stream structured success/error outputs back to stdout.
- Ensure that if required native system Python dependencies are missing, it sends a readable error payload back to the TypeScript interface instead of failing silently.

---

## 2. UNIVERSAL AI TOOL ECOSYSTEM & CONFIGURATION MATRIX

The toolkit must automatically translate our canonical agent definitions and configuration mappings into the specific file formats, headers, and paths required by major industry development platforms simultaneously. Target the following ecosystems:

### IDE & Code Editor Extensions
- **Cursor:** Generate workspace rules matching the structured `.mdc` syntax (complete with targeting globs) and automatically inject configurations into the global `mcp.json` storage file.
- **Cline & Roo Code:** Automatically append custom instructions to workspace `.clinerules` and inject global parameters into the extension’s `mcp_settings.json` file.
- **Windsurf (Codeium):** Generate clean Markdown system headers and append them seamlessly into workspace `.windsurfrules` files.
- **GitHub Copilot / Codex:** Standardize fallbacks to deploy markdown context instructions via `.github/copilot-instructions.md` and `.cursorrules`.

### Terminal & CLI AI Agents
- **Claude Code:** Mount workspace rules directly into the global skill path hierarchy (`~/.claude/skills/`) and safely inject active tool arrays into `~/.claude/settings.json`.
- **Aider:** Export deployment configurations to `.aider.instructions.md` and dynamically format server execution array flags into project-level `.aider.conf.yml` profiles.

---

## 3. HIGH-DENSITY SPLIT-VIEW TERMINAL UI/UX

Modernize the main terminal user interface to support an advanced, information-dense dashboard and make sure to include animations and colors rainbows intereactive UI. Group tools logically and utilize a split-view panel layout:

```text
┌────────────────────────────────────────────────────────────────────────┐
│  ♦  P E R E Z D E V   H U B  (v2.0 Universal Toolkit)                  │
│  your AI dev workflow, local executor, and terminal cheat code         │
│                                                                        │
│  [IDEs]: ● cursor  ● cline  ○ windsurf  ● copilot                      │
│  [CLIs]: ● claude  ● aider  ○ interpreter                              │
│  project: git · node · typescript · react · vitest                     │
│                                                                        │
│  ⚙️ WORKFLOW CONFIGURATION            │  🤖 LIVE CONSOLE CONTEXT VIEW   │
│  ► Recommend for this project         │  ⠋ Connecting python core...   │
│    Describe an agent to build         │  ✔ Python engine running       │
│    Manage installed tools             │                                │
│                                       │  [AUTOMATION STREAM]           │
│  🤖 LOCAL RUNTIME (Python Engine)     │  Injecting Cursor MDC rules... │
│    Execute Local Agent Workflow       │  Backing up mcp.json -> .bak   │
│    Auto-Inject MCP Servers            │  Writing token mappings...     │
│    System Diagnoser & Fixer           │  ✔ Installation Complete       │
│    Browse Registry Catalog            │                                │
│    Quit                               │                                │
│                                       │                                │
│  ▲▼ move  ·  space toggle tool  ·  enter select  ·  q quit             │
└────────────────────────────────────────────────────────────────────────┘
```

### Layout Requirements:
- **Header Badges:** Group the active tool matrix neatly into sub-headers (`[IDEs]` and `[CLIs]`) with visual state toggles showing which apps are detected or active.
- **Left Panel (Navigation):** Group structural features clearly into "Workflow Configuration" and the new "Local Runtime (Python Engine)" modules.
- **Right Panel (Live Automation Stream):** Provide a scrolling, real-time diagnostic text window. Pipe log strings directly from the file system and Python processes into this pane to show file modifications, API calls, and installation states as they happen.

---

## 4. DEEP PYTHON TOOLKIT EXECUTION ENGINES

Develop three main Python core engines that run locally and process data without relying on heavy cloud platforms:

### Local Agent Rule Interpreter
- Write a background routine that parses your tool's generated Markdown agent specifications.
- Use a local LLM API (like Ollama running Mistral or Llama3) to read the markdown workflow, guidelines, and guardrails, and actually execute that agent's core task sequence directly in the terminal workspace.

### Terminal Time Machine & Diagnostics
- Build an error fixer that accepts terminal traceback text dumps or log files passed from the TypeScript side.
- Use regex to isolate errors, trace file paths, and pinpoint line numbers. Automatically read those local code snippets, diagnose the issue, and output a structured breakdown alongside the exact shell command or patch needed to resolve the crash.

### Smart Data Utilities
- Build highly optimized utilities utilizing native Python system libraries to execute high-utility local files transformations.
- Features should include generating localized markdown file tree structural maps, data structure optimizations, and asset media conversions (e.g., code-to-layout schemas).

---

## 5. ATOMICITY & RECOVERY SAFEGUARDS

- **Automated Backup Loop:** Every time an automated tool installation modifies a global AI configuration file (like `mcp.json`), a timestamped `.bak` backup file must be duplicated into the application cache.
- **Atomic File Swapping:** Write all modifications to temporary configuration files (`.tmp`) first. Verify that the generated file is completely valid JSON/YAML before overwriting the active application files.
- **Automatic Rollback:** If an engine task crashes mid-execution, intercept the throw, wipe out the broken partial configurations, and restore the operational backups instantly to keep the user's environment clean.
