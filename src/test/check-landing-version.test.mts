import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";

const REPO_ROOT = cwd();
const CHECKER = join(REPO_ROOT, "bin", "check-landing-version.mjs");

function landingMarkup(versions: {
  badge: string;
  hero: string;
  current: string;
  footer: string;
}): string {
  return `<!doctype html>
<html>
  <body>
    <span class="ver">v${versions.badge}</span>
    <span class="kicker">SPEC / REV ${versions.hero}</span>
    <span class="v">v${versions.current}</span><span class="k">Current rev</span>
    <span class="foot-doc">DOC / REV ${versions.footer} / MIT</span>
  </body>
</html>
`;
}

function setupRepo(version: string, landing: string): string {
  const root = mkdtempSync(join(tmpdir(), "landing-version-test-"));
  mkdirSync(join(root, "docs", "landing"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ version }), "utf8");
  writeFileSync(join(root, "docs", "landing", "index.html"), landing, "utf8");
  return root;
}

function runCheckerExpectingFailure(root: string): string {
  try {
    execFileSync("node", [CHECKER, root], { encoding: "utf8" });
  } catch (error) {
    const failure = error as { status?: number; stderr?: string };
    assert.equal(failure.status, 1, `expected exit 1, got ${failure.status}`);
    return failure.stderr ?? "";
  }
  assert.fail("check-landing-version should have exited non-zero");
}

describe("check-landing-version CLI", () => {
  it("passes when every landing marker matches package.json", () => {
    const root = setupRepo(
      "3.20.0",
      landingMarkup({ badge: "3.20.0", hero: "3.20.0", current: "3.20.0", footer: "3.20.0" }),
    );
    try {
      const stdout = execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      assert.match(stdout, /OK landing-version:.*3\.20\.0/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when every landing marker is stale", () => {
    const root = setupRepo(
      "3.20.0",
      landingMarkup({ badge: "3.19.0", hero: "3.19.0", current: "3.19.0", footer: "3.19.0" }),
    );
    try {
      const stderr = runCheckerExpectingFailure(root);
      assert.match(stderr, /FAIL landing-version:/);
      assert.match(stderr, /3\.20\.0/);
      assert.match(stderr, /3\.19\.0/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when landing markers contain mixed versions", () => {
    const root = setupRepo(
      "3.20.0",
      landingMarkup({ badge: "3.20.0", hero: "3.19.0", current: "3.20.0", footer: "3.18.0" }),
    );
    try {
      const stderr = runCheckerExpectingFailure(root);
      assert.match(stderr, /FAIL landing-version:/);
      assert.match(stderr, /mixed|3\.19\.0|3\.18\.0/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when the landing page has no release markers", () => {
    const root = setupRepo("3.20.0", "<!doctype html><html><body>No release metadata</body></html>");
    try {
      const stderr = runCheckerExpectingFailure(root);
      assert.match(stderr, /FAIL landing-version:/);
      assert.match(stderr, /marker|version/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("landing mobile overflow regression", () => {
  it("does not force the hero belt to stay unbroken below 620px", () => {
    const landing = readFileSync(join(REPO_ROOT, "docs", "landing", "index.html"), "utf8");
    const mobileStart = landing.indexOf("@media (max-width: 620px)");
    const styleEnd = landing.indexOf("</style>", mobileStart);

    assert.notEqual(mobileStart, -1, "landing page must keep its 620px mobile breakpoint");
    assert.notEqual(styleEnd, -1, "landing page must contain a closing style tag");

    const mobileCss = landing.slice(mobileStart, styleEnd);
    const globalBeltForcesNowrap =
      /h1\.display\s+\.belt\s*\{[^}]*white-space:\s*nowrap\s*;?[^}]*\}/.test(landing);
    const mobileBeltAllowsWrapping =
      /h1\.display\s+\.belt\s*\{[^}]*white-space:\s*normal\s*;?[^}]*\}/.test(mobileCss);

    assert.ok(
      !globalBeltForcesNowrap || mobileBeltAllowsWrapping,
      "a global nowrap belt must be overridden with white-space: normal at the mobile breakpoint",
    );
  });
});
