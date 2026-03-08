import { Command } from "commander";
import pc from "picocolors";
import { runInit } from "./commands/init.js";
import { runCreate } from "./commands/create.js";
import { runList } from "./commands/list.js";
import { runUpdate } from "./commands/update.js";
import { runRemove } from "./commands/remove.js";
import { runDoctor } from "./commands/doctor.js";
import { runShow } from "./commands/show.js";
import { runExport } from "./commands/export.js";
import { runImport } from "./commands/import.js";
import { runManage } from "./commands/manage.js";
import { runStackInstall } from "./commands/stacks.js";
import { runHome } from "./commands/home.js";
import { runTui } from "./commands/tui.js";
import { runFix } from "./commands/fix.js";
import { runMap } from "./commands/map.js";

const program = new Command();

program
  .name("perezdev")
  .description("PerezDev Hub — recommend, generate, and manage AI agents and MCP servers across your AI coding tools.")
  .version("0.1.0")
  // No subcommand → animated TUI in a terminal, else show help.
  .action(wrap(home));

program
  .command("menu")
  .description("Open the plain list menu instead of the TUI")
  .action(wrap(runHome));

/** Default entry: the animated TUI when interactive, else show help. */
async function home(): Promise<void> {
  if (process.stdout.isTTY) await runTui();
  else program.outputHelp();
}

program
  .command("init")
  .description("Detect installed AI tools and set up ~/.config/perezdev")
  .action(wrap(runInit));

program
  .command("create")
  .description("Generate a custom agent and install it globally (wizard, flags, or --preset)")
  .option("-n, --name <name>", "agent name (kebab-case)")
  .option("-p, --purpose <text>", "what the agent should do")
  .option("-r, --role <text>", "explicit role (defaults from purpose)")
  .option("-t, --target <ids>", "comma-separated tools: claude-code,cursor,copilot,codex")
  .option("--preset <id>", "install a built-in starter agent by id")
  .option("-a, --advanced", "prompt for behaviors / tools / MCP")
  .option("-y, --yes", "skip the confirmation prompt")
  .action(wrap(runCreate));

program
  .command("stack")
  .argument("<id>", "stack to install")
  .option("-t, --target <ids>", "comma-separated tools: claude-code,cursor,copilot,codex")
  .option("-y, --yes", "skip the confirmation prompt")
  .description("Install a bundle of agents + MCP servers in one command")
  .action(wrap(runStackInstall));

program
  .command("manage")
  .description("Interactively view, update, share, or remove agents")
  .action(wrap(runManage));

program
  .command("list")
  .description("List managed agents and MCP servers across all tools")
  .action(wrap(runList));

program
  .command("show")
  .argument("<name>", "agent to inspect")
  .description("Show an agent's spec, files, and instructions")
  .action(wrap(runShow));

program
  .command("update")
  .argument("[name]", "agent to update (omit to update all)")
  .option("-b, --bump", "bump the patch version")
  .description("Re-apply a managed agent's files to its tools (repairs drift)")
  .action(wrap(runUpdate));

program
  .command("remove")
  .argument("<name>", "agent to remove")
  .description("Remove a managed agent across all tools and restore backups")
  .action(wrap(runRemove));

program
  .command("export")
  .argument("<name>", "agent to export")
  .option("-o, --out <file>", "write JSON to a file instead of stdout")
  .description("Export an agent's spec as JSON for sharing")
  .action(wrap(runExport));

program
  .command("import")
  .argument("<file>", "agent spec JSON to install")
  .option("-y, --yes", "skip the confirmation prompt")
  .description("Install a shared agent spec from a JSON file")
  .action(wrap(runImport));

program
  .command("doctor")
  .description("Diagnose config drift and broken installs")
  .action(wrap(runDoctor));

program
  .command("fix")
  .argument("[file]", "log/traceback file (or pipe one into stdin)")
  .description("Diagnose a traceback: root file/line, cause, and the fix (Python engine)")
  .action(wrap(runFix));

program
  .command("map")
  .argument("[dir]", "directory to map (default: .)")
  .option("-d, --depth <n>", "max depth", "3")
  .description("Print a file-tree map of a directory (Python engine)")
  .action(wrap(runMap));

/** Wrap an async command so rejections print cleanly and exit non-zero. */
function wrap<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(pc.red(`\nerror: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  };
}

program.parseAsync(process.argv);
