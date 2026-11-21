import assert from "node:assert/strict";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const COMMANDS_DIR = join(__dirname, "..", "commands");
const SKILLS_DIR = join(__dirname, "..", "skills");

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

describe("skills/ship.md", () => {
  const path = join(SKILLS_DIR, "ship.md");
  let content = "";

  before(() => {
    assert.ok(existsSync(path), "skills/ship.md should exist");
    content = readFileSync(path, "utf8");
  });

  it("exists", () => {
    assert.ok(content.length > 0, "ship.md should not be empty");
    assert.match(content, /name: ship/);
    assert.match(content, /tier: "1"/);
    assert.match(content, /user-invocable: true/);
    assert.match(content, /disable-model-invocation: true/);
    assert.match(content, /Law 1/);

    const fenceIndents = content
      .split(/\r?\n/)
      .filter((line) => /^\s*```/.test(line))
      .map((line) => line.length - line.trimStart().length);
    assert.equal(fenceIndents.length % 2, 0, "ship skill should have balanced code fences");
    for (let index = 0; index < fenceIndents.length; index += 2) {
      assert.equal(
        fenceIndents[index + 1],
        fenceIndents[index],
        `ship skill fence pair ${index / 2 + 1} should use matching indentation`,
      );
    }
  });

  it("isolates an unrelated dirty checkout in a clean worktree", () => {
    const isolation = content.slice(content.indexOf("2. **Select a safe checkout**"), content.indexOf("3. **Reproduce (RED)**"));
    const remoteCollisionIndex = isolation.indexOf('git ls-remote --heads origin "refs/heads/<feature-branch>"');
    const worktreeAddIndex = isolation.indexOf("git worktree add --no-track");
    assert.match(isolation, /do not stash, switch, reset, clean, or copy/i);
    assert.match(isolation, /always.*isolated.*worktree/is);
    assert.doesNotMatch(isolation, /reuse the initiating checkout only when/i);
    assert.ok(remoteCollisionIndex >= 0 && remoteCollisionIndex < worktreeAddIndex, "remote branch collision check should precede worktree creation");
    assert.match(isolation, /remote command must complete.*return no matching ref.*if either branch exists.*choose another unique name/is);
    assert.match(isolation, /git check-ref-format --branch "<feature-branch>"/);
    assert.match(isolation, /\[a-z0-9\/_-\]\+/);
    assert.match(isolation, /git worktree add --no-track --lock --reason "owner=<session-id>; purpose=\/ship" -b "<feature-branch>" "<worktree-path>" "<base-sha>"/);
    assert.match(isolation, /pinned.*<base-sha>/is);
    assert.match(isolation, /worktree-safety.*lock reason.*current session/is);
    assert.match(isolation, /current harness session ID.*unique.*run token/is);
  });

  it("refreshes and detects the remote default branch without assuming main", () => {
    const fetchIndex = content.indexOf("git fetch --prune origin");
    const remoteHeadIndex = content.indexOf("git ls-remote --symref origin HEAD");
    const localHeadIndex = content.indexOf("refs/remotes/origin/HEAD");
    assert.ok(fetchIndex >= 0, "should fetch origin before selecting the base");
    assert.ok(fetchIndex < remoteHeadIndex, "fetch should precede the live remote HEAD query");
    assert.ok(remoteHeadIndex < localHeadIndex, "live remote HEAD should precede the local symbolic-ref fallback");
    assert.match(content, /remote HEAD commit.*origin\/main.*origin\/master.*exactly one/is);
    assert.match(content, /zero or multiple.*halt/is);
  });

  it("pushes the feature branch explicitly", () => {
    const pushSection = content.slice(content.indexOf("7. **Push and open the PR**"), content.indexOf("8. **Return before stopping**"));
    const collisionIndex = pushSection.indexOf('git ls-remote --heads origin "refs/heads/<feature-branch>"');
    const pushIndex = pushSection.indexOf('git push -u origin "<feature-branch>"');
    assert.ok(collisionIndex >= 0 && collisionIndex < pushIndex, "remote branch should be rechecked immediately before push");
    assert.match(pushSection, /require empty output.*push.*without force/is);
    assert.match(pushSection, /remote tip equals local HEAD/);
    assert.match(pushSection, /gh pr create --base "<base>" --head "<feature-branch>"/);
    assert.match(pushSection, /gh pr view "<pr-number-or-url>" --json baseRefName,headRefName,headRefOid/);
    assert.match(pushSection, /baseRefName.*headRefName.*headRefOid.*local HEAD/is);
  });

  it("returns only a clean checkout to the detected default branch", () => {
    const returnSection = content.slice(content.indexOf("8. **Return before stopping**"), content.indexOf("9. **Clean up after the PR merges**"));
    const finalDecisionIndex = returnSection.indexOf("Freeze the final decision");
    const receiptIndex = returnSection.indexOf("Persist a local cleanup receipt");
    assert.ok(finalDecisionIndex >= 0 && finalDecisionIndex < receiptIndex, "return authorization should be finalized before the receipt is written");
    assert.match(returnSection, /return_allowed=true.*clean.*owned by the current session.*not reserved by another task[\s\S]*git fetch --prune origin[\s\S]*git branch -f "<base>" "origin\/<base>"[\s\S]*git switch "<base>"/i);
    assert.match(content, /authoritative.*lease.*equivalent.*ledger/is);
    assert.match(returnSection, /git branch --track "<base>" "origin\/<base>"[\s\S]*git switch "<base>"/);
    assert.doesNotMatch(returnSection, /git switch "<base>"[\s\S]*git pull/);
    assert.match(returnSection, /ship-receipts\/<pr-number>\.json/);
    assert.match(returnSection, /PR URL.*base.*base SHA.*feature branch.*feature tip.*worktree path.*owner token.*initiating checkout.*return_allowed/is);
    assert.match(returnSection, /atomic.*read.*back/is);
    assert.match(returnSection, /later drift.*atomically downgrade.*return_allowed=false/is);
    assert.match(returnSection, /after every authorized review-fix commit and push.*remote feature tip.*local HEAD.*same PR.*headRefOid.*atomically replace.*receipt.*feature tip/is);
    assert.match(returnSection, /return_allowed.*false.*leave.*branch.*unchanged/is);
    assert.match(returnSection, /dirty initiating checkout.*leave.*exactly as found/is);
  });

  it("freshly verifies the merge and removes only the named clean worktree", () => {
    const cleanup = content.slice(content.indexOf("9. **Clean up after the PR merges**"), content.indexOf("10. **Deploy receipt"));
    const fetchIndex = cleanup.indexOf("git fetch --prune origin");
    const verifyIndex = cleanup.indexOf('git merge-base --is-ancestor "<merge-sha>" "origin/<base>"');
    const ownerGateIndex = cleanup.indexOf("Cleanup may proceed only as the original owner");
    const unlockIndex = cleanup.indexOf('git worktree unlock "<worktree-path>"');
    const removeIndex = cleanup.indexOf('git worktree remove "<worktree-path>"');
    assert.ok(fetchIndex >= 0 && fetchIndex < verifyIndex, "post-merge fetch should precede merge verification");
    assert.ok(ownerGateIndex >= 0 && verifyIndex < ownerGateIndex && ownerGateIndex < unlockIndex, "owner or handoff validation should precede unlock");
    assert.ok(verifyIndex < unlockIndex && unlockIndex < removeIndex, "verification and unlock should precede removal");
    assert.match(cleanup, /isolated worktree is clean.*HEAD equals.*receipt.*feature tip.*headRefOid/is);
    assert.match(cleanup, /original owner.*explicit operator-confirmed handoff/is);
    assert.match(cleanup, /read.*ship-receipts\/<pr-number>\.json.*compare/is);
    assert.match(cleanup, /missing remote feature ref.*expected.*deleted.*branch/is);
    assert.match(cleanup, /if that ref still exists.*tip.*receipt.*feature tip/is);
    assert.match(cleanup, /never.*foreign lock.*stale/is);
    assert.doesNotMatch(cleanup, /git worktree prune/);
    assert.match(content, /never use `git worktree remove --force`/);
  });
});

describe("commands/ship.md", () => {
  const path = join(COMMANDS_DIR, "ship.md");

  it("delegates arguments to the native skill without copying its workflow", () => {
    assert.ok(existsSync(path), "commands/ship.md should exist");
    const content = readFileSync(path, "utf8");

    assert.match(content, /native `ship` skill/);
    assert.match(content, /\$ARGUMENTS/);
    assert.doesNotMatch(content, /git worktree add|git switch <base>|git push/);
  });

  it("refuses to fall through to a project-defined ship skill", () => {
    const content = readFileSync(path, "utf8");

    assert.match(content, /\.claude\/skills\/ship/);
    assert.match(content, /stop and ask/i);
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

  // The default file gate allows a new file, so a Write probe passes on a
  // correct install and leaves the probe file behind. Check 2 must name a
  // shell command the hook denies on a default install, and that deny must
  // be the one the hook really emits.
  it("probes the gateguard with a command a default install denies, and writes no file", () => {
    const check2 = content.split("## Check 2")[1]?.split("## Check 3")[0] ?? "";
    assert.ok(check2, "Check 2 section should exist");
    assert.doesNotMatch(check2, /\.ci-verify-install-probe\.txt/);
    assert.doesNotMatch(check2, /attempt to `Write`/);

    const command = check2.match(/run `([^`]+)` through/)?.[1];
    const reasonPrefix = check2.match(/the reason starts `([^`]+)`/)?.[1];
    assert.ok(command, "Check 2 should name the probe command");
    assert.ok(reasonPrefix, "Check 2 should name the deny reason it counts as the pass");

    const tempHome = mkdtempSync(join(tmpdir(), "ci-verify-install-"));
    try {
      const env: NodeJS.ProcessEnv = { ...process.env, HOME: tempHome, USERPROFILE: tempHome };
      delete env.CI_GATEGUARD_EXCLUDE;
      delete env.CI_GATEGUARD_FILE_GATE;
      for (const tool of ["Bash", "PowerShell"]) {
        const payload: string = JSON.stringify({
          session_id: "verify-install-probe",
          hook_event_name: "PreToolUse",
          tool_name: tool,
          tool_input: { command },
        });
        const result: SpawnSyncReturns<string> = spawnSync(process.execPath, [join(__dirname, "..", "hooks", "gateguard.mjs")], {
          input: payload,
          encoding: "utf8",
          env,
        });
        assert.equal(result.status, 0, result.stderr);
        const output = JSON.parse(result.stdout) as {
          hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
        };
        assert.equal(output.hookSpecificOutput.permissionDecision, "deny", `${tool} probe should be denied`);
        assert.ok(
          output.hookSpecificOutput.permissionDecisionReason.startsWith(reasonPrefix),
          `${tool} deny reason should start with ${reasonPrefix}`,
        );
      }
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("tells an unwired install what to check and points at a README heading that exists", () => {
    const check2 = content.split("## Check 2")[1]?.split("## Check 3")[0] ?? "";
    assert.match(check2, /node.*PATH/);
    assert.match(check2, /restart Claude Code/i);

    const heading = check2.match(/see README → ([^)`;]+)/)?.[1]?.trim();
    assert.ok(heading, "Check 2 should point the reader at a README heading");
    const readme = readFileSync(join(__dirname, "..", "README.md"), "utf8");
    const headings = readme.split(/\r?\n/).filter((line) => /^#{2,6} /.test(line)).map((line) => line.replace(/^#+ /, "").trim());
    assert.ok(headings.includes(heading), `README.md should have a heading "${heading}"`);
  });
});

