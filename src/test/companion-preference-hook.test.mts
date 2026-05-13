import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// __dirname resolves to <repo>/test/ at runtime (compiled .mjs lives under
// test/ per tsconfig outDir). Hook lives under <repo>/hooks/.
const HOOK_PATH = join(__dirname, "..", "hooks", "companion-preference.mjs");

interface HookResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface HookDecision {
  decision: "allow" | "block";
  reason?: string;
}

function buildIsolatedEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.HOME;
  delete env.USERPROFILE;
  env.HOME = home;
  env.USERPROFILE = home;
  return env;
}

function runHook(payload: unknown, home: string): HookResult {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input,
    env: buildIsolatedEnv(home),
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

function setSettings(home: string, settings: object): void {
  const dir = join(home, ".claude");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings));
}

function installCompanion(home: string, pluginName: string): void {
  mkdirSync(join(home, ".claude", "plugins", pluginName), { recursive: true });
}

function decision(r: HookResult): HookDecision {
  return JSON.parse(r.stdout) as HookDecision;
}

describe("companion-preference hook", () => {
  let home: string;

  before(() => {
    home = mkdtempSync(join(tmpdir(), "ci-comp-pref-"));
  });

  after(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("ignores non-Skill tool calls under any mode", () => {
    setSettings(home, {
      continuous_improvement: { companion_preference: "strict-companions" },
    });
    const r = runHook({ tool_name: "Bash", tool_input: { command: "ls" } }, home);
    assert.equal(decision(r).decision, "allow");
    assert.equal(r.stderr, "");
  });

  it("defaults to ci-first when settings.json is missing", () => {
    const isolated = mkdtempSync(join(tmpdir(), "ci-comp-pref-nosettings-"));
    try {
      const r = runHook(
        { tool_name: "Skill", tool_input: { skill: "tdd-workflow" } },
        isolated,
      );
      assert.equal(decision(r).decision, "allow");
      assert.equal(r.stderr, "");
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("ci-first mode is a no-op even on mapped skills", () => {
    setSettings(home, {
      continuous_improvement: { companion_preference: "ci-first" },
    });
    const r = runHook(
      { tool_name: "Skill", tool_input: { skill: "tdd-workflow" } },
      home,
    );
    assert.equal(decision(r).decision, "allow");
    assert.equal(r.stderr, "");
  });

  it("companions-first emits an advisory on a mapped CI skill", () => {
    setSettings(home, {
      continuous_improvement: { companion_preference: "companions-first" },
    });
    const r = runHook(
      { tool_name: "Skill", tool_input: { skill: "tdd-workflow" } },
      home,
    );
    assert.equal(decision(r).decision, "allow");
    assert.match(r.stderr, /companion_preference=companions-first/);
    assert.match(r.stderr, /superpowers:test-driven-development/);
  });

  it("companions-first is silent on a non-mapped skill", () => {
    setSettings(home, {
      continuous_improvement: { companion_preference: "companions-first" },
    });
    const r = runHook(
      { tool_name: "Skill", tool_input: { skill: "gateguard" } },
      home,
    );
    assert.equal(decision(r).decision, "allow");
    assert.equal(r.stderr, "");
  });

  it("strict-companions blocks a mapped CI skill when the companion is installed", () => {
    setSettings(home, {
      continuous_improvement: { companion_preference: "strict-companions" },
    });
    installCompanion(home, "superpowers");
    const r = runHook(
      { tool_name: "Skill", tool_input: { skill: "tdd-workflow" } },
      home,
    );
    const d = decision(r);
    assert.equal(d.decision, "block");
    assert.match(d.reason ?? "", /superpowers:test-driven-development/);
    assert.match(d.reason ?? "", /strict-companions/);
  });

  it("strict-companions blocks with install hint when the companion is not installed", () => {
    const isolated = mkdtempSync(join(tmpdir(), "ci-comp-pref-strict-noinstall-"));
    try {
      setSettings(isolated, {
        continuous_improvement: { companion_preference: "strict-companions" },
      });
      const r = runHook(
        { tool_name: "Skill", tool_input: { skill: "tdd-workflow" } },
        isolated,
      );
      const d = decision(r);
      assert.equal(d.decision, "block");
      assert.match(d.reason ?? "", /not installed/i);
      assert.match(d.reason ?? "", /plugin install/);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("fail-open on malformed JSON input", () => {
    setSettings(home, {
      continuous_improvement: { companion_preference: "strict-companions" },
    });
    const r = runHook("{not valid json", home);
    assert.equal(r.status, 0);
    assert.equal(decision(r).decision, "allow");
  });
});
