// skill-distill.mts — Pure trajectory → draft-skill distillation.
//
// No I/O. Scans observation rows for repeated tool sequences that ended in a
// successful verification, and proposes DRAFT instincts capturing the pattern.
// The MCP tools ci_distill_candidates / ci_distill_propose / ci_distill_promote
// (src/bin/mcp-server.mts) wire the file reads and writes around these
// functions.
//
// Closed-loop "Learn From Every Session" (Law 7) on the SUCCESS side: the
// friction harvester (src/bin/harvest-friction.mts) already turns failures into
// instincts; this turns repeated wins into reusable drafts. Drafts never enter
// the suggestion pool — they require explicit promotion — so a coincidental
// tool sequence cannot cargo-cult itself into enforced behavior.

const MIN_TRAJECTORY_LENGTH = 4;
const GAP_MS = 10 * 60 * 1000;
const NGRAM_SIZES = [3, 4, 5];
const DEFAULT_MIN_OCCURRENCES = 3;
const DEFAULT_MIN_SESSIONS = 2;
const DRAFT_CONFIDENCE = 0.4;

const VERIFY_CMD =
  /\b(npm\s+(run\s+)?(test|verify(:[\w-]+)?|build)|pnpm\s+(test|build)|yarn\s+(test|build)|pytest|cargo\s+test|go\s+test|jest|vitest|make\s+test)\b/i;
const FAILURE_MARKER =
  /\b(error|errors|fail|failed|failing|not found|denied|cannot|exception|traceback)\b|exit code [1-9]/i;
const SUCCESS_MARKER =
  /\b(pass|passed|passing|success|succeeded|green|0 failures|all tests)\b|\bok\b/i;
const REFLECTION_MARKER = /\b(verified|phase[- ]?4|verify:all green|all tests pass)\b/i;

const NOISE_TOOL = /^(ci_|mcp__|TodoWrite$)/;

export interface DistillObservation {
  ts?: string;
  session?: string;
  session_id?: string;
  tool?: string;
  input_summary?: string;
  output_summary?: string;
}

export type SuccessReason = "verify-exit-0" | "reflection-pass";

export interface Trajectory {
  observations: DistillObservation[];
  session: string;
  startTs: string;
  endTs: string;
  succeeded: boolean;
  successReason: SuccessReason | null;
}

export interface Candidate {
  id: string;
  ngram: string[];
  occurrences: number;
  sessions: string[];
  outcomes: string[];
}

export interface DraftInstinct {
  id: string;
  trigger: string;
  body: string;
  confidence: number;
  domain: string;
  ngram: string[];
  occurrences: number;
  sessions: number;
  outcome: string;
}

function session(obs: DistillObservation): string {
  return (obs.session ?? obs.session_id ?? "").toString();
}

function text(obs: DistillObservation): string {
  return `${obs.input_summary ?? ""}\n${obs.output_summary ?? ""}`;
}

function classifyTrajectorySuccess(observations: DistillObservation[]): SuccessReason | null {
  for (const obs of observations) {
    if ((obs.tool ?? "") === "Bash") {
      const input = (obs.input_summary ?? "").toString();
      const output = (obs.output_summary ?? "").toString();
      if (VERIFY_CMD.test(input) && !FAILURE_MARKER.test(output) && (output === "" || SUCCESS_MARKER.test(output))) {
        return "verify-exit-0";
      }
    }
  }
  for (const obs of observations) {
    if (REFLECTION_MARKER.test(text(obs))) {
      return "reflection-pass";
    }
  }
  return null;
}

/**
 * Split a chronological observation list into contiguous trajectories. A
 * boundary occurs on session change or a time gap longer than GAP_MS. Only
 * trajectories of at least MIN_TRAJECTORY_LENGTH observations are returned;
 * each is classified as succeeded or not.
 */
