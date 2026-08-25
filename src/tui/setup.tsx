import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import { detectAll } from "../adapters/registry.js";
import { scanProject } from "../core/scan.js";
import { loadRc, saveRc } from "../core/rc.js";
import { toolInstallCommand } from "../core/tool-install.js";
import {
  STARTER_PACKS,
  initialSelected,
  missingSelected,
  probeOllama,
  shouldOfferCoreMcp,
  toggleId,
  type StarterPack,
  type ToolPresence,
} from "../core/setup.js";
import {
  fetchSuperpowersSkills,
  installSuperpowersPack,
  planSuperpowersPack,
  type SuperpowersSkill,
} from "../core/superpowers.js";
import type { ToolId } from "../core/agent-spec.js";
import { getMcpServer } from "../registry/index.js";
import { installCatalogMcp, plannedToDiff } from "./data.js";
import { ConfirmBox } from "./components.js";
import { theme } from "./theme.js";
import { version as VERSION } from "./version.js";

export interface SetupLanding {
  pack: StarterPack;
  targets: ToolId[];
  message?: string;
}

export interface SetupSnapshot {
  tools: ToolPresence[];
  ollama: { up: boolean; model?: string };
  git: boolean;
  languages?: string[];
}

type Step = "detect" | "targets" | "missing" | "pack" | "fetch" | "confirm" | "mcp";

