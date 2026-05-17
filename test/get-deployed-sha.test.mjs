import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
assert.ok(existsSync(join(REPO_ROOT, "package.json")), `REPO_ROOT sanity check failed — ${REPO_ROOT}/package.json not found`);
const SCRIPT = join(REPO_ROOT, "scripts", "get-deployed-sha.sh").replace(/\\/g, "/");
const SKIP_REASON = (() => {
    const probe = spawnSync("bash", ["-c", "exit 0"], { stdio: "ignore" });
    if (probe.status !== 0 || probe.error)
        return "bash not available on PATH";
    return false;
})();
function runScript(args) {
    const result = spawnSync("bash", [SCRIPT, ...args], {
        cwd: REPO_ROOT,
        encoding: "utf8",
    });
    return {
        exitCode: result.status ?? -1,
        stdout: (result.stdout ?? "").trim(),
        stderr: (result.stderr ?? "").trim(),
    };
}
describe("scripts/get-deployed-sha.sh", { skip: SKIP_REASON }, () => {
    it("exits non-zero with a clear error when no provider is given", () => {
        const out = runScript([]);
        assert.notEqual(out.exitCode, 0);
        assert.match(out.stderr, /usage|provider/i);
    });
    it("exits non-zero on an unknown provider", () => {
        const out = runScript(["--show-command", "made-up-provider"]);
        assert.notEqual(out.exitCode, 0);
        assert.match(out.stderr, /unknown|unsupported/i);
    });
    it("--show-command railway prints the railway CLI shape", () => {
        const out = runScript(["--show-command", "railway"]);
        assert.equal(out.exitCode, 0, `stderr: ${out.stderr}`);
        assert.match(out.stdout, /railway status --json/);
        assert.match(out.stdout, /commitHash/);
    });
    it("--show-command cloudflare prints the wrangler CLI shape", () => {
        const out = runScript(["--show-command", "cloudflare"]);
        assert.equal(out.exitCode, 0, `stderr: ${out.stderr}`);
        assert.match(out.stdout, /wrangler deployments list --json/);
        assert.match(out.stdout, /commit_hash/);
    });
    it("--show-command vercel prints the vercel CLI shape", () => {
        const out = runScript(["--show-command", "vercel"]);
        assert.equal(out.exitCode, 0, `stderr: ${out.stderr}`);
        assert.match(out.stdout, /vercel inspect/);
        assert.match(out.stdout, /gitSource\.sha/);
    });
    it("--show-command netlify prints the netlify CLI shape", () => {
        const out = runScript(["--show-command", "netlify"]);
        assert.equal(out.exitCode, 0, `stderr: ${out.stderr}`);
        assert.match(out.stdout, /netlify api listSiteDeploys/);
        assert.match(out.stdout, /commit_ref/);
    });
    it("--show-command fly prints the fly CLI shape", () => {
        const out = runScript(["--show-command", "fly"]);
        assert.equal(out.exitCode, 0, `stderr: ${out.stderr}`);
        assert.match(out.stdout, /fly releases --json/);
        assert.match(out.stdout, /commit_sha/);
    });
});
