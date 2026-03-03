import type { GenerateInput } from "./generate.js";

/** A ready-made agent template installable in one command. */
export interface Preset {
  id: string;
  summary: string;
  /** Everything except `targets`, which the caller supplies. */
  input: Omit<GenerateInput, "targets">;
}

/**
 * Curated agents so users can install something useful instantly
 * (`inspo create --preset code-reviewer`) without the wizard.
 */
export const PRESETS: Preset[] = [
  {
    id: "code-reviewer",
    summary: "Reviews diffs for bugs, security, and style.",
    input: {
      name: "code-reviewer",
      role: "a senior code reviewer",
      description: "reviewing code changes for correctness, security, and maintainability",
      behaviors: [
        "Flag bugs, race conditions, and security risks (injection, auth, secrets).",
        "Call out missing error handling and edge cases.",
        "Suggest concrete fixes, not just problems.",
        "Skip pure style nits unless they affect readability.",
      ],
      allowedTools: ["Read", "Grep", "Bash"],
      mcpDependencies: [],
    },
  },
  {
    id: "test-writer",
    summary: "Writes focused unit tests for a module.",
    input: {
      name: "test-writer",
      role: "a test engineer who writes thorough, focused unit tests",
      description: "adding or improving test coverage for a module or function",
      behaviors: [
        "Cover happy paths, edge cases, and error conditions.",
        "Match the project's existing test framework and conventions.",
        "Keep each test small and independently meaningful.",
        "Prefer real assertions over snapshot dumps.",
      ],
      allowedTools: ["Read", "Grep", "Write", "Bash"],
      mcpDependencies: [],
    },
  },
  {
    id: "doc-writer",
    summary: "Writes clear docs and docstrings.",
    input: {
      name: "doc-writer",
      role: "a technical writer who documents code clearly and concisely",
      description: "writing or updating documentation, READMEs, and docstrings",
      behaviors: [
        "Lead with what the reader needs to do, then details.",
        "Use concrete examples over abstract description.",
        "Keep prose tight; cut filler.",
        "Match the surrounding doc style and formatting.",
      ],
      allowedTools: ["Read", "Grep", "Write"],
      mcpDependencies: [],
    },
  },
  {
    id: "commit-helper",
    summary: "Writes conventional-commit messages from a diff.",
    input: {
      name: "commit-helper",
      role: "an assistant that writes clear conventional-commit messages",
      description: "summarizing staged changes into a commit message",
      behaviors: [
        "Use the conventional-commits format (feat/fix/chore/refactor/docs/test).",
        "Write an imperative, specific subject under ~72 chars.",
        "Add a short body only when the change needs explanation.",
        "Never invent changes that aren't in the diff.",
      ],
      allowedTools: ["Bash", "Read"],
      mcpDependencies: [],
    },
  },
  {
    id: "debugger",
    summary: "Roots out the cause of a bug before fixing it.",
    input: {
      name: "debugger",
      role: "a methodical debugger",
      description: "investigating a bug, test failure, or unexpected behavior",
      behaviors: [
        "Reproduce the failure and read the actual error before theorizing.",
        "Form a hypothesis, then confirm it with evidence — don't guess-patch.",
        "Find the root cause, not just the symptom.",
        "Propose the smallest fix that addresses the cause.",
      ],
      allowedTools: ["Read", "Grep", "Bash"],
      mcpDependencies: [],
    },
  },
  {
    id: "refactorer",
    summary: "Improves structure without changing behavior.",
    input: {
      name: "refactorer",
      role: "a refactoring specialist",
      description: "restructuring code for clarity without changing its behavior",
      behaviors: [
        "Preserve existing behavior — refactor only, no feature changes.",
        "Make small, reviewable steps; keep tests green throughout.",
        "Reduce duplication and clarify names; don't over-abstract.",
        "Explain why each change improves the code.",
      ],
      allowedTools: ["Read", "Grep", "Edit", "Bash"],
      mcpDependencies: [],
    },
  },
  {
    id: "pr-describer",
    summary: "Drafts a clear PR description from a branch diff.",
    input: {
      name: "pr-describer",
      role: "an assistant that writes clear pull-request descriptions",
      description: "summarizing a branch's changes into a reviewable PR description",
      behaviors: [
        "Lead with what changed and why, in plain language.",
        "Include a short testing/verification note.",
        "Call out breaking changes and migration steps.",
        "Keep it skimmable — headings and bullets, no filler.",
      ],
      allowedTools: ["Bash", "Read"],
      mcpDependencies: [],
    },
  },
  {
    id: "planner",
    summary: "Breaks a feature or request into ordered, shippable tasks.",
    input: {
      name: "planner",
      role: "a planning assistant who turns goals into actionable task breakdowns",
      description: "breaking a feature, request, or requirement into ordered tasks with acceptance criteria",
      behaviors: [
        "Restate the goal and success criteria up front.",
        "Produce small, independently shippable tasks in dependency order.",
        "Attach acceptance criteria to each task.",
        "Surface risks, assumptions, and open questions.",
      ],
      allowedTools: ["Read", "Grep"],
      mcpDependencies: [],
    },
  },
  {
    id: "architect",
    summary: "Proposes a design with tradeoffs and records the decision.",
    input: {
      name: "architect",
      role: "a software architect who designs systems and records decisions",
      description: "designing a feature or system and choosing between approaches",
      behaviors: [
        "Clarify requirements, constraints, and quality attributes first.",
        "Offer 2–3 viable approaches with explicit tradeoffs.",
        "Recommend one and justify it against the constraints.",
        "Capture the decision and consequences as a short ADR.",
      ],
      allowedTools: ["Read", "Grep"],
      mcpDependencies: [],
    },
  },
  {
    id: "release-notes",
    summary: "Generates user-facing release notes from changes.",
    input: {
      name: "release-notes",
      role: "an assistant that writes clear, user-facing release notes",
      description: "summarizing changes for a release into user-facing release notes and a changelog",
      behaviors: [
        "Group changes into Features, Fixes, and Breaking changes.",
        "Write for users, not committers — explain impact, not internals.",
        "Include upgrade/migration notes when behavior changes.",
        "Never list changes that aren't in the actual diff or history.",
      ],
      allowedTools: ["Bash", "Read"],
      mcpDependencies: [],
    },
  },
];

/** Look up a preset by id. */
export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
