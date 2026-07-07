/**
 * Integration tests for the typecheck Stop hook (RISA 4 / G4).
 *
 * Spawns the built hooks/typecheck-stop.mjs against throwaway temp git repos.
 * The project's `typecheck` npm script is mocked with a tiny `node tc.js` that
 * exits 0 or 1 — so the full hook path (git detection, changed-file filter,
 * command selection, run, decision) is exercised without a real TypeScript
 * install.
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const HOOK_PATH = join(__dirname, "..", "hooks", "typecheck-stop.mjs");

interface HookResult {
  decision: "allow" | "block";
  reason?: string;
  stderr: string;
}

interface RepoOptions {
  tsconfig?: boolean; // default true
  pkg?: Record<string, unknown>;
  tcJs?: string;
  files?: Record<string, string>;
}

const dirs: string[] = [];

function setupRepo(opts: RepoOptions): string {
  const dir = mkdtempSync(join(tmpdir(), "tc-stop-"));
  dirs.push(dir);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  if (opts.tsconfig !== false) writeFileSync(join(dir, "tsconfig.json"), "{}\n");
  if (opts.pkg) writeFileSync(join(dir, "package.json"), `${JSON.stringify(opts.pkg, null, 2)}\n`);
  if (opts.tcJs !== undefined) writeFileSync(join(dir, "tc.js"), opts.tcJs);
  for (const [name, content] of Object.entries(opts.files ?? {})) writeFileSync(join(dir, name), content);
  execFileSync("git", ["add", "-A"], { cwd: dir }); // stage so `git diff --cached` sees the changes
  return dir;
}

function runHook(dir: string, mode: string | undefined): HookResult {
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_PROJECT_DIR: dir };
  if (mode === undefined) delete env.CLAUDE_TYPECHECK_GATE;
  else env.CLAUDE_TYPECHECK_GATE = mode;
  const result = spawnSync(process.execPath, [HOOK_PATH], { input: "{}", encoding: "utf8", env });
  assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
  const stdout = result.stdout.trim();
  if (stdout === "") return { decision: "allow", stderr: result.stderr };
  const parsed = JSON.parse(stdout) as { decision?: string; reason?: string };
  return { decision: parsed.decision === "block" ? "block" : "allow", reason: parsed.reason, stderr: result.stderr };
}

const FAILING_TC = 'console.error("mock type error line 1");\nprocess.exit(1);\n';
const PASSING_TC = "process.exit(0);\n";
const PKG = { name: "tmp", version: "0.0.0", scripts: { typecheck: "node tc.js" } };

describe("hooks/typecheck-stop.mjs (RISA 4 / G4)", () => {
  before(() => {
    /* dirs created per test */
  });

  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it("block mode + failing typecheck on a changed .ts file → block with the tsc output", () => {
    const dir = setupRepo({ pkg: PKG, tcJs: FAILING_TC, files: { "a.ts": "export const x: number = 1;\n" } });
    const res = runHook(dir, "block");
    assert.equal(res.decision, "block");
    assert.match(res.reason ?? "", /Typecheck FAILED/);
    assert.match(res.reason ?? "", /mock type error line 1/);
  });

  it("block mode + passing typecheck → allow", () => {
    const dir = setupRepo({ pkg: PKG, tcJs: PASSING_TC, files: { "a.ts": "export const x = 1;\n" } });
    assert.equal(runHook(dir, "block").decision, "allow");
  });

  it("off (default, unset) → allow even when typecheck would fail", () => {
    const dir = setupRepo({ pkg: PKG, tcJs: FAILING_TC, files: { "a.ts": "export const x = 1;\n" } });
    assert.equal(runHook(dir, undefined).decision, "allow");
  });

  it("no changed TS file → allow without running the typecheck", () => {
    const dir = setupRepo({ pkg: PKG, tcJs: FAILING_TC, files: { "README.md": "# hi\n" } });
    assert.equal(runHook(dir, "block").decision, "allow");
  });

  it("no tsconfig.json (not a TS project) → allow", () => {
    const dir = setupRepo({ tsconfig: false, pkg: PKG, tcJs: FAILING_TC, files: { "a.ts": "export const x = 1;\n" } });
    assert.equal(runHook(dir, "block").decision, "allow");
  });

  it("warn mode + failing typecheck → allow (empty stdout) but a stderr notice", () => {
    const dir = setupRepo({ pkg: PKG, tcJs: FAILING_TC, files: { "a.ts": "export const x = 1;\n" } });
    const res = runHook(dir, "warn");
    assert.equal(res.decision, "allow");
    assert.match(res.stderr, /typecheck/i);
    assert.match(res.stderr, /mock type error line 1/);
  });
});
