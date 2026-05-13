import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// __dirname resolves to <repo>/test/ at runtime; CLI lives under <repo>/bin/.
const CLI_PATH = join(__dirname, "..", "bin", "companion-preference-status.mjs");

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): CliResult {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

interface TelemetryLine {
  ts: string;
  hook: "companion-preference";
  mode: "ci-first" | "companions-first" | "strict-companions";
  action: "observation" | "advisory" | "block" | "block-not-installed";
  ci_skill: string;
  companion: string;
  plugin: string;
  companion_installed: boolean;
}

function makeLine(overrides: Partial<TelemetryLine> = {}): TelemetryLine {
  return {
    ts: new Date().toISOString(),
    hook: "companion-preference",
    mode: "ci-first",
    action: "observation",
    ci_skill: "tdd-workflow",
    companion: "superpowers:test-driven-development",
    plugin: "superpowers",
    companion_installed: false,
    ...overrides,
  };
}

function writeFixture(dir: string, lines: TelemetryLine[]): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "companion-preference.jsonl");
  writeFileSync(
    path,
    lines.map((l) => JSON.stringify(l)).join("\n") + (lines.length > 0 ? "\n" : ""),
  );
  return path;
}

interface JsonReport {
  file: string;
  window_days: number | null;
  since: string | null;
  total_events: number;
  parse_errors?: number;
  by_skill: Record<
    string,
    {
      total: number;
      actions: Record<string, number>;
      installed_pct: number | null;
    }
  >;
  by_mode: Record<string, number>;
}

describe("/companion-preference status CLI", () => {
  let workdir: string;

  before(() => {
    workdir = mkdtempSync(join(tmpdir(), "ci-comp-pref-cli-"));
  });

  after(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("emits a friendly message when the JSONL file is missing (exit 0)", () => {
    const missingPath = join(workdir, "missing-dir", "companion-preference.jsonl");
    const r = runCli(["--path", missingPath]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no telemetry recorded yet/i);
  });

  it("handles an empty JSONL file with zero counts (exit 0)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-comp-pref-cli-empty-"));
    try {
      const path = writeFixture(dir, []);
      const r = runCli(["--path", path, "--json"]);
      assert.equal(r.status, 0);
      const report = JSON.parse(r.stdout) as JsonReport;
      assert.equal(report.total_events, 0);
      assert.deepEqual(report.by_skill, {});
      assert.deepEqual(report.by_mode, {});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("aggregates a single observation row correctly", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-comp-pref-cli-single-"));
    try {
      const path = writeFixture(dir, [
        makeLine({ action: "observation", mode: "ci-first" }),
      ]);
      const r = runCli(["--path", path, "--json", "--all"]);
      assert.equal(r.status, 0);
      const report = JSON.parse(r.stdout) as JsonReport;
      assert.equal(report.total_events, 1);
      assert.equal(report.by_skill["tdd-workflow"]?.total, 1);
      assert.equal(report.by_skill["tdd-workflow"]?.actions.observation, 1);
      assert.equal(report.by_mode["ci-first"], 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("excludes rows older than the window by default; --all includes them", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-comp-pref-cli-window-"));
    try {
      const oldTs = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const newTs = new Date().toISOString();
      const path = writeFixture(dir, [
        makeLine({ ts: oldTs, action: "observation" }),
        makeLine({ ts: newTs, action: "observation" }),
      ]);

      const windowed = runCli(["--path", path, "--json"]);
      assert.equal(
        (JSON.parse(windowed.stdout) as JsonReport).total_events,
        1,
        "default 7-day window excludes the 30-day-old row",
      );

      const all = runCli(["--path", path, "--json", "--all"]);
      assert.equal(
        (JSON.parse(all.stdout) as JsonReport).total_events,
        2,
        "--all includes the 30-day-old row",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--json output is valid JSON with the documented shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-comp-pref-cli-shape-"));
    try {
      const path = writeFixture(dir, [
        makeLine({ action: "advisory", mode: "companions-first", companion_installed: true }),
        makeLine({ action: "block", mode: "strict-companions", companion_installed: true }),
        makeLine({ action: "block-not-installed", mode: "strict-companions", companion_installed: false }),
      ]);
      const r = runCli(["--path", path, "--json", "--all"]);
      assert.equal(r.status, 0);
      const report = JSON.parse(r.stdout) as JsonReport;
      assert.equal(typeof report.file, "string");
      assert.equal(report.total_events, 3);
      assert.ok(typeof report.parse_errors === "number");
      const skill = report.by_skill["tdd-workflow"]!;
      assert.equal(skill.total, 3);
      assert.equal(skill.actions.advisory, 1);
      assert.equal(skill.actions.block, 1);
      assert.equal(skill.actions["block-not-installed"], 1);
      assert.equal(report.by_mode["companions-first"], 1);
      assert.equal(report.by_mode["strict-companions"], 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("silently skips malformed lines and counts them in parse_errors", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-comp-pref-cli-bad-"));
    try {
      const path = join(dir, "companion-preference.jsonl");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path,
        [
          JSON.stringify(makeLine({ action: "observation" })),
          "{not valid json",
          "",
          JSON.stringify(makeLine({ action: "advisory", mode: "companions-first" })),
          "another broken line {",
        ].join("\n") + "\n",
      );
      const r = runCli(["--path", path, "--json", "--all"]);
      assert.equal(r.status, 0);
      const report = JSON.parse(r.stdout) as JsonReport;
      assert.equal(report.total_events, 2, "two well-formed rows counted");
      assert.equal(report.parse_errors, 2, "two malformed rows skipped");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("installed_pct is null when total is 0, otherwise rounded 0-100", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-comp-pref-cli-pct-"));
    try {
      // Two rows for tdd-workflow: one installed, one not -> 50%
      // One row for verification-loop: installed -> 100%
      const path = writeFixture(dir, [
        makeLine({ ci_skill: "tdd-workflow", companion_installed: true }),
        makeLine({ ci_skill: "tdd-workflow", companion_installed: false }),
        makeLine({
          ci_skill: "verification-loop",
          companion: "superpowers:verification-before-completion",
          companion_installed: true,
        }),
      ]);
      const r = runCli(["--path", path, "--json", "--all"]);
      const report = JSON.parse(r.stdout) as JsonReport;
      assert.equal(report.by_skill["tdd-workflow"]?.installed_pct, 50);
      assert.equal(report.by_skill["verification-loop"]?.installed_pct, 100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("human output renders a table header naming the documented columns", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-comp-pref-cli-human-"));
    try {
      const path = writeFixture(dir, [makeLine({ action: "observation" })]);
      const r = runCli(["--path", path, "--all"]);
      assert.equal(r.status, 0);
      // Header line must mention the canonical column names so a reader can
      // map the columns to the JSON shape without docs.
      assert.match(r.stdout, /ci_skill/);
      assert.match(r.stdout, /total/);
      assert.match(r.stdout, /observation/);
      assert.match(r.stdout, /installed%/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
