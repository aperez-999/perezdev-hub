# UI Overhaul Specification: Transform PerezDev Hub into a High-Fidelity OpenDev Terminal

You are an expert Terminal UI (TUI) Engineer. You successfully added the `Prompt local AI` backend engine, but the frontend layout is still trapped in a legacy vertical menu structure. 

You must completely delete the old menu list format and implement a responsive, border-aligned, dual-pane terminal layout inspired by OpenDev's cyber-matrix design.

---

## 1. VISUAL TERMINAL RECONSTRUCTION OVERRIDE

Replace your current rendering loops with this structural blueprint. Use clean box-drawing characters (`═`, `─`, `┌`, `┐`, `└`, `┘`) instead of relying on basic text lines:

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
│  [IDEs] ● cursor  ○ copilot  ○ cline  ○ windsurf                       │
│  [CLIs] ● claude-code  ● codex  ● ollama (local)                       │
│  project: git · node · typescript                                      │
│                                                                        │
│  [AUTOMATION & LOG STREAM]                                             │
│  ⠋ Connecting to local Ollama API instance...                         │
│  ✔ Detected models: qwen2.5-coder:7b (Normal), deepseek-r1:8b (Think)  │
│  ● Syncing project workspace file systems...                          │
│                                                                        │
│ ─── Normal Mode (Shift+Tab) ────────────────────────────────────────── │
│ > Type an automation prompt or choose an action...                     │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│  ◆ qwen2.5-coder │ Autonomy: Manual (Ctrl+Shift+A) │ Context left 100% │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. KEYBOARD INTERACTION & INTERFACE STATES

Instead of an arrow-key navigation list, the terminal must become a fully interactive command-line loop backed by global shortcut event listeners:

*   **Global Layout Toggles:**
    *   `Shift+Tab`: Instantly swap the UI string marker from `─── Normal Mode ───` to `─── Planning Mode ───` and route the text field content to your newly implemented local thinking engine.
    *   `Ctrl+Shift+A`: Toggle the footer state metadata between `Autonomy: Manual` and `Autonomy: Autonomous`.
*   **Dynamic Command Router (`/` Prefix):**
    *   If the user types `/help`, dump your utility manual into the `[AUTOMATION & LOG STREAM]` viewport.
    *   If the user types `/models`, execute your Ollama API query and print the available local models inline.
*   **Context Engineering (`@` Prefix):**
    *   If the user types `@`, open a mini-overlay or capture the trailing string to append local file contents into the LLM payload context.

---

## 3. REAL-TIME LOG PIPING (RIGHT PANEL SIMULATION)

*   Redirect all standard input/output (`stdout`/`stderr`) hooks from your local installer, project tree mapper, and Ollama bridge directly into the centralized `[AUTOMATION & LOG STREAM]` section.
*   Ensure that text updates inside this section append downwards asynchronously like a true terminal log monitor, keeping the matrix header and the command input box completely locked in place.