export function extractTrajectories(observations: DistillObservation[]): Trajectory[] {
  const out: Trajectory[] = [];
  let group: DistillObservation[] = [];

  const flush = (): void => {
    if (group.length < MIN_TRAJECTORY_LENGTH) {
      group = [];
      return;
    }
    const successReason = classifyTrajectorySuccess(group);
    out.push({
      observations: group,
      session: session(group[0]!),
      startTs: (group[0]!.ts ?? "").toString(),
      endTs: (group[group.length - 1]!.ts ?? "").toString(),
      succeeded: successReason !== null,
      successReason,
    });
    group = [];
  };

  for (const obs of observations) {
    if (group.length === 0) {
      group.push(obs);
      continue;
    }
    const prev = group[group.length - 1]!;
    const sessionChanged = session(obs) !== session(prev);
    const prevMs = Date.parse((prev.ts ?? "").toString());
    const curMs = Date.parse((obs.ts ?? "").toString());
    const prevValid = !Number.isNaN(prevMs);
    const curValid = !Number.isNaN(curMs);
    const gapTooBig =
      (prevValid && curValid && curMs - prevMs > GAP_MS) || (prevValid !== curValid);

    if (sessionChanged || gapTooBig) {
      flush();
    }
    group.push(obs);
  }
  flush();

  return out;
}

function toolSequence(trajectory: Trajectory): string[] {
  return trajectory.observations
    .map((obs) => (obs.tool ?? "").toString())
    .filter((tool) => tool.length > 0 && !NOISE_TOOL.test(tool));
}

// Tool names are external data (observations.jsonl). The candidate id is later
// joined into a draft file path, so it must be slugified to [a-z0-9-] to keep a
// hostile tool name (`../`, `/`, `\`) from escaping the drafts directory.
function slugifyNgram(ngram: string[]): string {
  const slug = ngram
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "sequence";
}

interface Aggregate {
  ngram: string[];
  occurrences: number;
  sessions: Set<string>;
  outcomes: Set<string>;
}

/**
 * Mine repeated tool-sequence n-grams from SUCCESSFUL trajectories. A candidate
 * must occur at least `minOccurrences` times across at least `minSessions`
 * distinct sessions — so a pattern repeated within a single session is rejected.
 * Sorted by occurrences then n-gram length, both descending.
 */
export function findCandidates(
  trajectories: Trajectory[],
  opts: { minOccurrences?: number; minSessions?: number } = {},
): Candidate[] {
  const minOccurrences = opts.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;
  const minSessions = opts.minSessions ?? DEFAULT_MIN_SESSIONS;
  const aggregates = new Map<string, Aggregate>();

  for (const trajectory of trajectories) {
    if (!trajectory.succeeded) continue;
    const sequence = toolSequence(trajectory);
    const outcome = trajectory.successReason ?? "unknown";

    for (const size of NGRAM_SIZES) {
      for (let i = 0; i + size <= sequence.length; i += 1) {
        const ngram = sequence.slice(i, i + size);
        const key = ngram.join(">");
        let aggregate = aggregates.get(key);
        if (!aggregate) {
          aggregate = { ngram, occurrences: 0, sessions: new Set(), outcomes: new Set() };
          aggregates.set(key, aggregate);
        }
        aggregate.occurrences += 1;
        aggregate.sessions.add(trajectory.session);
        aggregate.outcomes.add(outcome);
      }
    }
  }

  const candidates: Candidate[] = [];
  for (const aggregate of aggregates.values()) {
    if (aggregate.occurrences < minOccurrences) continue;
    if (aggregate.sessions.size < minSessions) continue;
    candidates.push({
      id: `draft-${slugifyNgram(aggregate.ngram)}`,
      ngram: aggregate.ngram,
      occurrences: aggregate.occurrences,
      sessions: [...aggregate.sessions],
      outcomes: [...aggregate.outcomes],
    });
  }

  candidates.sort((a, b) =>
    b.occurrences !== a.occurrences ? b.occurrences - a.occurrences : b.ngram.length - a.ngram.length,
  );
  return candidates;
}

