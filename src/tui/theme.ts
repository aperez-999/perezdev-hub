// Two-accent dark palette ported from the PerezDev Hub redesign prototype.
// Hex tokens render truecolor in modern terminals and degrade gracefully.
// Legacy key names (accent/ok/warn/bad/muted/accentBright) are preserved.
export const theme = {
  // accents
  accent: "#34d8e6", // cyan — primary, links, active tab, prompt glyph
  accentBright: "#7fe9f2",
  violet: "#b89dff", // AI / generative / planning
  // status
  ok: "#46d18a",
  warn: "#f1c453",
  bad: "#fb7185",
  // neutrals (dark terminal)
  fg: "#cdd6e0", // body text
  fg2: "#8b97a6", // secondary
  muted: "#6e7b8a", // labels / inactive
  dim: "#4d5866", // eyebrows / hints
  faint: "#3a4450", // empty dots, rules
  line: "#1b2530", // borders / dividers
  panel: "#0a0f16", // inset card bg
  ink: "#04161a", // text on an accent fill
} as const;

// Logo gradient — pass to <Gradient colors={LOGO_GRADIENT}>.
export const LOGO_GRADIENT = ["#34d8e6", "#7c8cff", "#b89dff"];

// Layout (character cells).
export const BUILDER_FORM_W = 46; // F2 compose column
export const MCP_PANEL_W = 40; // F3 right panel
