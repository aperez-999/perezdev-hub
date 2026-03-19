# Product Specification Blueprint: PerezDev Hub v2.0 (Open-Source Local Engine Edition)

You are an elite Principal AI Systems Engineer and Terminal UI/UX Architect. Your task is to refactor "PerezDev Hub" to support a completely open-source, local-first runtime using an OpenDev-inspired visual terminal layout.

The core engine must route tasks across local LLM slots using Ollama:
- **Normal Workflow Slot:** Defaults to `qwen2.5-coder` or `llama3.1` (optimized for swift tool executions and fast bash/fs generation syntax).
- **Thinking/Reasoning Slot:** Defaults to a heavy reasoning model variant like `deepseek-r1` or `llama3-groq-tool-use` to generate structured multi-step execution plans.

---

## 1. HIGH-FIDELITY LOCAL RUNTIME TERMINAL UI/UX

Reconstruct the main terminal interface using a border-aligned visual system mimicking OpenDev's high-density diagnostic styling.

### UI Layout Design
```text
┌────────────────────────────────────────────────────────────────────────┐
│                        .  :  .:::..  .:::                              │
│                       . ... :::: ..:::::                               │
│                       P E R E Z D E V   H U B                          │
│                       : . :::::...  ::.                                │
│                        ..  ..  ...   .                                 │
│                                                                        │
│ ══════════════════════ PerezDev Hub v2.0 ═════════════════════════════ │
│         /help  │  /models  │  Shift+Tab plan mode  │  @file context    │
│ ────────────────────────────────────────────────────────────────────── │
│                                                                        │
│  [AUTOMATION STREAM]                                                   │
│  ⠋ Connecting to local Ollama API instance...                         │
│  ✔ Verified models: qwen2.5-coder:7b (Normal), deepseek-r1:8b (Thinking)│
│  ● Syncing local MCP storage pathways...                               │
│                                                                        │
│ ─── Normal Mode (Shift+Tab) ────────────────────────────────────────── │
│ > Type an automation prompt or choose an action...                     │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│  ◆ qwen2.5-coder │ Autonomy: Manual (Ctrl+Shift+A) │ Context left 100% │
└────────────────────────────────────────────────────────────────────────┘
```

### Visual Interface Requirements:
- **Matrix Ascii Header:** Implement an eye-catching, centralized subtitle splash section with minimal micro-dot matrix styling.
- **Horizon Splitters:** Replace standard TUI block lines with thin double-line borders (`═`, `─`) to organize command modes cleanly.
- **Footer Metadata Bar:** Place active state tracking variables side-by-side along the terminal floor to give developers visibility into current model contexts and token boundaries.

---

## 2. LOCAL MULTI-MODEL ROUTING ENGINE (OLLAMA INTEGRATION)

Do not connect to expensive, privacy-invasive cloud models. Build a localized multi-model pipeline utilizing standard local execution endpoints.

- **Automated Registry Detection:** Query `http://localhost:11434/api/tags` via the Python engine to automatically detect what models the user has pulled (e.g., `qwen`, `llama`, `mistral`).
- **Dynamic Task Routing:** Split user interactions cleanly based on the chosen mode:
  - **Normal Mode:** Runs standard commands and config injections directly against lightweight, code-optimized weights.
  - **Thinking Mode:** When `Shift+Tab` is toggled, route tasks to reasoning chains first, rendering the internal thinking thoughts inside the automation log panel before executing.

---

## 3. FLEXIBLE KEYBOARD-DRIVEN CONTROL PARSER

Implement global terminal keyboard action listeners within your TypeScript layer to give devs fine-grained tactical execution control:

- **`Shift+Tab` (Mode Toggle):** Instantly swap between "Normal" input mode and structured "Planning" mode, updating the UI layout live.
- **`Ctrl+Shift+A` (Autonomy Toggle):** Cycle between **Manual** confirmation (the toolkit asks permission before editing files or running terminal lines) and **Autonomous** mode.
- **`Ctrl+Shift+T` (Thinking Toggle):** Adjust local model reasoning intensity settings (Low, Medium, High) to balance generation latency against complex bug resolution deep-dives.

---

## 4. LOCAL WORKSPACE INDEXING & DIAGNOSTIC REPAIR

Connect your Python daemon to local system assets to make your open-source agents highly effective:

- **Context Reference Engine (`@file` Context):** When a user inputs `@filename` in the terminal bar, intercept the string, read the local workspace file contents, and pass it directly into the prompt context window.
- **Traceback Extraction Loop:** Parse local program failure dump strings, extract paths, and match the error against local code context using your active local models to deliver rapid shell patches.
