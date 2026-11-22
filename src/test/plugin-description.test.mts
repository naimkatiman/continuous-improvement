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

import { AGENT_SUPPORT, blocksPreTool } from "../lib/agent-support.mjs";
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

  it("is repeated word for word in .cloudplugin/marketplace.json", () => {
    const manifest = JSON.parse(readRepoFile(".cloudplugin/marketplace.json")) as { description: string };
    assert.equal(manifest.description, DESCRIPTION);
  });
});

// npm and llms.txt are read by people who may install with npx instead of the
// plugin, and src/bin/install.mts wires much less than the plugin's hooks.json:
// the tool-call log (bin/observe.mjs) always, the session hook and the MCP
// server only with --mode expert, and no PreToolUse guard at all.
describe("package description (npm and llms.txt)", () => {
  const pkg = JSON.parse(readRepoFile("package.json")) as { description: string };
  const installer = readRepoFile("bin/install.mjs");

  it("is the summary line of llms.txt, word for word", () => {
    const summary = readRepoFile("llms.txt")
      .split(/\r?\n/)
      .find((line) => line.startsWith("> "));
    assert.equal(summary, `> ${pkg.description}`);
  });

  it("says the guards and the session loader come with the plugin install", () => {
    assert.match(pkg.description, /As a Claude Code plugin it wires/);
    for (const mechanism of MECHANISMS) {
      assert.match(pkg.description, mechanism.says);
    }
  });

  it("says what `npx continuous-improvement install` wires, which is what src/bin/install.mts wires", () => {
    for (const guard of ["hooks/gateguard.mjs", "hooks/hook-pack.mjs", "hooks/config-guard.mjs", "hooks/typecheck-stop.mjs"]) {
      assert.ok(!installer.includes(guard), `the installer now wires ${guard}; update the description`);
    }
    assert.match(installer, /if \(INSTALL_MODE === "expert"\) \{\s*setupMcpServer\(\);/);
    assert.match(
      pkg.description,
      /`npx continuous-improvement install` wires only the tool-call log for Claude Code \(with --mode expert, also the session-start loader and the MCP server\)/,
    );
  });

  // PR 17 of the all-agents train changed the positioning on purpose: guardrails
  // for coding agents, Claude Code first. "for Claude Code" now qualifies the npx
  // sentence above, because `--target <agent> --hooks` does install the guard for
  // other agents. The count it states comes from the support table, so it cannot
  // drift from the agents the tier table says can block.
  it("leads with the positioning and states how many other agents can block, from lib/agent-support.mjs", () => {
    assert.match(pkg.description, /^Guardrails for coding agents, Claude Code first\. /);
    const others = AGENT_SUPPORT.filter((row) => row.id !== "claude" && blocksPreTool(row)).length;
    assert.ok(
      pkg.description.includes(`\`--target <agent> --hooks\` installs the guard for ${others} other agents that can block a tool call`),
      `the description must state the ${others} other agents that can block`,
    );
    assert.match(pkg.description, /docs\/AGENT-SUPPORT\.md/);
  });

  // PR 17 review: at project scope 8 of the 15 agents get the MCP server as a
  // printed step, not a written file, so no surface may say the install adds it.
  it("says the other-agent install writes or prints the MCP server step, on every surface", () => {
    assert.ok(pkg.description.includes("and writes or prints the MCP server step"), "package.json description");
    assert.doesNotMatch(pkg.description, /with the MCP server, per/);
    const llms = readRepoFile("llms.txt");
    assert.doesNotMatch(llms, /run from a stable copy, plus the MCP server/);
    assert.match(llms, /writes or prints the MCP server step/);
    const landing = readRepoFile("docs/landing/index.html");
    assert.doesNotMatch(landing, /Installs the hooks and the MCP server for that agent/);
    assert.match(landing, /writes or prints the MCP server step/);
  });
});

describe("llms.txt install steps", () => {
  const llms = readRepoFile("llms.txt");

  it("does not say the npx install fires gateguard, which src/bin/install.mts never wires", () => {
    assert.ok(!readRepoFile("bin/install.mjs").includes("hooks/gateguard.mjs"));
    assert.deepEqual(
      llms
        .split(/\r?\n/)
        .filter((line) => /npx continuous-improvement install/.test(line) && /gateguard fires/i.test(line))
        .filter((line) => !/`npx continuous-improvement install` does not wire gateguard/.test(line)),
      [],
    );
  });

  it("gives the plugin install first, and marks the npx install as the narrower one", () => {
    const install = llms.slice(llms.indexOf("## Install"));
    assert.ok(install.indexOf("/plugin install") !== -1, "the plugin install is listed");
    assert.ok(install.indexOf("/plugin install") < install.indexOf("npx continuous-improvement install"));
    assert.match(install, /log only/);
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

// Each sentence below was false of the code; the test names the code it checks.
describe("core docs say only what the code does", () => {
  const COMMAND_DOCS = ["commands/continuous-improvement.md", "plugins/continuous-improvement/commands/continuous-improvement.md"];
  const SKILL_DOCS = ["SKILL.md", "plugins/continuous-improvement/skills/continuous-improvement/SKILL.md"];
  const SEVEN_LAWS_DOCS = ["commands/seven-laws.md", "plugins/continuous-improvement/commands/seven-laws.md"];

  for (const doc of COMMAND_DOCS) {
    // Step 1 records an instinct from any reflection with a "Rule to add"; only
    // Step 2's mining waits for 20 observations.
    it(`${doc} says in the empty state that Step 1 records an instinct whatever the observation count`, () => {
      const text = readRepoFile(doc);
      assert.match(text, /If there's a "Rule to add", record it as an instinct/);
      const emptyState = text.split(/\r?\n/).find((line) => line.startsWith("If no instincts or observations exist yet"));
      assert.ok(emptyState, `${doc} has no empty-state sentence`);
      assert.doesNotMatch(emptyState, /this command creates instincts once 20\+ observations/);
      assert.match(emptyState, /Step 1 records an instinct whenever the reflection has a rule to add/);
      assert.match(emptyState, /Step 2 mines observations into instincts once 20\+ have accumulated/);
    });
  }

  for (const doc of SKILL_DOCS) {
    // The only code that rewrites a YAML instinct's confidence is
    // updateInstinctConfidence, reached from ci_reinforce; neither analysis
    // procedure has a decay step.
    it(`${doc} does not say decay is applied, since no code decays an instinct`, () => {
      const server = readRepoFile("bin/mcp-server.mjs");
      assert.equal([...server.matchAll(/updateInstinctConfidence\(/g)].length, 2, "defined once, called once");
      assert.match(server, /case "ci_reinforce": \{[\s\S]*?updateInstinctConfidence\(project,/);
      assert.deepEqual(matchingLines(doc, [/Decay is applied when analysis runs/]), []);
      assert.match(readRepoFile(doc), /No code decays an instinct\./);
    });

    // bin/harvest-friction.mjs appends JSON lines to instincts.jsonl, the
    // session hook lists only *.yaml (through lib/lesson-render.mjs, which
    // lists them with lib/gateguard-state.mjs), and the plugin bundle has no
    // copy of it.
    it(`${doc} says the friction harvest writes instincts.jsonl, which the session-start block does not load`, () => {
      assert.match(readRepoFile("bin/harvest-friction.mjs"), /join\(projectDir, "instincts\.jsonl"\)/);
      assert.match(readRepoFile("hooks/session.mjs"), /import \{ readLessonSources, renderLessonBlock \} from "\.\.\/lib\/lesson-render\.mjs";/);
      assert.match(readRepoFile("lib/lesson-render.mjs"), /import \{ hashProjectRoot, projectYamlFiles, yamlFiles \} from "\.\/gateguard-state\.mjs";/);
      assert.match(readRepoFile("lib/gateguard-state.mjs"), /export function yamlFiles\(dir\) \{\s*try \{\s*return readdirSync\(dir\)\s*\.filter\(\(name\) => name\.endsWith\("\.yaml"\)\)/);
      assert.ok(!readdirSync(join(REPO_ROOT, "plugins", "continuous-improvement", "bin")).includes("harvest-friction.mjs"));
      const text = readRepoFile(doc);
      assert.doesNotMatch(text, /into typed instincts automatically/);
      assert.match(text, /npm checkout only/);
      assert.match(text, /`<project-hash>\/instincts\.jsonl`/);
      assert.match(text, /the session-start block does not load them/);
    });
  }

  for (const doc of SEVEN_LAWS_DOCS) {
    it(`${doc} names only subcommands that continuous-improvement.md defines`, () => {
      const commandDoc = readRepoFile(doc.replace("seven-laws.md", "continuous-improvement.md"));
      const defined = [...commandDoc.matchAll(/^### `\/continuous-improvement (\w+)`/gm)].map((match) => match[1]);
      const sentence = readRepoFile(doc).split(/\r?\n/).find((line) => /subcommands? works? identically/.test(line));
      assert.ok(sentence, `${doc} no longer says which subcommands it shares`);
      const named = [...sentence.matchAll(/`(\w+)`/g)].map((match) => match[1]);
      assert.ok(named.length > 0);
      for (const name of named) {
        assert.ok(defined.includes(name), `${doc} names \`${name}\`, which continuous-improvement.md does not define (it defines ${defined.join(", ")})`);
      }
    });
  }
});

// src/bin/install.mts copies two skills (SKILL_SOURCE and SHIP_SKILL_SOURCE),
// whatever the mode, and no runtime file reads an always-on setting. A skill
// loads when its description matches the task.
describe("skill guides say which install delivers which skills", () => {
  const GUIDES = ["skills/README.md", "docs/skill-use-cases.md"];
  const installer = readRepoFile("bin/install.mjs");
  const copiedSkills = [...installer.matchAll(/const \w*SKILL_SOURCE = join\(__dirname, "\.\.", ([^)]*)\);/g)].map((match) => match[1]);

  it("the npm installer copies the core skill and ship, and no other", () => {
    assert.deepEqual(copiedSkills, ['"SKILL.md"', '"skills", "ship.md"']);
  });

  for (const guide of GUIDES) {
    it(`${guide} calls no skill always-on while no runtime file reads always_on`, () => {
      if (runtimeReads("always_on")) return;
      assert.deepEqual(matchingLines(guide, [/always[-_ ]on/i, /Always loaded/]), []);
    });

    it(`${guide} says \`npx continuous-improvement install\` copies only the core skill and ship`, () => {
      assert.deepEqual(
        matchingLines(guide, [
          /ship and load by default in \*\*Beginner\*\* install/,
          /for users running `npx continuous-improvement install --mode expert`/,
          /ships as part of the expert install/,
        ]),
        [],
      );
      assert.match(
        readRepoFile(guide),
        /`npx continuous-improvement install` copies only the core `continuous-improvement` skill and `ship`, in either mode/,
      );
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
