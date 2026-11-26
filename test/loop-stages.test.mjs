/**
 * The loop is the spine of the two-pillar positioning (the owner's direction
 * of 2026-11-25), and lib/loop-stages.mjs is its one source. The README loop
 * table, assets/readme/pillars-loop.svg and the loop line in SKILL.md are
 * rendered from it. These tests tie the table to what ships: each step's law
 * is a heading of SKILL.md, each hook file exists and is registered on the
 * event the table names, each mark agrees with the hook's default, and every
 * agent count comes from lib/agent-support.mjs.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { pillarsLoop } from "../bin/render-readme-assets.mjs";
import { HOOK_AGENT_IDS, PLUGIN_AGENT_IDS } from "../lib/agent-install-plans.mjs";
import { AGENT_SUPPORT, blocksPreTool } from "../lib/agent-support.mjs";
import { HEADLINE, LOOP_MARKS, LOOP_STAGES, LOOP_TABLE_END, LOOP_TABLE_START, MARK_MEANING, PILLARS, loopFacts, loopWords, markCounts, markLabel, renderLoopLine, renderLoopTableMarkdown, } from "../lib/loop-stages.mjs";
import { getPluginHooksConfig, getToolNames } from "../lib/plugin-metadata.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const working = AGENT_SUPPORT.filter((row) => blocksPreTool(row));
describe("the loop's steps and the laws of the core skill", () => {
    const skill = read("SKILL.md");
    const headings = new Map([...skill.matchAll(/^## Law (\d): (.+)$/gm)].map((m) => [Number(m[1]), m[2].trim()]));
    it("names seven steps in the owner's order", () => {
        assert.deepEqual(LOOP_STAGES.map((s) => s.name), ["Research", "Plan", "Implement", "Review", "Contemplate", "Relearn and learn", "Iterate"]);
        assert.equal(loopWords(), "research, plan, implement, review, contemplate, relearn and learn, iterate");
    });
    it("gives each step one law of SKILL.md, by its own number and its own title", () => {
        assert.equal(headings.size, 7, "SKILL.md has seven `## Law N:` headings");
        for (const stage of LOOP_STAGES)
            assert.equal(stage.lawTitle, headings.get(stage.law), `${stage.name} is Law ${stage.law}`);
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
            for (const pillar of PILLARS)
                assert.ok(opening.includes(`**${pillar.name}:**`), `the opening names ${pillar.name}`);
            assert.match(opening, /`be-ambitious`/);
        });
    }
});
describe("the hooks behind each step", () => {
    const registered = getPluginHooksConfig().hooks;
    const bundle = JSON.parse(read("plugins/continuous-improvement/hooks/hooks.json"));
    const runtime = ["hooks", "lib", "bin"].flatMap((dir) => readdirSync(join(REPO_ROOT, dir)).filter((f) => f.endsWith(".mjs")).map((f) => read(`${dir}/${f}`))).join("\n");
    it("exist on disk and are registered on the event the table names, in the plugin's hooks.json", () => {
        for (const stage of LOOP_STAGES) {
            for (const hook of stage.hooks) {
                assert.ok(existsSync(join(REPO_ROOT, hook.file)), `${stage.name}: ${hook.file} exists`);
                assert.ok(existsSync(join(REPO_ROOT, "src", hook.file.replace(/\.mjs$/, ".mts"))), `${stage.name}: ${hook.file} has a source`);
                for (const [where, hooks] of [["lib/plugin-metadata.mjs", registered], ["hooks.json", bundle.hooks]]) {
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
            }
            else if (stage.mark === "off until you switch it on") {
                assert.ok(stage.defaultMode === "off" || stage.defaultMode === "warn", stage.name);
                assert.match(stage.switch, /^CI_[A-Z_]+=block$/, `${stage.name} names the variable that switches it on`);
                assert.ok(always.length > 0 && always.every((hook) => hook.event === "Stop"), `${stage.name}: its gate runs at turn end`);
            }
            else if (stage.mark === "records and loads") {
                assert.equal(stage.defaultMode, "on", stage.name);
                assert.deepEqual(always.map((hook) => hook.event).sort(), ["PostToolUse", "SessionStart"], `${stage.name}: one hook logs, one loads`);
            }
            else {
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
            if (stage.switch !== "")
                assert.ok(stage.does(facts).includes(`\`${stage.switch}\``), `${stage.name}: the cell prints its switch`);
        }
    });
    it("cite the linter's real thresholds", () => {
        const linter = read("bin/lint-transcript.mjs");
        assert.match(linter, /editedFiles\.size > 8\b/);
        assert.match(LOOP_STAGES.find((s) => s.name === "Iterate").does(loopFacts()), /more than 8 files edited/);
    });
    it("name only skills and MCP tools that ship", () => {
        const skills = new Set(readdirSync(join(REPO_ROOT, "skills")).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)));
        const tools = new Set(getToolNames("expert"));
        const files = new Set(["task_plan.md"]);
        for (const stage of LOOP_STAGES) {
            for (const [, name] of stage.given.matchAll(/`([^`]+)`/g)) {
                if (name.startsWith("ci_"))
                    assert.ok(tools.has(name), `${stage.name}: no MCP tool ${name}`);
                else if (!files.has(name) && !name.startsWith("## "))
                    assert.ok(skills.has(name), `${stage.name}: no skill ${name}`);
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
        assert.deepEqual(facts.targetIds, working.filter((r) => r.id !== "claude").map((r) => r.id));
        assert.deepEqual([...facts.targetIds].sort(), [...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS].sort(), "every agent --hooks installs for can block");
    });
    it("move when a row changes, so none is typed into the copy", () => {
        const change = (id, over) => AGENT_SUPPORT.map((row) => (row.id === id ? { ...row, ...over } : row));
        const before = loopFacts();
        const text = renderLoopTableMarkdown(AGENT_SUPPORT);
        assert.ok(text.includes(`on the ${before.stopGate} agents with a Stop gate`));
        assert.ok(text.includes(`by hook on ${before.lessonsByHook} agents, through a rules file you rewrite on ${before.lessonsByRulesFile.length}, not at all on ${before.lessonsNone.length}`));
        assert.ok(text.includes(`go to all ${before.agents} agents`));
        const noStop = renderLoopTableMarkdown(change("codex", { stopGate: false }));
        assert.ok(noStop.includes(`on the ${before.stopGate - 1} agents with a Stop gate`) && noStop.includes(`${before.stopGate - 1} have a Stop gate`));
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
            assert.ok(rows[i].startsWith(`| ${i + 1}. ${stage.name} | Law ${stage.law}, ${stage.lawTitle} | `), stage.name);
            assert.ok(rows[i].includes(` | **${markLabel(stage.mark)}.** `), `${stage.name}: ${stage.mark}`);
            assert.equal(rows[i].split(" | ").length, 4, `${stage.name}: four cells`);
        });
    });
    it("explains each mark once, and calls a step with no hook a written rule", () => {
        const text = renderLoopTableMarkdown();
        for (const mark of LOOP_MARKS)
            assert.ok(text.includes(`**${markLabel(mark)}**: ${MARK_MEANING[mark]}.`), mark);
        for (const stage of LOOP_STAGES.filter((s) => s.mark === "none"))
            assert.doesNotMatch(stage.does(loopFacts()), /hooks\/|bin\//, `${stage.name} names no hook file`);
    });
    it("says where the Plan gate is shown to work, and that Review's gate is TypeScript only", () => {
        const facts = loopFacts();
        assert.match(LOOP_STAGES.find((s) => s.name === "Plan").does(facts), /Shown to work on Claude Code only/);
        assert.match(read("hooks/goal-drift-stop.mjs"), /payload\.transcript_path/, "the gate reads the reply from the transcript path Claude Code sends");
        assert.match(LOOP_STAGES.find((s) => s.name === "Review").does(facts), /TypeScript only/);
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
        assert.ok(at[0] > top.indexOf(HEADLINE) && at[1] > at[0], "Ambition, then Discipline, in the owner's words");
        const command = top.indexOf("npx continuous-improvement install --target <agent> --hooks");
        assert.ok(command > at[1], "the install command follows the pillars");
        assert.ok(top.indexOf("hooks/gateguard.mjs") > at[1], "the guard is named under Discipline, not before it");
        assert.doesNotMatch(top.slice(0, at[0]), /refus|den(y|ies)|block|guard/i, "nothing above the pillars is about the guard");
    });
    it("calls the skill guidance and the hooks code, and points at the loop and the limits", () => {
        assert.match(top, /A skill: guidance the agent reads\. No hook checks that it was followed\./);
        assert.match(top, /Hooks: Node scripts on your machine\. No model calls, no network calls\./);
        assert.match(top, /\[The loop\]\(#the-loop\)/);
        assert.match(top, /\[Limits\]\(#limits\)/);
    });
    it("lists the --target ids and the agents from the support table, in its order", () => {
        const ids = facts.targetIds.map((id) => `\`${id}\``);
        assert.ok(top.includes(`\`<agent>\` is ${ids.slice(0, -1).join(", ")} or ${ids[ids.length - 1]}.`), "the --target ids");
        const names = working.map((row) => row.names[0]);
        assert.ok(top.includes(`It works in ${names.length} coding agents: ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`), "the agents");
    });
    it("stays short: the per-step caveats live in the loop table, not in a paragraph above it", () => {
        assert.doesNotMatch(top.replace(/<img\b[^>]*>/g, ""), /off until you switch it on|refuses by default|written rules?/i);
        assert.ok(top.split("\n").filter((line) => line.trim() !== "").length <= 20, "at most 20 lines above the first section");
    });
});
describe("the pillars image", () => {
    const svg = pillarsLoop().svg;
    it("shows both pillars and every step with its law number and its mark", () => {
        for (const pillar of PILLARS)
            for (const part of [pillar.name, pillar.claim, pillar.ships])
                assert.ok(svg.includes(`>${part}</text>`), part);
        LOOP_STAGES.forEach((stage, i) => {
            assert.ok(svg.includes(`>${i + 1}. ${stage.name}</text>`), stage.name);
            assert.ok(svg.includes(`>Law ${stage.law}</text>`), `Law ${stage.law}`);
            assert.ok(svg.includes(`>${stage.mark}</text>`), stage.mark);
        });
    });
    it("names a hook file only on a step that has one, and never draws the opt-in hook as a default", () => {
        assert.equal([...svg.matchAll(/>a written rule, no hook</g)].length, markCounts().none);
        for (const stage of LOOP_STAGES)
            for (const hook of stage.hooks.filter((h) => h.optIn !== true))
                assert.ok(svg.includes(hook.file), hook.file);
        assert.doesNotMatch(svg, /hook-pack/);
    });
    it("describes itself for a reader who cannot see it", () => {
        const desc = /<desc id="desc">([^<]*)<\/desc>/.exec(svg)[1];
        for (const stage of LOOP_STAGES)
            assert.ok(desc.includes(`${stage.name} (Law ${stage.law})`), stage.name);
        assert.match(desc, /2 steps have a hook that refuses by default: Research and Implement\./);
        assert.match(desc, /Contemplate and Iterate are written rules with no hook\./);
    });
});
