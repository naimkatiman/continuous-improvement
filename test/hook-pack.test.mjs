/**
 * Tests for the enforcing-hook pack (v1): push-to-main + commit-size PreToolUse gates.
 *
 * Pure gate logic lives in src/lib/hook-pack-gate.mts (importable here — the
 * test-imports-only invariant forbids importing from hooks/). The runtime hook
 * src/hooks/hook-pack.mts is exercised by spawning the built hooks/hook-pack.mjs
 * over stdin, mirroring gateguard-hook.test.mts.
 *
 * Plan: docs/plans/2026-06-17-enforcing-hook-pack.md
 */
import { spawnSync, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { parseMode, classifyCommand, isProtectedBranch, evaluatePush, evaluateCommitSize, decide, COMMIT_FILE_LIMIT, } from "../lib/hook-pack-gate.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const HOOK_PATH = join(REPO_ROOT, "hooks", "hook-pack.mjs");
function runHook(toolName, toolInput, mode, cwd) {
    const payload = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
    const env = { ...process.env };
    if (mode === undefined)
        delete env.CLAUDE_CI_HOOKPACK_GATE;
    else
        env.CLAUDE_CI_HOOKPACK_GATE = mode;
    const result = spawnSync(process.execPath, [HOOK_PATH], {
        input: payload,
        encoding: "utf8",
        env,
        cwd,
    });
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    const stdout = result.stdout.trim();
    if (stdout === "")
        return { decision: "allow", stderr: result.stderr };
    const parsed = JSON.parse(stdout);
    const out = parsed.hookSpecificOutput;
    assert.equal(out?.hookEventName, "PreToolUse", "deny output names the hook event");
    assert.equal(out?.permissionDecision, "deny", "non-empty output must be a deny");
    return { decision: "block", reason: out?.permissionDecisionReason, stderr: result.stderr };
}
describe("hook-pack-gate: parseMode", () => {
    it("defaults to warn when unset, empty, or unrecognized", () => {
        assert.equal(parseMode(undefined), "warn");
        assert.equal(parseMode(""), "warn");
        assert.equal(parseMode("garbage"), "warn");
    });
    it("recognizes warn/block/off case-insensitively", () => {
        assert.equal(parseMode("warn"), "warn");
        assert.equal(parseMode("BLOCK"), "block");
        assert.equal(parseMode(" off "), "off");
    });
});
describe("hook-pack-gate: classifyCommand", () => {
    it("classifies git push / commit at command position", () => {
        assert.equal(classifyCommand("git push origin main"), "push");
        assert.equal(classifyCommand("  git push"), "push");
        assert.equal(classifyCommand("git commit -m x"), "commit");
        assert.equal(classifyCommand("git add . && git commit -m x"), "commit");
    });
    it("returns other for unrelated commands and non-command mentions", () => {
        assert.equal(classifyCommand("npm test"), "other");
        assert.equal(classifyCommand("git status"), "other");
        assert.equal(classifyCommand("echo git push"), "other");
        assert.equal(classifyCommand(""), "other");
    });
    // Windows PowerShell 5.1 has no && operator: the chain is written
    // `A; if ($?) { B }`, which puts B after `{`. An assignment, a try block, a
    // parenthesis and the call operator hide the command word the same way.
    it("classifies git push / commit inside a PowerShell block, assignment or call", () => {
        assert.equal(classifyCommand("npm test; if ($?) { git push origin main }"), "push");
        assert.equal(classifyCommand("if ($LASTEXITCODE -eq 0) { git push origin main }"), "push");
        assert.equal(classifyCommand("git add README.md; git commit -m x; if ($?) { git push origin main }"), "push");
        assert.equal(classifyCommand("$out = git push origin main"), "push");
        assert.equal(classifyCommand("try { git push origin main } catch { }"), "push");
        assert.equal(classifyCommand("(git push origin main)"), "push");
        assert.equal(classifyCommand("if ($?) { git commit -m x }"), "commit");
        assert.equal(classifyCommand("$r = git commit -m x"), "commit");
    });
    it("classifies git spelled git.exe or by path, with the call operator", () => {
        assert.equal(classifyCommand("git.exe push origin main"), "push");
        assert.equal(classifyCommand("& 'C:\\Program Files\\Git\\cmd\\git.exe' push origin main"), "push");
        assert.equal(classifyCommand('& "C:\\Program Files\\Git\\cmd\\git.exe" commit -m x'), "commit");
        assert.equal(classifyCommand("/usr/bin/git push origin main"), "push");
    });
    it("still returns other when git is an argument or part of another word", () => {
        assert.equal(classifyCommand("Write-Output git push"), "other");
        assert.equal(classifyCommand("legit push origin main"), "other");
        assert.equal(classifyCommand("if ($?) { git status }"), "other");
    });
});
// f18b752 let `(` and `{` start a command, but the command was still found by a
// regex over the raw text. A push that is only mentioned (in a commit message,
// a PR body, a quoted string, a heredoc note) was read as a push, and the
// commit that carried the message lost its commit-size check.
describe("hook-pack-gate: text that is data is not a push", () => {
    const prose = [
        ['git commit -m "docs: note (git push origin main is blocked by hook-pack)"', "commit"],
        ["git commit -m 'docs: (git push origin main) is blocked'", "commit"],
        ['git commit -m "feat(hook-pack): gate {git push} inside script blocks"', "commit"],
        ['git commit -m "ci: run tests before (git push) in the release script"', "commit"],
        ['git commit -am "wip (git push origin main) later"', "commit"],
        ['git commit -m "x" -m "(git push origin main) is blocked"', "commit"],
        ['git commit -m "$(cat <<\'EOF\'\nfix: x\n\nDo not run (git push origin main) by hand.\nEOF\n)"', "commit"],
        ["git commit -F - <<'EOF'\nfix: x\n\ngit push origin main is no longer part of the release script.\nEOF", "commit"],
        ['gh pr create --title "x" --body "after merge (git push origin main is never needed)"', "other"],
        ['git stash push -m "wip (git push later)"', "other"],
        ['echo "(git push origin main)"', "other"],
        ['echo "{git push origin main}"', "other"],
        ['echo "done; git push origin main is next"', "other"],
        ['echo "{\\"note\\": \\"(git push origin main)\\"}"', "other"],
        ['Write-Host "Next: (git push origin main)"', "other"],
        ["cat > NOTES.md <<'EOF'\n- (git push origin main) is blocked by hook-pack\nEOF", "other"],
        ["$body = @'\nline one\ndrop the table of contents (git push origin main later)\n'@\nSet-Content notes.md $body", "other"],
    ];
    for (const [command, expected] of prose) {
        it(`reads as ${expected}: ${JSON.stringify(command)}`, () => {
            assert.equal(classifyCommand(command), expected);
        });
    }
    // Under the PowerShell tool the escape character is the backtick, and a
    // backslash before a quote is the end of a Windows path.
    it("reads a PowerShell string with backtick-escaped quotes as prose", () => {
        assert.equal(classifyCommand('Write-Host "say `"(git push origin main)`" later"', "PowerShell"), "other");
        assert.equal(classifyCommand('Set-Location "C:\\repo\\"; git push origin main', "PowerShell"), "push");
    });
    const real = [
        'git commit -m "x" && (git push origin main)',
        'git commit -m "docs: (git push) note"; if ($?) { git push origin main }',
        'echo "pushing"; git push origin main',
        "(git push origin main)",
        "{ git push origin main; }",
        "(cd repo && git push origin main)",
        // git read the way the destructive gate reads it: a global option, and the
        // command line of a shell wrapper.
        "git -C ../wt push origin main",
        "git --no-pager push origin main",
        "git -c http.sslVerify=true push origin main",
        'git -C "my repo" push origin main',
        'bash -c "git push origin main"',
        'powershell -Command "git push origin main"',
        "cmd /c git push origin main",
        // a heredoc body that is itself a script keeps the reach it had
        "bash <<'EOF'\ngit push origin main\nEOF",
    ];
    for (const command of real) {
        it(`still gates the real push in: ${JSON.stringify(command)}`, () => {
            assert.equal(classifyCommand(command), "push");
            assert.equal(evaluatePush(command, "feature/x").gated, true);
        });
    }
    // A comment is data too, and a quote character inside one opens no string:
    // the apostrophe of "don't" must not swallow the lines that follow.
    const afterComment = [
        ["# don't forget to rebase first\ngit push origin main", "Bash"],
        ["git status # it's clean\ngit push origin main", "Bash"],
        ['git fetch origin # the "upstream" remote\ngit push origin main', "Bash"],
        ["# can't skip the tests\ngit push origin main", "PowerShell"],
        ["echo $'it\\'s done'; git push origin main", "Bash"],
        ['echo "# it\'s"; git push origin main', "Bash"],
        ["echo $#; git push origin main", "Bash"],
        ['git commit -m "fix #12: don\'t crash" && git push origin main', undefined],
    ];
    for (const [command, tool] of afterComment) {
        it(`still gates the push after a comment or an odd quote: ${JSON.stringify(command)}`, () => {
            assert.equal(classifyCommand(command, tool), "push");
            assert.equal(evaluatePush(command, "feature/x", tool).gated, true);
        });
    }
    // A one-word commit message written without quotes ends at the separator
    // that follows it: the push after it is a command of its own.
    const afterUnquotedMessage = [
        ["git commit -m wip; git push origin main", "feature/x"],
        ["git commit --message=wip; git push origin main", "feature/x"],
        ["git commit -m wip&&git push origin main", "feature/x"],
        ["git add -A && git commit -m checkpoint; git push", "main"],
    ];
    for (const [command, current] of afterUnquotedMessage) {
        it(`still gates the push after an unquoted one-word message: ${command}`, () => {
            assert.equal(classifyCommand(command), "push");
            assert.deepEqual(evaluatePush(command, current), { gated: true, branch: "main" });
        });
    }
    // The shared reader took a shell keyword for the command word and did not
    // join a line that ends in a backslash to the next one.
    const afterKeywordOrContinuation = [
        "if git diff --quiet; then git push origin main; fi",
        "if npm test; then echo ok; else git push origin main; fi",
        "while ! git push origin main; do sleep 5; done",
        "for r in origin backup; do git push $r main; done",
        "git push \\\n  origin main",
        "git push \\\n  -u \\\n  origin main",
    ];
    for (const command of afterKeywordOrContinuation) {
        it(`still gates the push after a shell keyword or across a backslash continuation: ${JSON.stringify(command)}`, () => {
            assert.equal(classifyCommand(command, "Bash"), "push");
            assert.deepEqual(evaluatePush(command, "feature/x", "Bash"), { gated: true, branch: "main" });
        });
    }
    it("reads a harmless command after a keyword, and prose in a heredoc body, as before", () => {
        assert.equal(classifyCommand("if git diff --quiet; then git status; fi", "Bash"), "other");
        assert.equal(evaluatePush("if npm test; then git push origin feature/x; fi", "main", "Bash").gated, false);
        assert.equal(evaluatePush("git push \\\n  origin feature/x", "feature/x", "Bash").gated, false);
        assert.equal(classifyCommand("cat >> NOTES.md <<'EOF'\nthen git push origin main happens in CI\nEOF", "Bash"), "other");
        // Under PowerShell a backslash that ends a line is the end of a path.
        assert.equal(evaluatePush("Set-Location C:\\repo\\\ngit push origin main", "feature/x", "PowerShell").gated, true);
    });
    it("does not read a comment for pushes", () => {
        assert.equal(classifyCommand("# next: (git push origin main)\necho ok"), "other");
        assert.equal(classifyCommand("echo done # then (git push origin main) by hand"), "other");
        assert.equal(classifyCommand("npm test # a failure here; git push origin main must not run"), "other");
        assert.equal(evaluatePush("git push origin feature/x # then merge; git push origin main happens in CI", "feature/x").gated, false);
        // `#` inside a word is not a comment
        assert.equal(evaluatePush("git push origin feature#1", "main").gated, false);
        assert.equal(classifyCommand("git push origin feature#1"), "push");
    });
    it("reads a PowerShell block comment as a comment, and the push after it as a push", () => {
        assert.equal(classifyCommand("<# then (git push origin main) by hand #>\ngit status", "PowerShell"), "other");
        assert.equal(classifyCommand("<# don't skip #> git push origin main", "PowerShell"), "push");
        assert.equal(evaluatePush("<# don't skip #> git push origin main", "feature/x", "PowerShell").gated, true);
    });
    it("reads --dry-run and --amend from the command they belong to", () => {
        assert.equal(evaluatePush("npm publish --dry-run; git push origin main", "feature/x").gated, true);
        assert.equal(evaluatePush("git push --dry-run origin main && git push origin main", "feature/x").gated, true);
        assert.equal(evaluatePush("git push --dry-run origin main", "main").gated, false);
        assert.equal(evaluateCommitSize('git commit -m "docs: say why --amend is not used"', COMMIT_FILE_LIMIT + 1).gated, true);
        assert.equal(evaluateCommitSize('git commit --amend -m "x"', COMMIT_FILE_LIMIT + 1).gated, false);
    });
});
// The regex this replaced rescanned the rest of a whitespace-free run from
// every `(`, `{`, `;`, `|` and `&`, so 200 KB of minified CSS took seconds and
// 200 KB of `(a` ran past the 30 s hook timeout. Classification is one pass.
describe("hook-pack-gate: classification time on a long run without spaces", () => {
    const css = ".mx-auto{margin-left:auto;margin-right:auto}.block{display:block}.p-4{padding:1rem}";
    const minified = css.repeat(Math.ceil(200_000 / css.length));
    const inputs = [
        ["parentheses as one token", "(a".repeat(100_000)],
        ["separators as one token", "a;b|c&".repeat(34_000)],
        ["minified CSS as one token", minified],
        ["a path as one token", "/usr/local/".repeat(18_000)],
        ["minified CSS in a heredoc", `cat > docs/app.min.css <<'EOF'\n${minified}\nEOF`],
    ];
    for (const [name, command] of inputs) {
        it(`reads 200 KB of ${name} in under a second`, () => {
            const started = performance.now();
            classifyCommand(command);
            evaluatePush(command, "main");
            evaluateCommitSize(command, 0);
            const elapsed = performance.now() - started;
            assert.ok(elapsed < 1000, `took ${elapsed.toFixed(0)} ms for ${command.length} chars`);
        });
    }
});
describe("hook-pack-gate: isProtectedBranch", () => {
    it("treats main/master/release-* as protected", () => {
        assert.equal(isProtectedBranch("main"), true);
        assert.equal(isProtectedBranch("master"), true);
        assert.equal(isProtectedBranch("release/1.0"), true);
    });
    it("treats feature/dev branches as unprotected", () => {
        assert.equal(isProtectedBranch("feature/x"), false);
        assert.equal(isProtectedBranch("develop"), false);
    });
});
describe("hook-pack-gate: evaluatePush", () => {
    it("gates an explicit push to a protected branch regardless of current branch", () => {
        assert.equal(evaluatePush("git push origin main", "feature/x").gated, true);
        assert.equal(evaluatePush("git push -u origin main", "feature/x").gated, true);
        assert.equal(evaluatePush("git push origin HEAD:main", "x").gated, true);
        assert.equal(evaluatePush("git push origin release/1.0", "x").gated, true);
    });
    it("allows an explicit push to a feature branch", () => {
        assert.equal(evaluatePush("git push origin feature/x", "main").gated, false);
    });
    it("falls back to the current branch when no explicit target is given", () => {
        assert.equal(evaluatePush("git push", "main").gated, true);
        assert.equal(evaluatePush("git push", "feature/x").gated, false);
    });
    it("never gates a dry-run push", () => {
        assert.equal(evaluatePush("git push --dry-run origin main", "main").gated, false);
    });
    it("reads the push target inside a PowerShell block and after git.exe", () => {
        assert.equal(evaluatePush("npm test; if ($?) { git push origin main }", "feature/x").gated, true);
        assert.equal(evaluatePush("if ($?) { git push origin main}", "feature/x").gated, true);
        assert.equal(evaluatePush("git.exe push origin main", "feature/x").gated, true);
        assert.equal(evaluatePush("& 'C:\\Program Files\\Git\\cmd\\git.exe' push origin main", "feature/x").gated, true);
        assert.equal(evaluatePush("if ($?) { git push origin feature/x }", "main").gated, false);
        assert.equal(evaluatePush("if ($?) { git push }", "main").gated, true);
    });
});
// The destination used to be the second bare word after `push`, verbatim: HEAD
// was a branch called HEAD, a redirect was a refspec, and a quoted or fully
// qualified name was not the protected name.
describe("hook-pack-gate: the branch a push goes to", () => {
    const gatedOn = (command, current) => evaluatePush(command, current).gated;
    const toCurrentBranch = [
        "git push origin HEAD",
        "git push -u origin HEAD",
        "git push origin @",
        "git push origin +HEAD",
        "git push origin HEAD 2>&1 | tail -3",
        "git push origin 2>&1",
        "git push origin 2>/dev/null",
        "git push origin 2>$null",
        "git push > push.log 2>&1",
        "git push origin # the upstream of this branch",
        'git push origin "$(git branch --show-current)"',
        "git push origin $(git branch --show-current)",
        "git push -u origin $(git rev-parse --abbrev-ref HEAD) 2>&1 | tail -3",
        "git push origin (git branch --show-current)",
        "$r = git push origin HEAD 2>&1",
        "if ($?) { git push origin HEAD }",
        "if ($?) { git push origin $(git branch --show-current) }",
    ];
    for (const command of toCurrentBranch) {
        it(`goes to the current branch: ${command}`, () => {
            assert.equal(gatedOn(command, "main"), true, "on main");
            assert.equal(gatedOn(command, "release/2.0"), true, "on release/2.0");
            assert.equal(gatedOn(command, "feature/x"), false, "on feature/x");
            assert.equal(gatedOn(command, null), false, "branch unknown");
        });
    }
    const toMain = [
        'git push origin "main"',
        "git push origin 'main'",
        "git push origin refs/heads/main",
        "git push origin HEAD:refs/heads/main",
        "git push origin main:refs/heads/main",
        'git push origin "HEAD:main"',
        "git push origin +main",
        "git push origin main >/dev/null 2>&1",
        "git push origin main > push.log",
        "git push -o ci.skip origin main",
        "git push --push-option merge_request.create origin main",
        "git push origin main # ship it",
    ];
    for (const command of toMain) {
        it(`goes to main: ${command}`, () => {
            assert.deepEqual(evaluatePush(command, "feature/x"), { gated: true, branch: "main" });
        });
    }
    const elsewhere = [
        'git push origin "feature/x"',
        "git push origin refs/heads/feature/x",
        "git push origin HEAD:refs/for/main",
        "git push origin refs/tags/main",
        "git push origin feature/x 2> main",
        "git push origin feature/x > main.log",
        "git push origin feature/x # then open a PR against main",
        "git push -o ci.skip origin feature/x",
        "git push origin $branch",
        'git push origin "$(git describe --tags)"',
        // A push inside a group or block keeps its whole argument list: it is not
        // cut at the `{` or `(` of an expansion, which left a bare `git push`.
        "git push ${REMOTE} feature/x",
        "(git push ${REMOTE} feature/x)",
        "{ git push ${REMOTE} feature/x; }",
        "if ($?) { git push $(Get-Remote) feature/x }",
        "x=$(git push ${REMOTE:-origin} feature/x 2>&1)",
        "if ($ok) { git push origin feature/x } else { Write-Host main }",
        "try { git push origin main --dry-run } catch { git checkout main }",
    ];
    for (const command of elsewhere) {
        it(`does not go to a protected branch: ${command}`, () => {
            assert.equal(gatedOn(command, "main"), false);
        });
    }
    // `git -C <dir> push` pushes the branch checked out in <dir>, and
    // `git -C <dir> commit` commits what is staged there. The hook passes a
    // lookup instead of a value so the right directory is asked.
    it("asks for the branch of the directory the push runs in, and only when it is needed", () => {
        const asked = [];
        const lookup = (dirs) => {
            asked.push([...dirs]);
            return dirs.join("|") === "../wt" || dirs.join("|") === "my repo" ? "main" : "feature/x";
        };
        assert.equal(evaluatePush("git -C ../wt push", lookup).gated, true);
        assert.equal(evaluatePush('git -C "my repo" push origin HEAD', lookup).gated, true);
        assert.equal(evaluatePush("git push", lookup).gated, false);
        assert.equal(evaluatePush("git -C ../other push origin HEAD", lookup).gated, false);
        assert.deepEqual(asked, [["../wt"], ["my repo"], [], ["../other"]]);
        assert.equal(evaluatePush("git -C ../wt push origin feature/y", lookup).gated, false);
        assert.equal(evaluatePush("git -C ../other push origin main", lookup).gated, true);
        assert.equal(asked.length, 4, "an explicit branch needs no lookup");
    });
    it("counts the files staged in the directory the commit runs in", () => {
        const staged = (dirs) => (dirs[0] === "../big" ? COMMIT_FILE_LIMIT + 1 : 1);
        assert.equal(evaluateCommitSize("git -C ../big commit -m x", staged).gated, true);
        assert.equal(evaluateCommitSize("git commit -m x", staged).gated, false);
        assert.equal(evaluateCommitSize("git -C ../small commit -m x", staged).gated, false);
        assert.equal(evaluateCommitSize("git -C ../big commit --amend --no-edit", staged).gated, false);
    });
});
// A push that names no branch pushes the branch checked out where the push
// runs. The gate asked for the branch of the hook's own directory, whatever
// the command line did first: a `cd` into another checkout, or a `git checkout
// -b`. A session standing on main was denied every feature-branch push written
// as `cd ../wt && git push -u origin HEAD`, and a push of main from another
// checkout passed.
describe("hook-pack-gate: the directory and the branch a command line sets up before a push", () => {
    // Two checkouts next to the hook's own: ../repo-feat is on feat/x and
    // ../repo-main on main. `main`, `feat/x` and `feat/new` are branch names;
    // anything else handed to `git checkout` is a path.
    const world = (hookBranch) => {
        const asked = [];
        const lookup = (dirs, switchedTo) => {
            asked.push(dirs.join("|") + (switchedTo === undefined ? "" : ` ?${switchedTo}`));
            const last = dirs[dirs.length - 1]?.replace(/\\/g, "/");
            const here = last === undefined ? hookBranch : last.endsWith("repo-feat") ? "feat/x" : last.endsWith("repo-main") ? "main" : null;
            if (here === null)
                return null;
            return switchedTo !== undefined && ["main", "feat/x", "feat/new"].includes(switchedTo) ? switchedTo : here;
        };
        return { asked, lookup };
    };
    const gated = (command, hookBranch, tool = "Bash") => evaluatePush(command, world(hookBranch).lookup, tool).gated;
    const toAFeatureBranch = [
        ["cd ../repo-feat && git push -u origin HEAD", "Bash"],
        ["cd ../repo-feat && git push -q && gh pr create --fill", "Bash"],
        ['cd "../repo-feat" && git push', "Bash"],
        ["cd ../repo-feat; if git diff --quiet; then git push origin HEAD; fi", "Bash"],
        ["pushd ../repo-feat && git push && popd", "Bash"],
        ["(cd ../repo-feat && git push origin HEAD)", "Bash"],
        ['bash -c "cd ../repo-feat && git push"', "Bash"],
        ["cd ../repo-main && cd ../repo-feat && git push", "Bash"],
        ["Set-Location ..\\repo-feat; git push -u origin HEAD", "PowerShell"],
        ["Set-Location -Path ..\\repo-feat; if ($?) { git push }", "PowerShell"],
        ["Push-Location ..\\repo-feat; git push; Pop-Location", "PowerShell"],
        ['git checkout -b feat/new && git commit --allow-empty -m "feat: x" && git push -u origin HEAD', "Bash"],
        ["git checkout -B feat/new origin/main && git push -u origin HEAD", "Bash"],
        ["git switch -c feat/new; git push -u origin HEAD", "Bash"],
        ["git switch --create feat/new; if ($?) { git push -u origin HEAD }", "PowerShell"],
        ["git checkout feat/x && git push", "Bash"],
        ["git switch feat/x && git push origin HEAD", "Bash"],
        ["cd ../repo-main && git checkout -b feat/new && git push -u origin HEAD", "Bash"],
        ["git -C ../repo-main checkout -b feat/new && git -C ../repo-main push -u origin HEAD", "Bash"],
    ];
    for (const [command, tool] of toAFeatureBranch) {
        it(`from a session on main, pushes a feature branch (${tool}): ${command}`, () => {
            assert.equal(gated(command, "main", tool), false);
        });
    }
    const toMain = [
        ["cd ../repo-main && git push origin HEAD", "Bash"],
        ["cd ../repo-main && git push -q 2>&1 | tail -3", "Bash"],
        ["cd ../repo-feat && cd ../repo-main && git push", "Bash"],
        ["(cd ../repo-main && git push)", "Bash"],
        ["Set-Location ..\\repo-main; git push", "PowerShell"],
        ["git checkout main && git pull --ff-only && git push origin HEAD", "Bash"],
        ["git checkout -q main 2>&1 && git push", "Bash"],
        ["git switch main && git push", "Bash"],
        ["git checkout -b feat/new && git checkout main && git push", "Bash"],
        ["git -C ../repo-feat checkout main && git -C ../repo-feat push", "Bash"],
        // The branch was made in this checkout, the push runs in another one.
        ["git checkout -b feat/new && cd ../repo-main && git push", "Bash"],
    ];
    for (const [command, tool] of toMain) {
        it(`from a session on a feature branch, pushes main (${tool}): ${command}`, () => {
            assert.deepEqual(evaluatePush(command, world("feat/x").lookup, tool), { gated: true, branch: "main" });
        });
    }
    it("a cd inside a group ends with the group", () => {
        assert.equal(gated("(cd ../repo-feat && git status) && git push origin HEAD", "main"), true);
        assert.equal(gated("(cd ../repo-main && git status) && git push origin HEAD", "feat/x"), false);
        assert.equal(gated("x=$(cd ../repo-main && git rev-parse HEAD); git push", "feat/x"), false);
        // Braces are the same shell: the directory stays changed after them.
        assert.equal(gated("{ cd ../repo-main; }; git push", "feat/x"), true);
        assert.equal(gated("if (Test-Path ..\\repo-main) { Set-Location ..\\repo-main }; git push", "feat/x", "PowerShell"), true);
    });
    it("a path handed to git checkout is not a branch, and the branch stays what it was", () => {
        assert.equal(gated("git checkout README.md && git push", "main"), true);
        assert.equal(gated("git checkout -- . && git push", "main"), true);
        assert.equal(gated("git checkout main -- package.json && git push", "feat/x"), false);
        assert.equal(gated("git checkout main package.json && git push", "feat/x"), false);
    });
    const unknown = [
        'cd "$REPO" && git push origin HEAD',
        "cd $(git rev-parse --show-toplevel)/../elsewhere && git push",
        "cd - && git push",
        "cd ../repo-main && popd && git push",
        'git checkout "$BRANCH" && git push',
        "git checkout - && git push",
        "git switch - && git push origin HEAD",
        "git checkout --track origin/feat/x && git push",
    ];
    for (const command of unknown) {
        it(`allows when the directory or the branch cannot be read: ${command}`, () => {
            assert.equal(gated(command, "main"), false);
        });
    }
    it("asks for the branch of the directory the command line moved to, with the name a plain checkout gave", () => {
        const moved = world("main");
        evaluatePush("cd ../repo-feat && git push", moved.lookup);
        assert.deepEqual(moved.asked, ["../repo-feat"]);
        const switched = world("feat/x");
        evaluatePush("git checkout main && git push", switched.lookup);
        assert.deepEqual(switched.asked, [" ?main"]);
        const made = world("main");
        evaluatePush("git checkout -b feat/new && git push -u origin HEAD", made.lookup);
        assert.deepEqual(made.asked, [], "a branch made on the line needs no lookup");
        const back = world("main");
        evaluatePush("cd - && git push", back.lookup);
        assert.deepEqual(back.asked, [], "a directory that cannot be named is not looked up");
    });
    it("with a plain value for the current branch, a checkout on the line still decides", () => {
        assert.equal(evaluatePush("git checkout main && git push origin HEAD", "feature/x").gated, true);
        assert.equal(evaluatePush("git checkout -b feat/new && git push -u origin HEAD", "main").gated, false);
        assert.equal(evaluatePush("git checkout feature/y && git push", "main").gated, false);
    });
    it("a plain value is the branch of the hook's own directory, and says nothing about another one", () => {
        assert.equal(evaluatePush("git push origin HEAD", "main").gated, true);
        assert.equal(evaluatePush("cd ../wt && git push origin HEAD", "main").gated, false);
        assert.equal(evaluatePush("git -C ../wt push", "main").gated, false);
        assert.equal(evaluatePush("cd ../wt && git push origin main", "feature/x").gated, true, "a named branch needs no lookup");
    });
    it("counts the files staged in the directory the command line moved to", () => {
        const staged = (dirs) => (dirs[dirs.length - 1] === "../big" ? COMMIT_FILE_LIMIT + 1 : 1);
        assert.equal(evaluateCommitSize("cd ../big && git commit -m x", staged).gated, true);
        assert.equal(evaluateCommitSize("cd ../small && git commit -m x", staged).gated, false);
        assert.equal(evaluateCommitSize("Set-Location ../big; git commit -m x", staged, "PowerShell").gated, true);
        const big = (dirs) => (dirs.length === 0 ? COMMIT_FILE_LIMIT + 1 : 1);
        assert.equal(evaluateCommitSize("cd ../small && git commit -m x", big).gated, false);
        assert.equal(evaluateCommitSize("cd - && git commit -m x", big).gated, false, "an unknown directory is not counted");
    });
});
describe("hook-pack-gate: evaluateCommitSize", () => {
    it("gates a commit staging more than the limit", () => {
        assert.equal(evaluateCommitSize("git commit -m x", COMMIT_FILE_LIMIT + 1).gated, true);
    });
    it("allows a commit at or under the limit", () => {
        assert.equal(evaluateCommitSize("git commit -m x", COMMIT_FILE_LIMIT).gated, false);
        assert.equal(evaluateCommitSize("git commit -m x", 0).gated, false);
    });
    it("never gates an --amend (no new files added)", () => {
        assert.equal(evaluateCommitSize("git commit --amend -m x", 99).gated, false);
    });
});
describe("hook-pack-gate: decide", () => {
    it("off allows everything", () => {
        assert.equal(decide("off", true, "r").action, "allow");
    });
    it("warn warns on a gated action, allows otherwise", () => {
        assert.equal(decide("warn", true, "r").action, "warn");
        assert.equal(decide("warn", false, "r").action, "allow");
    });
    it("block denies a gated action, allows otherwise", () => {
        assert.equal(decide("block", true, "r").action, "block");
        assert.equal(decide("block", false, "r").action, "allow");
    });
});
describe("hooks/hook-pack.mjs (runtime PreToolUse hook)", () => {
    it("is present in the repo", () => {
        assert.ok(existsSync(HOOK_PATH), `expected ${HOOK_PATH} to exist`);
    });
    it("blocks a push to main in block mode", () => {
        const r = runHook("Bash", { command: "git push origin main" }, "block");
        assert.equal(r.decision, "block");
        assert.match(r.reason ?? "", /protected|feature branch|PR/i);
    });
    it("allows a push to a feature branch in block mode", () => {
        assert.equal(runHook("Bash", { command: "git push origin feature/x" }, "block").decision, "allow");
    });
    it("warns (never blocks) on a push to main in warn mode", () => {
        const r = runHook("Bash", { command: "git push origin main" }, "warn");
        assert.equal(r.decision, "allow");
        assert.match(r.stderr, /hook-pack|protected|main/i);
    });
    it("defaults to warn when the env var is unset", () => {
        assert.equal(runHook("Bash", { command: "git push origin main" }, undefined).decision, "allow");
    });
    it("is a no-op in off mode", () => {
        const r = runHook("Bash", { command: "git push origin main" }, "off");
        assert.equal(r.decision, "allow");
        assert.equal(r.stderr.trim(), "");
    });
    it("ignores unrelated Bash commands", () => {
        assert.equal(runHook("Bash", { command: "npm test" }, "block").decision, "allow");
    });
    // The hook hands the tool name to the reader, which picks the escape
    // character by it: the backtick under PowerShell, the backslash under Bash.
    // Read with the wrong one, the escaped quote ends the string early, the next
    // quote opens one that runs to the end of the text, and the push inside it
    // is not seen. With the tool name dropped from the hook's calls every other
    // test still passed.
    it("reads a quote escaped the PowerShell way under the PowerShell tool, and the push after the string", () => {
        const r = runHook("PowerShell", { command: 'Write-Host "a `" b"; git push origin main' }, "block");
        assert.equal(r.decision, "block");
        assert.match(r.reason ?? "", /protected branch "main"/);
        assert.equal(runHook("PowerShell", { command: 'Write-Host "a `" b"; git push origin feature/x' }, "block").decision, "allow");
    });
    it("reads a quote escaped the Bash way under the Bash tool, and the push after the string", () => {
        const r = runHook("Bash", { command: 'echo "a \\" b"; git push origin main' }, "block");
        assert.equal(r.decision, "block");
        assert.match(r.reason ?? "", /protected branch "main"/);
        assert.equal(runHook("Bash", { command: 'echo "a \\" b"; git push origin feature/x' }, "block").decision, "allow");
    });
    it("ignores non-Bash tools", () => {
        assert.equal(runHook("Read", { file_path: "/tmp/x" }, "block").decision, "allow");
    });
});
// Claude Code on Windows exposes a first-class PowerShell tool whose input is
// the same { command } shape as Bash. A `git push` to main is the same push
// through either tool. Each row runs under both tool names: the Bash rows are
// the control, the PowerShell rows are the defect (they were allowed).
describe("hooks/hook-pack.mjs — the PowerShell tool is gated like Bash", () => {
    const shellTools = ["Bash", "PowerShell"];
    const cases = [
        ["git push origin main", "block"],
        ["git push --force origin main", "block"],
        ["git push -u origin HEAD:main", "block"],
        ["git add README.md; git push origin release/1.0", "block"],
        // The Windows PowerShell 5.1 spelling of `A && git push`, and the other
        // forms that put the push after something other than a separator.
        ["npm test; if ($?) { git push origin main }", "block"],
        ["git add README.md; git commit -m x; if ($?) { git push origin main }", "block"],
        ["if ($LASTEXITCODE -eq 0) { git push origin main }", "block"],
        ["$out = git push origin main", "block"],
        ["try { git push origin main } catch { }", "block"],
        ["git.exe push origin main", "block"],
        ["& 'C:\\Program Files\\Git\\cmd\\git.exe' push origin main", "block"],
        ["if ($?) { git push origin feature/x }", "allow"],
        ["git push origin feature/x", "allow"],
        ["git push --dry-run origin main", "allow"],
        ["Get-ChildItem", "allow"],
    ];
    for (const tool of shellTools) {
        for (const [command, expected] of cases) {
            it(`${tool} in block mode: ${expected} for ${command}`, () => {
                const r = runHook(tool, { command }, "block");
                assert.equal(r.decision, expected);
                if (expected === "block")
                    assert.match(r.reason ?? "", /protected branch/);
            });
        }
    }
    // Text that mentions a push, and a push hidden behind a global option or a
    // shell wrapper, through the spawned hook.
    const mentions = [
        'gh pr create --title "x" --body "after merge (git push origin main is never needed)"',
        'echo "(git push origin main)"',
        'Write-Host "Next: (git push origin main)"',
        "cat > NOTES.md <<'EOF'\n- (git push origin main) is blocked by hook-pack\nEOF",
    ];
    const hidden = [
        "# don't forget to rebase first\ngit push origin main",
        "git -C ../wt push origin main",
        'bash -c "git push origin main"',
        'powershell -NoProfile -Command "git push origin main"',
    ];
    for (const tool of shellTools) {
        for (const command of mentions) {
            it(`${tool} in block mode: allow, with no notice, for ${JSON.stringify(command)}`, () => {
                const r = runHook(tool, { command }, "block");
                assert.equal(r.decision, "allow", r.reason ?? "");
                assert.equal(runHook(tool, { command }, "warn").stderr, "");
            });
        }
        for (const command of hidden) {
            it(`${tool} in block mode: block for ${command}`, () => {
                const r = runHook(tool, { command }, "block");
                assert.equal(r.decision, "block");
                assert.match(r.reason ?? "", /protected branch "main"/);
            });
        }
    }
    for (const tool of shellTools) {
        it(`${tool} in warn mode: a push to main is allowed with a stderr notice`, () => {
            const r = runHook(tool, { command: "git push origin main" }, "warn");
            assert.equal(r.decision, "allow");
            assert.match(r.stderr, /\[hook-pack\] Direct push to protected branch "main"/);
        });
    }
});
// Claude Code's Monitor tool takes { command, description, timeout_ms } and runs
// the command in the same shell as Bash (or takes { ws: { url } } and runs no
// command). A `git push` to main is the same push through Monitor. Each row
// runs under both tool names: the Bash rows are the control, the Monitor rows
// are the defect (they were allowed).
describe("hooks/hook-pack.mjs — the Monitor tool is gated like Bash", () => {
    const monitorInput = (command) => ({
        command,
        description: "watch",
        timeout_ms: 60000,
    });
    const cases = [
        ["git push origin main", "block"],
        ["git push --force origin main", "block"],
        ["git push -u origin HEAD:main", "block"],
        ["sleep 30; git push origin main", "block"],
        ['bash -c "git push origin main"', "block"],
        ["git push origin feature/x", "allow"],
        ["git push --dry-run origin main", "allow"],
        ["tail -f build.log", "allow"],
    ];
    for (const tool of ["Bash", "Monitor"]) {
        for (const [command, expected] of cases) {
            it(`${tool} in block mode: ${expected} for ${command}`, () => {
                const r = runHook(tool, monitorInput(command), "block");
                assert.equal(r.decision, expected);
                if (expected === "block")
                    assert.match(r.reason ?? "", /protected branch "main"/);
            });
        }
        it(`${tool} in warn mode: a push to main is allowed with a stderr notice`, () => {
            const r = runHook(tool, monitorInput("git push origin main"), "warn");
            assert.equal(r.decision, "allow");
            assert.match(r.stderr, /\[hook-pack\] Direct push to protected branch "main"/);
        });
    }
    it("a Monitor call with no command (the ws form) is allowed without error or notice", () => {
        const input = { ws: { url: "ws://127.0.0.1:9229" }, description: "watch", timeout_ms: 60000 };
        const blocked = runHook("Monitor", input, "block");
        assert.equal(blocked.decision, "allow");
        assert.equal(blocked.stderr, "");
        assert.equal(runHook("Monitor", input, "warn").stderr, "");
    });
});
describe("hooks/hook-pack.mjs commit-size gate (temp repo)", () => {
    let repo = "";
    function makeRepoWithStaged(count) {
        const dir = mkdtempSync(join(tmpdir(), "hookpack-repo-"));
        const run = (args) => execFileSync("git", args, { cwd: dir, stdio: ["ignore", "ignore", "ignore"] });
        run(["init", "-q"]);
        for (let i = 0; i < count; i += 1) {
            writeFileSync(join(dir, `f${i}.txt`), `${i}\n`);
        }
        run(["add", "-A"]);
        return dir;
    }
    after(() => {
        if (repo)
            rmSync(repo, { recursive: true, force: true });
    });
    it("blocks a commit staging more than 15 files in block mode", () => {
        repo = makeRepoWithStaged(16);
        const r = runHook("Bash", { command: "git commit -m x" }, "block", repo);
        assert.equal(r.decision, "block");
        assert.match(r.reason ?? "", /15|one[- ]concern|split/i);
    });
    it("allows a commit staging 15 files in block mode", () => {
        const dir = makeRepoWithStaged(15);
        try {
            assert.equal(runHook("Bash", { command: "git commit -m x" }, "block", dir).decision, "allow");
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
    it("blocks a PowerShell-tool commit staging more than 15 files in block mode", () => {
        const dir = makeRepoWithStaged(16);
        try {
            const r = runHook("PowerShell", { command: "git commit -m x" }, "block", dir);
            assert.equal(r.decision, "block");
            assert.match(r.reason ?? "", /15|one[- ]concern|split/i);
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
    // The commit-size count gets the tool name too: the commit after a string
    // with a backtick-escaped quote is only found when the reader is told the
    // command is PowerShell.
    it("counts the commit after a PowerShell string with a backtick-escaped quote", () => {
        const dir = makeRepoWithStaged(16);
        try {
            const r = runHook("PowerShell", { command: 'Write-Host "a `" b"; git commit -m x' }, "block", dir);
            assert.equal(r.decision, "block");
            assert.match(r.reason ?? "", /more than 15 files/);
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
    // A commit whose message mentions a push is a commit: the push gate stays out
    // of it and the commit-size gate still runs.
    const pushInMessage = 'git commit -m "docs: note (git push origin main is blocked by hook-pack)"';
    it("allows a small commit whose message mentions a push to main", () => {
        const dir = makeRepoWithStaged(1);
        try {
            for (const tool of ["Bash", "PowerShell"]) {
                const r = runHook(tool, { command: pushInMessage }, "block", dir);
                assert.equal(r.decision, "allow", `${tool}: ${r.reason ?? ""}`);
                assert.equal(r.stderr, "");
            }
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
    it("applies the commit-size gate to an oversized commit whose message mentions a push", () => {
        const dir = makeRepoWithStaged(16);
        try {
            const r = runHook("Bash", { command: pushInMessage }, "block", dir);
            assert.equal(r.decision, "block");
            assert.match(r.reason ?? "", /more than 15 files/);
            const warned = runHook("Bash", { command: pushInMessage }, "warn", dir);
            assert.equal(warned.decision, "allow");
            assert.match(warned.stderr, /more than 15 files/);
            assert.doesNotMatch(warned.stderr, /protected branch/);
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
    it("blocks an oversized commit written as a PowerShell 5.1 conditional chain", () => {
        const dir = makeRepoWithStaged(16);
        try {
            const r = runHook("PowerShell", { command: "git add .; if ($?) { git commit -m x }" }, "block", dir);
            assert.equal(r.decision, "block");
            assert.match(r.reason ?? "", /15|one[- ]concern|split/i);
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
// The hook resolves "the current branch" itself, so these run it inside real
// repositories: one checked out on main, one on a feature branch.
describe("hooks/hook-pack.mjs — the branch a push goes to (temp repos)", () => {
    const repos = [];
    let onMain = "";
    let onFeature = "";
    let manyStaged = "";
    function makeRepoOnBranch(branch, stagedFiles) {
        const dir = mkdtempSync(join(tmpdir(), "hookpack-branch-"));
        const run = (args) => execFileSync("git", args, { cwd: dir, stdio: ["ignore", "ignore", "ignore"] });
        run(["init", "-q"]);
        run(["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
        run(["config", "user.email", "test@example.com"]);
        run(["config", "user.name", "Test"]);
        run(["config", "commit.gpgsign", "false"]);
        run(["commit", "-q", "--allow-empty", "-m", "init"]);
        for (let i = 0; i < stagedFiles; i += 1)
            writeFileSync(join(dir, `f${i}.txt`), `${i}\n`);
        if (stagedFiles > 0)
            run(["add", "-A"]);
        repos.push(dir);
        // Forward slashes: the path goes into a command line for either shell.
        return dir.replace(/\\/g, "/");
    }
    before(() => {
        onMain = makeRepoOnBranch("main", 0);
        onFeature = makeRepoOnBranch("feature/x", 0);
        manyStaged = makeRepoOnBranch("feature/y", 16);
    });
    after(() => {
        for (const dir of repos)
            rmSync(dir, { recursive: true, force: true });
    });
    const toCurrentBranch = [
        "git push",
        "git push 2>&1 | tail -3",
        "git push origin HEAD",
        "git push -u origin HEAD",
        "git push origin HEAD 2>&1 | tail -3",
        "git push origin 2>&1",
        'git push origin "$(git branch --show-current)"',
    ];
    for (const tool of ["Bash", "PowerShell"]) {
        for (const command of toCurrentBranch) {
            it(`${tool} on main: block for ${command}`, () => {
                const r = runHook(tool, { command }, "block", onMain);
                assert.equal(r.decision, "block");
                assert.match(r.reason ?? "", /protected branch "main"/);
            });
            it(`${tool} on a feature branch: allow for ${command}`, () => {
                assert.equal(runHook(tool, { command }, "block", onFeature).decision, "allow");
            });
        }
    }
    for (const command of ['git push origin "main"', "git push origin 'main'", "git push origin refs/heads/main"]) {
        it(`on a feature branch: block for ${command}`, () => {
            const r = runHook("Bash", { command }, "block", onFeature);
            assert.equal(r.decision, "block");
            assert.match(r.reason ?? "", /protected branch "main"/);
        });
    }
    it("git -C <dir> push is judged by the branch checked out in <dir>", () => {
        for (const tool of ["Bash", "PowerShell"]) {
            const intoMain = runHook(tool, { command: `git -C "${onMain}" push` }, "block", onFeature);
            assert.equal(intoMain.decision, "block", `${tool}: a push from the main checkout`);
            assert.match(intoMain.reason ?? "", /protected branch "main"/);
            assert.equal(runHook(tool, { command: `git -C ${onMain} push origin HEAD` }, "block", onFeature).decision, "block");
            assert.equal(runHook(tool, { command: `git -C "${onFeature}" push` }, "block", onMain).decision, "allow", `${tool}: a push from the feature checkout, run while standing in the main one`);
        }
    });
    it("git -C <dir> push with a directory that cannot be read is allowed", () => {
        const r = runHook("Bash", { command: 'git -C "$WORKTREE" push' }, "block", onMain);
        assert.equal(r.decision, "allow");
    });
    it("git -C <dir> commit is judged by what is staged in <dir>", () => {
        const big = runHook("Bash", { command: `git -C "${manyStaged}" commit -m x` }, "block", onFeature);
        assert.equal(big.decision, "block");
        assert.match(big.reason ?? "", /more than 15 files/);
        assert.equal(runHook("Bash", { command: `git -C "${onFeature}" commit -m x` }, "block", manyStaged).decision, "allow");
    });
    // The hook used to ask for the branch of the directory it was started in,
    // whatever the command line did before the push. A session standing on main
    // had every `cd ../wt && git push -u origin HEAD` denied, and the push of
    // main from another checkout passed.
    const enter = (tool, dir) => (tool === "PowerShell" ? `Set-Location "${dir}"; ` : `cd "${dir}" && `);
    for (const tool of ["Bash", "PowerShell"]) {
        it(`${tool}: cd <dir> then push is judged by the branch checked out in <dir>`, () => {
            for (const push of ["git push -u origin HEAD", "git push -q && gh pr create --fill", "git push"]) {
                const command = enter(tool, onFeature) + push;
                assert.equal(runHook(tool, { command }, "block", onMain).decision, "allow", `from main: ${command}`);
            }
            for (const push of ["git push origin HEAD", "git push -q 2>&1 | tail -3", "git push"]) {
                const command = enter(tool, onMain) + push;
                const r = runHook(tool, { command }, "block", onFeature);
                assert.equal(r.decision, "block", `from the feature checkout: ${command}`);
                assert.match(r.reason ?? "", /protected branch "main"/);
            }
        });
    }
    it("a relative cd is resolved against the directory the hook runs in", () => {
        const sibling = (dir) => `../${dir.slice(dir.lastIndexOf("/") + 1)}`;
        assert.equal(runHook("Bash", { command: `cd ${sibling(onFeature)} && git push` }, "block", onMain).decision, "allow");
        assert.equal(runHook("Bash", { command: `cd ${sibling(onMain)} && git push` }, "block", onFeature).decision, "block");
    });
    it("a cd inside a group ends with the group", () => {
        const inGroup = `(cd "${onMain}" && git status) && git push origin HEAD`;
        assert.equal(runHook("Bash", { command: inGroup }, "block", onFeature).decision, "allow");
        const after = `(cd "${onFeature}" && git status); git push`;
        assert.equal(runHook("Bash", { command: after }, "block", onMain).decision, "block");
    });
    it("a branch made on the command line is the branch the push pushes", () => {
        const made = 'git checkout -b feat/new && git commit --allow-empty -m "feat: x" && git push -u origin HEAD';
        assert.equal(runHook("Bash", { command: made }, "block", onMain).decision, "allow");
        const switched = "git switch -c feat/new; if ($?) { git push -u origin HEAD }";
        assert.equal(runHook("PowerShell", { command: switched }, "block", onMain).decision, "allow");
    });
    it("a checkout of an existing branch decides, and a checkout of a path does not", () => {
        // Both branches exist in these two checkouts; one also tracks a file.
        const bothOnMain = makeRepoOnBranch("main", 0);
        const bothOnFeature = makeRepoOnBranch("feature/x", 0);
        const git = (dir, args) => execFileSync("git", args, { cwd: dir, stdio: ["ignore", "ignore", "ignore"] });
        git(bothOnMain, ["branch", "feature/x"]);
        git(bothOnFeature, ["branch", "main"]);
        writeFileSync(join(bothOnMain, "notes.txt"), "notes\n");
        git(bothOnMain, ["add", "notes.txt"]);
        git(bothOnMain, ["commit", "-q", "-m", "notes"]);
        const toMain = runHook("Bash", { command: "git checkout main && git pull --ff-only && git push origin HEAD" }, "block", bothOnFeature);
        assert.equal(toMain.decision, "block");
        assert.match(toMain.reason ?? "", /protected branch "main"/);
        assert.equal(runHook("Bash", { command: "git checkout feature/x && git push" }, "block", bothOnMain).decision, "allow");
        // notes.txt is a file: the checkout restores it and main stays checked out.
        assert.equal(runHook("Bash", { command: "git checkout notes.txt && git push" }, "block", bothOnMain).decision, "block");
        // No branch called main in this checkout: the push pushes feature/x.
        assert.equal(runHook("Bash", { command: "git checkout main && git push" }, "block", onFeature).decision, "allow");
        // The same, in the directory the command line moved to.
        const moved = `cd "${bothOnFeature}" && git checkout main && git push`;
        assert.equal(runHook("Bash", { command: moved }, "block", onFeature).decision, "block");
    });
    it("allows a push when the directory or the branch cannot be read", () => {
        for (const command of [
            'cd "$REPO" && git push origin HEAD',
            "cd - && git push",
            "git worktree add ../not-made-yet -b feat/new && cd ../not-made-yet && git push -u origin HEAD",
            'git checkout "$BRANCH" && git push',
            "git checkout - && git push",
        ]) {
            assert.equal(runHook("Bash", { command }, "block", onMain).decision, "allow", command);
        }
        assert.equal(runHook("PowerShell", { command: "Set-Location $repo; git push" }, "block", onMain).decision, "allow");
    });
    it("cd <dir> then commit is judged by what is staged in <dir>", () => {
        for (const tool of ["Bash", "PowerShell"]) {
            const big = runHook(tool, { command: `${enter(tool, manyStaged)}git commit -m x` }, "block", onFeature);
            assert.equal(big.decision, "block", tool);
            assert.match(big.reason ?? "", /more than 15 files/);
            assert.equal(runHook(tool, { command: `${enter(tool, onFeature)}git commit -m x` }, "block", manyStaged).decision, "allow", tool);
        }
    });
    it("reads the drive path Git Bash writes (/c/dir) as that directory", { skip: process.platform !== "win32" }, () => {
        const msys = (dir) => dir.replace(/^([A-Za-z]):\//, (_match, drive) => `/${drive.toLowerCase()}/`);
        assert.notEqual(msys(onMain), onMain);
        const toMain = runHook("Bash", { command: `cd ${msys(onMain)} && git push origin HEAD` }, "block", onFeature);
        assert.equal(toMain.decision, "block");
        assert.equal(runHook("Bash", { command: `cd ${msys(onFeature)} && git push` }, "block", onMain).decision, "allow");
    });
});
describe("hook-pack registration", () => {
    it("is wired in the plugin bundle PreToolUse hooks, with gateguard still first", () => {
        const hooksJsonPath = join(REPO_ROOT, "plugins", "continuous-improvement", "hooks", "hooks.json");
        assert.ok(existsSync(hooksJsonPath), "plugin-bundle hooks.json should exist");
        const hooksJson = JSON.parse(readFileSync(hooksJsonPath, "utf8"));
        const preToolUse = hooksJson.hooks.PreToolUse ?? [];
        assert.ok(preToolUse.length > 0, "PreToolUse hooks present");
        assert.match(preToolUse[0].hooks[0].command, /gateguard\.mjs/, "gateguard must remain the first PreToolUse hook");
        const commands = preToolUse.flatMap((entry) => entry.hooks.map((h) => h.command));
        assert.ok(commands.some((c) => /hook-pack\.mjs/.test(c)), "hook-pack must be registered in PreToolUse");
    });
    it("bundles the hook-pack-gate lib core the bundled hook imports", () => {
        // The bundled hooks/hook-pack.mjs imports ../lib/hook-pack-gate.mjs; if the
        // generator's copyFileTo list omits it, the installed plugin's hook crashes
        // at runtime even though repo-root tests pass. Pin the bundle copy.
        const bundledLib = join(REPO_ROOT, "plugins", "continuous-improvement", "lib", "hook-pack-gate.mjs");
        assert.ok(existsSync(bundledLib), `expected ${bundledLib} to be bundled`);
    });
    it("the bundled hook loads every lib module it imports and gates a push to main", () => {
        // lib/hook-pack-gate.mjs imports lib/destructive-bash.mjs for the shared
        // command reader. A lib missing from the bundle makes the hook die at
        // module load, which the harness reads as allow.
        const bundledHook = join(REPO_ROOT, "plugins", "continuous-improvement", "hooks", "hook-pack.mjs");
        const result = spawnSync(process.execPath, [bundledHook], {
            input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push origin main" } }),
            encoding: "utf8",
            env: { ...process.env, CLAUDE_CI_HOOKPACK_GATE: "block" },
        });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /"permissionDecision":"deny"/);
    });
});
