#!/usr/bin/env node
/**
 * Phase 9 Synthetic-Checks Runner
 *
 * Executes every *.synthetic.{sh,mjs,ts,py} file in --dir (default
 * synthetic-checks/) in lexical order. Injects the documented env vars
 * (BASE_URL, BASELINE_URL, EXPECTED_SHA, DEPLOY_BRANCH, RECEIPT_TIMESTAMP),
 * captures stdout + stderr + exit per check, aggregates.
 *
 * Pure aggregator: required-env enforcement lives in the synthetic checks
 * themselves (a check exits 2 when its own input contract is unmet, per
 * synthetic-checks/README.md). The runner forwards env, propagates exit
 * categories, and prints the operator-facing report.
 *
 * Contract: synthetic-checks/README.md
 * Skill: skills/verification-loop.md (Phase 9 — production-vs-baseline diff)
 *
 * Exit codes:
 *   0 — every recognized check exited 0, OR directory empty/absent
 *   1 — at least one check exited non-zero (drift) or hit the wall-clock cap
 *   2 — at least one check exited 2 (config error) AND zero drift
 *   3 — runner-level usage error (bad flag, --timeout not a positive int)
 *
 * Flags:
 *   --dir <path>       synthetic-checks/  Directory to walk
 *   --timeout <sec>    60                 Per-check wall-clock cap
 *   --fail-fast        off                Halt on first drift or timeout
 *                                         (config_error does not halt — gate
 *                                         did not run is not the same as drift)
 *   --json             off                Emit machine-readable summary
 *   --show-command     off                Print interpreter map, do not execute
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { argv, env, exit, stderr, stdout } from "node:process";
import { parseArgs } from "node:util";

const INTERPRETER_MAP = {
  ".sh": "bash",
  ".mjs": "node",
  ".ts": "tsx",
  ".py": "python",
};

const FORWARDED_ENV = [
  "BASE_URL",
  "BASELINE_URL",
  "EXPECTED_SHA",
  "DEPLOY_BRANCH",
  "RECEIPT_TIMESTAMP",
];

const SYNTHETIC_FILE_RE = /\.synthetic\.[A-Za-z0-9]+$/;

function parseFlags() {
  try {
    const { values } = parseArgs({
      args: argv.slice(2),
      options: {
        dir: { type: "string", default: "synthetic-checks/" },
        timeout: { type: "string", default: "60" },
        "fail-fast": { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        "show-command": { type: "boolean", default: false },
      },
      strict: true,
    });
    return values;
  } catch (err) {
    stderr.write(`usage error: ${err.message}\n`);
    stderr.write("Run with no arguments to see defaults; --dir/--timeout/--fail-fast/--json/--show-command are the supported flags.\n");
    exit(3);
  }
}

function showCommand(dir) {
  stdout.write(`Phase 9 runner — interpreter map (dry run for ${dir}):\n`);
  for (const [ext, bin] of Object.entries(INTERPRETER_MAP)) {
    stdout.write(`  ${ext} -> ${bin}\n`);
  }
  stdout.write("\nForwarded env vars (runner -> child):\n");
  for (const name of FORWARDED_ENV) {
    const present = env[name] !== undefined ? "set" : "unset";
    stdout.write(`  ${name} (${present})\n`);
  }
  stdout.write("\nNo checks were executed. Re-run without --show-command to invoke.\n");
}

function listChecks(dir) {
  if (!existsSync(dir)) return null;
  try {
    if (!statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  return readdirSync(dir)
    .filter((name) => SYNTHETIC_FILE_RE.test(name))
    .sort();
}

function runOne(filePath, timeoutMs) {
  const ext = extname(filePath);
  const interpreter = INTERPRETER_MAP[ext];
  if (!interpreter) {
    return {
      status: "skipped — unknown extension",
      exitCode: null,
      stdout: "",
      stderr: `unknown extension: ${ext}`,
      durationMs: 0,
    };
  }
  const childEnv = { PATH: env.PATH ?? "" };
  for (const name of FORWARDED_ENV) {
    childEnv[name] = env[name] ?? "";
  }
  const start = Date.now();
  const result = spawnSync(interpreter, [filePath], {
    env: childEnv,
    encoding: "utf8",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  const durationMs = Date.now() - start;

  if (result.error && result.error.code === "ENOENT") {
    return {
      status: "skipped — interpreter not on PATH",
      exitCode: null,
      stdout: "",
      stderr: `interpreter '${interpreter}' not on PATH`,
      durationMs,
    };
  }

  // Cross-platform timeout detection: POSIX returns a signal name; Windows
  // sets result.error.code to "ETIMEDOUT" with result.signal sometimes null.
  const timedOut =
    result.signal === "SIGKILL" ||
    result.signal === "SIGTERM" ||
    result.error?.code === "ETIMEDOUT";
  if (timedOut) {
    return {
      status: "timeout",
      exitCode: 124,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      durationMs,
    };
  }

  const exitCode = result.status ?? -1;
  let status;
  if (exitCode === 0) status = "pass";
  else if (exitCode === 2) status = "config_error";
  else status = "fail";

  return {
    status,
    exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs,
  };
}

function main() {
  const args = parseFlags();
  const dir = args.dir;

  if (args["show-command"]) {
    showCommand(dir);
    exit(0);
  }

  const timeoutSec = Number.parseInt(args.timeout, 10);
  if (Number.isNaN(timeoutSec) || timeoutSec <= 0) {
    stderr.write(`usage error: --timeout must be a positive integer (got "${args.timeout}")\n`);
    exit(3);
  }
  const timeoutMs = timeoutSec * 1000;

  const files = listChecks(dir);

  if (files === null) {
    const note = `skipped — directory not found: ${dir}`;
    if (args.json) {
      stdout.write(JSON.stringify({
        dir,
        checks: [],
        summary: { pass: 0, fail: 0, configError: 0, skipped: 0, total: 0 },
        note,
      }, null, 2) + "\n");
    } else {
      stdout.write(`Phase 9 runner: ${note}\n`);
    }
    exit(0);
  }

  if (files.length === 0) {
    const note = `skipped — 0 check(s) in ${dir}`;
    if (args.json) {
      stdout.write(JSON.stringify({
        dir,
        checks: [],
        summary: { pass: 0, fail: 0, configError: 0, skipped: 0, total: 0 },
        note,
      }, null, 2) + "\n");
    } else {
      stdout.write(`Phase 9 runner: ${note}\n`);
    }
    exit(0);
  }

  const results = [];
  let halt = false;
  for (const name of files) {
    const ext = extname(name);
    if (!INTERPRETER_MAP[ext]) {
      results.push({
        file: name,
        status: "skipped — unknown extension",
        exitCode: null,
        stdout: "",
        stderr: `unknown extension: ${ext}`,
        durationMs: 0,
      });
      continue;
    }

    if (halt) {
      results.push({
        file: name,
        status: "skipped — fail_fast",
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: 0,
      });
      continue;
    }

    const r = runOne(join(dir, name), timeoutMs);
    results.push({ file: name, ...r });

    if (args["fail-fast"] && (r.status === "fail" || r.status === "timeout")) {
      halt = true;
    }
  }

  let pass = 0, fail = 0, configError = 0, skipped = 0;
  for (const r of results) {
    if (r.status === "pass") pass += 1;
    else if (r.status === "fail" || r.status === "timeout") fail += 1;
    else if (r.status === "config_error") configError += 1;
    else if (typeof r.status === "string" && r.status.startsWith("skipped")) skipped += 1;
  }
  const summary = { pass, fail, configError, skipped, total: results.length };

  let exitCode;
  if (fail > 0) exitCode = 1;
  else if (configError > 0) exitCode = 2;
  else exitCode = 0;

  if (args.json) {
    stdout.write(JSON.stringify({ dir, checks: results, summary }, null, 2) + "\n");
  } else {
    stdout.write(`Phase 9 runner: ${results.length} check(s) in ${dir}\n`);
    for (const r of results) {
      const label = r.status === "pass"
        ? "PASS"
        : r.status === "fail"
          ? "FAIL"
          : r.status === "config_error"
            ? "CONFIG"
            : r.status === "timeout"
              ? "TIMEOUT"
              : (typeof r.status === "string" && r.status.startsWith("skipped"))
                ? "SKIP"
                : "UNKNOWN";
      stdout.write(`  ${label.padEnd(8)} ${r.file}\n`);
      if (r.status === "fail" || r.status === "timeout" || r.status === "config_error") {
        if (r.stdout) stdout.write(r.stdout.split("\n").map((l) => "    " + l).join("\n") + "\n");
        if (r.stderr) stderr.write(r.stderr.split("\n").map((l) => "    " + l).join("\n") + "\n");
      }
      if (typeof r.status === "string" && r.status.startsWith("skipped")) {
        stderr.write(`    ${r.status}${r.stderr ? `: ${r.stderr}` : ""}\n`);
      }
    }
    stdout.write(`\nSummary: ${pass} pass, ${fail} fail, ${configError} config-error, ${skipped} skipped (${results.length} total)\n`);
  }

  exit(exitCode);
}

main();
