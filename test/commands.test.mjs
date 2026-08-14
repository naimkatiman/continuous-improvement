import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
        assert.match(content, /Law 1/);
    });
    it("isolates an unrelated dirty checkout in a clean worktree", () => {
        const isolation = content.slice(content.indexOf("2. **Select a safe checkout**"), content.indexOf("3. **Reproduce (RED)**"));
        const remoteCollisionIndex = isolation.indexOf("git ls-remote --heads origin refs/heads/<feature-branch>");
        const worktreeAddIndex = isolation.indexOf("git worktree add --no-track");
        assert.match(isolation, /reuse.*only when.*HEAD.*equals.*origin\/<base>/is);
        assert.match(isolation, /do not stash, switch, reset, clean, or copy/i);
        assert.ok(remoteCollisionIndex >= 0 && remoteCollisionIndex < worktreeAddIndex, "remote branch collision check should precede worktree creation");
        assert.match(isolation, /remote command must complete.*return no matching ref.*if either branch exists.*choose another unique name/is);
        assert.match(isolation, /git worktree add --no-track --lock --reason "owner=<session-id>; purpose=\/ship" -b <feature-branch> <worktree-path> origin\/<base>/);
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
        assert.match(content, /origin\/main.*otherwise.*origin\/master/is);
    });
    it("pushes the feature branch explicitly", () => {
        const pushSection = content.slice(content.indexOf("7. **Push and open the PR**"), content.indexOf("8. **Return before stopping**"));
        const collisionIndex = pushSection.indexOf("git ls-remote --heads origin refs/heads/<feature-branch>");
        const pushIndex = pushSection.indexOf("git push -u origin <feature-branch>");
        assert.ok(collisionIndex >= 0 && collisionIndex < pushIndex, "remote branch should be rechecked immediately before push");
        assert.match(pushSection, /require empty output.*push.*without force/is);
        assert.match(pushSection, /remote tip equals local HEAD/);
    });
    it("returns only a clean checkout to the detected default branch", () => {
        const returnSection = content.slice(content.indexOf("8. **Return before stopping**"), content.indexOf("9. **Clean up after the PR merges**"));
        assert.match(returnSection, /return_allowed=true.*clean.*owned by the current session.*not reserved by another task[\s\S]*git switch <base>[\s\S]*git pull --ff-only origin <base>/i);
        assert.match(returnSection, /return_allowed.*false.*leave.*branch.*unchanged/is);
        assert.match(returnSection, /dirty initiating checkout.*leave.*exactly as found/is);
    });
    it("freshly verifies the merge and removes only the named clean worktree", () => {
        const cleanup = content.slice(content.indexOf("9. **Clean up after the PR merges**"), content.indexOf("10. **Deploy receipt"));
        const fetchIndex = cleanup.indexOf("git fetch --prune origin");
        const verifyIndex = cleanup.indexOf("git merge-base --is-ancestor <merge-sha> origin/<base>");
        const ownerGateIndex = cleanup.indexOf("Cleanup may proceed only as the original owner");
        const unlockIndex = cleanup.indexOf("git worktree unlock <worktree-path>");
        const removeIndex = cleanup.indexOf("git worktree remove <worktree-path>");
        assert.ok(fetchIndex >= 0 && fetchIndex < verifyIndex, "post-merge fetch should precede merge verification");
        assert.ok(ownerGateIndex >= 0 && verifyIndex < ownerGateIndex && ownerGateIndex < unlockIndex, "owner or handoff validation should precede unlock");
        assert.ok(verifyIndex < unlockIndex && unlockIndex < removeIndex, "verification and unlock should precede removal");
        assert.match(cleanup, /isolated worktree is clean.*no unpushed commits/is);
        assert.match(cleanup, /original owner.*explicit operator-confirmed handoff/is);
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
