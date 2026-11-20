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
  ["Remove-Item -Recurse -Force .\\dist", "powershell-remove-item"],
];

// PowerShell's delete was only recognised as the contiguous, switch-first
// substrings "Remove-Item -Recurse" and "Remove-Item -Force". The spelling
// PowerShell users actually write puts the path first or names it with -Path,
// uses an alias, or abbreviates the switch, and every one of those was allowed.
const POWERSHELL_DELETE_CAUGHT: ReadonlyArray<[string, string]> = [
  ["Remove-Item build -Recurse -Force", "powershell-remove-item"],
  ["Remove-Item -Path build -Recurse -Force", "powershell-remove-item"],
  ["Remove-Item -LiteralPath C:\\work\\repo -Recurse -Force", "powershell-remove-item"],
  ["Remove-Item .\\build\\* -Recurse -Force", "powershell-remove-item"],
  ["Remove-Item $env:USERPROFILE\\.claude\\plugins -Recurse -Force", "powershell-remove-item"],
  ["Remove-Item -Rec -Fo x", "powershell-remove-item"],
  ["Remove-Item x -Recurse", "powershell-remove-item"],
  ["Remove-Item x -Force", "powershell-remove-item"],
  ["Remove-Item x -Force:$true", "powershell-remove-item"],
  ["remove-item x -recurse -force", "powershell-remove-item"],
  ["ri -r -fo build", "powershell-remove-item"],
  ["rd -Recurse -Force build", "powershell-remove-item"],
  ["del -Recurse -Force build", "powershell-remove-item"],
  ["erase -Recurse -Force build", "powershell-remove-item"],
  ["rmdir build -Recurse -Force", "powershell-remove-item"],
  ["rm -Recurse -Force x", "powershell-remove-item"],
  ["Remove-Item `\n  -Recurse -Force build", "powershell-remove-item"],
  ["Remove-Item `\r\n  -Recurse -Force build", "powershell-remove-item"],
  ["Get-ChildItem x | ri -r -fo", "powershell-remove-item"],
  ["Get-ChildItem build -Recurse | Remove-Item", "powershell-remove-item-pipeline"],
  ["gci *.log | del", "powershell-remove-item-pipeline"],
  ["[System.IO.Directory]::Delete('build', $true)", "substring:io.directory]::delete("],
  ["cmd /c rd /s /q build", "cmd-rmdir-tree"],
  ["cmd.exe /C rmdir build /S /Q", "cmd-rmdir-tree"],
];

