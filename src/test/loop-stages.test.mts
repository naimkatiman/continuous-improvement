/**
 * The loop is the spine of the two-pillar positioning (the owner's direction
 * of 2026-11-25), and lib/loop-stages.mjs is its one source. The README loop
 * table, the landing page's list of steps and assets/readme/pillars-loop.svg
 * are rendered from it; SKILL.md's loop line is hand-written and held to it
 * here. These tests tie the table to what ships: each step's law is a heading of SKILL.md, each hook file
 * exists and is registered on the event the table names, each mark agrees with
 * the hook's default, and every agent count comes from lib/agent-support.mjs.
 * The last four suites hold the landing page and the social card to the same
 * table: the headline, the pillars, the install switch, and where the guard's
 * replay sits.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { pillarsLoop } from "../bin/render-readme-assets.mjs";
import { HOOK_AGENT_IDS, PLUGIN_AGENT_IDS } from "../lib/agent-install-plans.mjs";
import { AGENT_SUPPORT, blocksPreTool, installFlags, supportTier, type AgentSupport } from "../lib/agent-support.mjs";
import {
  HEADLINE,
  LOOP_MARKS,
  LOOP_STAGES,
  LOOP_TABLE_END,
  LOOP_TABLE_START,
  MARK_MEANING,
  PILLARS,
  loopFacts,
  loopWords,
  markCounts,
  markLabel,
  renderLoopLine,
  renderLoopStepsHtml,
  renderLoopTableMarkdown,
} from "../lib/loop-stages.mjs";
import { getPluginHooksConfig, getToolNames } from "../lib/plugin-metadata.mjs";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const working = AGENT_SUPPORT.filter((row) => blocksPreTool(row));

describe("the loop's steps and the laws of the core skill", () => {
  const skill = read("SKILL.md");
  const headings = new Map([...skill.matchAll(/^## Law (\d): (.+)$/gm)].map((m) => [Number(m[1]), m[2]!.trim()]));

  it("names seven steps in the owner's order", () => {
    assert.deepEqual(LOOP_STAGES.map((s) => s.name), ["Research", "Plan", "Implement", "Review", "Contemplate", "Relearn and learn", "Iterate"]);
    assert.equal(loopWords(), "research, plan, implement, review, contemplate, relearn and learn, iterate");
  });

  it("gives each step one law of SKILL.md, by its own number and its own title", () => {
    assert.equal(headings.size, 7, "SKILL.md has seven `## Law N:` headings");
    for (const stage of LOOP_STAGES) assert.equal(stage.lawTitle, headings.get(stage.law), `${stage.name} is Law ${stage.law}`);
    assert.deepEqual(LOOP_STAGES.map((s) => s.law), [1, 2, 3, 4, 5, 7, 6], "no law is renumbered: Relearn and learn is Law 7, Iterate is Law 6");
    assert.deepEqual([...LOOP_STAGES.map((s) => s.law)].sort(), [1, 2, 3, 4, 5, 6, 7]);
  });

  for (const doc of ["SKILL.md", "plugins/continuous-improvement/skills/continuous-improvement/SKILL.md"]) {
    it(`${doc} names both pillars and shows the loop in that order under "The Loop", beside its own loop line`, () => {
      const text = read(doc);
      const loop = text.slice(text.indexOf("\n## The Loop\n"), text.indexOf("\n---\n", text.indexOf("\n## The Loop\n")));
      assert.ok(loop.includes(`\n${renderLoopLine()}\n`), "the loop line with the law numbers");
      assert.ok(loop.includes("\nResearch → Plan → Execute (one thing) → Verify → Reflect → Learn → Iterate\n"), "the skill's own loop line is kept");
      assert.match(loop, /two pillars/);
      const opening = text.slice(text.indexOf("\n# continuous-improvement\n"), text.indexOf("\n## Law 1"));
      for (const pillar of PILLARS) assert.ok(opening.includes(`**${pillar.name}:**`), `the opening names ${pillar.name}`);
      assert.match(opening, /`be-ambitious`/);
    });

    it(`${doc} says in its description, the line a skill list shows, which pillar it is and the steps in order`, () => {
      const description = /^description: "(.*)"$/m.exec(read(doc))![1]!;
      assert.match(description, /^The discipline pillar, beside the be-ambitious skill \(ambition\)\. Tells the agent /);
      assert.ok(description.includes(`seven steps: ${loopWords()}.`), description);
      assert.doesNotMatch(description, /Install structured|execute, verify|into a coding agent/);
    });
  }
});

describe("the hooks behind each step", () => {
  const registered = getPluginHooksConfig().hooks as Record<string, unknown>;
  const bundle = JSON.parse(read("plugins/continuous-improvement/hooks/hooks.json")) as { hooks: Record<string, unknown> };
  const runtime = ["hooks", "lib", "bin"].flatMap((dir) => readdirSync(join(REPO_ROOT, dir)).filter((f) => f.endsWith(".mjs")).map((f) => read(`${dir}/${f}`))).join("\n");

  it("exist on disk and are registered on the event the table names, in the plugin's hooks.json", () => {
    for (const stage of LOOP_STAGES) {
      for (const hook of stage.hooks) {
        assert.ok(existsSync(join(REPO_ROOT, hook.file)), `${stage.name}: ${hook.file} exists`);
        assert.ok(existsSync(join(REPO_ROOT, "src", hook.file.replace(/\.mjs$/, ".mts"))), `${stage.name}: ${hook.file} has a source`);
        for (const [where, hooks] of [["lib/plugin-metadata.mjs", registered], ["hooks.json", bundle.hooks]] as const) {
          assert.ok(JSON.stringify(hooks[hook.event] ?? []).includes(`/${hook.file}`), `${stage.name}: ${hook.file} is registered on ${hook.event} in ${where}`);
        }
      }
    }
  });

  it("agree with the step's mark: a refusal is on before the tool call, a gate waits at turn end, a recorder cannot refuse", () => {
    for (const stage of LOOP_STAGES) {
      const always = stage.hooks.filter((hook) => hook.optIn !== true);
      if (stage.mark === "refuses by default") {
        assert.equal(stage.defaultMode, "on", stage.name);
        assert.ok(always.length > 0 && always.every((hook) => hook.event === "PreToolUse"), `${stage.name}: its default hook runs before the tool call`);
      } else if (stage.mark === "off until you switch it on") {
        assert.ok(stage.defaultMode === "off" || stage.defaultMode === "warn", stage.name);
        assert.match(stage.switch, /^CI_[A-Z_]+=block$/, `${stage.name} names the variable that switches it on`);
        assert.ok(always.length > 0 && always.every((hook) => hook.event === "Stop"), `${stage.name}: its gate runs at turn end`);
      } else if (stage.mark === "records and loads") {
        assert.equal(stage.defaultMode, "on", stage.name);
        assert.deepEqual(always.map((hook) => hook.event).sort(), ["PostToolUse", "SessionStart"], `${stage.name}: one hook logs, one loads`);
      } else {
        assert.deepEqual([stage.hooks.length, stage.defaultMode, stage.switch], [0, "none", ""], `${stage.name} has no hook, so nothing to switch`);
      }
    }
    assert.deepEqual(markCounts(), { "refuses by default": 2, "off until you switch it on": 2, "records and loads": 1, none: 2 });
  });

  it("read the switch each step names, and every variable a cell prints", () => {
    const facts = loopFacts();
    for (const stage of LOOP_STAGES) {
      const named = [stage.switch, ...(stage.does(facts).match(/CI_[A-Z_]+=\w+/g) ?? [])].filter((s) => s !== "");
      for (const pair of named) {
        const name = pair.slice(0, pair.indexOf("="));
        assert.ok(runtime.includes(name), `${stage.name}: no runtime file reads ${name}`);
      }
      if (stage.switch !== "") assert.ok(stage.does(facts).includes(`\`${stage.switch}\``), `${stage.name}: the cell prints its switch`);
    }
  });

  it("cite the linter's real thresholds", () => {
    const linter = read("bin/lint-transcript.mjs");
    assert.match(linter, /editedFiles\.size > 8\b/);
    assert.match(LOOP_STAGES.find((s) => s.name === "Iterate")!.does(loopFacts()), /more than 8 files edited/);
  });

  it("name only skills and MCP tools that ship", () => {
    const skills = new Set(readdirSync(join(REPO_ROOT, "skills")).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)));
    const tools = new Set(getToolNames("expert"));
    const files = new Set(["task_plan.md"]);
    for (const stage of LOOP_STAGES) {
      for (const [, name] of stage.given.matchAll(/`([^`]+)`/g)) {
        if (name!.startsWith("ci_")) assert.ok(tools.has(name!), `${stage.name}: no MCP tool ${name}`);
        else if (!files.has(name!) && !name!.startsWith("## ")) assert.ok(skills.has(name!), `${stage.name}: no skill ${name}`);
      }
    }
  });
});

describe("the agent counts in the loop copy", () => {
  it("are the support table's, for the agents where the guard blocks", () => {
    const facts = loopFacts();
    assert.equal(facts.agents, working.length);
    assert.equal(facts.stopGate, working.filter((r) => r.stopGate).length);
    assert.equal(facts.lessonsByHook + facts.lessonsByRulesFile.length + facts.lessonsNone.length, facts.agents);
    assert.equal(facts.fullTier, working.filter((r) => supportTier(r) === "full").length);
    assert.deepEqual(facts.stopGatePartial, working.filter((r) => r.stopGate && supportTier(r) !== "full").map((r) => r.names[0]));
    assert.equal(facts.fullTier + facts.stopGatePartial.length, facts.stopGate, "every agent with a Stop gate is counted or named once");
    assert.deepEqual(facts.targetIds, working.filter((r) => r.id !== "claude").map((r) => r.id));
    assert.deepEqual([...facts.targetIds].sort(), [...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS].sort(), "every agent --hooks installs for can block");
  });

  it("move when a row changes, so none is typed into the copy", () => {
    const change = (id: string, over: Partial<AgentSupport>): AgentSupport[] => AGENT_SUPPORT.map((row) => (row.id === id ? { ...row, ...over } : row));
    const before = loopFacts();
    const text = renderLoopTableMarkdown(AGENT_SUPPORT);
    assert.ok(text.includes(`on the ${before.stopGate} agents with a Stop gate`));
    assert.ok(text.includes(`by hook on ${before.lessonsByHook} agents, through a rules file you rewrite on ${before.lessonsByRulesFile.length}, not at all on ${before.lessonsNone.length}`));
    assert.ok(text.includes(`go to all ${before.agents} agents`));

    const noStop = renderLoopTableMarkdown(change("codex", { stopGate: false }));
    assert.ok(noStop.includes(`on the ${before.stopGate - 1} agents with a Stop gate`) && noStop.includes(`${before.stopGate - 1} have a Stop gate: the ${before.fullTier - 1} full-tier agents, `));
    const clineHook = renderLoopTableMarkdown(change("cline", { lessons: "hook" }));
    assert.ok(clineHook.includes(`by hook on ${before.lessonsByHook + 1} agents`) && clineHook.includes("not at all on 0"));
    assert.ok(!clineHook.includes("not on Cline"));
    const fewer = renderLoopTableMarkdown(change("amp", { canBlockPreTool: false }));
    assert.ok(fewer.includes(`go to all ${before.agents - 1} agents`));
  });
});

describe("the README loop table", () => {
  const readme = read("README.md");

  it("is the render of lib/loop-stages.mjs, between its markers", () => {
    const start = readme.indexOf(LOOP_TABLE_START);
    const end = readme.indexOf(LOOP_TABLE_END);
    assert.ok(start !== -1 && end > start, "one marker pair");
    assert.equal(readme.slice(start + LOOP_TABLE_START.length, end), `\n${renderLoopTableMarkdown()}\n`, "run `node bin/check-agent-matrix.mjs --write`");
  });

  it("opens the first section, so a reader meets what is enforced before any feature", () => {
    const first = readme.indexOf("\n## ");
    assert.ok(readme.startsWith("\n## The loop\n", first), "the first H2 is The loop");
    assert.ok(readme.indexOf(LOOP_TABLE_START) < readme.indexOf("\n## ", first + 1), "the table sits in it");
  });

  it("gives every step a row with its law, and one of the four marks in bold", () => {
    const rows = renderLoopTableMarkdown().split("\n").filter((line) => /^\| \d\. /.test(line));
    assert.equal(rows.length, LOOP_STAGES.length);
    LOOP_STAGES.forEach((stage, i) => {
      assert.ok(rows[i]!.startsWith(`| ${i + 1}. ${stage.name} | Law ${stage.law}, ${stage.lawTitle} | `), stage.name);
      assert.ok(rows[i]!.includes(` | **${markLabel(stage.mark)}.** `), `${stage.name}: ${stage.mark}`);
      assert.equal(rows[i]!.split(" | ").length, 4, `${stage.name}: four cells`);
    });
  });

  it("explains each mark once, and calls a step with no hook a written rule", () => {
    const text = renderLoopTableMarkdown();
    for (const mark of LOOP_MARKS) assert.ok(text.includes(`**${markLabel(mark)}**: ${MARK_MEANING[mark]}.`), mark);
    for (const stage of LOOP_STAGES.filter((s) => s.mark === "none")) assert.doesNotMatch(stage.does(loopFacts()), /hooks\/|bin\//, `${stage.name} names no hook file`);
  });

  // Plan carries the "off until you switch it on" mark, and its hook acts by
  // default: hooks/goal-drift-stop.mjs scores the turn, prints a stderr line on
  // drift and rewrites its state file. Iterate carries "none", and the
  // transcript linter checks it after the run. A legend that says "does
  // nothing" or "nothing checks it" is false for both.
  it("says of a mark only what holds for every step that carries it", () => {
    const plan = LOOP_STAGES.find((s) => s.mark === "off until you switch it on" && s.defaultMode === "warn");
    assert.equal(plan?.name, "Plan");
    assert.match(read(plan!.hooks[0]!.file), /goal-drift-state\.json/, "the hook writes a state file with no switch set");
    assert.equal(MARK_MEANING["off until you switch it on"], "the hook ships and refuses nothing until you set the variable");
    assert.ok(LOOP_STAGES.some((s) => s.mark === "none" && /transcript linter/.test(s.does(loopFacts()))), "a step with no hook is checked after the run");
    assert.equal(MARK_MEANING.none, "text the agent is given, and nothing checks it during the session");
    for (const meaning of Object.values(MARK_MEANING)) assert.doesNotMatch(meaning, /does nothing|nothing checks it$/);
  });

  // A reader meets "Stop gate" in the Review row first, so that row says what
  // one is. The agent table has no Stop gate column, so the reach line says
  // which agents the count is.
  it("says what a Stop gate is in the Review row, and which agents have one under the table", () => {
    const facts = loopFacts();
    const text = renderLoopTableMarkdown();
    const review = text.split("\n").find((line) => line.startsWith("| 4. Review "))!;
    assert.ok(review.includes(`on the ${facts.stopGate} agents with a Stop gate (a hook that runs when the agent ends its turn and can send it back)`));
    assert.equal(text.indexOf("Stop gate"), text.indexOf("Stop gate (a hook that runs when the agent ends its turn"), "the first mention defines it");
    const others = facts.stopGatePartial;
    assert.ok(others.length > 1);
    const named = `${others.slice(0, -1).map((name) => `, ${name}`).join("")} and ${others[others.length - 1]}`;
    assert.ok(text.includes(` ${facts.stopGate} have a Stop gate: the ${facts.fullTier} full-tier agents${named}.`), text.split("\n").pop());
    assert.ok(read("README.md").indexOf("Stop gate") > read("README.md").indexOf(LOOP_TABLE_START), "nothing above the loop table uses the term");
  });

  it("says where the Plan gate is shown to work, and that Review's gate is TypeScript only", () => {
    const facts = loopFacts();
    assert.match(LOOP_STAGES.find((s) => s.name === "Plan")!.does(facts), /Shown to work on Claude Code only/);
    assert.match(read("hooks/goal-drift-stop.mjs"), /payload\.transcript_path/, "the gate reads the reply from the transcript path Claude Code sends");
    assert.match(LOOP_STAGES.find((s) => s.name === "Review")!.does(facts), /TypeScript only/);
  });
});

// The first screen is the positioning: the headline, the two pillars, the
// install command and the agents, in that order, with the guard nowhere above
// the pillars.
describe("the README first screen", () => {
  const readme = read("README.md");
  const top = readme.slice(0, readme.indexOf("\n## "));
  const facts = loopFacts();

  it("leads with the headline and the two pillars, then the install command", () => {
    assert.ok(top.includes(`**${HEADLINE}**`), "the headline");
    const at = PILLARS.map((pillar) => top.indexOf(`${pillar.name}: ${pillar.claim}`));
    assert.ok(at[0]! > top.indexOf(HEADLINE) && at[1]! > at[0]!, "Ambition, then Discipline, in the owner's words");
    const command = top.indexOf("npx continuous-improvement install --target <agent> --hooks");
    assert.ok(command > at[1]!, "the install command follows the pillars");
    assert.ok(top.indexOf("hooks/gateguard.mjs") > at[1]!, "the guard is named under Discipline, not before it");
    assert.doesNotMatch(top.slice(0, at[0]!), /refus|den(y|ies)|block|guard/i, "nothing above the pillars is about the guard");
  });

  it("calls the skill guidance and the hooks code, and points at the loop and the limits", () => {
    assert.match(top, /A skill: guidance the agent reads\. No hook checks that it was followed\./);
    assert.match(top, /Hooks: Node scripts on your machine\. No model calls, no network calls\./);
    assert.match(top, /\[The loop\]\(#the-loop\)/);
    assert.match(top, /\[Limits\]\(#limits\)/);
  });

  it("lists the --target ids and the agents from the support table, in its order", () => {
    // An id whose own install command takes another flag (Junie, whose project
    // config the agent does not read) carries it, as the agent table does.
    const ids = facts.targetIds.map((id) => {
      const flags = installFlags(AGENT_SUPPORT.find((row) => row.id === id)!);
      return `\`${id}\`${flags === "" ? "" : ` (add \`${flags}\`)`}`;
    });
    assert.ok(ids.includes("`junie` (add `--scope user`)"));
    assert.ok(top.includes(`\`<agent>\` is ${ids.slice(0, -1).join(", ")} or ${ids[ids.length - 1]}.`), "the --target ids");
    const names = working.map((row) => row.names[0]!);
    assert.ok(top.includes(`It works in ${names.length} coding agents: ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`), "the agents");
  });

  it("stays short: the per-step caveats live in the loop table, not in a paragraph above it", () => {
    assert.doesNotMatch(top.replace(/<img\b[^>]*>/g, ""), /off until you switch it on|refuses by default|written rules?/i);
    assert.ok(top.split("\n").filter((line) => line.trim() !== "").length <= 20, "at most 20 lines above the first section");
  });
});

// The README first screen gives every agent one command and links to
// QUICKSTART.md as the walkthrough, so the walkthrough may not start by asking
// for Claude Code.
describe("the README Discipline section", () => {
  const readme = read("README.md");
  const section = (from: string, to: string): string => readme.slice(readme.indexOf(from), readme.indexOf(to));
  const discipline = section("\n## Discipline\n", "\n## Install\n");

  // "What turns on" and Limits hold the detail. Discipline says the point of
  // each part and links there, so a fact is stated once.
  it("says what each part is and leaves the detail to What turns on and Limits", () => {
    assert.ok(discipline.includes("](#what-turns-on-what-it-costs-how-to-turn-it-off)") && discipline.includes("](#limits)"));
    for (const repeat of [/are on after install:/, /No hook writes inside your repository/, /No hook runs tests, lint or a build/, /Contemplate and Iterate have no hook/, /no runtime dependencies/]) {
      assert.doesNotMatch(discipline, repeat);
      assert.match(readme.replace(discipline, ""), repeat.source.includes("after install") ? /\*\*On after install:\*\*/ : repeat, "it is still said, once, where the detail is");
    }
    for (const once of ["No hook writes inside your repository", "the blind-edit gate, the log, the lesson load", "no runtime dependencies"]) {
      assert.equal(readme.split(once).length - 1, 1, once);
    }
  });

  it("does not say that every other hook waits for a switch, since two of them write local state by default", () => {
    assert.match(readme, /The goal-drift check runs without reaching the model and rewrites `goal-drift-state\.json`/);
    for (const doc of [readme, read("QUICKSTART.md")]) {
      assert.doesNotMatch(doc, /Every other hook waits for a switch/);
      assert.match(doc, /Every other hook refuses nothing and sends the model nothing until you set its switch/);
    }
  });

  it("defines a Stop gate once, in the loop table", () => {
    assert.equal(readme.split("runs when the agent ends its turn").length - 1, 1);
    assert.match(discipline, /Stop gate/);
  });
});

