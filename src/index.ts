import { Command, Option } from "commander";
import pc from "picocolors";
import { TOOL_IDS } from "./core/agent-spec.js";
import { version } from "./core/version.js";
import { runStatus } from "./commands/status.js";
import { runInit } from "./commands/init.js";
import { runCreate } from "./commands/create.js";
import { runPresets } from "./commands/presets.js";
import { runStackInstall } from "./commands/stacks.js";
import { runMcp } from "./commands/mcp.js";
import { runAdd, runUpgrade } from "./commands/add.js";
import { runAgentsMd } from "./commands/agents-md.js";
import { runCi } from "./commands/ci.js";
import { runList } from "./commands/list.js";
import { runShow } from "./commands/show.js";
import { runUpdate } from "./commands/update.js";
import { runRemove } from "./commands/remove.js";
import { runExport } from "./commands/export.js";
import { runImport } from "./commands/import.js";
import { runManage } from "./commands/manage.js";
import { runDoctor } from "./commands/doctor.js";
import { runProfileExport, runProfileImport, runProfileShow } from "./commands/profile.js";

const program = new Command();

program
  .name("perezdev")
  .description("Write your AI agent setup once — skills, rules, and MCP servers — for every coding tool, and catch drift in CI.")
  .version(version)
  // Program options only before the subcommand, so `perezdev list -g` reaches `list`.
  .enablePositionalOptions()
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
Scope: inside a git repo commands act on the project (files you commit, plus
${pc.cyan("perezdev.lock.json")}); outside one, or with ${pc.cyan("-g")}, on your home directory.

Tools: ${TOOL_IDS.join(", ")}

Getting started:
  $ perezdev init                       suggest and install agents for this repo
  $ perezdev                            status: what's installed, what's still needed
  $ perezdev ci                         fail pull requests when generated files drift

