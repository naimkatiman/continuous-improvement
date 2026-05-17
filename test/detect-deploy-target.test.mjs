import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
// __dirname at runtime points at the generated .mjs location (`test/`), one
// level under the repo root. Going up one resolves repo root for both the
// generated and the source layout.
const REPO_ROOT = join(__dirname, "..");
assert.ok(existsSync(join(REPO_ROOT, "package.json")), `REPO_ROOT sanity check failed — ${REPO_ROOT}/package.json not found`);
const SCRIPT = join(REPO_ROOT, "scripts", "detect-deploy-target.sh").replace(/\\/g, "/");
const SKIP_REASON = (() => {
    const probe = spawnSync("bash", ["-c", "exit 0"], { stdio: "ignore" });
    if (probe.status !== 0 || probe.error)
        return "bash not available on PATH";
    return false;
})();
function runScript(cwd) {
    const result = spawnSync("bash", [SCRIPT], { cwd, encoding: "utf8" });
    return {
        exitCode: result.status ?? -1,
        stdout: (result.stdout ?? "").trim(),
        stderr: (result.stderr ?? "").trim(),
    };
}
function makeTempRepo() {
    return mkdtempSync(join(tmpdir(), "detect-deploy-target-test-"));
}
describe("scripts/detect-deploy-target.sh", { skip: SKIP_REASON }, () => {
    it("returns 'none' in an empty directory", () => {
        const tmp = makeTempRepo();
        try {
            const out = runScript(tmp);
            assert.equal(out.exitCode, 0);
            assert.equal(out.stdout, "none");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("detects railway via railway.toml", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "railway.toml"), "");
            assert.equal(runScript(tmp).stdout, "railway");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("detects cloudflare via wrangler.toml", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "wrangler.toml"), "");
            assert.equal(runScript(tmp).stdout, "cloudflare");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("detects cloudflare via wrangler.jsonc", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "wrangler.jsonc"), "{}");
            assert.equal(runScript(tmp).stdout, "cloudflare");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("detects vercel via vercel.json", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "vercel.json"), "{}");
            assert.equal(runScript(tmp).stdout, "vercel");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("detects netlify via netlify.toml", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "netlify.toml"), "");
            assert.equal(runScript(tmp).stdout, "netlify");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("detects fly via fly.toml", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "fly.toml"), "");
            assert.equal(runScript(tmp).stdout, "fly");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("prefers railway over later providers when multiple markers exist", () => {
        const tmp = makeTempRepo();
        try {
            writeFileSync(join(tmp, "railway.toml"), "");
            writeFileSync(join(tmp, "vercel.json"), "{}");
            writeFileSync(join(tmp, "fly.toml"), "");
            assert.equal(runScript(tmp).stdout, "railway", "first-match-wins order: railway > cloudflare > vercel > netlify > fly");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it("detects gha-deploy when a .github workflow contains a deploy: job", () => {
        const tmp = makeTempRepo();
        try {
            mkdirSync(join(tmp, ".github", "workflows"), { recursive: true });
            writeFileSync(join(tmp, ".github", "workflows", "release.yml"), "name: release\non:\n  push:\n    branches: [main]\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps: []\n");
            assert.equal(runScript(tmp).stdout, "gha-deploy");
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
});
