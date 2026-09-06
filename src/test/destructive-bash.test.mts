/**
 * Table tests for the destructive-Bash classifier behind hooks/gateguard.mjs.
 *
 * RED first: the classifier module does not exist yet. The 19-entry substring
 * list in the hook let common destructive forms through — split flags
 * (`rm -r -f`), `git clean -fdx`, `git checkout -- .`, `git restore .`,
 * `find ... -delete`, a `+refspec` force push, `git stash drop` — while the
 * message-flag carve-out (`git commit -m "..."`) must keep working. Every row
 * below is a real command shape, not a synthetic string.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyDestructiveBash, stripMessageArgs } from "../lib/destructive-bash.mjs";

const CAUGHT: ReadonlyArray<[string, string]> = [
  // [command, expected rule id]
  ["rm -rf node_modules", "rm-recursive-force"],
  ["rm -fr build", "rm-recursive-force"],
  ["rm -r -f dist", "rm-recursive-force"],
  ["rm -f -r dist", "rm-recursive-force"],
  ["rm -Rf dist", "rm-recursive-force"],
  ["rm --recursive --force dist", "rm-recursive-force"],
  ["rm -r --force dist", "rm-recursive-force"],
  ["cd /tmp && rm -r -f cache", "rm-recursive-force"],
  ["git clean -fdx", "git-clean-force"],
  ["git clean -fd", "git-clean-force"],
  ["git clean -xdf", "git-clean-force"],
  ["git clean --force -d", "git-clean-force"],
  ["git checkout -- .", "git-checkout-discard"],
  ["git checkout -- src/index.ts", "git-checkout-discard"],
  ["git checkout .", "git-checkout-discard"],
  ["git restore .", "git-restore-discard"],
  ["git restore src/index.ts", "git-restore-discard"],
  ["git restore --worktree --staged src/index.ts", "git-restore-discard"],
  ["find . -name '*.log' -delete", "find-delete"],
  ["find build -type f -delete", "find-delete"],
  ["git push origin +main", "git-push-plus-refspec"],
  ["git push origin +feat/x:feat/x", "git-push-plus-refspec"],
  ["git stash drop", "git-stash-drop"],
  ["git stash drop stash@{2}", "git-stash-drop"],
  ["git stash clear", "git-stash-drop"],
  ["git reset --hard origin/main", "substring:git reset --hard"],
  ["git push --force origin main", "substring:git push --force"],
  ["git branch -D feat/old", "substring:git branch -D"],
  ["psql -c 'DROP TABLE users'", "substring:drop table"],
  ["Remove-Item -Recurse -Force .\\dist", "substring:Remove-Item -Recurse"],
];

const ALLOWED: ReadonlyArray<string> = [
  "rm -f scratch.txt",
  "rm -r tmp",
  "rm --force scratch.txt",
  "git clean -n",
  "git clean --dry-run -d",
  "git checkout -b feat/new-thing",
  "git checkout main",
  "git checkout feat/x -- ",
  "git restore --staged README.md",
  "git restore --staged src/a.ts src/b.ts",
  "git stash",
  "git stash list",
  "git stash pop",
  "git stash apply stash@{1}",
  "find . -name '*.log'",
  "find . -type f -name '*.mts' | head",
  "git push origin main",
  "git push -u origin feat/x",
  "git push origin HEAD:refs/heads/feat/x",
  "git status",
  "npm run build",
  'git commit -m "rm -r -f the old cache helper"',
  'gh pr create --title "git clean -fdx in CI" --body "explains the cleanup"',
  "echo 'git stash drop' >> notes.md",
];

describe("lib/destructive-bash — classifier table", () => {
  for (const [command, rule] of CAUGHT) {
    it(`catches: ${command}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, true, `expected destructive: ${command}`);
      assert.equal(verdict.rule, rule);
    });
  }

  for (const command of ALLOWED) {
    it(`allows: ${command}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, false, `expected allowed: ${command} (rule ${verdict.rule})`);
      assert.equal(verdict.rule, null);
    });
  }

  it("stripMessageArgs blanks message and body values but keeps the flag", () => {
    assert.equal(stripMessageArgs('git commit -m "rm -rf x"'), "git commit -m ");
    assert.equal(stripMessageArgs("gh pr create --body-file body.md"), "gh pr create --body-file ");
    assert.equal(stripMessageArgs('bash -c "rm -rf /tmp/x"'), 'bash -c "rm -rf /tmp/x"');
  });

  it("is case-insensitive for SQL and PowerShell forms", () => {
    assert.equal(classifyDestructiveBash("DROP DATABASE prod").destructive, true);
    assert.equal(classifyDestructiveBash("remove-item -recurse -force .\\x").destructive, true);
  });

  it("treats an empty or non-command string as not destructive", () => {
    assert.deepEqual(classifyDestructiveBash(""), { destructive: false, rule: null });
    assert.deepEqual(classifyDestructiveBash("   "), { destructive: false, rule: null });
  });
});