// No npm package is named ci-reconcile: it is a bin of the package
// continuous-improvement, so `npx ci-reconcile` 404s on a plugin-only install.
// Claude Code substitutes ${CLAUDE_PLUGIN_ROOT} in command and skill bodies,
// and the plugin bundle carries bin/reconcile.mjs.
describe("reconcile runner invocation", () => {
  const docs = [
    ["commands/reconcile.md", join(COMMANDS_DIR, "reconcile.md")],
    ["skills/reconcile.md", join(SKILLS_DIR, "reconcile.md")],
  ] as const;

  for (const [label, path] of docs) {
    it(`${label} runs the bundled script and names the npm fallback`, () => {
      const body = readFileSync(path, "utf8");
      assert.doesNotMatch(body, /npx ci-reconcile/);
      assert.match(body, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/reconcile\.mjs"/);
      assert.match(body, /npx -p continuous-improvement ci-reconcile/);
    });
  }

  it("no command or skill tells the reader to run npx ci-reconcile", () => {
    for (const dir of [COMMANDS_DIR, SKILLS_DIR]) {
      for (const file of readdirSync(dir).filter((name) => name.endsWith(".md"))) {
        const body = readFileSync(join(dir, file), "utf8");
        assert.doesNotMatch(body, /npx ci-reconcile/, `${file} still says npx ci-reconcile`);
      }
    }
  });

  it("the plugin bundle carries the script the docs name", () => {
    assert.ok(existsSync(join(__dirname, "..", "plugins", "continuous-improvement", "bin", "reconcile.mjs")));
  });
});

// gateguard's file gate defaults to CI_GATEGUARD_FILE_GATE=evidence: a new file
// and a file the session has read are allowed, and only a blind edit of an
// existing file is denied. The fact list on the first edit of every file is
// the strict mode. A line outside the gateguard skill that describes the fact
// list must say it belongs to strict.
describe("docs describe the gateguard file gate default", () => {
  const ROOT = join(__dirname, "..");
  const OLD_GATE =
    /fact[- ]list|fact-forcing|first (edit|mutation) (per|of each|of every) file|first (edit|mutation) until|until (the agent provides|you present|grounding is presented|fact-list investigation|concrete investigation|the investigation is presented)|without facts|before grounding/i;

  function scanned(): string[] {
    const files: string[] = [];
    for (const dir of ["commands", "skills"]) {
      for (const name of readdirSync(join(ROOT, dir))) {
        if (name.endsWith(".md") && name !== "gateguard.md") files.push(join(dir, name));
      }
    }
    files.push("llms.txt", "templates/insights-claude-md.md");
    for (const name of ["philosophy.md", "skill-use-cases.md", "skills.md", "using-this-plugin.md"]) {
      files.push(join("docs", name));
    }
    return files;
  }

  it("names CI_GATEGUARD_FILE_GATE=strict wherever it describes the fact-list gate", () => {
    const stale: string[] = [];
    for (const rel of scanned()) {
      const lines = readFileSync(join(ROOT, rel), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/gateguard/.test(line) && OLD_GATE.test(line) && !line.includes("CI_GATEGUARD_FILE_GATE=strict")) {
          stale.push(`${rel}:${index + 1}`);
        }
      });
    }
    assert.deepEqual(stale, []);
  });
});
