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
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
