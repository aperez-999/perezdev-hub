import pc from "picocolors";
import { p, guardCancel, showKeyHints } from "../ui/prompts.js";
import { PRESETS } from "../core/presets.js";
import { listEntries } from "../core/lockfile.js";
import { hasAnthropicKey } from "../core/config.js";
import { runCreate } from "./create.js";
import { runManage } from "./manage.js";
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { runDashboard } from "./dashboard.js";

/**
 * Interactive home screen shown when `inspo` runs with no subcommand. Drives
 * every workflow through pickable menus so nothing has to be memorized.
 */
export async function runMenu(): Promise<void> {
  const count = (await listEntries()).length;
  const keyHint = hasAnthropicKey() ? pc.green("AI-assisted") : pc.dim("template mode");
  p.intro(`${pc.bgCyan(pc.black(" inspo "))}  ${pc.dim(`${count} agent(s) · ${keyHint}`)}`);
  showKeyHints();

  for (;;) {
    const action = guardCancel(
      await p.select({
        message: "What do you want to do?",
        options: [
          { value: "quick", label: "⚡ Quick start", hint: "install a ready-made agent" },
          { value: "create", label: "✨ Create a custom agent", hint: "answer 2 quick questions" },
          { value: "manage", label: "📂 Manage agents", hint: "view, update, share, remove" },
          { value: "dashboard", label: "🖥  Dashboard", hint: "live fullscreen view" },
          { value: "doctor", label: "🩺 Doctor", hint: "check for problems" },
          { value: "init", label: "⚙️  Detect tools", hint: "rescan installed AI tools" },
          { value: "exit", label: "Exit" },
        ],
      }),
    ) as string;

    switch (action) {
      case "quick":
        await quickStart();
        break;
      case "create":
        await runCreate({});
        break;
      case "manage":
        await runManage();
        break;
      case "dashboard":
        await runDashboard();
        break;
      case "doctor":
        await runDoctor();
        break;
      case "init":
        await runInit();
        break;
      case "exit":
      default:
        p.outro(pc.dim("Bye."));
        return;
    }
  }
}

/** Pick a curated preset and install it (targets + confirm handled by create). */
async function quickStart(): Promise<void> {
  const choice = guardCancel(
    await p.select({
      message: "Pick a starter agent",
      options: [
        ...PRESETS.map((preset) => ({ value: preset.id, label: preset.id, hint: preset.summary })),
        { value: "__back", label: pc.dim("← Back") },
      ],
    }),
  ) as string;

  if (choice === "__back") return;
  await runCreate({ preset: choice });
}
