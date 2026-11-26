import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

describe("community files", () => {
  it("CONTRIBUTING.md exists and has content", () => {
    const path = join(ROOT, "CONTRIBUTING.md");
    assert.ok(existsSync(path));
    const content = readFileSync(path, "utf8");
    assert.ok(content.length > 200);
    assert.match(content, /Contributing/);
    assert.match(content, /npm test/);
  });

  it("CODE_OF_CONDUCT.md exists and has content", () => {
    const path = join(ROOT, "CODE_OF_CONDUCT.md");
    assert.ok(existsSync(path));
    const content = readFileSync(path, "utf8");
    assert.match(content, /Code of Conduct/);
    assert.match(content, /Contributor Covenant/);
  });

  it("SECURITY.md exists and has content", () => {
    const path = join(ROOT, "SECURITY.md");
    assert.ok(existsSync(path));
    const content = readFileSync(path, "utf8");
    assert.match(content, /Security/);
    assert.match(content, /Reporting/i);
    assert.match(content, /Vulnerabilit/i);
  });

  it("LICENSE exists", () => {
    assert.ok(existsSync(join(ROOT, "LICENSE")));
  });
});

describe("llms.txt", () => {
  let content = "";

  it("exists", () => {
    const path = join(ROOT, "llms.txt");
    assert.ok(existsSync(path));
    content = readFileSync(path, "utf8");
  });

  it("contains project name", () => {
    assert.match(content, /continuous-improvement/);
  });

  it("contains install command", () => {
    assert.match(content, /npx continuous-improvement install/);
  });

  it("contains all 7 laws", () => {
    assert.match(content, /Research Before Executing/);
    assert.match(content, /Plan Is Sacred/);
    assert.match(content, /One Thing at a Time/);
    assert.match(content, /Verify Before Reporting/);
    assert.match(content, /Reflect After/);
    assert.match(content, /Iterate One Change/);
    assert.match(content, /Learn From Every Session/);
  });

  it("contains Mulahazah reference", () => {
    assert.match(content, /Mulahazah/);
  });

  it("mentions the planning-with-files workflow", () => {
    assert.match(content, /planning-with-files/i);
    assert.match(content, /task_plan\.md/);
  });

  it("contains links", () => {
    assert.match(content, /github\.com/);
    assert.match(content, /npmjs\.com/);
  });
});

describe("README.md", () => {
  it("mentions the planning workflow", () => {
    const path = join(ROOT, "README.md");
    const content = readFileSync(path, "utf8");
    assert.match(content, /planning-with-files/i);
    assert.match(content, /task_plan\.md/);
    assert.match(content, /ci_plan_init/);
  });
});

describe("GitHub templates", () => {
  it("bug report template exists", () => {
    const path = join(ROOT, ".github", "ISSUE_TEMPLATE", "bug_report.md");
    assert.ok(existsSync(path));
    const content = readFileSync(path, "utf8");
    assert.match(content, /Bug/);
    assert.match(content, /Steps to reproduce/);
  });

  it("feature request template exists", () => {
    const path = join(ROOT, ".github", "ISSUE_TEMPLATE", "feature_request.md");
    assert.ok(existsSync(path));
    const content = readFileSync(path, "utf8");
    assert.match(content, /Feature/);
    assert.match(content, /law/i);
  });

  it("CI workflow exists", () => {
    const path = join(ROOT, ".github", "workflows", "ci.yml");
    assert.ok(existsSync(path));
    const content = readFileSync(path, "utf8");
    assert.match(content, /node --test\b[^\n]*test\/\*\.test\.mjs/);
    assert.match(content, /node-version/);
  });
});

describe("action.yml (GitHub Action)", () => {
  let content = "";

  it("exists", () => {
    const path = join(ROOT, "action.yml");
    assert.ok(existsSync(path));
    content = readFileSync(path, "utf8");
  });

  it("has required fields", () => {
    assert.match(content, /name:/);
    assert.match(content, /description:/);
    assert.match(content, /runs:/);
    assert.match(content, /using:/);
  });

  it("references lint-transcript.mjs", () => {
    assert.match(content, /lint-transcript\.mjs/);
  });

  it("has inputs defined", () => {
    assert.match(content, /inputs:/);
    assert.match(content, /transcript-path/);
    assert.match(content, /strict/);
  });

  it("has outputs defined", () => {
    assert.match(content, /outputs:/);
    assert.match(content, /violations/);
    assert.match(content, /score/);
  });
});