describe("QUICKSTART.md, the walkthrough the first screen links to", () => {
  const quick = read("QUICKSTART.md");
  const facts = loopFacts();

  it("opens with the two pillars and needs any agent of the table, not Claude Code", () => {
    const intro = quick.slice(0, quick.indexOf("\n## 1. "));
    assert.ok(intro.indexOf("ambition") !== -1 && intro.indexOf("ambition") < intro.indexOf("discipline"));
    assert.ok(intro.includes(`You need one of the ${facts.agents} agents`), "the agent count");
    assert.doesNotMatch(intro, /You need Claude Code|uses Claude Code/);
  });

  it("installs with --target first and the Claude Code plugin second, with the ids of the table", () => {
    const install = quick.slice(quick.indexOf("\n## 1. "), quick.indexOf("\n## 2. "));
    const command = install.indexOf("npx continuous-improvement install --target codex --hooks");
    assert.ok(command !== -1 && command < install.indexOf("/plugin install"));
    assert.ok(install.includes(`**For ${facts.targetIds.length} agents**`));
    const ids = AGENT_SUPPORT.filter((row) => facts.targetIds.includes(row.id)).map((row) => `\`${row.id}\`${installFlags(row) === "" ? "" : ` (add \`${installFlags(row)}\`)`}`);
    assert.ok(install.includes(`The ids are ${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}.`), ids.join(", "));
  });

  it("asks for nothing only Claude Code has without saying so", () => {
    for (const block of quick.split("\n\n")) {
      if (!/(?:^|[\s`])\/(?:plugin|recall|verify-install|be-ambitious|clear|continuous-improvement:recall)\b|claude plugin /m.test(block)) continue;
      if (block.startsWith("```")) continue; // a code block takes the label of the paragraph above it
      assert.match(block, /Claude Code/, block);
    }
    for (const command of ["/plugin marketplace add", "/verify-install", "claude plugin disable"]) {
      const before = quick.slice(0, quick.indexOf(`\n${command}`)).split("\n\n");
      assert.match(before[before.length - 2] ?? "", /\*\*(?:On )?Claude Code\*\*/, command);
    }
  });

  it("names the agents that take lessons another way, from the support table, and tries the ambition side", () => {
    const names = facts.lessonsByRulesFile;
    assert.ok(quick.includes(`${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} take lessons through a rules file instead`));
    assert.ok(quick.includes(`${facts.lessonsNone.join(" and ")} gets none.`));
    assert.match(quick, /Use the be-ambitious skill on this task/);
  });
});

