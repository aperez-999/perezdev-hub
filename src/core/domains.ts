// Deterministic domain inference: keyword matches on name/purpose/behaviors add
// tailored responsibilities, guidelines, workflow, and done-checks. Additive; deduped by the caller.

export interface DomainRule {
  /** Matched against the lowercased name + purpose + behaviors. */
  test: RegExp;
  responsibilities: string[];
  guidelines: string[];
  /** Ordered process steps the agent should follow. */
  workflow: string[];
  /** Definition-of-done checks. */
  done: string[];
}

export const DOMAIN_RULES: DomainRule[] = [
  {
    test: /\b(review|audit|lint)\b|reviewer/,
    responsibilities: [
      "Flag correctness bugs and logic errors",
      "Call out missing error handling and unhandled edge cases",
      "Suggest concrete fixes, not just problems",
    ],
    guidelines: [
      "Focus on what matters; skip pure style nits unless they hurt readability",
      "Cite specific files and line numbers when raising an issue",
    ],
    workflow: [
      "Identify the changeset under review (diff, branch, or files).",
      "Read the surrounding code so each change is judged in context.",
      "Assess in priority order: correctness → security → performance → maintainability.",
      "For each finding, record location, severity, and a concrete fix.",
      "Summarize findings highest-severity first; note anything you could not verify.",
    ],
    done: [
      "Every changed file has been read and assessed",
      "Each finding has a location, a severity, and an actionable fix",
    ],
  },
  {
    test: /\b(test|tests|testing|coverage|spec|unit|e2e)\b/,
    responsibilities: [
      "Cover happy paths, edge cases, and error conditions",
      "Match the project's existing test framework and naming conventions",
    ],
    guidelines: [
      "Keep each test small and independently meaningful",
      "Prefer real assertions over snapshot dumps; avoid testing implementation details",
    ],
    workflow: [
      "Identify the module under test and its public surface.",
      "Detect the test framework, runner, and conventions already used in the repo.",
      "Enumerate cases: happy path, boundaries, error conditions, and regressions.",
      "Write focused tests, one behavior per test.",
      "Run the suite, fix failures, and iterate until green.",
    ],
    done: ["New tests cover the key paths and pass", "No flaky or implementation-coupled assertions remain"],
  },
  {
    test: /\b(debug|bug|fix|crash|failure|regress|incident)\b|debugger/,
    responsibilities: [
      "Reproduce the failure and read the actual error before theorizing",
      "Form a hypothesis, confirm it with evidence, then find the root cause",
    ],
    guidelines: [
      "Fix the cause, not the symptom; propose the smallest change that works",
      "Never guess-patch — verify the fix actually resolves the reported behavior",
    ],
    workflow: [
      "Reproduce the failure and capture the exact error and stack trace.",
      "Localize the fault: read the trace, bisect, add logging if needed.",
      "Form a hypothesis and confirm it with concrete evidence.",
      "Apply the smallest fix at the root cause.",
      "Re-run to confirm the failure is gone; add a regression test.",
    ],
    done: ["Root cause identified, not just the symptom", "Fix verified by reproduce-then-pass; regression guarded"],
  },
  {
    test: /\b(doc|docs|document|documentation|readme|docstring|guide|tutorial)\b/,
    responsibilities: [
      "Lead with what the reader needs to do, then the details",
      "Use concrete examples over abstract description",
    ],
    guidelines: [
      "Match the surrounding documentation style and formatting",
      "Keep prose tight; cut filler and restated obvious points",
    ],
    workflow: [
      "Identify the audience and what they need to accomplish.",
      "Read the code or feature being documented to stay accurate.",
      "Draft: purpose, usage, examples, then edge cases and gotchas.",
      "Verify every example actually runs/compiles.",
    ],
    done: ["Docs are accurate against current code", "A new reader could follow them without prior context"],
  },
  {
    test: /\b(refactor|cleanup|restructure|simplif|tech debt)\b/,
    responsibilities: [
      "Preserve existing behavior — refactor only, no feature changes",
      "Reduce duplication and clarify names without over-abstracting",
    ],
    guidelines: [
      "Work in small, reviewable steps and keep tests green throughout",
      "Explain why each change improves the code",
    ],
    workflow: [
      "Confirm there are tests covering the behavior; add characterization tests if not.",
      "Make one small structural change at a time.",
      "Run the tests after each step to prove behavior is unchanged.",
      "Stop when the target structure is reached; avoid scope creep.",
    ],
    done: ["Behavior is provably unchanged (tests green)", "Code is clearer with no new features added"],
  },
  {
    test: /\b(commit|pr|pull request|changelog|release notes|merge)\b/,
    responsibilities: [
      "Summarize what changed and why, in plain language",
      "Call out breaking changes and required migration steps",
    ],
    guidelines: [
      "Be specific and skimmable; never invent changes that aren't in the diff",
      "Use the project's existing commit/PR conventions",
    ],
    workflow: [
      "Read the staged diff or branch changes.",
      "Group changes by type (feat/fix/refactor/docs/test/chore).",
      "Write a concise summary: what changed, why, and how to verify.",
      "Flag breaking changes and migration steps explicitly.",
    ],
    done: ["Summary reflects only what is actually in the diff", "Breaking changes and verification steps are stated"],
  },
  {
    test: /\b(security|secure|vuln|owasp|auth|crypto|secret)\b/,
    responsibilities: [
      "Check for OWASP-class issues: injection, broken auth, secret exposure, SSRF",
      "Validate input handling and trust boundaries",
    ],
    guidelines: [
      "Treat all external input as untrusted; verify at boundaries",
      "Recommend defense-in-depth, not single-point fixes",
    ],
    workflow: [
      "Map the trust boundaries and where untrusted input enters.",
      "Check each boundary for injection, authz, and data-exposure risks.",
      "Rate findings by exploitability and impact.",
      "Recommend concrete, layered mitigations.",
    ],
    done: ["Each input/trust boundary has been examined", "Findings are risk-rated with concrete mitigations"],
  },
  {
    test: /\b(sql|query|database|schema|migration|orm)\b/,
    responsibilities: [
      "Write parameterized, injection-safe queries",
      "Consider indexes, query plans, and N+1 access patterns",
    ],
    guidelines: ["Prefer explicit columns over SELECT *; keep migrations reversible"],
    workflow: [
      "Understand the schema and access patterns involved.",
      "Write parameterized queries; never interpolate raw input.",
      "Check indexes and query plans for the hot paths.",
      "For migrations, provide a reversible down path and test on a copy first.",
    ],
    done: ["Queries are injection-safe and index-aware", "Migrations are reversible and verified on non-prod first"],
  },
  {
    test: /\b(api|endpoint|rest|graphql|http|route|webhook)\b/,
    responsibilities: [
      "Validate request payloads and return correct status codes",
      "Return structured, actionable error responses",
    ],
    guidelines: ["Keep endpoints idempotent where the HTTP method implies it"],
    workflow: [
      "Define the contract: method, path, request/response shapes, errors.",
      "Validate input and authenticate/authorize before doing work.",
      "Return correct status codes and structured error bodies.",
      "Document the endpoint and add request/response tests.",
    ],
    done: ["Input is validated and errors are structured", "Contract is documented and covered by tests"],
  },
  {
    test: /\b(perf|performance|optimi|latency|throughput|profile|bottleneck)\b/,
    responsibilities: [
      "Measure before optimizing; identify the actual bottleneck",
      "Compare before/after with concrete numbers",
    ],
    guidelines: ["Avoid premature optimization; protect readability unless the hot path demands otherwise"],
    workflow: [
      "Establish a baseline measurement under a representative load.",
      "Profile to find the real bottleneck — don't guess.",
      "Apply one targeted optimization at a time.",
      "Re-measure and compare against the baseline.",
    ],
    done: ["Bottleneck identified with data", "Improvement shown with before/after numbers"],
  },
  {
    test: /\b(plan|planning|requirement|user story|backlog|scope|breakdown|estimate)\b/,
    responsibilities: [
      "Turn goals into concrete, ordered, independently shippable tasks",
      "Surface assumptions, risks, and dependencies",
    ],
    guidelines: ["Keep tasks small and verifiable; define acceptance criteria for each"],
    workflow: [
      "Restate the goal and success criteria in one or two sentences.",
      "Break the work into small, ordered tasks with clear acceptance criteria.",
      "Identify dependencies, risks, and open questions.",
      "Recommend a sequence and a first concrete step.",
    ],
    done: ["Tasks are small, ordered, and have acceptance criteria", "Risks, dependencies, and assumptions are listed"],
  },
  {
    test: /\b(accessibility|a11y|wcag|aria|screen reader|keyboard nav)\b/,
    responsibilities: [
      "Check semantic HTML and ARIA roles/attributes are correct",
      "Verify keyboard navigation, focus order, and visible focus states",
      "Check color contrast and text alternatives (alt text, labels)",
      "Test against screen-reader expectations and WCAG criteria",
    ],
    guidelines: [
      "Prefer native semantic elements over ARIA where possible",
      "Reference the specific WCAG success criterion when flagging an issue",
    ],
    workflow: [
      "Identify the components or pages in scope.",
      "Audit structure: semantic elements, headings, landmarks, ARIA.",
      "Check keyboard operability, focus management, and contrast.",
      "Report each issue with the WCAG criterion and a concrete fix.",
    ],
    done: ["Issues map to specific WCAG criteria", "Keyboard and screen-reader paths are verified"],
  },
  {
    test: /\b(architect|design|adr|system design|tradeoff|rfc)\b/,
    responsibilities: [
      "Propose 2–3 options with explicit tradeoffs before recommending one",
      "Tie the design back to the requirements and constraints",
    ],
    guidelines: ["Record the decision and its rationale (ADR-style) for future maintainers"],
    workflow: [
      "Clarify the requirements, constraints, and quality attributes that matter.",
      "Propose 2–3 viable approaches with tradeoffs.",
      "Recommend one and justify it against the constraints.",
      "Capture the decision and consequences as a short ADR.",
    ],
    done: ["Options and tradeoffs are explicit", "A decision is recorded with rationale and consequences"],
  },
];

export interface InferredGuidance {
  responsibilities: string[];
  guidelines: string[];
  workflow: string[];
  done: string[];
}

/** Merge guidance from every rule matching `text`. */
export function inferDomains(text: string): InferredGuidance {
  const haystack = text.toLowerCase();
  const out: InferredGuidance = { responsibilities: [], guidelines: [], workflow: [], done: [] };
  for (const rule of DOMAIN_RULES) {
    if (rule.test.test(haystack)) {
      out.responsibilities.push(...rule.responsibilities);
      out.guidelines.push(...rule.guidelines);
      out.workflow.push(...rule.workflow);
      out.done.push(...rule.done);
    }
  }
  return out;
}
