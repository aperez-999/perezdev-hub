import { mkdir } from "node:fs/promises";
import pc from "picocolors";
import { inspoDir, hasAnthropicKey } from "../core/config.js";
import { detectAll } from "../adapters/registry.js";
import { p } from "../ui/prompts.js";

/**
 * Detect installed AI tools and set up inspo's config dir. Does NOT modify
 * shell rc files or any tool config — it only creates ~/.config/inspo.
 */
export async function runInit(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" perezdev init ")));

  const dir = inspoDir();
  await mkdir(dir, { recursive: true });
  p.log.success(`Config dir ready: ${pc.bold(dir)}`);

  const detected = await detectAll();
  const lines = detected.map((d) => {
    const mark = d.detection.installed ? pc.green("●") : pc.dim("○");
    const label = d.detection.installed ? pc.bold(d.adapter.displayName) : pc.dim(d.adapter.displayName);
    return `${mark} ${label} ${pc.dim(`(${d.detection.detail})`)}`;
  });
  p.note(lines.join("\n"), "Detected tools");

  p.log.info(
    hasAnthropicKey()
      ? `LLM-assisted generation: ${pc.green("enabled")} (ANTHROPIC_API_KEY found)`
      : `LLM-assisted generation: ${pc.dim("off")} (set ANTHROPIC_API_KEY to enable)`,
  );

  const anyInstalled = detected.some((d) => d.detection.installed);
  if (!anyInstalled) {
    p.log.warn("No supported AI tools detected. You can still generate agents and install them later.");
  }

  p.outro(`Run ${pc.cyan("perezdev")} for the menu, or ${pc.cyan("perezdev stack review")} to install a setup.`);
}