const POWERSHELL_DELETE_ALLOWED: ReadonlyArray<string> = [
  "Remove-Item scratch.txt",
  "Remove-Item -Path scratch.txt -Confirm:$false",
  "ri scratch.txt",
  "del scratch.txt",
  "rd emptydir",
  "Get-ChildItem -Recurse src",
  "Get-ChildItem -Force",
  "Copy-Item a b -Recurse -Force",
  "Get-ChildItem x | Select-Object Name",
  "Write-Output Remove-Item | Out-Null",
  // The POSIX spelling of rm stays with rm-recursive-force, which needs both flags.
  "rm -r tmp",
  "rm -R tmp",
  "rmdir -p a/b",
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

  // The volume formatter was matched as the substring "format ", which also
  // matches PowerShell's -Format and -UFormat parameters and every
  // --output-format flag. The destructive gate has no clearance path, so each
  // of these was denied on every retry.
  const FORMAT_PARAMETER_ALLOWED: ReadonlyArray<string> = [
    'Get-Date -Format "yyyy-MM-dd"',
    "$stamp = Get-Date -Format o",
    "Get-Date -UFormat %s",
    'New-Item -ItemType Directory -Force "out_$(Get-Date -Format yyyyMMdd)"',
    "$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'; Copy-Item app.log \"app-$stamp.log\"",
    "claude -p hi --output-format json",
    "git log --format %H -1",
    "date +%F | xargs printf 'format %s\\n'",
  ];
  for (const command of FORMAT_PARAMETER_ALLOWED) {
    it(`allows a format parameter: ${command}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, false, `expected allowed: ${command} (rule ${verdict.rule})`);
    });
  }

  const FORMAT_VOLUME_CAUGHT: ReadonlyArray<string> = [
    "format d: /q",
    "FORMAT D: /FS:NTFS",
    "format.com d:",
    "cmd /c format d: /q",
    "echo y | format d:",
  ];
  for (const command of FORMAT_VOLUME_CAUGHT) {
    it(`still catches the volume formatter: ${command}`, () => {
      assert.deepEqual(classifyDestructiveBash(command), { destructive: true, rule: "format-volume" });
    });
  }

  // Windows PowerShell 5.1 has no && operator: the chain is written
  // `A; if ($?) { B }`, which puts B inside a script block. The structured
  // rules read the first word of each segment, so B has to start a segment of
  // its own. An assignment, a try block and a parenthesis hid B the same way.
  const SCRIPT_BLOCK_CAUGHT: ReadonlyArray<[string, string]> = [
    ["git status; if ($?) { git clean -fdx }", "git-clean-force"],
    ["git fetch; if ($?) { git checkout -- . }", "git-checkout-discard"],
    ["if ($?) { git stash drop }", "git-stash-drop"],
    ["if ($?) { git restore . }", "git-restore-discard"],
    ["if ($LASTEXITCODE -eq 0) { git clean -fdx }", "git-clean-force"],
    ["if ($?) {git clean -fdx}", "git-clean-force"],
    ["$out = git clean -fdx", "git-clean-force"],
    ["try { git clean -fdx } catch {}", "git-clean-force"],
    ["(git clean -fdx)", "git-clean-force"],
    ["if ($?) { Remove-Item build -Recurse -Force }", "powershell-remove-item"],
    // A brace expansion between the command word and its flag must not hide the flag.
    ["find {src,test} -name '*.tmp' -delete", "find-delete"],
    ["git clean {a,b} -fd", "git-clean-force"],
  ];
  for (const [command, rule] of SCRIPT_BLOCK_CAUGHT) {
    it(`catches a command inside a block, assignment or group: ${command}`, () => {
      assert.deepEqual(classifyDestructiveBash(command), { destructive: true, rule });
    });
  }

  const SCRIPT_BLOCK_ALLOWED: ReadonlyArray<string> = [
    "git fetch; if ($?) { git status }",
    "$files = Get-ChildItem -Recurse src",
    "try { git stash list } catch {}",
    "find {src,test} -name '*.tmp'",
    "(git clean -n)",
    "foreach ($f in $files) { git restore --staged $f }",
  ];
  for (const command of SCRIPT_BLOCK_ALLOWED) {
    it(`allows a harmless command inside a block: ${command}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, false, `expected allowed: ${command} (rule ${verdict.rule})`);
    });
  }

  // In Bash a backtick that ends a line closes a command substitution. Reading
  // it as a PowerShell line continuation glued the next line onto this one, so
  // the destructive command on that line was no longer a command start.
  const AFTER_BACKTICK_SUBSTITUTION_CAUGHT: ReadonlyArray<[string, string]> = [
    ["cd `git rev-parse --show-toplevel`\ngit clean -fdx", "git-clean-force"],
    ["cd `git rev-parse --show-toplevel`\r\ngit clean -fdx", "git-clean-force"],
    ["v=`git describe --tags`\ngit checkout -- .", "git-checkout-discard"],
    ["branch=`git branch --show-current`\ngit stash drop", "git-stash-drop"],
    ["export ROOT=`git rev-parse --show-toplevel`\ngit stash drop", "git-stash-drop"],
    ["echo \"root is\" `pwd`\nfind . -name '*.orig' -delete", "find-delete"],
    ["tag=`git describe --tags`\ngit push origin +main", "git-push-plus-refspec"],
  ];
  for (const [command, rule] of AFTER_BACKTICK_SUBSTITUTION_CAUGHT) {
    it(`catches the line after a Bash backtick substitution: ${JSON.stringify(command)}`, () => {
      assert.deepEqual(classifyDestructiveBash(command), { destructive: true, rule });
    });
  }

  it("allows a harmless line after a Bash backtick substitution", () => {
    assert.equal(classifyDestructiveBash("cd `git rev-parse --show-toplevel`\ngit status").destructive, false);
    assert.equal(classifyDestructiveBash("v=`git describe --tags`\ngit clean -n").destructive, false);
  });

  for (const [command, rule] of POWERSHELL_DELETE_CAUGHT) {
    it(`catches the PowerShell delete: ${JSON.stringify(command)}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, true, `expected destructive: ${command}`);
      assert.equal(verdict.rule, rule);
    });
  }

  for (const command of POWERSHELL_DELETE_ALLOWED) {
    it(`allows the PowerShell command: ${command}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, false, `expected allowed: ${command} (rule ${verdict.rule})`);
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
