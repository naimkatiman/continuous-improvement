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
    const gapTooBig = !Number.isNaN(prevMs) && !Number.isNaN(curMs) && curMs - prevMs > GAP_MS;

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
      id: `draft-${aggregate.ngram.join("-").toLowerCase()}`,
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
