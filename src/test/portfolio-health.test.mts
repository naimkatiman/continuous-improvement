// portfolio-health.test.mts — TDD tests for the v0 portfolio repo scorer.
//
// Portfolio-spine train (docs/plans/2026-07-04-portfolio-spine.md). The scorer
// reads LOCAL static signals only (no network): CI presence, release receipts,
// experiment records, commit freshness (guarded git call), and high-severity
// auditWorkflows findings. Fixtures are fs.mkdtemp trees with synthetic
// content — no spawned shells, no assertions against real repo files.
//
// These tests run RED-first against an as-yet-unwritten src/bin/portfolio-health.mts.
// The .mjs import resolves only after `npm run build` — per the .mts-is-source
// rule, never edit the .mjs directly.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
  buildRows,
  collectSignals,
  loadConfig,
  renderReport,
  scoreRepo,
  WEIGHT_CI,
  WEIGHT_EXPERIMENTS,
  WEIGHT_FRESHNESS,
  WEIGHT_RECEIPTS,
  WEIGHT_SECURITY,
  type RepoEntry,
  type RepoSignals,
} from "../bin/portfolio-health.mjs";

const CLEAN_WORKFLOW = `name: CI
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: npm test
`;

const RISKY_WORKFLOW = `name: risky
on: workflow_dispatch
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: npm test
`;

const cleanupDirs: string[] = [];

function makeFixture(build: (root: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), "portfolio-health-test-"));
  cleanupDirs.push(root);
  build(root);
  return root;
}

after(() => {
  for (const dir of cleanupDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; Windows can hold locks briefly.
    }
  }
});

function fullSignals(): RepoSignals {
  return {
    hasCI: true,
    receiptCount: 3,
    experimentCount: 2,
    daysSinceLastCommit: 1,
    highFindings: 0,
  };
}

describe("scoreRepo", () => {
  it("weights sum to 100 and a fully healthy repo scores 100", () => {
    assert.equal(WEIGHT_CI + WEIGHT_RECEIPTS + WEIGHT_EXPERIMENTS + WEIGHT_FRESHNESS + WEIGHT_SECURITY, 100);
    assert.equal(scoreRepo(fullSignals()).score, 100);
  });

  it("scores an empty repo (no CI, no proof, unknown freshness) at 0", () => {
    const empty: RepoSignals = {
      hasCI: false,
      receiptCount: 0,
      experimentCount: 0,
      daysSinceLastCommit: null,
      highFindings: 0,
    };
    const { score, topRisk } = scoreRepo(empty);
    assert.equal(score, 0);
    assert.match(topRisk, /CI/i);
  });

  it("stays within 0-100 even under extreme inputs", () => {
    const extreme: RepoSignals = {
      hasCI: true,
      receiptCount: 999,
      experimentCount: 999,
      daysSinceLastCommit: 0,
      highFindings: 999,
    };
    const { score } = scoreRepo(extreme);
    assert.ok(score >= 0 && score <= 100, `score ${score} out of bounds`);
  });

  it("deducts security weight per high finding, floored at zero", () => {
    const base = fullSignals();
    const one = scoreRepo({ ...base, highFindings: 1 }).score;
    const many = scoreRepo({ ...base, highFindings: 50 }).score;
    assert.equal(one, 100 - 5);
    assert.equal(many, 100 - WEIGHT_SECURITY);
  });

  it("halves freshness credit between 8 and 30 days, drops it after", () => {
    const base = fullSignals();
    const fresh = scoreRepo({ ...base, daysSinceLastCommit: 7 }).score;
    const mid = scoreRepo({ ...base, daysSinceLastCommit: 30 }).score;
    const stale = scoreRepo({ ...base, daysSinceLastCommit: 90 }).score;
    assert.equal(fresh, 100);
    assert.equal(mid, 100 - WEIGHT_FRESHNESS / 2);
    assert.equal(stale, 100 - WEIGHT_FRESHNESS);
  });
});