export function Setup({
  onDone,
  snapshot,
}: {
  onDone: (landing: SetupLanding) => void;
  snapshot?: SetupSnapshot;
}): React.ReactElement {
  const { stdout } = useStdout();
  const cols = stdout?.columns ? Math.min(stdout.columns, 132) : 80;

  const [step, setStep] = useState<Step>(snapshot ? "targets" : "detect");
  const [tools, setTools] = useState<ToolPresence[]>(snapshot?.tools ?? []);
  const [ollama, setOllama] = useState(snapshot?.ollama ?? { up: false as boolean, model: undefined as string | undefined });
  const [offerMcp, setOfferMcp] = useState(snapshot ? shouldOfferCoreMcp({ git: snapshot.git, languages: snapshot.languages }) : false);
  const [selected, setSelected] = useState<ToolId[]>(snapshot ? initialSelected(snapshot.tools) : []);
  const [cursor, setCursor] = useState(0);
  const [packSel, setPackSel] = useState(0);
  const [status, setStatus] = useState("");
  const [diff, setDiff] = useState<string[]>([]);
  const skillsRef = useRef<SuperpowersSkill[]>([]);
  const selectedRef = useRef(selected);
  const offerMcpRef = useRef(offerMcp);
  const packRef = useRef<StarterPack>("empty");
  const finished = useRef(false);
  const busyRef = useRef(false);

  selectedRef.current = selected;
  offerMcpRef.current = offerMcp;

  const missing = missingSelected(tools, selected);

  useEffect(() => {
    if (snapshot) return;
    let alive = true;
    void (async () => {
      const [detected, ollamaHit, scan] = await Promise.all([detectAll(), probeOllama(), scanProject()]);
      if (!alive) return;
      const next: ToolPresence[] = detected.map((d) => ({
        id: d.adapter.id,
        name: d.adapter.displayName,
        present: d.detection.installed,
      }));
      setTools(next);
      setOllama(ollamaHit);
      setSelected(initialSelected(next));
      setOfferMcp(shouldOfferCoreMcp(scan));
      setStep("detect");
    })();
    return () => {
      alive = false;
    };
  }, [snapshot]);

  async function persist(pack: StarterPack): Promise<void> {
    const rc = await loadRc();
    const targets = selectedRef.current;
    await saveRc({
      ...rc,
      setup_complete: true,
      default_targets: targets.length ? targets : undefined,
      last_active_tab: pack === "generate" ? 2 : 1,
    });
  }

  async function finish(pack: StarterPack, message?: string): Promise<void> {
    if (finished.current) return;
    finished.current = true;
    await persist(pack);
    onDone({ pack, targets: selectedRef.current, message });
  }

  function afterPack(pack: StarterPack, message?: string): void {
    if (finished.current) return;
    packRef.current = pack;
    if (offerMcpRef.current && selectedRef.current.length > 0) {
      setStatus(message ?? "");
      setStep("mcp");
      return;
    }
    void finish(pack, message);
  }

  function gotoMissingOrPack(): void {
    setCursor(0);
    setStep(missing.length > 0 ? "missing" : "pack");
  }

  useInput((input, key) => {
    if (finished.current) return;
    if (key.escape) {
      void finish(packRef.current);
      return;
    }
    if (step === "fetch") return;

    if (step === "detect") {
      if (key.return && tools.length > 0) {
        setCursor(0);
        setStep("targets");
      }
      return;
    }

    if (step === "targets") {
      if (key.upArrow || input === "k") setCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow || input === "j") setCursor((c) => Math.min(tools.length - 1, c + 1));
      else if (input === " ") {
        const id = tools[cursor]?.id;
        if (id) setSelected((s) => toggleId(s, id));
      } else if (key.return) gotoMissingOrPack();
      return;
    }

    if (step === "missing") {
      if (key.return) setStep("pack");
      return;
    }

    if (step === "pack") {
      if (key.upArrow || input === "k") setPackSel((c) => Math.max(0, c - 1));
      else if (key.downArrow || input === "j") setPackSel((c) => Math.min(STARTER_PACKS.length - 1, c + 1));
      else if (key.return) {
        const pack = STARTER_PACKS[packSel]?.id ?? "empty";
        packRef.current = pack;
        if (pack !== "superpowers") {
          afterPack(pack);
          return;
        }
        if (selectedRef.current.length === 0) {
          afterPack("superpowers", "no write-targets selected — skipped Superpowers");
          return;
        }
        setStep("fetch");
        setStatus("fetching Superpowers skills…");
        void (async () => {
          const { skills, error } = await fetchSuperpowersSkills();
          if (error || skills.length === 0) {
            afterPack("superpowers", error ?? "could not fetch Superpowers skills (network)");
            return;
          }
          skillsRef.current = skills;
          try {
            const planned = await planSuperpowersPack(skills, selectedRef.current);
            setDiff(shortDiff(plannedToDiff(planned)));
            setStep("confirm");
          } catch (e) {
            afterPack("superpowers", e instanceof Error ? e.message : String(e));
          }
        })();
      }
      return;
    }

    if (step === "confirm") {
      const yes = input.toLowerCase() === "y";
      const no = input.toLowerCase() === "n";
      if ((!yes && !no) || busyRef.current) return;
      if (no) {
        afterPack("superpowers", "skipped Superpowers pack");
        return;
      }
      busyRef.current = true;
      setStatus("installing Superpowers…");
      setStep("fetch");
      void (async () => {
        try {
          const written = await installSuperpowersPack(skillsRef.current, selectedRef.current);
          afterPack("superpowers", `installed ${skillsRef.current.length} Superpowers skills · ${written.length} files`);
        } catch (e) {
          afterPack("superpowers", e instanceof Error ? e.message : String(e));
        }
      })();
      return;
    }

    if (step === "mcp") {
      const yes = input.toLowerCase() === "y";
      const no = input.toLowerCase() === "n";
      if ((!yes && !no) || busyRef.current) return;
      busyRef.current = true;
      void (async () => {
        let message = status;
        if (yes) {
          try {
            const fs = getMcpServer("filesystem");
            const git = getMcpServer("git");
            const tgts = selectedRef.current;
            if (fs) await installCatalogMcp(fs, tgts);
            if (git) await installCatalogMcp(git, tgts);
            message = [status, "installed filesystem + git MCP"].filter(Boolean).join(" · ");
          } catch (e) {
            message = [status, e instanceof Error ? e.message : String(e)].filter(Boolean).join(" · ");
          }
        }
        await finish(packRef.current, message);
      })();
    }
  });

  const footer =
    step === "detect" && tools.length === 0
      ? "esc skip"
      : step === "targets"
        ? "space toggle · ↵ next · esc skip"
        : step === "mcp"
          ? "Y install filesystem + git · N skip · esc skip"
          : step === "confirm"
            ? "Y write · N skip pack · esc skip"
            : step === "pack"
              ? "↵ choose · esc skip"
              : "↵ next · esc skip";

  return (
    <Box flexDirection="column" width={cols} paddingX={2} paddingY={1}>
      <Box borderStyle="round" borderColor={theme.line} paddingX={2}>
        <Text color={theme.accent}>◤ </Text>
        <Text bold color={theme.accent}>
          PEREZDEV HUB
        </Text>
        <Text color={theme.muted}>{`  v${VERSION}`}</Text>
        <Text color={theme.dim}>  setup</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1} paddingY={0}>
        {step === "detect" && <DetectStep tools={tools} ollama={ollama} />}
        {step === "targets" && <TargetsStep tools={tools} selected={selected} cursor={cursor} />}
        {step === "missing" && <MissingStep missing={missing} />}
        {step === "pack" && <PackStep sel={packSel} />}
        {step === "fetch" && (
          <Box>
            <Text color={theme.violet}>
              <Spinner type="dots" />
            </Text>
            <Text color={theme.fg2}> {status || "working…"}</Text>
          </Box>
        )}
        {step === "confirm" && <ConfirmBox desc={`Superpowers → ${selected.join(", ") || "no targets"}`} diff={diff} />}
        {step === "mcp" && (
          <Box flexDirection="column">
            {status ? <Text color={theme.fg2}>{status}</Text> : null}
            <Text color={theme.fg}>Install filesystem + git MCP into {selected.join(", ") || "chosen tools"}?</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.dim}>{footer}</Text>
      </Box>
    </Box>
  );
}

