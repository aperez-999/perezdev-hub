import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { Logo, ToolBadges, Loading, Footer, Row } from "./components.js";
import { theme, GRADIENTS } from "./theme.js";
import {
  loadHome,
  installProposal,
  installCatalogMcp,
  installDescribed,
  removeAgent,
  removeMcp,
  updateInstalled,
  catalogMcp,
  catalogCli,
  engineMap,
  engineDiagnose,
  type HomeData,
  type Diagnosis,
} from "./data.js";
import { slugSchema } from "../core/agent-spec.js";
import { ChatView } from "./chat.js";

export interface ExitResult {
  action: null;
}

type View = "home" | "chat" | "recommend" | "installed" | "browse" | "describe" | "map" | "diagnose";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [data, setData] = useState<HomeData | null>(null);
  const [view, setView] = useState<View>("home");
  const [grad, setGrad] = useState(0);
  const [status, setStatus] = useState("");

  // Shimmer the logo.
  useEffect(() => {
    const t = setInterval(() => setGrad((g) => (g + 1) % GRADIENTS.length), 420);
    return () => clearInterval(t);
  }, []);

  async function reload(): Promise<void> {
    const [d] = await Promise.all([loadHome(), sleep(700)]);
    setData(d);
  }
  useEffect(() => {
    void reload();
  }, []);

  const go = (v: View): void => {
    setView(v);
    setStatus("");
  };

  if (!data) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Logo gradient={GRADIENTS[grad]!} />
        <Box marginTop={2}>
          <Loading label="scanning your project" />
        </Box>
      </Box>
    );
  }

  // Chat takes over the screen (its own header/footer), no shared chrome.
  if (view === "chat") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <ChatView gradient={GRADIENTS[grad]!} onBack={() => go("home")} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Logo gradient={GRADIENTS[grad]!} />
      <Box marginTop={1}>
        <ToolBadges tools={data.tools} />
      </Box>
      <Text dimColor>{`project   ${data.scan.signals.join(" · ") || "no signals"}`}</Text>
      <Box marginTop={1} flexDirection="column">
        {view === "home" && <HomeView data={data} onPick={go} onQuit={() => exit()} status={status} />}
        {view === "recommend" && <RecommendView data={data} onBack={() => go("home")} reload={reload} />}
        {view === "installed" && <InstalledView data={data} onBack={() => go("home")} reload={reload} />}
        {view === "browse" && <BrowseView data={data} onBack={() => go("home")} reload={reload} />}
        {view === "describe" && <DescribeView data={data} onBack={() => go("home")} reload={reload} />}
        {view === "map" && <RuntimeMapView onBack={() => go("home")} />}
        {view === "diagnose" && <RuntimeDiagnoseView onBack={() => go("home")} />}
      </Box>
    </Box>
  );
}

const MENU: { value: View | "quit"; label: string; hint: string }[] = [
  { value: "chat", label: "Prompt local AI", hint: "ollama · local models" },
  { value: "recommend", label: "Recommend for this project", hint: "tailored, generated" },
  { value: "describe", label: "Describe an agent to build", hint: "type what you want" },
  { value: "installed", label: "Manage installed", hint: "update · remove" },
  { value: "browse", label: "Browse MCP & CLI agents", hint: "catalog" },
  { value: "map", label: "Map project tree", hint: "local engine" },
  { value: "diagnose", label: "Diagnose a log file", hint: "local engine" },
  { value: "quit", label: "Quit", hint: "" },
];

function HomeView({
  data,
  onPick,
  onQuit,
  status,
}: {
  data: HomeData;
  onPick: (v: View) => void;
  onQuit: () => void;
  status: string;
}): React.ReactElement {
  const [sel, setSel] = useState(0);
  useInput((input, key) => {
    if (key.downArrow || input === "j") setSel((s) => (s + 1) % MENU.length);
    else if (key.upArrow || input === "k") setSel((s) => (s - 1 + MENU.length) % MENU.length);
    else if (key.return) {
      const item = MENU[sel]!;
      if (item.value === "quit") onQuit();
      else onPick(item.value);
    } else if (input === "q") onQuit();
  });
  return (
    <Box flexDirection="column">
      {!data.aiMode && (
        <Box marginBottom={1}>
          <Text color={theme.warn}>tip </Text>
          <Text dimColor>set ANTHROPIC_API_KEY for fully AI-generated agents</Text>
        </Box>
      )}
      {MENU.map((m, i) => (
        <Row key={m.value} active={i === sel} label={m.label} hint={m.hint} />
      ))}
      <Footer keys={`↑↓ move · enter select · q quit${status ? `   ${status}` : ""}`} />
    </Box>
  );
}