describe("the pillars image", () => {
  const svg = pillarsLoop().svg;

  it("shows both pillars and every step with its law number and its mark", () => {
    for (const pillar of PILLARS) for (const part of [pillar.name, pillar.claim, pillar.ships]) assert.ok(svg.includes(`>${part}</text>`), part);
    LOOP_STAGES.forEach((stage, i) => {
      assert.ok(svg.includes(`>${i + 1}. ${stage.name}</text>`), stage.name);
      assert.ok(svg.includes(`>Law ${stage.law}</text>`), `Law ${stage.law}`);
      assert.ok(svg.includes(`>${stage.mark}</text>`), stage.mark);
    });
  });

  it("names a hook file only on a step that has one, and never draws the opt-in hook as a default", () => {
    assert.equal([...svg.matchAll(/>a written rule, no hook</g)].length, markCounts().none);
    for (const stage of LOOP_STAGES) for (const hook of stage.hooks.filter((h) => h.optIn !== true)) assert.ok(svg.includes(hook.file), hook.file);
    assert.doesNotMatch(svg, /hook-pack/);
  });

  it("describes itself for a reader who cannot see it", () => {
    const desc = /<desc id="desc">([^<]*)<\/desc>/.exec(svg)![1]!;
    for (const stage of LOOP_STAGES) assert.ok(desc.includes(`${stage.name} (Law ${stage.law})`), stage.name);
    assert.match(desc, /2 steps have a hook that refuses by default: Research and Implement\./);
    assert.match(desc, /Contemplate and Iterate are written rules with no hook\./);
  });
});

