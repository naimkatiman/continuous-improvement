/**
 * The plugin description is what a user reads before installing: the
 * marketplace card (plugin.json and both marketplace manifests), npm
 * (package.json) and llms.txt. It may state only what the shipped runtime does,
 * and every copy has to say the same thing.
 *
 * What the runtime does with a recorded lesson ("instinct"): hooks/session.mjs
 * prints the ones at 0.5 confidence or higher into the model's context on
 * SessionStart. No code applies one, and none is recorded unless the reflect
 * command or an MCP tool writes it. The core skill and its command are held to
 * the same rule.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { getClaudePluginManifest, getPluginHooksConfig } from "../lib/plugin-metadata.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DESCRIPTION = getClaudePluginManifest().description;
const MAX_DESCRIPTION_CHARS = 400;

function readRepoFile(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Each thing the description says the plugin does, and the hook registration
// in the plugin's hooks.json that does it.
const MECHANISMS: ReadonlyArray<{ says: RegExp; event: string; hook: string }> = [
  { says: /destructive/i, event: "PreToolUse", hook: "/hooks/gateguard.mjs" },
  { says: /protected branch/i, event: "PreToolUse", hook: "/hooks/hook-pack.mjs" },
  { says: /guardrails/i, event: "PreToolUse", hook: "/hooks/config-guard.mjs" },
  { says: /typecheck/i, event: "Stop", hook: "/hooks/typecheck-stop.mjs" },
  { says: /searchable log/i, event: "PostToolUse", hook: "/bin/observe.mjs" },
  { says: /session start/i, event: "SessionStart", hook: "/hooks/session.mjs" },
];

// The three promises the old description made with no code behind them.
const UNKEPT_PROMISES: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /appl(y|ies|ied) (it )?automatically/i, why: "nothing applies a lesson; the model reads it" },
  { pattern: /re-?teach|re-?taught/i, why: "a lesson is recorded only by the reflect command or a tool" },
  { pattern: /sharper instincts/i, why: "the transcript linter writes no instinct" },
];

describe("plugin description", () => {
  it(`is at most ${MAX_DESCRIPTION_CHARS} characters`, () => {
    assert.ok(
      DESCRIPTION.length <= MAX_DESCRIPTION_CHARS,
      `description is ${DESCRIPTION.length} characters, limit ${MAX_DESCRIPTION_CHARS}`,
    );
  });

  for (const promise of UNKEPT_PROMISES) {
    it(`does not promise ${promise.pattern} (${promise.why})`, () => {
      assert.doesNotMatch(DESCRIPTION, promise.pattern);
    });
  }

  for (const mechanism of MECHANISMS) {
    it(`says ${mechanism.says} and the plugin wires ${mechanism.hook} on ${mechanism.event}`, () => {
      assert.match(DESCRIPTION, mechanism.says);
      const registrations = (getPluginHooksConfig().hooks as Record<string, unknown>)[mechanism.event];
      assert.ok(
        JSON.stringify(registrations ?? []).includes(mechanism.hook),
        `${mechanism.hook} is not registered on ${mechanism.event} in the plugin's hooks.json`,
      );
    });
  }

  it("is repeated word for word in package.json", () => {
    const pkg = JSON.parse(readRepoFile("package.json")) as { description: string };
    assert.equal(pkg.description, DESCRIPTION);
  });

  it("is repeated word for word in .cloudplugin/marketplace.json", () => {
    const manifest = JSON.parse(readRepoFile(".cloudplugin/marketplace.json")) as { description: string };
    assert.equal(manifest.description, DESCRIPTION);
  });

  it("is the summary line of llms.txt", () => {
    const summary = readRepoFile("llms.txt")
      .split(/\r?\n/)
      .find((line) => line.startsWith("> "));
    assert.equal(summary, `> ${DESCRIPTION}`);
  });
});

const CORE_DOCS: ReadonlyArray<string> = [
  "SKILL.md",
  "commands/continuous-improvement.md",
  "commands/seven-laws.md",
  "plugins/continuous-improvement/skills/continuous-improvement/SKILL.md",
  "plugins/continuous-improvement/commands/continuous-improvement.md",
  "plugins/continuous-improvement/commands/seven-laws.md",
];
const RUNTIME_DIRS: ReadonlyArray<string> = ["bin", "hooks", "lib"];

// Sentences that describe a lesson being created or applied with nobody acting.
const UNATTENDED_CLAIMS: ReadonlyArray<RegExp> = [
  /automatic via hooks/i,
  /appl(y|ies) (it |the behavior )?automatically/i,
  /never re-taught/i,
  /will create instincts after/i,
];

function runtimeReads(key: string): boolean {
  for (const dir of RUNTIME_DIRS) {
    for (const file of readdirSync(join(REPO_ROOT, dir))) {
      if (file.endsWith(".mjs") && readRepoFile(join(dir, file)).includes(key)) return true;
    }
  }
  return false;
}

// "<path>:<line>: <text>" for every line a pattern matches, so a failure names
// the sentence instead of printing the whole document.
function matchingLines(relPath: string, patterns: ReadonlyArray<RegExp>): string[] {
  return readRepoFile(relPath)
    .split(/\r?\n/)
    .flatMap((line, index) =>
      patterns.some((pattern) => pattern.test(line)) ? [`${relPath}:${index + 1}: ${line.trim()}`] : [],
    );
}

describe("core skill and command docs", () => {
  for (const doc of CORE_DOCS) {
    it(`${doc} offers no always-on mode while no runtime file reads always_on`, () => {
      if (runtimeReads("always_on")) return;
      assert.deepEqual(matchingLines(doc, [/always[-_ ]on/i]), []);
    });

    it(`${doc} does not say a lesson is created or applied with nobody acting`, () => {
      assert.deepEqual(matchingLines(doc, UNATTENDED_CLAIMS), []);
    });
  }
});

// Where a project's instinct files live. hooks/session.mjs and the MCP server
// name the directory with hashProjectRoot (src/lib/gateguard-state.mts): the
// project root written with forward slashes, a lower-case drive letter and no
// trailing slash, then SHA-256 and the first 12 hex characters. A doc that says
// only "SHA-256 of the git root" sends a hand-written lesson on Windows, where
// git prints D:/..., to a directory the runtime does not write to.
const HASH_RULE_DOCS: ReadonlyArray<string> = [
  "SKILL.md",
  "commands/continuous-improvement.md",
  "commands/dashboard.md",
  "plugins/continuous-improvement/skills/continuous-improvement/SKILL.md",
  "plugins/continuous-improvement/commands/continuous-improvement.md",
  "plugins/continuous-improvement/commands/dashboard.md",
];
const WORKED_EXAMPLE = /`([^`]+)` is hashed as `([^`]+)`, which gives `([0-9a-f]{12})`/;

describe("docs that say how a project's instinct directory is named", () => {
  for (const doc of HASH_RULE_DOCS) {
    it(`${doc} states the form of the path that is hashed`, () => {
      const lines = readRepoFile(doc)
        .split(/\r?\n/)
        .filter((line) => /SHA-256/i.test(line));
      assert.ok(lines.length > 0, `${doc} no longer says how the directory is named`);
      for (const line of lines) {
        assert.match(line, /CLAUDE_PROJECT_DIR/);
        assert.match(line, /forward slashes/);
        assert.match(line, /lower-case drive letter/);
        assert.match(line, /no trailing slash or newline/);
      }
    });

    it(`${doc} gives a worked example that hashProjectRoot agrees with`, () => {
      const example = readRepoFile(doc).match(WORKED_EXAMPLE);
      assert.ok(
        example,
        `${doc} has no worked example of the form: \`<path>\` is hashed as \`<path>\`, which gives \`<12 hex>\``,
      );
      const [, asGiven, asHashed, hash] = example;
      assert.match(asGiven, /^[A-Z]:\\/, "the example starts from a Windows path");
      assert.equal(createHash("sha256").update(asHashed).digest("hex").slice(0, 12), hash);
      assert.equal(hashProjectRoot(asGiven), hash);
    });
  }

  // In expert mode, which is how the plugin install starts the server, the tool
  // writes the file to that directory, so the reflect command names it first.
  for (const doc of HASH_RULE_DOCS.filter((path) => path.endsWith("commands/continuous-improvement.md"))) {
    it(`${doc} names ci_create_instinct as the way to record a rule`, () => {
      assert.match(readRepoFile(doc), /`ci_create_instinct`/);
    });
  }
});
