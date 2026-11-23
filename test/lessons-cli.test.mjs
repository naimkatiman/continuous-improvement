/**
 * `ci lessons --format <agent> [--scope project|user] [--write]`
 * (docs/plans/2026-11-21-all-agents.md, Architecture item 10, PR 11), spawned
 * against a temp HOME.
 *
 * Without --write nothing is written anywhere: the command prints what the
 * agent would read. With --write it writes only the static route of an agent
 * whose session hook cannot reach the model (Grok, Auggie, Junie, Goose, Zed,
 * Aider), never a file under ~/.agents/. The default scope is the project
 * (owner decision "User-level config writes"): the route inside the project,
 * with the project's and the global lessons. A user-level file (~/.grok,
 * ~/.augment, ~/.junie, Zed's personal file, Goose's, Aider's) is written only
 * with an explicit --scope user, and gets the global lessons only, because it
 * loads in every repository.
 *
 * RED first: bin/unified-cli.mjs has no lessons command, and its entry guard
 * never matches a Windows argv path. Then RED again for --scope: `--format
 * junie --write` wrote ~/.junie/AGENTS.md with no --scope, and --scope was
 * refused as an unknown argument.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { LESSONS_BEGIN, LESSONS_END } from "../lib/lesson-render.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const CLI = join(REPO_ROOT, "bin", "unified-cli.mjs");
const GLOBAL_LESSON = "Run the build before staging generated files.";
const PROJECT_LESSON = "This repository ships only through a pull request.";
const STATIC_FORMATS = ["grok", "auggie", "junie", "goose", "zed", "aider"];
const LESSONS_FILE = "continuous-improvement-lessons.md";
// The env the CLI inherits; every agent home and project variable is dropped.
const INHERITED_ENV = new Set(["path", "pathext", "systemroot", "comspec", "temp", "tmp", "windir", "systemdrive"]);
const roots = [];
after(() => {
    for (const root of roots)
        rmSync(root, { recursive: true, force: true });
});
function instinct(id, body) {
    return `id: ${id}\ntrigger: "when ${id}"\nconfidence: 0.8\ndomain: workflow\nsource: manual\n---\n${body}\n`;
}
function box() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-lessons-cli-")));
    roots.push(root);
    const home = join(root, "home");
    const project = join(root, "project");
    mkdirSync(project, { recursive: true });
    const instincts = join(home, ".claude", "instincts");
    mkdirSync(join(instincts, "global"), { recursive: true });
    writeFileSync(join(instincts, "global", "build-first.yaml"), instinct("build-first", GLOBAL_LESSON));
    mkdirSync(join(instincts, hashProjectRoot(project)), { recursive: true });
    writeFileSync(join(instincts, hashProjectRoot(project), "pr-only.yaml"), instinct("pr-only", PROJECT_LESSON));
    return { home, project, root };
}
function run(b, args, extraEnv = {}) {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (INHERITED_ENV.has(key.toLowerCase()) && value !== undefined)
            env[key] = value;
    }
    Object.assign(env, {
        HOME: b.home,
        USERPROFILE: b.home,
        APPDATA: join(b.home, "AppData", "Roaming"),
        CLAUDE_PROJECT_DIR: b.project,
        GIT_CEILING_DIRECTORIES: b.root,
        ...extraEnv,
    });
    const result = spawnSync(process.execPath, [CLI, "lessons", ...args], { cwd: b.project, env, encoding: "utf8", timeout: 30_000 });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
// Every file under the home, relative, sorted.
function tree(dir, base = dir) {
    if (!existsSync(dir))
        return [];
    return readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) => (entry.isDirectory() ? tree(join(dir, entry.name), base) : [relative(base, join(dir, entry.name))]))
        .sort();
}
describe("ci lessons without --write", () => {
    it("prints the hook agent's SessionStart bytes, project and global lessons, and writes nothing", () => {
        const b = box();
        const before = tree(b.root);
        const out = run(b, ["--format", "cursor"]);
        assert.equal(out.status, 0, out.stderr);
        const parsed = JSON.parse(out.stdout);
        assert.ok(parsed.additional_context.includes(GLOBAL_LESSON));
        assert.ok(parsed.additional_context.includes(PROJECT_LESSON));
        assert.deepEqual(tree(b.root), before);
    });
    it("accepts --format=<id> and prints plain text for claude", () => {
        const b = box();
        const out = run(b, ["--format=claude"]);
        assert.equal(out.status, 0, out.stderr);
        assert.match(out.stdout, /^Notes from continuous-improvement instinct files/);
    });
    it("prints a user route's content, names the file it would write, and writes nothing", () => {
        const b = box();
        const before = tree(b.root);
        for (const format of STATIC_FORMATS) {
            const out = run(b, ["--format", format, "--scope", "user"]);
            assert.equal(out.status, 0, `${format}: ${out.stderr}`);
            assert.ok(out.stdout.includes(GLOBAL_LESSON), format);
            assert.ok(!out.stdout.includes(PROJECT_LESSON), `${format} must not carry a project lesson into a file every repository loads`);
            assert.match(out.stderr, /--write/, format);
            assert.ok(out.stderr.includes(b.home), `${format}: ${out.stderr}`);
        }
        assert.deepEqual(tree(b.root), before);
    });
    it("previews the project route by default, with the project's and the global lessons, and writes nothing", () => {
        const b = box();
        writeFileSync(join(b.project, "AGENTS.md"), "# Project rules\n");
        const before = tree(b.root);
        for (const format of STATIC_FORMATS) {
            const out = run(b, ["--format", format]);
            assert.equal(out.status, 0, `${format}: ${out.stderr}`);
            assert.ok(out.stdout.includes(GLOBAL_LESSON) && out.stdout.includes(PROJECT_LESSON), format);
            assert.match(out.stderr, /--write/, format);
            assert.ok(out.stderr.includes(b.project), `${format}: ${out.stderr}`);
        }
        assert.deepEqual(tree(b.root), before);
    });
    it("prints nothing for a hook agent when CI_INSTINCT_LOAD is off, as the session hook does", () => {
        const b = box();
        for (const value of ["off", "0", "false", "NO"]) {
            const out = run(b, ["--format", "codex"], { CI_INSTINCT_LOAD: value });
            assert.equal(out.status, 0, out.stderr);
            assert.equal(out.stdout, "", value);
        }
        assert.ok(run(b, ["--format", "codex"], { CI_INSTINCT_LOAD: "on" }).stdout.includes(GLOBAL_LESSON));
    });
});
describe("ci lessons --write: the default scope is the project", () => {
    it("never writes a user-level file without --scope user", () => {
        const b = box();
        writeFileSync(join(b.project, "AGENTS.md"), "# Project rules\n");
        const homeBefore = tree(b.home);
        for (const format of STATIC_FORMATS) {
            const out = run(b, ["--format", format, "--write"]);
            assert.equal(out.status, 0, `${format}: ${out.stderr}`);
            assert.ok(out.stdout.includes(b.project), `${format}: ${out.stdout}`);
        }
        assert.deepEqual(tree(b.home), homeBefore);
        assert.ok(!existsSync(join(b.home, ".junie")) && !existsSync(join(b.home, ".augment")) && !existsSync(join(b.home, ".grok")));
    });
    it("writes the Grok and Auggie project rules with the project's and the global lessons", () => {
        const b = box();
        const grok = run(b, ["--format", "grok", "--write"]);
        assert.equal(grok.status, 0, grok.stderr);
        const grokFile = readFileSync(join(b.project, ".grok", "rules", LESSONS_FILE), "utf8");
        assert.match(grokFile, /^Notes from continuous-improvement instinct files/);
        assert.ok(grokFile.includes(PROJECT_LESSON) && grokFile.includes(GLOBAL_LESSON));
        const auggie = run(b, ["--format", "auggie", "--write"]);
        assert.equal(auggie.status, 0, auggie.stderr);
        const auggieFile = readFileSync(join(b.project, ".augment", "rules", LESSONS_FILE), "utf8");
        // A workspace rule loads on every turn only with type always_apply.
        assert.match(auggieFile, /^---\ntype: always_apply\n/);
        assert.ok(auggieFile.includes(PROJECT_LESSON) && auggieFile.includes(GLOBAL_LESSON));
    });
    it("creates the project's .junie/AGENTS.md block when the project has no Junie guidelines", () => {
        const b = box();
        assert.equal(run(b, ["--format", "junie", "--write"]).status, 0);
        const written = readFileSync(join(b.project, ".junie", "AGENTS.md"), "utf8");
        assert.ok(written.startsWith(LESSONS_BEGIN) && written.includes(PROJECT_LESSON));
    });
    it("merges into an existing .junie/AGENTS.md, keeps the user's text and is idempotent", () => {
        const b = box();
        mkdirSync(join(b.project, ".junie"), { recursive: true });
        const path = join(b.project, ".junie", "AGENTS.md");
        writeFileSync(path, "# Team rules\n");
        assert.equal(run(b, ["--format", "junie", "--write"]).status, 0);
        const first = readFileSync(path, "utf8");
        assert.ok(first.startsWith("# Team rules\n") && first.includes(LESSONS_END));
        assert.equal(run(b, ["--format", "junie", "--write"]).status, 0);
        assert.equal(readFileSync(path, "utf8"), first);
    });
    it("writes .junie/rules beside a root AGENTS.md instead of creating .junie/AGENTS.md, which would hide it", () => {
        const b = box();
        writeFileSync(join(b.project, "AGENTS.md"), "# Project rules\n");
        assert.equal(run(b, ["--format", "junie", "--write"]).status, 0);
        assert.ok(!existsSync(join(b.project, ".junie", "AGENTS.md")));
        assert.ok(readFileSync(join(b.project, ".junie", "rules", LESSONS_FILE), "utf8").includes(PROJECT_LESSON));
        assert.equal(readFileSync(join(b.project, "AGENTS.md"), "utf8"), "# Project rules\n");
    });
    it("refuses Junie when only the legacy guidelines exist, and writes nothing", () => {
        const b = box();
        mkdirSync(join(b.project, ".junie"), { recursive: true });
        writeFileSync(join(b.project, ".junie", "guidelines.md"), "legacy\n");
        const before = tree(b.root);
        const out = run(b, ["--format", "junie", "--write"]);
        assert.equal(out.status, 1);
        assert.equal(out.stdout, "");
        assert.match(out.stderr, /guidelines/);
        assert.deepEqual(tree(b.root), before);
    });
    it("puts the Zed block in the first rules file Zed reads, and refuses when there is none", () => {
        const b = box();
        const before = tree(b.root);
        const none = run(b, ["--format", "zed", "--write"]);
        assert.equal(none.status, 1);
        assert.equal(none.stdout, "");
        assert.match(none.stderr, /--scope user/);
        assert.deepEqual(tree(b.root), before);
        writeFileSync(join(b.project, "AGENTS.md"), "# Project rules\n");
        writeFileSync(join(b.project, "CLAUDE.md"), "# Claude rules\n");
        // A .clinerules directory is not a file, so Zed skips it.
        mkdirSync(join(b.project, ".clinerules"), { recursive: true });
        assert.equal(run(b, ["--format", "zed", "--write"]).status, 0);
        const agents = readFileSync(join(b.project, "AGENTS.md"), "utf8");
        assert.ok(agents.startsWith("# Project rules\n") && agents.includes(LESSONS_BEGIN) && agents.includes(PROJECT_LESSON));
        assert.equal(readFileSync(join(b.project, "CLAUDE.md"), "utf8"), "# Claude rules\n");
    });
    it("writes the Goose block in the project's .goosehints with no env step, and Aider's file with its read: step", () => {
        const b = box();
        const goose = run(b, ["--format", "goose", "--write"]);
        assert.equal(goose.status, 0, goose.stderr);
        assert.ok(!goose.stdout.includes("GOOSE_MOIM_MESSAGE_FILE"), goose.stdout);
        const hints = readFileSync(join(b.project, ".goosehints"), "utf8");
        assert.ok(hints.includes(LESSONS_BEGIN) && hints.includes(PROJECT_LESSON));
        const aider = run(b, ["--format", "aider", "--write"]);
        assert.equal(aider.status, 0, aider.stderr);
        assert.match(aider.stdout, /read:/);
        assert.ok(readFileSync(join(b.project, `.aider.${LESSONS_FILE}`), "utf8").includes(PROJECT_LESSON));
    });
    it("refuses the project scope when the project root is not a directory, and writes nothing", () => {
        const b = box();
        const before = tree(b.root);
        for (const format of STATIC_FORMATS) {
            const out = run(b, ["--format", format, "--write"], { CLAUDE_PROJECT_DIR: join(b.root, "missing") });
            assert.equal(out.status, 1, format);
            assert.equal(out.stdout, "", format);
            assert.match(out.stderr, /--scope user/, format);
        }
        assert.deepEqual(tree(b.root), before);
    });
});
describe("ci lessons --scope user --write", () => {
    it("writes the Grok and Auggie rules files whole", () => {
        const b = box();
        for (const [format, path] of [
            ["grok", join(b.home, ".grok", "rules", LESSONS_FILE)],
            ["auggie", join(b.home, ".augment", "rules", LESSONS_FILE)],
        ]) {
            const out = run(b, ["--format", format, "--scope", "user", "--write"]);
            assert.equal(out.status, 0, out.stderr);
            const written = readFileSync(path, "utf8");
            assert.match(written, /^Notes from continuous-improvement instinct files/);
            assert.ok(written.includes(GLOBAL_LESSON) && !written.includes(PROJECT_LESSON));
            assert.ok(out.stdout.includes(path), out.stdout);
        }
    });
    it("accepts --scope=user", () => {
        const b = box();
        assert.equal(run(b, ["--format", "auggie", "--scope=user", "--write"]).status, 0);
        assert.ok(existsSync(join(b.home, ".augment", "rules", LESSONS_FILE)));
    });
    it("follows GROK_HOME", () => {
        const b = box();
        const grokHome = join(b.home, ".grok-tui");
        const out = run(b, ["--format", "grok", "--scope", "user", "--write"], { GROK_HOME: grokHome });
        assert.equal(out.status, 0, out.stderr);
        assert.ok(existsSync(join(grokHome, "rules", LESSONS_FILE)));
        assert.ok(!existsSync(join(b.home, ".grok")));
    });
    it("merges a managed block into ~/.junie/AGENTS.md, keeps the user's text and is idempotent", () => {
        const b = box();
        const agentsMd = join(b.home, ".junie", "AGENTS.md");
        mkdirSync(join(b.home, ".junie"), { recursive: true });
        writeFileSync(agentsMd, "# My Junie rules\n\nAlways write tests.\n");
        assert.equal(run(b, ["--format", "junie", "--scope", "user", "--write"]).status, 0);
        const first = readFileSync(agentsMd, "utf8");
        assert.ok(first.startsWith("# My Junie rules\n\nAlways write tests.\n"));
        assert.ok(first.includes(LESSONS_BEGIN) && first.includes(LESSONS_END) && first.includes(GLOBAL_LESSON));
        assert.equal(run(b, ["--format", "junie", "--scope", "user", "--write"]).status, 0);
        assert.equal(readFileSync(agentsMd, "utf8"), first);
    });
    it("empties the block when no lesson is left, without touching the user's text", () => {
        const b = box();
        assert.equal(run(b, ["--format", "zed", "--scope", "user", "--write"]).status, 0);
        const zedFile = join(b.home, ".config", "zed", "AGENTS.md");
        const winFile = join(b.home, "AppData", "Roaming", "Zed", "AGENTS.md");
        const path = process.platform === "win32" ? winFile : zedFile;
        writeFileSync(path, `mine\n\n${readFileSync(path, "utf8")}`);
        rmSync(join(b.home, ".claude", "instincts", "global", "build-first.yaml"));
        assert.equal(run(b, ["--format", "zed", "--scope", "user", "--write"]).status, 0);
        assert.equal(readFileSync(path, "utf8"), `mine\n\n${LESSONS_BEGIN}\n${LESSONS_END}\n`);
    });
    it("refuses a broken marker pair and leaves the file as it was", () => {
        const b = box();
        const agentsMd = join(b.home, ".junie", "AGENTS.md");
        mkdirSync(join(b.home, ".junie"), { recursive: true });
        writeFileSync(agentsMd, `${LESSONS_BEGIN}\nuser text after a lost end marker\n`);
        const out = run(b, ["--format", "junie", "--scope", "user", "--write"]);
        assert.equal(out.status, 1);
        assert.match(out.stderr, /lessons block/);
        assert.equal(readFileSync(agentsMd, "utf8"), `${LESSONS_BEGIN}\nuser text after a lost end marker\n`);
    });
    it("tells the user how Goose and Aider load their file", () => {
        const b = box();
        const goose = run(b, ["--format", "goose", "--scope", "user", "--write"]);
        assert.equal(goose.status, 0, goose.stderr);
        assert.match(goose.stdout, /GOOSE_MOIM_MESSAGE_FILE/);
        const aider = run(b, ["--format", "aider", "--scope", "user", "--write"]);
        assert.equal(aider.status, 0, aider.stderr);
        assert.match(aider.stdout, /read:/);
    });
    it("warns that repointing GOOSE_MOIM_MESSAGE_FILE would drop the file it names now", () => {
        const b = box();
        const mine = join(b.home, "my-instructions.md");
        writeFileSync(mine, "Always answer in French.\n");
        const out = run(b, ["--format", "goose", "--scope", "user", "--write"], { GOOSE_MOIM_MESSAGE_FILE: mine });
        assert.equal(out.status, 0, out.stderr);
        assert.ok(out.stdout.includes(mine), out.stdout);
        assert.match(out.stdout, /one file/);
        assert.equal(readFileSync(mine, "utf8"), "Always answer in French.\n");
    });
    it("never writes under ~/.agents, for every route in either scope", () => {
        const b = box();
        for (const format of STATIC_FORMATS) {
            assert.equal(run(b, ["--format", format, "--scope", "user", "--write"]).status, 0, format);
        }
        writeFileSync(join(b.project, "AGENTS.md"), "# Project rules\n");
        for (const format of STATIC_FORMATS) {
            assert.equal(run(b, ["--format", format, "--write"]).status, 0, format);
        }
        assert.ok(!existsSync(join(b.home, ".agents")));
        assert.ok(!existsSync(join(b.project, ".agents")));
    });
    it("refuses a GROK_HOME under ~/.agents and writes nothing", () => {
        const b = box();
        const before = tree(b.root);
        const out = run(b, ["--format", "grok", "--scope", "user", "--write"], { GROK_HOME: join(b.home, ".agents") });
        assert.equal(out.status, 1);
        assert.match(out.stderr, /\.agents/);
        assert.deepEqual(tree(b.root), before);
    });
    it("refuses --write for an agent whose session hook carries the lessons", () => {
        const b = box();
        const before = tree(b.root);
        for (const format of ["claude", "codex", "cursor", "gemini"]) {
            const out = run(b, ["--format", format, "--write"]);
            assert.equal(out.status, 1, format);
            assert.match(out.stderr, /SessionStart/, format);
            assert.equal(out.stdout, "", format);
        }
        assert.deepEqual(tree(b.root), before);
    });
});
describe("ci lessons: bad input fails closed", () => {
    for (const [name, args] of [
        ["no --format", []],
        ["--format with no value", ["--format"]],
        ["an empty --format=", ["--format="]],
        ["an unknown format", ["--format", "unknown"]],
        ["a format in the wrong case", ["--format", "Grok", "--write"]],
        ["an unknown flag", ["--format", "grok", "--wirte"]],
        ["a stray argument", ["--format", "grok", "extra"]],
        ["--scope with no value", ["--format", "grok", "--scope"]],
        ["an empty --scope=", ["--format", "grok", "--scope=", "--write"]],
        ["an unknown scope", ["--format", "grok", "--scope", "global", "--write"]],
        ["a scope in the wrong case", ["--format", "junie", "--scope", "User", "--write"]],
        ["--scope for a hook agent", ["--format", "codex", "--scope", "user"]],
    ]) {
        it(`${name}: exit 1, nothing on stdout, nothing written`, () => {
            const b = box();
            const before = tree(b.root);
            const out = run(b, [...args]);
            assert.equal(out.status, 1, out.stdout);
            assert.equal(out.stdout, "");
            assert.match(out.stderr, /Usage: ci lessons|Unknown lessons format|--scope/);
            assert.deepEqual(tree(b.root), before);
        });
    }
    it("--help and -h print the usage and exit 0, writing nothing", () => {
        const b = box();
        const before = tree(b.root);
        for (const flag of ["--help", "-h"]) {
            const out = run(b, [flag]);
            assert.equal(out.status, 0, out.stderr);
            assert.match(out.stdout, /^Usage: ci lessons --format </);
            assert.equal(out.stderr, "");
        }
        assert.deepEqual(tree(b.root), before);
    });
});