function DetectStep({ tools, ollama }: { tools: ToolPresence[]; ollama: { up: boolean; model?: string } }): React.ReactElement {
  if (tools.length === 0) {
    return (
      <Box>
        <Text color={theme.accent}>
          <Spinner type="dots" />
        </Text>
        <Text color={theme.fg2}> detecting tools…</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text color={theme.dim}>detected</Text>
      {tools.map((t) => (
        <Text key={t.id} color={t.present ? theme.ok : theme.muted}>
          {t.present ? "●" : "○"} {t.name}
        </Text>
      ))}
      <Text color={ollama.up ? theme.ok : theme.muted}>
        {ollama.up ? "●" : "○"} Ollama{ollama.model ? ` · ${ollama.model}` : ollama.up ? "" : " · down"}
      </Text>
    </Box>
  );
}

function TargetsStep({
  tools,
  selected,
  cursor,
}: {
  tools: ToolPresence[];
  selected: ToolId[];
  cursor: number;
}): React.ReactElement {
  const on = new Set(selected);
  return (
    <Box flexDirection="column">
      <Text color={theme.dim}>write skills into</Text>
      {tools.map((t, i) => {
        const focus = i === cursor;
        return (
          <Box key={t.id}>
            <Box width={2} flexShrink={0}>
              <Text color={focus ? theme.accent : theme.faint}>{focus ? "›" : " "}</Text>
            </Box>
            <Text color={focus ? theme.accent : theme.fg}>
              {on.has(t.id) ? "●" : "○"} {t.name}
            </Text>
            {!t.present && <Text color={theme.dim}> missing</Text>}
          </Box>
        );
      })}
    </Box>
  );
}

function MissingStep({ missing }: { missing: ToolPresence[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.dim}>Not installed — paste to install. PerezDev will not run this.</Text>
      {missing.map((t) => (
        <Box key={t.id} flexDirection="column" marginTop={0}>
          <Text color={theme.fg}>{t.name}</Text>
          <Text color={theme.violet}>{toolInstallCommand(t.id)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function PackStep({ sel }: { sel: number }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.dim}>starter pack</Text>
      {STARTER_PACKS.map((p, i) => {
        const focus = i === sel;
        const color = p.id === "generate" && focus ? theme.violet : focus ? theme.accent : theme.fg;
        return (
          <Box key={p.id} flexDirection="column">
            <Box>
              <Box width={2} flexShrink={0}>
                <Text color={focus ? theme.accent : theme.faint}>{focus ? "›" : " "}</Text>
              </Box>
              <Text color={color} bold={focus}>
                {p.label}
              </Text>
            </Box>
            {focus && (
              <Box marginLeft={2}>
                <Text color={theme.dim}>{p.hint}</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** Keep the confirm box from flooding a 24-row terminal. */
function shortDiff(lines: string[], cap = 8): string[] {
  if (lines.length <= cap) return lines;
  return [...lines.slice(0, cap), `+ ${lines.length - cap} more`];
}
