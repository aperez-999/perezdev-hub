import pc from "picocolors";
import { listEntries, listMcpEntries } from "../core/lockfile.js";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { toolName } from "../adapters/tools.js";
import { p, guardCancel, intro, isInteractive } from "../ui/prompts.js";
import { runShow } from "./show.js";
import { runUpdate } from "./update.js";
import { runExport } from "./export.js";
import { runRemove } from "./remove.js";

const BACK = "__back";
const MCP_PREFIX = "mcp:";

/** Pick an installed item, then an action — for when you don't remember the name. */
export async function runManage(opts: ScopeOptions = {}): Promise<void> {
  if (!isInteractive()) {
    console.error("perezdev manage is interactive. Use list / show / sync / remove in scripts.");
    process.exit(1);
  }
  const scope = await resolveScope(opts);
  intro("manage", scope);

  for (;;) {
    const entries = await listEntries(scope);
    const mcp = await listMcpEntries(scope);
    if (entries.length === 0 && mcp.length === 0) {
      p.outro(`Nothing installed here. Try ${pc.cyan("perezdev init")}.`);
      return;
    }

    const choice = guardCancel(
      await p.select({
        message: "Pick an item",
        options: [
          ...entries.map((e) => ({
            value: e.spec.name,
            label: e.spec.name,
            hint: `v${e.spec.version} · ${e.spec.targets.map(toolName).join(", ")}`,
          })),
          ...mcp.map((m) => ({ value: `${MCP_PREFIX}${m.id}`, label: `${m.id} ${pc.dim("(MCP)")}`, hint: m.targets.map(toolName).join(", ") })),
          { value: BACK, label: pc.dim("Done") },
        ],
      }),
    ) as string;
    if (choice === BACK) {
      p.outro(pc.dim("Done."));
      return;
    }

    const isMcp = choice.startsWith(MCP_PREFIX);
    const name = isMcp ? choice.slice(MCP_PREFIX.length) : choice;
    const action = guardCancel(
      await p.select({
        message: pc.cyan(name),
        options: [
          { value: "show", label: "Show", hint: "spec, files, instructions" },
          ...(isMcp
            ? []
            : [
                { value: "sync", label: "Sync", hint: "rewrite its files from the lockfile" },
                { value: "bump", label: "Bump version", hint: "sync + bump patch" },
                { value: "export", label: "Export", hint: `write ${name}.perezdev.json` },
              ]),
          { value: "remove", label: "Remove", hint: "delete from every tool" },
          { value: BACK, label: pc.dim("Back") },
        ],
      }),
    ) as string;

    const scoped = { global: scope.kind === "user" };
    if (action === "show") await runShow(name, scoped);
    else if (action === "sync") await runUpdate(name, scoped);
    else if (action === "bump") await runUpdate(name, { ...scoped, bump: true });
    else if (action === "export") await runExport(name, { ...scoped, out: `${name}.perezdev.json` });
    else if (action === "remove") await runRemove(name, scoped);
  }
}
