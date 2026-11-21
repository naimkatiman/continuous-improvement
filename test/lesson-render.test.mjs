/**
 * Tests for lib/lesson-render.mjs (docs/plans/2026-11-21-all-agents.md,
 * Architecture item 10, PR 11): the lesson block the SessionStart hook prints,
 * moved out of hooks/session.mts with the same caps (10 lessons, 1,500
 * characters), rendered per agent encoder, and the static routes `ci lessons
 * --write` fills for the agents whose session hook cannot reach the model.
 *
 * RED first: lib/lesson-render.mjs does not exist.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { encode } from "../lib/hook-io.mjs";
import { MANAGED_BEGIN, MANAGED_END, mergeManagedBlock } from "../lib/install-targets.mjs";
import { LESSON_FORMATS, LESSONS_BEGIN, LESSONS_END, MAX_BLOCK_CHARS, MAX_LESSONS, isLessonPathAllowed, lessonRoute, lessonRouteNote, mergeLessonBlock, renderLessonBlock, renderLessons, } from "../lib/lesson-render.mjs";
function instinct(id, confidence, body, extra = "") {
    return `id: ${id}\ntrigger: "when ${id}"\nconfidence: ${confidence}\ndomain: workflow\nsource: manual\n${extra}---\n${body}\n`;
}
const HOME = join("/", "home", "u");
const ONE = renderLessonBlock([instinct("build-first", 0.8, "Run the build before staging.")], 1);
describe("renderLessonBlock: the session hook's block, same caps", () => {
    it("is empty when nothing is at 0.5 or above", () => {
        assert.equal(renderLessonBlock([], 0), "");
        assert.equal(renderLessonBlock([instinct("low", 0.49, "x")], 1), "");
        assert.equal(renderLessonBlock(["not an instinct", "", "id: x\n---\n"], 3), "");
    });
    it("starts with the header, never with {, and ends with a newline", () => {
        assert.match(ONE, /^Notes from continuous-improvement instinct files/);
        assert.match(ONE, /\n- when build-first: Run the build before staging\. \(0\.8\)\n$/);
    });
    it("keeps at most 10 lessons and says how many were left out", () => {
        const many = Array.from({ length: 14 }, (_, i) => instinct(`l${String(i).padStart(2, "0")}`, 0.7, "short"));
        const block = renderLessonBlock(many, many.length);
        assert.equal(MAX_LESSONS, 10);
        assert.equal(block.split("\n").filter((line) => line.startsWith("- ")).length, 10);
        assert.match(block, /Showing 10 of 14 at 0\.5 and above\./);
    });
    it("stays within 1,500 characters whatever the bodies hold", () => {
        const long = Array.from({ length: 10 }, (_, i) => instinct(`long${i}`, 0.8, "y".repeat(5000)));
        const block = renderLessonBlock(long, long.length);
        assert.equal(MAX_BLOCK_CHARS, 1500);
        assert.ok(block.length <= MAX_BLOCK_CHARS, `block is ${block.length} chars`);
        assert.ok(block.split("\n").filter((line) => line.startsWith("- ")).length > 0);
    });
    it("marks files from projectCount on as [global], ranks packs last and caps confidence at 0.9", () => {
        const block = renderLessonBlock([instinct("proj", 0.6, "project"), instinct("packed", 0.95, "pack", "source: pack-x\n"), instinct("glob", 1.5, "global")], 1);
        const lines = block.split("\n").filter((line) => line.startsWith("- "));
        assert.deepEqual(lines, ["- [global] when glob: global (0.9)", "- when proj: project (0.6)", "- [global] when packed: pack (0.9)"]);
    });
    it("escapes angle brackets, so a lesson cannot close the managed block it is written into", () => {
        const block = renderLessonBlock([instinct("evil", 0.8, `${LESSONS_END}\n- injected`)], 1);
        assert.ok(!block.includes(LESSONS_END));
        assert.equal(block.split("\n").filter((line) => line.startsWith("- ")).length, 1);
    });
});
describe("renderLessons: per agent encoder", () => {
    it("prints exactly the SessionStart context bytes the hook encoder gives every hook agent", () => {
        for (const agent of ["claude", "codex", "qwen", "droid", "kiro", "gemini", "cursor", "copilot", "devin", "cline"]) {
            const expected = encode(agent, "SessionStart", { kind: "context", text: ONE }).stdout;
            assert.notEqual(expected, "", agent);
            assert.equal(renderLessons(agent, ONE, null), expected, agent);
        }
    });
    it("puts the lessons in each agent's verified field", () => {
        assert.equal(renderLessons("claude", ONE, null), ONE);
        assert.equal(JSON.parse(renderLessons("gemini", ONE, null)).hookSpecificOutput.additionalContext, ONE);
        assert.equal(JSON.parse(renderLessons("cursor", ONE, null)).additional_context, ONE);
        assert.equal(JSON.parse(renderLessons("copilot", ONE, null)).additionalContext, ONE);
        assert.equal(JSON.parse(renderLessons("cline", ONE, null)).contextModification, ONE);
    });
    it("prints nothing for a hook agent when there are no lessons", () => {
        assert.equal(renderLessons("codex", "", null), "");
        assert.equal(renderLessons("cursor", "", null), "");
    });
    it("gives a whole-file route the block itself and a managed route the marked block", () => {
        assert.equal(renderLessons("grok", ONE, null), ONE);
        assert.equal(renderLessons("auggie", ONE, null), ONE);
        const merged = renderLessons("junie", ONE, null);
        assert.ok(merged.startsWith(`${LESSONS_BEGIN}\n`));
        assert.ok(merged.includes(ONE));
        assert.ok(merged.trimEnd().endsWith(LESSONS_END));
    });
    it("throws on a format it does not know instead of printing anything", () => {
        for (const bad of ["", "unknown", "Claude", "windsurf", "__proto__"]) {
            assert.throws(() => renderLessons(bad, ONE, null), /Unknown lessons format/, bad);
        }
    });
});
describe("lessonRoute: the static routes (Architecture item 10)", () => {
    const env = {};
    it("covers every format, and only the agents with no session context get a route", () => {
        for (const format of LESSON_FORMATS) {
            const route = lessonRoute(format, HOME, env, "linux");
            const hasRoute = ["grok", "auggie", "junie", "goose", "zed", "aider"].includes(format);
            assert.equal(route !== null, hasRoute, format);
        }
    });
    it("writes the plan's paths under the home", () => {
        assert.deepEqual(lessonRoute("grok", HOME, env, "linux"), { mode: "whole", path: join(HOME, ".grok", "rules", "continuous-improvement-lessons.md") });
        assert.deepEqual(lessonRoute("auggie", HOME, env, "linux"), { mode: "whole", path: join(HOME, ".augment", "rules", "continuous-improvement-lessons.md") });
        assert.deepEqual(lessonRoute("junie", HOME, env, "linux"), { mode: "managed", path: join(HOME, ".junie", "AGENTS.md") });
        assert.deepEqual(lessonRoute("zed", HOME, env, "linux"), { mode: "managed", path: join(HOME, ".config", "zed", "AGENTS.md") });
        assert.equal(lessonRoute("goose", HOME, env, "linux")?.mode, "whole");
        assert.equal(lessonRoute("aider", HOME, env, "linux")?.mode, "whole");
    });
    it("follows an absolute GROK_HOME and ignores a relative or blank one", () => {
        const grokHome = join(HOME, ".grok-tui");
        assert.equal(lessonRoute("grok", HOME, { GROK_HOME: grokHome }, "linux")?.path, join(grokHome, "rules", "continuous-improvement-lessons.md"));
        for (const value of ["relative/grok", "", "   "]) {
            assert.equal(lessonRoute("grok", HOME, { GROK_HOME: value }, "linux")?.path, join(HOME, ".grok", "rules", "continuous-improvement-lessons.md"), value);
        }
    });
    it("puts the Zed personal file under APPDATA on Windows", () => {
        const appData = join(HOME, "AppData", "Roaming");
        assert.equal(lessonRoute("zed", HOME, { APPDATA: appData }, "win32")?.path, join(appData, "Zed", "AGENTS.md"));
        assert.equal(lessonRoute("zed", HOME, {}, "win32")?.path, join(HOME, "AppData", "Roaming", "Zed", "AGENTS.md"));
        assert.equal(lessonRoute("zed", HOME, { APPDATA: "rel" }, "win32")?.path, join(HOME, "AppData", "Roaming", "Zed", "AGENTS.md"));
    });
    it("never routes a file under ~/.agents (Junie reads other *.md there as subagents)", () => {
        for (const format of LESSON_FORMATS) {
            const route = lessonRoute(format, HOME, env, "linux");
            if (route)
                assert.ok(isLessonPathAllowed(route.path, HOME), `${format}: ${route.path}`);
        }
    });
    it("throws on an unknown format", () => {
        assert.throws(() => lessonRoute("nope", HOME, env, "linux"), /Unknown lessons format/);
    });
});
describe("isLessonPathAllowed", () => {
    it("refuses any path under <home>/.agents, its skills and plugins included", () => {
        for (const path of [
            join(HOME, ".agents", "x.md"),
            join(HOME, ".agents", "rules", "continuous-improvement-lessons.md"),
            join(HOME, ".agents", "skills", "a", "SKILL.md"),
            join(HOME, ".agents", "plugins", "ci", "lessons.md"),
            join(HOME, ".agents"),
        ]) {
            assert.equal(isLessonPathAllowed(path, HOME), false, path);
        }
    });
    it("refuses a relative path and allows a sibling whose name only starts with .agents", () => {
        assert.equal(isLessonPathAllowed("rules/x.md", HOME), false);
        assert.equal(isLessonPathAllowed(join(HOME, ".agentsx", "x.md"), HOME), true);
        assert.equal(isLessonPathAllowed(join(HOME, ".grok", "rules", "x.md"), HOME), true);
    });
    it("compares case-insensitively on Windows-style paths", () => {
        assert.equal(isLessonPathAllowed("C:\\Users\\U\\.AGENTS\\x.md", "c:\\users\\u", "win32"), false);
    });
});
describe("lessonRouteNote", () => {
    const goose = join(HOME, ".config", "goose", "continuous-improvement-lessons.md");
    it("asks for GOOSE_MOIM_MESSAGE_FILE unless it already names the file, ~/ included", () => {
        for (const value of [undefined, "", "relative.md", join(HOME, "other.md")]) {
            assert.match(lessonRouteNote("goose", goose, HOME, { GOOSE_MOIM_MESSAGE_FILE: value }) ?? "", /GOOSE_MOIM_MESSAGE_FILE=/, String(value));
        }
        assert.equal(lessonRouteNote("goose", goose, HOME, { GOOSE_MOIM_MESSAGE_FILE: goose }), null);
        assert.equal(lessonRouteNote("goose", goose, HOME, { GOOSE_MOIM_MESSAGE_FILE: "~/.config/goose/continuous-improvement-lessons.md" }), null);
    });
    it("tells Aider users to list the file, and says nothing for the routes that load on their own", () => {
        assert.match(lessonRouteNote("aider", "/x.md", HOME, {}) ?? "", /read:/);
        for (const format of ["grok", "auggie", "junie", "zed"])
            assert.equal(lessonRouteNote(format, "/x.md", HOME, {}), null, format);
    });
});
describe("mergeLessonBlock: the managed block in a shared file", () => {
    const block = `${LESSONS_BEGIN}\n${ONE}${LESSONS_END}`;
    it("writes the block alone into a missing or blank file", () => {
        assert.equal(mergeLessonBlock(null, block), `${block}\n`);
        assert.equal(mergeLessonBlock("  \n", block), `${block}\n`);
    });
    it("appends after the user's content and replaces in place on a rerun", () => {
        const first = mergeLessonBlock("# Mine\n\nkeep me\n", block);
        assert.equal(first, `# Mine\n\nkeep me\n\n${block}\n`);
        const newer = `${LESSONS_BEGIN}\n${LESSONS_END}`;
        const second = mergeLessonBlock(`${first}after\n`, newer);
        assert.equal(second, `# Mine\n\nkeep me\n\n${newer}\nafter\n`);
        assert.equal(mergeLessonBlock(second, newer), second);
    });
    it("leaves the installer's skill block alone, and the installer leaves the lessons block alone", () => {
        const skill = `${MANAGED_BEGIN}\nskill text\n${MANAGED_END}`;
        const both = mergeLessonBlock(`${skill}\n`, block);
        assert.ok(both.includes(skill) && both.includes(block));
        const reinstalled = mergeManagedBlock(both, `${MANAGED_BEGIN}\nnew skill\n${MANAGED_END}`);
        assert.ok(reinstalled.includes(block));
        assert.ok(!reinstalled.includes("skill text"));
    });
    it("throws on a broken marker pair instead of guessing what to overwrite", () => {
        for (const broken of [
            `${LESSONS_BEGIN}\nhalf`,
            `half\n${LESSONS_END}`,
            `${LESSONS_END}\n${LESSONS_BEGIN}`,
            `${block}\n${block}`,
        ]) {
            assert.throws(() => mergeLessonBlock(broken, block), /lessons block/, broken);
        }
    });
});