interface Pick {
  id: string;
  kind: "agent" | "mcp";
  label: string;
  hint: string;
}

function RecommendView({
  data,
  onBack,
  reload,
}: {
  data: HomeData;
  onBack: () => void;
  reload: () => Promise<void>;
}): React.ReactElement {
  const items: Pick[] = [
    ...data.proposals.map((p): Pick => ({ id: `a:${p.name}`, kind: "agent", label: p.name, hint: p.reason })),
    ...data.mcpSuggestions.map((m): Pick => ({ id: `m:${m.server.id}`, kind: "mcp", label: `${m.server.name} (mcp)`, hint: m.reason })),
  ];
  const [sel, setSel] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, "pending" | "done">>({});
  const [installing, setInstalling] = useState(false);

  useInput((input, key) => {
    if (installing) return;
    if (key.escape || input === "q") {
      onBack();
    } else if (key.downArrow || input === "j") {
      setSel((s) => (items.length ? (s + 1) % items.length : 0));
    } else if (key.upArrow || input === "k") {
      setSel((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
    } else if (input === " ") {
      const id = items[sel]?.id;
      if (id) setChecked((c) => toggle(c, id));
    } else if (input === "a") {
      setChecked((c) => (c.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
    } else if (key.return && checked.size > 0) {
      void run();
    }
  });

  async function run(): Promise<void> {
    setInstalling(true);
    const queue = items.filter((i) => checked.has(i.id));
    for (const it of queue) {
      setStatuses((s) => ({ ...s, [it.id]: "pending" }));
      if (it.kind === "agent") {
        const proposal = data.proposals.find((p) => `a:${p.name}` === it.id)!;
        await Promise.all([installProposal(proposal, data.targets), sleep(350)]);
      } else {
        const sug = data.mcpSuggestions.find((m) => `m:${m.server.id}` === it.id)!;
        await Promise.all([installCatalogMcp(sug.server, data.targets), sleep(350)]);
      }
      setStatuses((s) => ({ ...s, [it.id]: "done" }));
    }
    await reload();
    onBack();
  }

  if (items.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={theme.ok}>✓ You're fully set up for this project.</Text>
        <Footer keys="esc back" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>{`Recommended  `}<Text dimColor>{`${items.length} for ${data.scan.signals.slice(0, 3).join(" · ") || "this project"}`}</Text></Text>
      <Box marginTop={1} flexDirection="column">
        {items.map((it, i) => {
          const st = statuses[it.id];
          if (installing) {
            return (
              <Box key={it.id}>
                <Text>{"  "}</Text>
                {st === "done" ? <Text color={theme.ok}>✓ </Text> : st === "pending" ? <Loading label="" /> : <Text dimColor>· </Text>}
                <Text dimColor={st !== "done"}>{it.label}</Text>
              </Box>
            );
          }
          return <Row key={it.id} active={i === sel} checked={checked.has(it.id)} label={it.label} hint={it.hint} />;
        })}
      </Box>
      <Footer keys={installing ? "generating…" : `space toggle · a all · enter install (${checked.size}) · esc back`} />
    </Box>
  );
}

function InstalledView({
  data,
  onBack,
  reload,
}: {
  data: HomeData;
  onBack: () => void;
  reload: () => Promise<void>;
}): React.ReactElement {
  const rows = [
    ...data.agents.map((a) => ({ id: `a:${a.name}`, kind: "agent" as const, label: a.name, hint: `${a.targets.join(", ")} · v${a.version}`, agent: a })),
    ...data.mcp.map((m) => ({ id: `m:${m.id}`, kind: "mcp" as const, label: `${m.id} (mcp)`, hint: m.targets.join(", "), agent: null })),
  ];
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const cur = rows[sel];

  useInput((input, key) => {
    if (busy) return;
    if (key.escape || input === "q") return onBack();
    if (rows.length === 0) return;
    if (key.downArrow || input === "j") {
      setSel((s) => (s + 1) % rows.length);
      setConfirm(null);
    } else if (key.upArrow || input === "k") {
      setSel((s) => (s - 1 + rows.length) % rows.length);
      setConfirm(null);
    } else if (input === "u" && cur?.kind === "agent") {
      act(() => updateInstalled(cur.agent!.spec, false), `updated ${cur.label}`);
    } else if (input === "b" && cur?.kind === "agent") {
      act(() => updateInstalled(cur.agent!.spec, true), `bumped ${cur.label}`);
    } else if (input === "x" && cur) {
      if (confirm !== cur.id) {
        setConfirm(cur.id);
        setMsg(`press x again to remove ${cur.label}`);
      } else {
        act(() => (cur.kind === "agent" ? removeAgent(cur.agent!) : removeMcp(cur.id.slice(2))), `removed ${cur.label}`);
      }
    }
  });

  function act(fn: () => Promise<void>, done: string): void {
    setBusy(true);
    setMsg("working…");
    setConfirm(null);
    void (async () => {
      await Promise.all([fn(), sleep(300)]);
      await reload();
      setBusy(false);
      setMsg(done);
      setSel((s) => Math.max(0, Math.min(s, rows.length - 2)));
    })();
  }

  if (rows.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Nothing installed yet. Try Recommend or Describe.</Text>
        <Footer keys="esc back" />
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text bold>{`Installed  `}<Text dimColor>{`${data.agents.length} agent(s) · ${data.mcp.length} mcp`}</Text></Text>
      <Box marginTop={1} flexDirection="column">
        {rows.map((r, i) => (
          <Row key={r.id} active={i === sel} label={r.label} hint={r.hint} />
        ))}
      </Box>
      <Footer keys={busy ? "working…" : `u update · b bump · x remove · esc back${msg ? `   ${msg}` : ""}`} />
    </Box>
  );
}

function BrowseView({
  data,
  onBack,
  reload,
}: {
  data: HomeData;
  onBack: () => void;
  reload: () => Promise<void>;
}): React.ReactElement {
  const rows = [
    ...catalogMcp.map((m) => ({ id: `m:${m.id}`, kind: "mcp" as const, label: `${m.name} (mcp)`, hint: m.description })),
    ...catalogCli.map((a) => ({ id: `c:${a.id}`, kind: "cli" as const, label: a.name, hint: a.description })),
  ];
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const cur = rows[sel]!;

  useInput((input, key) => {
    if (busy) return;
    if (key.escape || input === "q") return onBack();
    if (key.downArrow || input === "j") setSel((s) => (s + 1) % rows.length);
    else if (key.upArrow || input === "k") setSel((s) => (s - 1 + rows.length) % rows.length);
    else if (key.return) {
      if (cur.kind === "mcp") {
        const server = catalogMcp.find((m) => `m:${m.id}` === cur.id)!;
        setBusy(true);
        setMsg(`installing ${server.name}…`);
        void (async () => {
          await Promise.all([installCatalogMcp(server, data.targets), sleep(350)]);
          await reload();
          setBusy(false);
          setMsg(`installed ${server.name}`);
        })();
      } else {
        const agent = catalogCli.find((a) => `c:${a.id}` === cur.id)!;
        setMsg(`${agent.name}: ${agent.install}`);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>Browse catalog</Text>
      <Box marginTop={1} flexDirection="column">
        {rows.map((r, i) => (
          <Row key={r.id} active={i === sel} label={r.label} hint={i === sel ? r.hint : undefined} />
        ))}
      </Box>
      <Footer keys={busy ? "working…" : `enter ${cur.kind === "mcp" ? "install" : "show command"} · esc back${msg ? `   ${msg}` : ""}`} />
    </Box>
  );
}

function DescribeView({
  data,
  onBack,
  reload,
}: {
  data: HomeData;
  onBack: () => void;
  reload: () => Promise<void>;
}): React.ReactElement {
  const [step, setStep] = useState<"purpose" | "name" | "installing" | "done">("purpose");
  const [purpose, setPurpose] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  useInput((_i, key) => {
    if (key.escape && step !== "installing") onBack();
  });

  if (step === "installing") {
    return (
      <Box flexDirection="column">
        <Loading label={data.aiMode ? `generating ${name} with Claude…` : `building ${name}…`} />
      </Box>
    );
  }
  if (step === "done") {
    return (
      <Box flexDirection="column">
        <Text color={theme.ok}>{`✓ installed ${name} → ${data.targets.join(", ")}`}</Text>
        <Footer keys="esc back" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Describe an agent</Text>
      <Box marginTop={1}>
        <Text dimColor>what should it do?  </Text>
        {step === "purpose" ? (
          <TextInput
            value={purpose}
            onChange={setPurpose}
            placeholder="review my React code for accessibility"
            onSubmit={(v) => {
              if (v.trim().length < 8) {
                setErr("describe it in a few more words");
                return;
              }
              setErr("");
              setName(slugify(v));
              setStep("name");
            }}
          />
        ) : (
          <Text>{purpose}</Text>
        )}
      </Box>
      {step === "name" && (
        <Box marginTop={1}>
          <Text dimColor>name  </Text>
          <TextInput
            value={name}
            onChange={setName}
            onSubmit={(v) => {
              if (!slugSchema.safeParse(v).success) {
                setErr("kebab-case only (letters, numbers, hyphens)");
                return;
              }
              setErr("");
              setStep("installing");
              void (async () => {
                await Promise.all([installDescribed(v, purpose, data.targets), sleep(400)]);
                await reload();
                setStep("done");
              })();
            }}
          />
        </Box>
      )}
      {err ? <Text color={theme.bad}>{err}</Text> : null}
      <Footer keys="enter continue · esc back" />
    </Box>
  );
}

function RuntimeMapView({ onBack }: { onBack: () => void }): React.ReactElement {
  const [tree, setTree] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useInput((_i, key) => {
    if (key.escape || _i === "q") onBack();
  });
  useEffect(() => {
    engineMap(process.cwd(), 2).then((r) => setTree(r.tree)).catch((e: unknown) => setErr(String(e instanceof Error ? e.message : e)));
  }, []);
  return (
    <Box flexDirection="column">
      <Text bold>Project map  <Text dimColor>local engine</Text></Text>
      <Box marginTop={1} flexDirection="column">
        {err ? (
          <Text color={theme.bad}>{err}</Text>
        ) : tree === null ? (
          <Loading label="mapping the file tree" />
        ) : (
          tree.split("\n").slice(0, 24).map((l, i) => (
            <Text key={i} dimColor={i > 0}>
              {l}
            </Text>
          ))
        )}
      </Box>
      <Footer keys="esc back" />
    </Box>
  );
}

function RuntimeDiagnoseView({ onBack }: { onBack: () => void }): React.ReactElement {
  const [path, setPath] = useState("");
  const [phase, setPhase] = useState<"input" | "running" | "done">("input");
  const [res, setRes] = useState<Diagnosis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useInput((_i, key) => {
    if (key.escape && phase !== "running") onBack();
  });
  return (
    <Box flexDirection="column">
      <Text bold>Diagnose a log file  <Text dimColor>local engine</Text></Text>
      <Box marginTop={1}>
        <Text dimColor>path  </Text>
        {phase === "input" ? (
          <TextInput
            value={path}
            onChange={setPath}
            placeholder="/path/to/error.log"
            onSubmit={(v) => {
              if (!v.trim()) return;
              setPhase("running");
              engineDiagnose(v.trim())
                .then((d) => {
                  setRes(d);
                  setPhase("done");
                })
                .catch((e: unknown) => {
                  setErr(String(e instanceof Error ? e.message : e));
                  setPhase("done");
                });
            }}
          />
        ) : (
          <Text>{path}</Text>
        )}
      </Box>
      {phase === "running" && (
        <Box marginTop={1}>
          <Loading label="analyzing" />
        </Box>
      )}
      {phase === "done" && err && <Text color={theme.bad}>{err}</Text>}
      {phase === "done" && res && (
        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text color={theme.bad} bold>{res.kind}</Text>  {res.message}
          </Text>
          <Text color={theme.ok}>{`→ ${res.hint}`}</Text>
          {res.frames.map((f) => (
            <Text key={`${f.file}:${f.line}`} dimColor>{`  ${f.file}:${f.line}`}</Text>
          ))}
        </Box>
      )}
      <Footer keys="enter analyze · esc back" />
    </Box>
  );
}

// helpers
function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 3)
    .join("-")
    .slice(0, 40) || "agent";
}