/** Turn a candidate into a DRAFT instinct with a placeholder body for the user to fill in. */
export function draftFromCandidate(candidate: Candidate): DraftInstinct {
  const arrow = candidate.ngram.join(" → ");
  const outcome = candidate.outcomes.join(", ");
  return {
    id: candidate.id,
    trigger: `Auto-detected pattern: ${candidate.ngram.join(" then ")} (seen ${candidate.occurrences}x across ${candidate.sessions.length} sessions)`,
    body: [
      "When this situation recurs, follow the proven sequence that worked before:",
      "",
      `  ${arrow}`,
      "",
      `This pattern succeeded in ${candidate.occurrences} run(s) across ${candidate.sessions.length} session(s) (outcome: ${outcome}).`,
      "Replace this placeholder with the concrete steps, preconditions, and gotchas before promoting —",
      "the tool sequence alone is evidence, not a recipe.",
    ].join("\n"),
    confidence: DRAFT_CONFIDENCE,
    domain: "workflow",
    ngram: candidate.ngram,
    occurrences: candidate.occurrences,
    sessions: candidate.sessions.length,
    outcome,
  };
}

/**
 * Serialize a draft to the instinct YAML format (key: value lines, `---`, body)
 * so it round-trips through the same parser that reads live instincts. Stored
 * under drafts/ so it is not picked up as a live instinct until promoted.
 */
export function serializeDraft(draft: DraftInstinct): string {
  return [
    `id: ${draft.id}`,
    `trigger: "${draft.trigger}"`,
    `confidence: ${draft.confidence}`,
    `domain: ${draft.domain}`,
    "source: distilled",
    "status: draft",
    `evidence_ngram: "${draft.ngram.join(">")}"`,
    `evidence_occurrences: ${draft.occurrences}`,
    `evidence_sessions: ${draft.sessions}`,
    `evidence_outcome: "${draft.outcome}"`,
    "---",
    draft.body,
    "",
  ].join("\n");
}

/** Render candidates as a markdown block for the MCP tool output. */
export function formatCandidates(candidates: Candidate[], limit = 10): string {
  if (candidates.length === 0) {
    return "No distillation candidates found. A candidate needs a tool sequence that recurred across multiple successful sessions. Keep working — patterns accrue as the observation log grows.";
  }

  const shown = candidates.slice(0, limit);
  const lines: string[] = [
    `## Distillation Candidates (${candidates.length})`,
    "",
    "Repeated tool sequences from successful sessions. Propose a draft with `ci_distill_propose id=<id>`, edit its body, then `ci_distill_promote id=<id>`.",
    "",
  ];
  for (const candidate of shown) {
    lines.push(
      `- **${candidate.id}**`,
      `  Sequence: ${candidate.ngram.join(" → ")}`,
      `  Seen ${candidate.occurrences}x across ${candidate.sessions.length} session(s) — outcome: ${candidate.outcomes.join(", ")}`,
    );
  }
  if (candidates.length > limit) {
    lines.push("", `_…and ${candidates.length - limit} more._`);
  }
  return lines.join("\n");
}

// ── Workflow-run → instinct bridge ───────────────────────────────────────────
// A native Workflow run (Opus 4.8 orchestration / ultracode) is recorded in the
// observation feed as a `tool: "Workflow"` row whose input_summary holds
// {"script":"..."} — truncated (~500 chars), but meta.name/description/phases sit
// at the head of the script and survive. The output_summary holds
// {"status","runId",...} with status "async_launched": the feed captures the
// LAUNCH, not the result. So a workflow's success is never read from the Workflow
// row itself — it is inferred from a following verify-exit-0 in the same feed.
//
// Unlike findCandidates (which needs a pattern recurring across >=2 sessions to
// reject coincidence), a Workflow script is an AUTHORED recipe: one verified run
// warrants a draft, so the session/occurrence thresholds do not apply here.

const WORKFLOW_TOOL = "Workflow";

export interface WorkflowRun {
  name: string;
  description: string;
  phases: string[];
  verifyCommand: string;
}

