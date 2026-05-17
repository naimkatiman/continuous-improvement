import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
assert.ok(existsSync(join(REPO_ROOT, "package.json")), `REPO_ROOT sanity check failed — ${REPO_ROOT}/package.json not found`);
const SCRIPT = join(REPO_ROOT, "scripts", "resolve-verify-ladder.mjs");
function runJson(cwd) {
    const result = spawnSync("node", [SCRIPT, "--json", cwd], {
        encoding: "utf8",
    });
    let ladder = null;
    if (result.stdout) {
        try {
            ladder = JSON.parse(result.stdout);
        }
        catch {
            // leave null; caller asserts shape
        }
    }
    return {
        exitCode: result.status ?? -1,
        ladder,
        stderr: (result.stderr ?? "").trim(),
    };
}
function makeTempRepo() {
    return mkdtempSync(join(tmpdir(), "resolve-verify-ladder-test-"));
}
describe("scripts/resolve-verify-ladder.mjs", () => {
    it("returns ask-operator for every field in an empty directory", () => {
        const tmp = makeTempRepo();
        try {
            const out = runJson(tmp);
            assert.equal(out.exitCode, 0, `stderr: ${out.stderr}`);
            assert.ok(out.ladder, "ladder parsed");
            for (const phase of ["build", "typecheck", "lint", "test", "security", "deploy_receipt"]) {
                assert.equal(out.ladder[phase].source, "ask-operator", `${phase} source`);
                assert.equal(out.ladder[phase].command, null, `${phase} command`);
            }
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("sniffs package.json scripts when manifest is absent", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "package.json"), JSON.stringify({
                scripts: {
                    build: "tsc -p tsconfig.json",
                    test: "node --test test/",
                    lint: "eslint .",
                },
            }));
            const out = runJson(tmp);
            assert.equal(out.ladder.build.command, "npm run build");
            assert.match(out.ladder.build.source, /^sniff:package\.json/);
            assert.equal(out.ladder.test.command, "npm test");
            assert.equal(out.ladder.lint.command, "npm run lint");
            assert.equal(out.ladder.typecheck.source, "ask-operator", "no typecheck script → ask");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("prefers verify:<phase> over <phase> when both exist", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "package.json"), JSON.stringify({
                scripts: {
                    test: "node --test test/",
                    "verify:test": "node --test test/ --reporter=spec",
                },
            }));
            const out = runJson(tmp);
            assert.equal(out.ladder.test.command, "npm run verify:test");
            assert.match(out.ladder.test.source, /verify:test/);
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("reads .claude/verify-ladder.json manifest first when present", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
            mkdirSync(join(tmp, ".claude"), { recursive: true });
            writeFileSync(join(tmp, ".claude", "verify-ladder.json"), JSON.stringify({
                build: "make all",
                typecheck: "make typecheck",
                test: null,
            }));
            const out = runJson(tmp);
            assert.equal(out.ladder.build.command, "make all");
            assert.equal(out.ladder.build.source, "manifest");
            assert.equal(out.ladder.typecheck.command, "make typecheck");
            assert.equal(out.ladder.typecheck.source, "manifest");
            // test set to null → skipped at manifest layer
            assert.equal(out.ladder.test.command, null);
            assert.equal(out.ladder.test.source, "manifest:null");
            // lint not in manifest → falls through; no scripts.lint either → ask
            assert.equal(out.ladder.lint.source, "ask-operator");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("ignores underscore-prefixed metadata keys in the manifest", () => {
        const tmp = makeTempRepo();
        try {
            mkdirSync(join(tmp, ".claude"), { recursive: true });
            writeFileSync(join(tmp, ".claude", "verify-ladder.json"), JSON.stringify({
                _doc: ["this is documentation, not a field"],
                _node_example: { build: "ignored" },
                build: "make build",
            }));
            const out = runJson(tmp);
            assert.equal(out.ladder.build.command, "make build");
            assert.equal(out.ladder.build.source, "manifest");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("sniffs Cargo.toml when package.json is absent", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "Cargo.toml"), '[package]\nname = "foo"\nversion = "0.1.0"\n');
            const out = runJson(tmp);
            assert.match(out.ladder.build.command ?? "", /^cargo build/);
            assert.match(out.ladder.build.source, /^sniff:Cargo\.toml/);
            assert.match(out.ladder.test.command ?? "", /^cargo test/);
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("sniffs go.mod when package.json is absent", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "go.mod"), "module example.com/foo\n\ngo 1.22\n");
            const out = runJson(tmp);
            assert.match(out.ladder.build.command ?? "", /^go build/);
            assert.match(out.ladder.build.source, /^sniff:go\.mod/);
            assert.match(out.ladder.test.command ?? "", /^go test/);
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("sniffs pyproject.toml when package.json is absent", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "pyproject.toml"), '[project]\nname = "foo"\n');
            const out = runJson(tmp);
            assert.match(out.ladder.test.command ?? "", /pytest/);
            assert.match(out.ladder.test.source, /^sniff:pyproject\.toml/);
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("default mode (no --json) prints a human-readable fenced block", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
            const result = spawnSync("node", [SCRIPT, tmp], { encoding: "utf8" });
            assert.equal(result.status, 0);
            assert.match(result.stdout, /verify-ladder \(resolved\):/);
            assert.match(result.stdout, /test:.*npm test/);
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
});
