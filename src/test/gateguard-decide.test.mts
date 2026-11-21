/**
 * The gateguard decider (src/lib/gateguard-decide.mts), called in-process.
 *
 * hooks/gateguard.mjs is now: read stdin, normalize (lib/hook-io.mjs), decide
 * here, encode. The spawned-hook suites (gateguard-hook, agent-tool-aliases,
 * agent-claude-golden) pin the bytes end to end; these tests pin the decision
 * and the config parsing without a child process, so a later agent encoder can
 * rely on the decision alone. Session state goes to a temp dir through
 * GATEGUARD_SESSION_DIR, never the real home.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { decideGateguard, readGateguardConfig, type GateguardConfig } from "../lib/gateguard-decide.mjs";
import { normalizeEvent } from "../lib/hook-io.mjs";

const CLEAR_CLI = "/plugin/bin/gateguard-clear.mjs";
const config = (env: Record<string, string> = {}): GateguardConfig => readGateguardConfig(env, CLEAR_CLI);
const pre = (payload: unknown) => normalizeEvent("claude", "PreToolUse", payload);
// Built from parts so the host's own shell guard does not read this file's text
// as a destructive command.
const FORCE_PUSH = ["git", "push", "--for" + "ce", "origin", "main"].join(" ");

let sessionDir = "";
let projectDir = "";
let savedSessionEnv: string | undefined;

before(() => {
  savedSessionEnv = process.env.GATEGUARD_SESSION_DIR;
  sessionDir = mkdtempSync(join(tmpdir(), "gg-decide-session-"));
  projectDir = mkdtempSync(join(tmpdir(), "gg-decide-project-"));
  writeFileSync(join(projectDir, "app.ts"), "export const x = 1;\n");
  process.env.GATEGUARD_SESSION_DIR = sessionDir;
});

after(() => {
  if (savedSessionEnv === undefined) delete process.env.GATEGUARD_SESSION_DIR;
  else process.env.GATEGUARD_SESSION_DIR = savedSessionEnv;
  rmSync(sessionDir, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe("readGateguardConfig", () => {
  it("defaults to the evidence file gate, no exclusions, no target lock", () => {
    const c = config();
    assert.equal(c.fileGateMode, "evidence");
    assert.equal(c.fileGateUnknownNotice, null);
    assert.deepEqual(c.excludeFragments, []);
    assert.equal(c.targetLock, false);
    assert.equal(c.clearCliPath, CLEAR_CLI);
  });

  it("reads the modes case-insensitively and trimmed", () => {
    assert.equal(config({ CI_GATEGUARD_FILE_GATE: " STRICT " }).fileGateMode, "strict");
    assert.equal(config({ CI_GATEGUARD_FILE_GATE: "off" }).fileGateMode, "off");
    assert.equal(config({ CI_GATEGUARD_FILE_GATE: "" }).fileGateUnknownNotice, null);
  });

  it("reads an unknown mode as evidence and words a notice that names the value", () => {
    const c = config({ CI_GATEGUARD_FILE_GATE: "strct" });
    assert.equal(c.fileGateMode, "evidence");
    assert.equal(
      c.fileGateUnknownNotice,
      '[continuous-improvement] gateguard: CI_GATEGUARD_FILE_GATE="strct" is not a mode, using evidence. Accepted values: evidence, strict, off.',
    );
  });

  it("splits, trims, lowercases and slash-normalizes the exclude fragments", () => {
    assert.deepEqual(config({ CI_GATEGUARD_EXCLUDE: " Docs\\Wiki , ,tmp/" }).excludeFragments, ["docs/wiki", "tmp/"]);
  });

  it("turns the target lock on only for block", () => {
    assert.equal(config({ CI_GATEGUARD_TARGET_LOCK: "BLOCK" }).targetLock, true);
    assert.equal(config({ CI_GATEGUARD_TARGET_LOCK: "warn" }).targetLock, false);
  });
});

describe("decideGateguard, shell", () => {
  it("allows a read-only tool and a routine command with no notice", async () => {
    assert.deepEqual(await decideGateguard(pre({ tool_name: "Read", tool_input: { file_path: "a.ts" } }), config()), {
      kind: "allow",
      notices: [],
    });
    assert.deepEqual(await decideGateguard(pre({ tool_name: "Bash", tool_input: { command: "git status" } }), config()), {
      kind: "allow",
      notices: [],
    });
  });

  it("allows an unknown tool and an empty event (no tool name)", async () => {
    assert.equal((await decideGateguard(pre({ tool_name: "SomeNewTool" }), config())).kind, "allow");
    assert.equal((await decideGateguard(pre(null), config())).kind, "allow");
    assert.equal((await decideGateguard(pre([]), config())).kind, "allow");
  });

  it("denies a destructive Bash command and prints the matched rule", async () => {
    const decision = await decideGateguard(pre({ tool_name: "Bash", tool_input: { command: FORCE_PUSH } }), config());
    assert.equal(decision.kind, "deny");
    assert.ok(decision.kind === "deny" && decision.reason.startsWith(`Destructive command requested: ${FORCE_PUSH}\n`));
    assert.match(decision.kind === "deny" ? decision.reason : "", /\nMatched rule: \S+\n/);
  });

  it("denies the same command through another agent's shell alias", async () => {
    const decision = await decideGateguard(
      pre({ tool_name: "run_terminal_command", tool_input: { command: FORCE_PUSH } }),
      config(),
    );
    assert.equal(decision.kind, "deny");
  });

  it("denies an unquoted @{u} ref with the quoted fix, before the destructive check", async () => {
    const decision = await decideGateguard(pre({ tool_name: "Bash", tool_input: { command: "git log @{u}..HEAD" } }), config());
    assert.equal(decision.kind, "deny");
    assert.match(decision.kind === "deny" ? decision.reason : "", /\n {2}git log '@\{u\}\.\.HEAD'\n/);
  });
});

describe("decideGateguard, file gate", () => {
  it("off mode allows a blind edit of an existing file with no notice", async () => {
    const edit = pre({ tool_name: "Edit", tool_input: { file_path: join(projectDir, "app.ts") }, cwd: projectDir });
    assert.deepEqual(await decideGateguard(edit, config({ CI_GATEGUARD_FILE_GATE: "off" })), { kind: "allow", notices: [] });
  });

  it("an excluded path is allowed with one notice naming the fragment", async () => {
    const decision = await decideGateguard(
      pre({ tool_name: "Write", tool_input: { file_path: "docs/wiki/page.md" } }),
      config({ CI_GATEGUARD_EXCLUDE: "docs/wiki", CI_GATEGUARD_FILE_GATE: "strict" }),
    );
    assert.deepEqual(decision, {
      kind: "allow",
      notices: ['[continuous-improvement] gateguard: skipped by CI_GATEGUARD_EXCLUDE (fragment "docs/wiki" matched docs/wiki/page.md).'],
    });
  });

  it("strict mode denies the first edit with the fact list and the clear command", async () => {
    const decision = await decideGateguard(
      pre({ tool_name: "Edit", tool_input: { file_path: "src/app.ts" } }),
      config({ CI_GATEGUARD_FILE_GATE: "strict" }),
    );
    assert.equal(decision.kind, "deny");
    const reason = decision.kind === "deny" ? decision.reason : "";
    assert.ok(reason.startsWith("Before editing src/app.ts, present these facts:\n"));
    assert.ok(reason.includes(`node "${CLEAR_CLI}" --state "${join(sessionDir, "gateguard-session.json").replace(/\\/g, "/")}" "src/app.ts"`));
  });

  it("an unknown mode is evidence, and its notice rides along with the decision", async () => {
    const decision = await decideGateguard(
      pre({ tool_name: "Write", tool_input: { file_path: join(projectDir, "new-file.ts") }, cwd: projectDir }),
      config({ CI_GATEGUARD_FILE_GATE: "nope" }),
    );
    assert.equal(decision.kind, "allow");
    assert.equal(decision.notices?.length, 1);
    assert.match(decision.notices?.[0] ?? "", /CI_GATEGUARD_FILE_GATE="nope" is not a mode/);
  });

  // The session root is CLAUDE_PROJECT_DIR when the runner sets it, else the
  // repository this suite runs in (the payload cwd is not in a repository):
  // a fresh temp dir is outside both.
  it("the target lock denies an absolute target outside the session root", async () => {
    const outside = mkdtempSync(join(tmpdir(), "gg-decide-outside-"));
    try {
      const decision = await decideGateguard(
        pre({ tool_name: "Write", tool_input: { file_path: join(outside, "x.ts") }, cwd: projectDir }),
        config({ CI_GATEGUARD_TARGET_LOCK: "block" }),
      );
      assert.equal(decision.kind, "deny");
      assert.match(decision.kind === "deny" ? decision.reason : "", /^Target is outside the session project root/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("strict mode with _gateguard_facts_presented records the clearance and allows", async () => {
    const decision = await decideGateguard(
      pre({ tool_name: "Edit", tool_input: { file_path: "src/cleared.ts", _gateguard_facts_presented: true } }),
      config({ CI_GATEGUARD_FILE_GATE: "strict" }),
    );
    assert.deepEqual(decision, { kind: "allow", notices: [] });
    const state = JSON.parse(readFileSync(join(sessionDir, "gateguard-session.json"), "utf8")) as {
      cleared_files: Record<string, unknown>;
    };
    assert.ok(Object.keys(state.cleared_files).some((key) => key.endsWith("src/cleared.ts")));
  });

  it("an apply_patch with no file header is denied under strict and warned under evidence", async () => {
    const patch = pre({ tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** End Patch" } });
    assert.equal((await decideGateguard(patch, config({ CI_GATEGUARD_FILE_GATE: "strict" }))).kind, "deny");
    const warned = await decideGateguard(patch, config());
    assert.equal(warned.kind, "allow");
    assert.match(warned.notices?.[0] ?? "", /^\[continuous-improvement\] gateguard: apply_patch names no file the gate can read/);
  });
});