// The landing page (docs/landing/index.html) carries the same positioning: the
// headline, the two pillars and the install command in the hero, then the loop,
// Ambition and Discipline, with the guard's replay under Discipline.
const landing = read("docs/landing/index.html");
const plain = (markup: string): string => markup.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const sectionOf = (id: string): string => {
  const at = landing.search(new RegExp(`<section[^>]* id="${id}"`));
  assert.notEqual(at, -1, `the landing page has no #${id} section`);
  return landing.slice(at, landing.indexOf("</section>", at));
};
const metaOf = (key: string): string => new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)">`).exec(landing)?.[1] ?? "";
// A README cell as the text the landing page prints for it: links and backticks dropped.
const cellText = (markdown: string): string => markdown.replace(/\[`?([^\]`]+)`?\]\([^)]+\)/g, "$1").replace(/`/g, "");

describe("the landing page's loop block", () => {
  const html = renderLoopStepsHtml();
  const facts = loopFacts();

  it("is the render of lib/loop-stages.mjs, between its one marker pair, in the loop section", () => {
    const start = landing.indexOf(LOOP_TABLE_START);
    const end = landing.indexOf(LOOP_TABLE_END);
    assert.ok(start !== -1 && end > start, "one marker pair");
    assert.equal(landing.slice(start + LOOP_TABLE_START.length, end), `\n${html}\n`, "run `node bin/check-agent-matrix.mjs --write`");
    assert.ok(sectionOf("loop").includes(LOOP_TABLE_START), "the block sits in #loop");
  });

  it("gives every step, in order, its name, its mark, its law and the hook files behind it", () => {
    const rows = [...html.matchAll(/<p class="step-top"><b>([^<]+)<\/b><span class="mark"><i class="m \w+" aria-hidden="true"><\/i>([^<]+)<\/span><\/p>\n\s*<p class="step-sub">Law (\d), ([^·]+) · (.*)<\/p>/g)];
    assert.equal(rows.length, LOOP_STAGES.length);
    const items = [...html.matchAll(/<li data-loop="([^"]+)" data-mark="(\w+)">\n\s*<div>\n\s*<p class="step-top">.*?<i class="m (\w+)"/g)];
    assert.deepEqual(items.map((m) => m[1]), LOOP_STAGES.map((stage) => stage.name), "the names landing.js reads");
    for (const [, name, mark, square] of items) assert.equal(mark, square, `${name}: the mark landing.js reads is the mark the page prints`);
    LOOP_STAGES.forEach((stage, i) => {
      const [, name, mark, law, title, backing] = rows[i]!;
      assert.equal(name, stage.name);
      assert.equal(mark, markLabel(stage.mark), `${stage.name}: ${stage.mark}`);
      assert.equal(Number(law), stage.law);
      assert.equal(title, stage.lawTitle);
      const files = stage.hooks.filter((hook) => hook.optIn !== true).map((hook) => hook.file);
      assert.deepEqual([...backing!.matchAll(/<code>([^<]+)<\/code>/g)].map((m) => m[1]), files, `${stage.name}: hook files`);
      if (files.length === 0) assert.equal(backing, "a written rule, no hook");
      else assert.ok(backing!.endsWith(stage.covers === "" ? "</code>" : `: ${stage.covers}`), `${stage.name}: what the hook covers`);
    });
  });

  it("prints under each step the two cells the README table prints, its default and its switch", () => {
    const text = plain(html);
    for (const stage of LOOP_STAGES) {
      assert.ok(text.includes(`${cellText(stage.given)}.`), `${stage.name}: what the agent is given`);
      assert.ok(text.includes(`${cellText(stage.does(facts))}.`), `${stage.name}: what a hook does`);
      if (stage.switch !== "") assert.ok(html.includes(`<dt>Switch</dt><dd><code>${stage.switch}</code></dd>`), `${stage.name}: switch`);
    }
    assert.equal(html.split("<dt>Switch</dt><dd>None</dd>").length - 1, LOOP_STAGES.filter((s) => s.switch === "").length);
    assert.equal(html.split("<dt>Default</dt><dd>No hook</dd>").length - 1, markCounts().none, "a step with no hook says so");
    // The only step that warns by default runs at turn end, where there is no tool call to let through.
    assert.deepEqual(LOOP_STAGES.filter((s) => s.defaultMode === "warn").flatMap((s) => s.hooks.map((hook) => hook.event)), ["Stop"]);
    assert.equal(html.split("<dt>Default</dt><dd>Warns only: a debug-log line, and the turn ends</dd>").length - 1, 1);
    assert.doesNotMatch(html, /the call goes through/);
    assert.equal(html.split("<details").length - 1, LOOP_STAGES.length, "one disclosure per step");
  });

  it("leaves no Markdown in the markup, and links each hook file to the file on GitHub", () => {
    assert.doesNotMatch(html, /\]\(|`|\*\*/);
    const linked = [...html.matchAll(/<a href="https:\/\/github\.com\/naimkatiman\/continuous-improvement\/blob\/main\/([^"]+)"><code>([^<]+)<\/code><\/a>/g)];
    const named = new Set(LOOP_STAGES.flatMap((stage) => stage.hooks.map((hook) => hook.file)));
    assert.deepEqual([...new Set(linked.map((m) => m[1]))].sort(), [...named].sort(), "every hook file a step names is linked");
    for (const [, target, label] of linked) {
      assert.equal(target, label);
      assert.ok(existsSync(join(REPO_ROOT, target!)), `${target} is not in the repository`);
    }
  });

  it("lists the four marks once each, with the meaning the README gives and the steps that carry it", () => {
    for (const mark of LOOP_MARKS) {
      const carriers = LOOP_STAGES.filter((s) => s.mark === mark).map((s) => s.name).join(", ");
      assert.equal(html.split(`<b>${markLabel(mark)}</b>: ${MARK_MEANING[mark]}</span> <span class="rv">${carriers}</span>`).length - 1, 1, mark);
    }
  });

  it("states the reach with the support table's counts, and they move when a row changes", () => {
    const text = plain(html);
    assert.ok(text.includes(`the skills go to all ${facts.agents} agents`));
    assert.ok(text.includes(`${facts.stopGate} have a Stop gate: the ${facts.fullTier} full-tier agents, `));
    assert.ok(text.includes(`Saved lessons load by hook on ${facts.lessonsByHook}`));
    const fewer = plain(renderLoopStepsHtml(AGENT_SUPPORT.map((row) => (row.id === "codex" ? { ...row, stopGate: false } : row))));
    assert.ok(fewer.includes(`${facts.stopGate - 1} have a Stop gate: the ${facts.fullTier - 1} full-tier agents, `) && fewer.includes(`on the ${facts.stopGate - 1} agents with a Stop gate`));
    const readmeReach = renderLoopTableMarkdown().split("\n").pop()!.replace(/\[agent table\]\([^)]*\)/, "agent table");
    assert.ok(text.endsWith(readmeReach), "the reach line is the README's");
  });

  it("is introduced by a heading that counts the steps, and nothing above it in the section counts marks by hand", () => {
    const section = sectionOf("loop");
    assert.equal(LOOP_STAGES.length, 7);
    assert.match(section, /<h2 id="h-loop">Seven steps\. /);
    assert.doesNotMatch(plain(section.slice(0, section.indexOf(LOOP_TABLE_START))), /\b(?:one|two|three|four|five|six|\d+) (?:steps?|have|are|logs)\b/i);
  });
});

describe("the landing page's first screen", () => {
  const hero = sectionOf("top");
  const pkg = JSON.parse(read("package.json")) as { description: string };
  const lead = pkg.description.slice(0, pkg.description.indexOf(". ") + 1);
  const tiles = [...hero.matchAll(/<li><b>([^<]+)<\/b>([\s\S]*?)<\/li>/g)].map((m) => ({ title: m[1]!, body: plain(m[2]!) }));

  it("leads with the headline: the h1, the title and the link-preview titles", () => {
    assert.equal(plain(/<h1 id="h-top">([\s\S]*?)<\/h1>/.exec(hero)![1]!), HEADLINE);
    const title = /<title>([^<]*)<\/title>/.exec(landing)![1]!;
    assert.match(title, /Aim high, stay in control/);
    assert.equal(metaOf("og:title"), title);
    assert.equal(metaOf("twitter:title"), title);
  });

  it("opens the description, the link-preview texts and the JSON-LD description with the npm lead sentence", () => {
    assert.ok(lead.startsWith("Ambition and discipline for coding agents:") && lead.includes(loopWords()), lead);
    for (const key of ["description", "og:description", "twitter:description"]) assert.ok(metaOf(key).startsWith(lead), key);
    const ld = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(landing)![1]!) as { description: string; softwareRequirements: string };
    assert.ok(ld.description.startsWith(lead), "JSON-LD");
    assert.equal(ld.softwareRequirements, "A supported coding agent, Node.js 18 or newer");
  });

  it("shows the two pillars as tiles in the owner's words, the first called guidance and the second naming its hooks", () => {
    assert.deepEqual(tiles.map((t) => t.title), PILLARS.map((p) => `${p.name}. ${p.claim.charAt(0).toUpperCase()}${p.claim.slice(1)}.`));
    assert.ok(tiles[0]!.body.includes(PILLARS[0]!.ships), "Ambition names the skill");
    assert.match(tiles[0]!.body, /It is guidance the agent reads\. No hook checks that it was followed\./);
    assert.match(tiles[1]!.body, /With the hooks installed, hooks\/gateguard\.mjs refuses destructive commands and blind edits \(an edit of an existing file the session has not read\) before they run\./);
    assert.match(tiles[1]!.body, /bin\/observe\.mjs logs each tool call that runs/);
    assert.ok(hero.indexOf("<h1") < hero.indexOf('<ul class="tiles') && hero.indexOf('<ul class="tiles') < hero.indexOf('id="install"'), "headline, pillars, install");
  });

  it("keeps the guard's replay out of the hero: the chips and the verdict card are in the Discipline section", () => {
    assert.doesNotMatch(hero, /data-call=|class="chip"|id="verdict"|class="tape"/);
    const discipline = sectionOf("discipline");
    assert.equal(discipline.split("data-call=").length, landing.split("data-call=").length, "every chip is under Discipline");
    assert.ok(discipline.includes('id="verdict"') && discipline.includes('id="verdict-live"'));
    assert.doesNotMatch(plain(hero.slice(0, hero.indexOf('<ul class="tiles'))), /refus|den(?:y|ies)|block|guard/i, "nothing above the pillars is about the guard");
  });

  it("shows the --target install command by default, and the Claude Code plugin commands as the other state", () => {
    const command = "npx continuous-improvement install --target <agent> --hooks";
    assert.match(hero, /<input class="vh" type="radio" name="install-for" id="for-other" value="other" checked>/);
    assert.match(hero, /<input class="vh" type="radio" name="install-for" id="for-claude" value="claude">/);
    assert.equal(plain(/<pre class="cmds sh" id="cmds-other">([\s\S]*?)<\/pre>/.exec(hero)![1]!), command);
    assert.equal(plain(/<button class="copy-btn"[^>]* data-copy="([^"]*)"/.exec(hero)![1]!), command, "the copy button copies what is shown");
    const claude = AGENT_SUPPORT.find((row) => row.id === "claude")!;
    const lines = [...(/<pre class="cmds" id="cmds">([\s\S]*?)<\/pre>/.exec(hero)![1]!).matchAll(/<span>((?:<span class="nb">[^<]*<\/span>|<wbr>|[^<])*)<\/span>/g)].map((m) => plain(m[1]!));
    assert.deepEqual(lines, claude.install, "the plugin commands are the agent table's");
    assert.match(hero, /writes or prints the MCP server step/);
  });

  it("works without scripting: CSS swaps the two states, and the copy button is not shown", () => {
    assert.match(landing, /\.for-claude \{ display: none; \}/);
    assert.match(landing, /\.install:has\(#for-claude:checked\) \.for-claude \{ display: block; \}/);
    assert.match(landing, /\.install:has\(#for-claude:checked\) \.for-other \{ display: none; \}/);
    assert.match(landing, /\.no-js \.copy-btn \{ display: none; \}/);
    assert.match(landing, /<html lang="en" class="no-js">/);
    assert.match(hero, /<select id="for-agent">/, "the agent list is a native select");
  });
});

describe("the landing page's pillar sections", () => {
  const sections = [...landing.matchAll(/<section class="[^"]*" id="([^"]+)" data-cam="([^"]+)"/g)].map((m) => ({ id: m[1]!, cam: m[2]! }));

  it("follow the hero in the order loop, Ambition, Discipline, agents, each on its own camera", () => {
    assert.deepEqual(sections.slice(0, 6).map((s) => `${s.id}:${s.cam}`), ["top:hero", "loop:loop", "ambition:ambition", "discipline:gate", "agents:agents", "native:native"]);
  });

  it("use only camera names landing.js has a view for, so no section falls back to the hero view by accident", () => {
    const js = read("docs/landing/landing.js");
    const views = [...(/var SECT = \{([\s\S]*?)\n  \};/.exec(js)![1]!).matchAll(/^\s+(\w+):\s+\{/gm)].map((m) => m[1]);
    assert.ok(views.length >= 9, "the SECT table was read");
    for (const { id, cam } of sections) assert.ok(views.includes(cam), `#${id} names camera "${cam}"`);
  });

  it("call be-ambitious guidance with no hook, list what it tells the agent, and credit the essay", () => {
    const ambition = sectionOf("ambition");
    const text = plain(ambition);
    assert.match(text, /be-ambitious is a bundled skill\./);
    assert.match(text, /It is guidance/);
    assert.match(text, /A skill: guidance the agent reads\. No benchmark is claimed for it\./);
    assert.match(text, /No hook\. No code checks that the agent followed it/);
    assert.equal(ambition.split("<li><span><b>").length - 1, 5, "five things it tells the agent");
    assert.match(ambition, /href="https:\/\/felixrieseberg\.com\/how-to-be-more-ambitious-a-tutorial-for-humans-with-models\/"/);
    assert.ok(existsSync(join(REPO_ROOT, "skills", "be-ambitious.md")), "the skill ships");
  });

  it("put the owner's line under Discipline, and name the file for what is refused and what is logged", () => {
    const discipline = sectionOf("discipline");
    const text = plain(discipline);
    assert.ok(text.includes("You control the AI.") && text.includes("The AI does not control you."));
    const tiles = [...discipline.matchAll(/<li[^>]*><b>([^<]+)<\/b>([\s\S]*?)<\/li>/g)].map((m) => ({ title: m[1]!, body: plain(m[2]!) }));
    assert.deepEqual(tiles.map((t) => t.title), ["Refused", "Logged", "Switches", "Where it runs"]);
    assert.ok(tiles[0]!.body.startsWith("hooks/gateguard.mjs denies"));
    assert.ok(tiles[1]!.body.startsWith("bin/observe.mjs writes"));
    assert.match(text, /It is not a sandbox\./);
  });

  it("tag each exhibit with its step of the loop, by number and name", () => {
    const exhibits = sectionOf("exhibits");
    const tags = [...exhibits.matchAll(/<p class="meta">Step (\d), ([^·]+) · /g)];
    assert.equal(tags.length, exhibits.split('<article class="ex"').length - 1, "every exhibit is tagged");
    for (const [, n, name] of tags) assert.equal(name, LOOP_STAGES[Number(n) - 1]?.name, `step ${n}`);
  });

  it("count the known gaps they list, and name the gaps the pillars and the loop add", () => {
    const limits = sectionOf("limits");
    const gaps = limits.split("<li><details><summary>").length - 1;
    assert.match(limits, new RegExp(`<p class="lead">${gaps} known gaps, `));
    assert.match(limits, new RegExp(`<summary>All ${gaps} known gaps</summary>`));
    for (const gap of ["It is not a sandbox.", "be-ambitious is guidance.", "Contemplate and Iterate have no hook.", "No hook runs tests, lint or a build."]) assert.ok(limits.includes(`<summary>${gap}</summary>`), gap);
    assert.deepEqual(LOOP_STAGES.filter((s) => s.mark === "none").map((s) => s.name), ["Contemplate", "Iterate"]);
  });
});

// demo/social-card.html is the source of the link-preview image. A PNG cannot
// be read back, so the source is held to the data and the alt text to the source.
describe("the social card", () => {
  const card = read("demo/social-card.html");
  const body = plain(card.slice(card.indexOf("<body>")));

  it("carries the headline, the agent count and the seven steps with their marks, and no version", () => {
    assert.equal(plain(/<h1>([\s\S]*?)<\/h1>/.exec(card)![1]!.replace(/<\/span><span>/g, " ")), HEADLINE);
    assert.ok(body.includes(`Two pillars / one loop / ${working.length} coding agents`), "the label");
    const steps = [...card.matchAll(/<li class="\w+"><b>([^<]+)<\/b><em>([^<]+)<\/em><\/li>/g)].map((m) => `${m[1]}: ${m[2]}`);
    assert.deepEqual(steps, LOOP_STAGES.map((stage) => `${stage.name}: ${stage.mark}`));
    for (const pillar of PILLARS) assert.ok(body.includes(`${pillar.name}.`), pillar.name);
    assert.doesNotMatch(body, /\d+\.\d+\.\d+|\bREV\b/);
  });

  it("is described by og:image:alt and twitter:image:alt, in the words the card uses", () => {
    const alt = metaOf("og:image:alt");
    assert.equal(metaOf("twitter:image:alt"), alt);
    const marks = LOOP_MARKS.map((mark) => `${LOOP_STAGES.filter((s) => s.mark === mark).map((s) => s.name).join(" and ")}: ${mark}.`).join(" ");
    assert.equal(alt, `A paper-coloured card. Label: two pillars, one loop, ${working.length} coding agents. Headline: ${HEADLINE} Under it: Ambition, the be-ambitious skill. Discipline, hooks, a local log, switches. Beside it, the loop as seven numbered steps, each with its mark. ${marks} At the foot: continuous-improvement.dev, and the line: only a hook can refuse a call.`);
    for (const shown of ["The be-ambitious skill.", "Hooks, a local log, switches.", "continuous-improvement.dev", "only a hook can refuse a call"]) assert.ok(body.includes(shown), shown);
  });

  it("is rendered to both PNG paths at the size the page declares", () => {
    assert.equal(metaOf("og:image:width"), "1200");
    assert.equal(metaOf("og:image:height"), "630");
    const files = ["docs/landing/social-preview.png", "assets/social-preview.png"].map((file) => readFileSync(join(REPO_ROOT, file)));
    for (const png of files) {
      assert.equal(png.toString("latin1", 1, 4), "PNG");
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
    }
    assert.ok(files[0]!.equals(files[1]!), "the two files are one render");
  });
});
