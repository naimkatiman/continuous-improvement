import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  findViolations,
  listCommandFiles,
  parseReadmeSlashCommands,
} from "../bin/check-command-count.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-command-count.mjs");

/** Build a README "## Slash commands" section listing the given commands with a count claim. */
function makeReadme(commands: string[], claimedCount: number): string {
  const block = commands.map((c) => `/${c}` + " ".repeat(Math.max(2, 30 - c.length)) + "does a thing").join("\n");
  return [
    "# Title",
    "",
    "## Slash commands",
    "",
    "<details>",
    `<summary><b>All ${claimedCount} commands (Beginner gets every one)</b></summary>`,
    "",
    "Intro prose here.",
    "",
    "```",
    block,
    "```",
    "",
    `All ${claimedCount} ship in the marketplace bundle.`,
    "",
    "</details>",
    "",
    "## Next section",
    "",
    "Other content.",
    "",
  ].join("\n");
}

function setupRepo(commands: string[], readme: string): string {
  const root = mkdtempSync(join(tmpdir(), "command-count-test-"));
  mkdirSync(join(root, "commands"), { recursive: true });
  for (const c of commands) {
    writeFileSync(join(root, "commands", `${c}.md`), `---\nname: ${c}\n---\n# /${c}\n`);
  }
  writeFileSync(join(root, "README.md"), readme);
  return root;
}

describe("check-command-count — unit", () => {
  it("listCommandFiles counts *.md and excludes README.md", () => {
    const root = setupRepo(["alpha", "beta", "gamma"], "noop");
    try {
      writeFileSync(join(root, "commands", "README.md"), "# README\n");
      const names = listCommandFiles(root);
      assert.deepEqual(names, ["alpha", "beta", "gamma"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("parseReadmeSlashCommands extracts listed commands and count claims", () => {
    const parsed = parseReadmeSlashCommands(makeReadme(["alpha", "beta"], 2));
    assert.equal(parsed.hasSection, true);
    assert.deepEqual(parsed.listed.sort(), ["alpha", "beta"]);
    assert.deepEqual(parsed.counts, [2, 2]);
  });

  it("parseReadmeSlashCommands fails closed when there is no Slash commands section", () => {
    const parsed = parseReadmeSlashCommands("# Title\n\n## Other\n\nNo commands here.\n");
    assert.equal(parsed.hasSection, false);
  });

  it("findViolations returns empty array when README matches the shipped set and count", () => {
    const parsed = parseReadmeSlashCommands(makeReadme(["alpha", "beta"], 2));
    assert.deepEqual(findViolations(["alpha", "beta"], parsed), []);
  });

  it("findViolations flags a shipped command missing from the README list", () => {
    const parsed = parseReadmeSlashCommands(makeReadme(["alpha"], 1));
    const v = findViolations(["alpha", "beta"], parsed);
    assert.ok(v.some((s) => /missing/.test(s) && /beta/.test(s)), v.join(" | "));
  });

  it("findViolations flags a listed command that is not shipped", () => {
    const parsed = parseReadmeSlashCommands(makeReadme(["alpha", "ghost"], 2));
    const v = findViolations(["alpha"], parsed);
    assert.ok(v.some((s) => /extra/.test(s) && /ghost/.test(s)), v.join(" | "));
  });

  it("findViolations flags a count claim that does not match the shipped count", () => {
    const parsed = parseReadmeSlashCommands(makeReadme(["alpha", "beta"], 5));
    const v = findViolations(["alpha", "beta"], parsed);
    assert.ok(v.some((s) => /count/.test(s) && /5/.test(s)), v.join(" | "));
  });

  it("findViolations fails closed when there is no Slash commands section", () => {
    const parsed = parseReadmeSlashCommands("# Title\n\nNothing.\n");
    const v = findViolations(["alpha"], parsed);
    assert.ok(v.length > 0 && /section/.test(v[0]), v.join(" | "));
  });

  it("findViolations fails closed when the section lists no commands", () => {
    const parsed = parseReadmeSlashCommands("# Title\n\n## Slash commands\n\nNo list.\n\n## End\n");
    const v = findViolations(["alpha"], parsed);
    assert.ok(v.some((s) => /no .*command/i.test(s)), v.join(" | "));
  });

  it("findViolations fails closed when the section states no count claim", () => {
    const readme = "# Title\n\n## Slash commands\n\n```\n/alpha   does a thing\n```\n\n## End\n";
    const parsed = parseReadmeSlashCommands(readme);
    const v = findViolations(["alpha"], parsed);
    assert.ok(v.some((s) => /count claim/i.test(s)), v.join(" | "));
  });
});

describe("check-command-count — integration", () => {
  it("CLI exits 0 when the README lists every shipped command with the right count", () => {
    const cmds = ["alpha", "beta", "gamma"];
    const root = setupRepo(cmds, makeReadme(cmds, cmds.length));
    try {
      const out = execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      assert.match(out, /OK command-count: README lists all 3 command\(s\)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CLI exits 1 and names the command missing from the README list", () => {
    const root = setupRepo(["alpha", "beta", "gamma"], makeReadme(["alpha", "beta"], 2));
    try {
      let exited = false;
      try {
        execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      } catch (err) {
        exited = true;
        const e = err as { status?: number; stderr?: string };
        assert.equal(e.status, 1, `expected exit 1, got ${e.status}`);
        assert.match(e.stderr ?? "", /FAIL command-count/);
        assert.match(e.stderr ?? "", /gamma/);
      }
      assert.ok(exited, "CLI should have exited non-zero when a command is unlisted");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("verifies the live repo lists every shipped command", () => {
    const out = execFileSync("node", [CHECKER, REPO_ROOT], { encoding: "utf8" });
    assert.match(out, /OK command-count:/);
  });
});