describe("collectSignals", () => {
  it("reads CI, receipts (template excluded), experiments, and clean workflows from a fixture tree", () => {
    const root = makeFixture((r) => {
      mkdirSync(join(r, ".github", "workflows"), { recursive: true });
      writeFileSync(join(r, ".github", "workflows", "ci.yml"), CLEAN_WORKFLOW);
      mkdirSync(join(r, ".releases"));
      writeFileSync(join(r, ".releases", "RELEASE_RECEIPT_TEMPLATE.md"), "# template");
      writeFileSync(join(r, ".releases", "2026-07-01-v1.md"), "# receipt 1");
      writeFileSync(join(r, ".releases", "2026-07-02-v2.md"), "# receipt 2");
      mkdirSync(join(r, ".experiments"));
      writeFileSync(join(r, ".experiments", "EXPERIMENT_TEMPLATE.md"), "# template");
      writeFileSync(join(r, ".experiments", "2026-07-01-exp.md"), "# exp 1");
    });
    const s = collectSignals(root);
    assert.equal(s.hasCI, true);
    assert.equal(s.receiptCount, 2);
    assert.equal(s.experimentCount, 1);
    assert.equal(s.highFindings, 0);
    // Fixture is not a git repository → the git guard must yield null, not throw.
    assert.equal(s.daysSinceLastCommit, null);
  });

  it("returns empty signals for a bare directory", () => {
    const root = makeFixture(() => {});
    const s = collectSignals(root);
    assert.deepEqual(s, {
      hasCI: false,
      receiptCount: 0,
      experimentCount: 0,
      daysSinceLastCommit: null,
      highFindings: 0,
    });
  });

  it("counts docs/releases and docs/experiments alongside the dot-dirs", () => {
    const root = makeFixture((r) => {
      mkdirSync(join(r, "docs", "releases"), { recursive: true });
      writeFileSync(join(r, "docs", "releases", "2026-06-01-v0.md"), "# receipt");
      mkdirSync(join(r, "docs", "experiments"), { recursive: true });
      writeFileSync(join(r, "docs", "experiments", "2026-06-01-exp.md"), "# exp");
    });
    const s = collectSignals(root);
    assert.equal(s.receiptCount, 1);
    assert.equal(s.experimentCount, 1);
  });

  it("feeds workflow findings through auditWorkflows (high finding counted)", () => {
    const root = makeFixture((r) => {
      mkdirSync(join(r, ".github", "workflows"), { recursive: true });
      writeFileSync(join(r, ".github", "workflows", "risky.yml"), RISKY_WORKFLOW);
    });
    const s = collectSignals(root);
    assert.equal(s.hasCI, true);
    // RISKY_WORKFLOW has no permissions anywhere → one high finding.
    assert.equal(s.highFindings, 1);
  });
});

describe("buildRows", () => {
  it("marks repos without a local checkout as n/a instead of crashing", () => {
    const missing: RepoEntry = {
      repo: "naimkatiman/ghost",
      lane: "infra",
      localPath: join(tmpdir(), "portfolio-health-test-does-not-exist"),
      active: true,
    };
    const rows = buildRows([missing]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scoreLabel, "n/a (no local checkout)");
  });

  it("orders scored rows worst-first and places n/a rows last", () => {
    const scoredRoot = makeFixture((r) => {
      mkdirSync(join(r, ".github", "workflows"), { recursive: true });
      writeFileSync(join(r, ".github", "workflows", "ci.yml"), CLEAN_WORKFLOW);
    });
    const entries: RepoEntry[] = [
      {
        repo: "naimkatiman/ghost",
        lane: "infra",
        localPath: join(tmpdir(), "portfolio-health-test-does-not-exist"),
        active: true,
      },
      { repo: "naimkatiman/scored", lane: "infra", localPath: scoredRoot, active: true },
    ];
    const rows = buildRows(entries);
    assert.equal(rows[0].repo, "naimkatiman/scored");
    assert.equal(rows[1].repo, "naimkatiman/ghost");
  });
});

describe("loadConfig", () => {
  it("parses a valid registry and preserves entries", () => {
    const root = makeFixture((r) => {
      writeFileSync(
        join(r, "repos.json"),
        JSON.stringify([
          { repo: "naimkatiman/a", lane: "infra", localPath: "c:/Ai/a", active: true },
        ]),
      );
    });
    const entries = loadConfig(join(root, "repos.json"));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].repo, "naimkatiman/a");
  });

  it("throws a clear error on a malformed registry (not an array)", () => {
    const root = makeFixture((r) => {
      writeFileSync(join(r, "repos.json"), JSON.stringify({ nope: true }));
    });
    assert.throws(() => loadConfig(join(root, "repos.json")), /array/i);
  });

  it("throws a clear error when an entry is missing required fields", () => {
    const root = makeFixture((r) => {
      writeFileSync(join(r, "repos.json"), JSON.stringify([{ repo: "x" }]));
    });
    assert.throws(() => loadConfig(join(root, "repos.json")), /lane|localPath/);
  });
});

describe("renderReport", () => {
  it("renders the table header, generated-at line, and scoring appendix", () => {
    const rows = buildRows([
      {
        repo: "naimkatiman/ghost",
        lane: "infra",
        localPath: join(tmpdir(), "portfolio-health-test-does-not-exist"),
        active: true,
      },
    ]);
    const report = renderReport(rows, "2026-07-04T00:00:00Z");
    assert.match(report, /\| Repo \| Score \| Top Risk \| Next Action \|/);
    assert.match(report, /2026-07-04T00:00:00Z/);
    assert.match(report, /How scores are computed/i);
    assert.match(report, /n\/a \(no local checkout\)/);
  });

  it("is deterministic for a fixed generated-at timestamp", () => {
    const rows = buildRows([
      {
        repo: "naimkatiman/ghost",
        lane: "infra",
        localPath: join(tmpdir(), "portfolio-health-test-does-not-exist"),
        active: true,
      },
    ]);
    const a = renderReport(rows, "2026-07-04T00:00:00Z");
    const b = renderReport(rows, "2026-07-04T00:00:00Z");
    assert.equal(a, b);
  });
});
