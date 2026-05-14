import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const COMMANDS_DIR = join(__dirname, "..", "commands");

describe("commands/discipline.md", () => {
  let content = "";

  it("exists", () => {
    const path = join(COMMANDS_DIR, "discipline.md");
    assert.ok(existsSync(path), "discipline.md should exist");
    content = readFileSync(path, "utf8");
  });

  it("has valid frontmatter", () => {
    assert.match(content, /^---\r?\n/);
    assert.match(content, /name: discipline/);
    assert.match(content, /description:/);
  });

  it("references all 7 laws", () => {
    assert.match(content, /Research Before Executing/);
    assert.match(content, /Plan Is Sacred/);
    assert.match(content, /One Thing at a Time/);
    assert.match(content, /Verify Before Reporting/);
    assert.match(content, /Reflect After Sessions/);
    assert.match(content, /Iterate One Change/);
    assert.match(content, /Learn From Every Session/);
  });

  it("contains red flags", () => {
    assert.match(content, /I'll just quickly/);
    assert.match(content, /This should work/);
  });

  it("contains the self-check checklist", () => {
    assert.match(content, /Code runs without errors/);
    assert.match(content, /Build passes/);
  });
});

describe("commands/dashboard.md", () => {
  let content = "";

  it("exists", () => {
    const path = join(COMMANDS_DIR, "dashboard.md");
    assert.ok(existsSync(path), "dashboard.md should exist");
    content = readFileSync(path, "utf8");
  });

  it("has valid frontmatter", () => {
    assert.match(content, /^---\r?\n/);
    assert.match(content, /name: dashboard/);
  });

  it("contains dashboard display format", () => {
    assert.match(content, /Dashboard/);
    assert.match(content, /Observations/);
    assert.match(content, /Instincts/);
    assert.match(content, /Health/);
  });

  it("references auto-leveling levels", () => {
    assert.match(content, /CAPTURE/);
    assert.match(content, /ANALYZE/);
    assert.match(content, /beginner|expert/);
  });
});

describe("commands/continuous-improvement.md", () => {
  it("exists", () => {
    const path = join(COMMANDS_DIR, "continuous-improvement.md");
    assert.ok(existsSync(path), "continuous-improvement.md should exist");
  });
});

describe("commands/planning-with-files.md", () => {
  let content = "";

  it("exists", () => {
    const path = join(COMMANDS_DIR, "planning-with-files.md");
    assert.ok(existsSync(path), "planning-with-files.md should exist");
    content = readFileSync(path, "utf8");
  });

  it("has valid frontmatter", () => {
    assert.match(content, /^---\r?\n/);
    assert.match(content, /name: planning-with-files/);
    assert.match(content, /description:/);
  });

  it("references the three planning files and workflow steps", () => {
    assert.match(content, /task_plan\.md/);
    assert.match(content, /findings\.md/);
    assert.match(content, /progress\.md/);
    assert.match(content, /init/i);
    assert.match(content, /status/i);
    assert.match(content, /checkpoint/i);
    assert.match(content, /recover/i);
  });
});

describe("commands/verify-install.md", () => {
  let content = "";

  it("exists", () => {
    const path = join(COMMANDS_DIR, "verify-install.md");
    assert.ok(existsSync(path), "verify-install.md should exist");
    content = readFileSync(path, "utf8");
  });

  it("has valid frontmatter", () => {
    assert.match(content, /^---\r?\n/);
    assert.match(content, /name: verify-install/);
    assert.match(content, /description:/);
  });

  it("walks the three post-install checks in order", () => {
    assert.match(content, /Check 1 — slash commands loaded/);
    assert.match(content, /Check 2 — gateguard runtime hook fires/);
    assert.match(content, /Check 3 — observation capture recording/);
  });

  it("anchors the gateguard check to the actual hook file", () => {
    assert.match(content, /hooks\/gateguard\.mjs/);
  });

  it("requires a single pass/fail summary line", () => {
    assert.match(content, /✓ wired/);
    assert.match(content, /✗ /);
  });
});