Examples:
  $ perezdev create --preset code-reviewer -y
  $ perezdev create -p "review SQL migrations for locking issues" -t claude-code,cursor
  $ perezdev add anthropics/skills --skill pdf
  $ perezdev mcp context7 github        add MCP servers
  $ perezdev doctor                     exit 1 if generated files drifted (CI)`,
  );

// Shared flags, attached per command so they read naturally after the subcommand.
const globalFlag = () => new Option("-g, --global", "use your home directory instead of the current project");
const targetFlag = () => new Option("-t, --target <ids>", "comma-separated tools (default: tools detected here)");
const yesFlag = () => new Option("-y, --yes", "don't ask for confirmation");
const dryRunFlag = () => new Option("--dry-run", "show the files that would change; write nothing");
const forceFlag = () => new Option("--force", "overwrite files perezdev didn't create");

program.option("-g, --global", "show status for your home directory").action(wrap((opts) => runStatus(opts)));

program
  .command("init")
  .description("Scan this project and install the agents and MCP servers that fit it")
  .addOption(globalFlag())
  .addOption(targetFlag())
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .addOption(forceFlag())
  .action(wrap(runInit));

program
  .command("create")
  .description("Generate an agent from a description (or --preset) and install it")
  .option("-n, --name <name>", "agent name (kebab-case)")
  .option("-p, --purpose <text>", "what the agent should do")
  .option("-r, --role <text>", "explicit role (defaults from the name)")
  .option("--preset <id>", "install a built-in agent (see `perezdev presets`)")
  .option("-a, --advanced", "also prompt for behaviors, allowed tools, and MCP servers")
  .addOption(targetFlag())
  .addOption(globalFlag())
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .addOption(forceFlag())
  .action(wrap(runCreate));

program
  .command("add")
  .argument("<source>", "owner/repo[/path][@ref], a GitHub URL, or a local folder")
  .description("Install skills (SKILL.md folders) from GitHub or a folder, verbatim")
  .option("-s, --skill <names>", "comma-separated skills to take from a multi-skill source")
  .option("-l, --list", "list the skills in the source and exit")
  .addOption(targetFlag())
  .addOption(globalFlag())
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .addOption(forceFlag())
  .action(wrap(runAdd));

program
  .command("upgrade")
  .argument("[name]", "one added skill (default: all)")
  .description("Re-fetch skills installed with `add` and apply upstream changes")
  .addOption(globalFlag())
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .addOption(forceFlag())
  .action(wrap(runUpgrade));

program
  .command("agents-md")
  .description("Keep a generated Commands section in AGENTS.md, imported by CLAUDE.md")
  .option("--off", "remove the section and stop managing it")
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .action(wrap(runAgentsMd));

program
  .command("ci")
  .description("Add a GitHub Actions check that fails pull requests when generated files drift")
  .option("--force", "replace an existing .github/workflows/perezdev.yml")
  .addOption(dryRunFlag())
  .action(wrap(runCi));

program.command("presets").description("List built-in agents for `create --preset`").action(wrap(runPresets));

program
  .command("stack")
  .argument("[id]", "stack to install (omit to list stacks)")
  .description("Install a bundle of agents + MCP servers")
  .addOption(targetFlag())
  .addOption(globalFlag())
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .addOption(forceFlag())
  .action(wrap(runStackInstall));

program
  .command("mcp")
  .argument("[ids...]", "catalog servers to install (omit to list the catalog)")
  .description("List or install MCP servers")
  .addOption(targetFlag())
  .addOption(globalFlag())
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .action(wrap(runMcp));

program
  .command("list")
  .alias("ls")
  .description("List agents and MCP servers recorded here")
  .option("--json", "machine-readable output")
  .addOption(globalFlag())
  .action(wrap(runList));

program
  .command("show")
  .argument("<name>", "agent or MCP server")
  .description("Show an agent's spec, files, and instructions")
  .option("--json", "machine-readable output (env values redacted)")
  .addOption(globalFlag())
  .action(wrap(runShow));

program
  .command("sync")
  .alias("update")
  .argument("[name]", "one agent (default: all)")
  .description("Rewrite tool files from the lockfile (after a pull, or to add a tool)")
  .option("-b, --bump", "bump each agent's patch version")
  .addOption(globalFlag())
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .addOption(forceFlag())
  .action(wrap(runUpdate));

program
  .command("remove")
  .alias("rm")
  .argument("<name>", "agent or MCP server")
  .description("Remove an agent or MCP server from every tool")
  .addOption(globalFlag())
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .action(wrap(runRemove));

program
  .command("doctor")
  .description("Check generated files against the lockfile; exit 1 on drift")
  .option("--fix", "rewrite anything missing or modified")
  .option("--json", "machine-readable output")
  .option("--strict", "also fail when a target tool isn't installed on this machine")
  .addOption(globalFlag())
  .action(wrap(runDoctor));

program
  .command("manage")
  .description("Pick an installed item and act on it (interactive)")
  .addOption(globalFlag())
  .action(wrap(runManage));

program
  .command("export")
  .argument("<name>", "agent to export")
  .option("-o, --out <file>", "write to a file instead of stdout")
  .addOption(globalFlag())
  .description("Print an agent's spec as JSON")
  .action(wrap(runExport));

program
  .command("import")
  .argument("<file>", "agent spec JSON (from `perezdev export`)")
  .description("Install an agent from a JSON spec")
  .addOption(targetFlag())
  .addOption(globalFlag())
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .addOption(forceFlag())
  .action(wrap(runImport));

const profile = program.command("profile").description("Share a whole setup (agents + MCP servers) as one JSON file");

profile
  .command("export")
  .option("-o, --out <file>", "output file ('-' for stdout)", "perezdev-profile.json")
  .addOption(globalFlag())
  .description("Bundle everything installed here into a profile")
  .action(wrap(runProfileExport));

profile
  .command("import")
  .argument("<ref>", "profile file or https URL")
  .option("--overwrite", "replace agents and servers that already exist here")
  .addOption(targetFlag())
  .addOption(globalFlag())
  .addOption(yesFlag())
  .addOption(dryRunFlag())
  .addOption(forceFlag())
  .description("Install every agent + MCP server from a profile")
  .action(wrap(runProfileImport));

profile
  .command("show")
  .argument("<ref>", "profile file or https URL")
  .option("--json", "machine-readable output")
  .description("Preview a profile without installing it")
  .action(wrap(runProfileShow));

/** Wrap an async command so rejections print cleanly and exit non-zero. */
function wrap<A extends unknown[]>(fn: (...args: A) => Promise<void> | void) {
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