// Pull meta.name / meta.description / meta.phases[].title out of a (possibly
// truncated) workflow script embedded as JSON in the observation input_summary.
// Fail-closed: returns null unless a name is recoverable — a recipe with no
// identity is never fabricated.
function parseWorkflowScript(inputSummary: string): { name: string; description: string; phases: string[] } | null {
  if (!inputSummary) return null;
  let script = "";
  try {
    const parsed = JSON.parse(inputSummary) as { script?: unknown };
    if (typeof parsed.script === "string") script = parsed.script;
  } catch {
    // input_summary may itself be truncated mid-JSON; recover the script field loosely.
    const m = inputSummary.match(/"script"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (m) {
      try {
        script = JSON.parse(`"${m[1]}"`) as string;
      } catch {
        script = m[1]!.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
      }
    }
  }
  if (!script) return null;
  const name = (script.match(/name\s*:\s*['"]([^'"]+)['"]/) ?? [])[1] ?? "";
  if (!name) return null; // fail closed: no recipe identity
  const description = (script.match(/description\s*:\s*['"]([^'"]+)['"]/) ?? [])[1] ?? "";
  const phases: string[] = [];
  const phaseRe = /title\s*:\s*['"]([^'"]+)['"]/g;
  let pm: RegExpExecArray | null;
  while ((pm = phaseRe.exec(script)) !== null) phases.push(pm[1]!);
  return { name, description, phases };
}

// A single verify-exit-0 Bash row: a verify/test/build command whose output is not
// failing. Mirrors classifyTrajectorySuccess's verify branch for one observation.
function isVerifySuccessRow(observation: DistillObservation): boolean {
  if ((observation.tool ?? "") !== "Bash") return false;
  const input = (observation.input_summary ?? "").toString();
  const output = (observation.output_summary ?? "").toString();
  return VERIFY_CMD.test(input) && !FAILURE_MARKER.test(output) && (output === "" || SUCCESS_MARKER.test(output));
}

/**
 * Detect the most recent completed-and-verified Workflow run in an observation
 * list. Returns null (fail closed) unless: a `tool: "Workflow"` row carries a
 * parseable script with a name, AND a verify-exit-0 row follows it in the feed.
 * The trailing verify is the only success signal — the Workflow row records the
 * launch, never the result.
 */
export function workflowRunFromObservations(observations: DistillObservation[]): WorkflowRun | null {
  let wfIndex = -1;
  let meta: { name: string; description: string; phases: string[] } | null = null;
  for (let i = observations.length - 1; i >= 0; i -= 1) {
    if ((observations[i]!.tool ?? "") !== WORKFLOW_TOOL) continue;
    const parsed = parseWorkflowScript((observations[i]!.input_summary ?? "").toString());
    if (parsed) {
      wfIndex = i;
      meta = parsed;
      break;
    }
  }
  if (wfIndex === -1 || !meta) return null;

  let verifyCommand = "";
  for (let i = wfIndex + 1; i < observations.length; i += 1) {
    if (isVerifySuccessRow(observations[i]!)) {
      verifyCommand = (observations[i]!.input_summary ?? "").toString();
      break;
    }
  }
  if (!verifyCommand) return null; // fail closed: no evidence the run's output landed

  return { name: meta.name, description: meta.description, phases: meta.phases, verifyCommand };
}

/**
 * Turn a verified Workflow run into a DRAFT instinct. The script's phase outline is
 * a real skeleton (not a placeholder n-gram), but the human still edits the body
 * before promoting. Reuses serializeDraft and the drafts/ ladder; the
 * `draft-workflow-` id prefix marks the source and stays filesystem-safe.
 */
export function draftFromWorkflowRun(run: WorkflowRun): DraftInstinct {
  const slug = slugifyNgram([run.name]);
  const phaseLine = run.phases.length > 0 ? run.phases.join(" → ") : "(phases not captured)";
  const lines = [
    `When this situation recurs, the workflow "${run.name}" handled it end to end and its output passed verification.`,
    "",
  ];
  if (run.description) lines.push(`Intent: ${run.description}`);
  lines.push(`Phases: ${phaseLine}`);
  lines.push(`Verified by: ${run.verifyCommand}`);
  lines.push(
    "",
    "Replace this with the concrete steps, preconditions, and gotchas before promoting —",
    "the phase outline is the skeleton, not the full recipe.",
  );
  return {
    id: `draft-workflow-${slug}`,
    trigger: `Auto-detected from a verified workflow run: ${run.name}${run.description ? ` — ${run.description}` : ""}`,
    body: lines.join("\n"),
    confidence: DRAFT_CONFIDENCE,
    domain: "workflow",
    ngram: run.phases.length > 0 ? run.phases : [run.name],
    occurrences: 1,
    sessions: 1,
    outcome: "workflow-verified",
  };
}
