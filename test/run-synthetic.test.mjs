import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
assert.ok(existsSync(join(REPO_ROOT, "package.json")), `REPO_ROOT sanity check failed — ${REPO_ROOT}/package.json not found`);
const SCRIPT = join(REPO_ROOT, "scripts", "run-synthetic.mjs");
function setupFixture(files) {
    const root = mkdtempSync(join(tmpdir(), "run-synthetic-"));
    for (const file of files) {
        writeFileSync(join(root, file.name), file.contents);
    }
    return root;
}
function run(args, env = {}) {
    const result = spawnSync("node", [SCRIPT, ...args], {
        encoding: "utf8",
        env: { ...process.env, ...env },
    });
    return {
        exit: result.status ?? -1,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}
// Reusable fixture content strings.
const PASS_MJS = `#!/usr/bin/env node\nprocess.exit(0);\n`;
const FAIL_MJS_B = `#!/usr/bin/env node\nconsole.log("drift on /b: production has key x=1, baseline has key x=2");\nprocess.exit(1);\n`;
const CONFIG_ERR_MJS = `#!/usr/bin/env node\nconsole.error("configuration error: STAGING_URL not set");\nprocess.exit(2);\n`;
const ENV_CHECK_MJS = `#!/usr/bin/env node\nif (!process.env.BASE_URL || !process.env.BASELINE_URL) {\n  console.error("configuration error: BASE_URL and BASELINE_URL must both be set");\n  process.exit(2);\n}\nif (process.env.BASE_URL === "https://example.test" && process.env.BASELINE_URL === "https://example.test") {\n  process.exit(0);\n}\nconsole.log(\`env mismatch: BASE_URL=\${process.env.BASE_URL}, BASELINE_URL=\${process.env.BASELINE_URL}\`);\nprocess.exit(1);\n`;
const SLOW_MJS = `#!/usr/bin/env node\nawait new Promise((r) => setTimeout(r, 5000));\nprocess.exit(0);\n`;
describe("run-synthetic — directory walk and aggregation", () => {
    it("exits 0 on an empty directory (no *.synthetic.* files)", () => {
        const root = setupFixture([]);
        try {
            const { exit, stdout } = run(["--dir", root]);
            assert.equal(exit, 0, `expected exit 0, got ${exit}`);
            assert.match(stdout, /0 check/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("exits 0 when every check exits 0", () => {
        const root = setupFixture([
            { name: "a.synthetic.mjs", contents: PASS_MJS },
            { name: "b.synthetic.mjs", contents: PASS_MJS },
        ]);
        try {
            const { exit, stdout } = run(["--dir", root]);
            assert.equal(exit, 0, `expected exit 0, got ${exit}`);
            assert.match(stdout, /2 (pass|check)/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("exits 1 on the mixed fixture (one pass, one drift, one config error — drift dominates)", () => {
        const root = setupFixture([
            { name: "a.synthetic.mjs", contents: PASS_MJS },
            { name: "b.synthetic.mjs", contents: FAIL_MJS_B },
            { name: "c.synthetic.mjs", contents: CONFIG_ERR_MJS },
        ]);
        try {
            const { exit, stdout, stderr } = run(["--dir", root]);
            assert.equal(exit, 1, `expected exit 1, got ${exit}`);
            const combined = stdout + stderr;
            assert.match(combined, /b\.synthetic\.mjs/, "expected the drifting file to be named");
            assert.match(combined, /drift on \/b/, "expected the drift diff to be surfaced verbatim");
            assert.match(combined, /c\.synthetic\.mjs/, "expected the config-error file to be named");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("exits 2 when every check is a config error and zero are drift", () => {
        const root = setupFixture([
            { name: "a.synthetic.mjs", contents: CONFIG_ERR_MJS },
            { name: "b.synthetic.mjs", contents: CONFIG_ERR_MJS },
        ]);
        try {
            const { exit } = run(["--dir", root]);
            assert.equal(exit, 2, `expected exit 2 (config error), got ${exit}`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("exits 0 with a skipped warning when the directory does not exist", () => {
        const phantom = join(tmpdir(), `run-synthetic-phantom-${Date.now()}`);
        const { exit, stdout, stderr } = run(["--dir", phantom]);
        assert.equal(exit, 0, `expected exit 0 for missing dir, got ${exit}`);
        assert.match(stdout + stderr, /skipped/i);
    });
});
describe("run-synthetic — env injection", () => {
    it("forwards BASE_URL and BASELINE_URL to children", () => {
        const root = setupFixture([
            { name: "a.synthetic.mjs", contents: ENV_CHECK_MJS },
        ]);
        try {
            const { exit } = run(["--dir", root], {
                BASE_URL: "https://example.test",
                BASELINE_URL: "https://example.test",
            });
            assert.equal(exit, 0, `expected exit 0 when env matches expected`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("aggregator exits 2 when checks self-report config errors (env-check exits 2 on missing required env)", () => {
        const root = setupFixture([
            { name: "a.synthetic.mjs", contents: ENV_CHECK_MJS },
        ]);
        try {
            const env = { ...process.env };
            delete env.BASE_URL;
            delete env.BASELINE_URL;
            const result = spawnSync("node", [SCRIPT, "--dir", root], {
                encoding: "utf8",
                env,
            });
            assert.equal(result.status, 2, `expected exit 2, got ${result.status}`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
describe("run-synthetic — unknown extensions", () => {
    it("skips files with unrecognized extensions and runs the rest", () => {
        const root = setupFixture([
            { name: "a.synthetic.mjs", contents: PASS_MJS },
            { name: "b.synthetic.rb", contents: "# ruby placeholder\nexit 0\n" },
        ]);
        try {
            const { exit, stdout, stderr } = run(["--dir", root]);
            assert.equal(exit, 0, `expected exit 0, got ${exit}`);
            const combined = stdout + stderr;
            assert.match(combined, /b\.synthetic\.rb/i, "expected the .rb file to be named in output");
            assert.match(combined, /skip|unknown extension/i, "expected a skip/unknown-extension signal in output");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
describe("run-synthetic — flags", () => {
    it("--json emits a structured report instead of human text", () => {
        const root = setupFixture([
            { name: "a.synthetic.mjs", contents: PASS_MJS },
            { name: "b.synthetic.mjs", contents: FAIL_MJS_B },
            { name: "c.synthetic.mjs", contents: CONFIG_ERR_MJS },
        ]);
        try {
            const { exit, stdout } = run(["--dir", root, "--json"]);
            assert.equal(exit, 1, `expected exit 1 (mixed has drift), got ${exit}`);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.summary.pass, 1, "summary.pass");
            assert.equal(parsed.summary.fail, 1, "summary.fail");
            assert.equal(parsed.summary.configError, 1, "summary.configError");
            assert.equal(parsed.summary.total, 3, "summary.total");
            assert.equal(parsed.checks.length, 3, "checks length");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("--fail-fast halts on the first failing check", () => {
        const root = setupFixture([
            { name: "a.synthetic.mjs", contents: PASS_MJS },
            { name: "b.synthetic.mjs", contents: FAIL_MJS_B },
            { name: "c.synthetic.mjs", contents: CONFIG_ERR_MJS },
        ]);
        try {
            const { exit, stdout } = run(["--dir", root, "--fail-fast", "--json"]);
            assert.equal(exit, 1, "expected exit 1 (drift)");
            const parsed = JSON.parse(stdout);
            const failIdx = parsed.checks.findIndex((c) => c.status === "fail");
            assert.ok(failIdx >= 0, "expected at least one fail entry");
            const after = parsed.checks.slice(failIdx + 1);
            for (const c of after) {
                assert.match(c.status, /skipped/, `expected files after first fail to be skipped — got ${c.status}`);
            }
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("--show-command prints the interpreter map and exits 0 without executing", () => {
        const root = setupFixture([
            { name: "b.synthetic.mjs", contents: FAIL_MJS_B },
        ]);
        try {
            const { exit, stdout } = run(["--show-command", "--dir", root]);
            assert.equal(exit, 0, "expected exit 0");
            assert.match(stdout, /\.mjs\s*->\s*node/);
            assert.match(stdout, /\.sh\s*->\s*bash/);
            assert.doesNotMatch(stdout, /drift on \/b/, "should not have executed the check");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("exits 3 on a usage error (unknown flag)", () => {
        const { exit } = run(["--bogus"]);
        assert.equal(exit, 3, `expected exit 3 for unknown flag, got ${exit}`);
    });
});
describe("run-synthetic — timeout", () => {
    it("--timeout kills a check that exceeds the wall-clock cap", () => {
        const root = setupFixture([
            { name: "slow.synthetic.mjs", contents: SLOW_MJS },
        ]);
        try {
            const { exit, stdout } = run(["--dir", root, "--timeout", "1", "--json"]);
            assert.equal(exit, 1, "expected exit 1 (timeout maps to drift)");
            const parsed = JSON.parse(stdout);
            const slow = parsed.checks.find((c) => c.file.endsWith("slow.synthetic.mjs"));
            assert.ok(slow, "expected slow.synthetic.mjs in checks");
            assert.equal(slow.status, "timeout", `expected status 'timeout', got '${slow.status}'`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
