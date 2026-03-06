export const theme = {
  accent: "cyan",
  accentBright: "cyanBright",
  ok: "green",
  warn: "yellow",
  bad: "red",
  muted: "gray",
} as const;

// Gradient presets cycled to make the logo shimmer.
export const GRADIENTS = ["cristal", "teen", "mind", "vice", "morning", "passion"] as const;

export const KIND_COLOR: Record<string, string> = {
  agent: "green",
  mcp: "blue",
  cli: "yellow",
};
