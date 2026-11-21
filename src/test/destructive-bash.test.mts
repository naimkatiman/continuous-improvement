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

import { classifyDestructiveBash, gitInvocations, stripMessageArgs } from "../lib/destructive-bash.mjs";

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
  ["git reset --hard origin/main", "git-reset-hard"],
  ["git push --force origin main", "git-push-force"],
  ["git push -f origin main", "git-push-force"],
  ["git push --force-with-lease origin feat/x", "git-push-force"],
  ["git branch -D feat/old", "git-branch-force-delete"],
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

  // `git -C <dir>` is how an agent addresses another worktree. The value of -C
  // was blanked as if it were a commit message, which made the parser swallow
  // the subcommand, and reset --hard, push --force and branch -D only existed
  // as contiguous substrings, so any global option in between hid them.
  const GIT_GLOBAL_OPTION_CAUGHT: ReadonlyArray<[string, string]> = [
    ["git -C ../wt clean -fdx", "git-clean-force"],
    ["git -C ../wt reset --hard origin/main", "git-reset-hard"],
    ["git -C ../wt checkout -- .", "git-checkout-discard"],
    ["git -C ../wt stash drop", "git-stash-drop"],
    ["git -C ../wt restore .", "git-restore-discard"],
    ["git -C ../wt push --force origin feat/x", "git-push-force"],
    ["git -C ../wt push -f origin feat/x", "git-push-force"],
    ["git -C ../wt push -fu origin feat/x", "git-push-force"],
    ["git -C ../wt push --force-with-lease origin feat/x", "git-push-force"],
    ["git -C ../wt push --force-with-lease=feat/x:abc123 origin feat/x", "git-push-force"],
    ["git -C ../wt push origin +main", "git-push-plus-refspec"],
    ["git -C ../wt branch -D feat/x", "git-branch-force-delete"],
    ["git -C D:\\repo\\wt clean -fdx", "git-clean-force"],
    ['git -C "D:\\my repo\\wt" clean -fdx', "git-clean-force"],
    ['git -C "$d" reset --hard', "git-reset-hard"],
    ["git --no-pager reset --hard", "git-reset-hard"],
    ["git -c user.name=x reset --hard HEAD~1", "git-reset-hard"],
    ['git -c user.name="A B" reset --hard HEAD~1', "git-reset-hard"],
    ["git --git-dir=.git --work-tree=. reset --hard", "git-reset-hard"],
    ["git --git-dir .git --work-tree . clean -fd", "git-clean-force"],
    ["git -c core.hooksPath=/dev/null push --force origin feat/x", "git-push-force"],
    ["git --no-pager branch -D feat/x", "git-branch-force-delete"],
    ["git branch --delete --force feat/x", "git-branch-force-delete"],
    ["git branch -d -f feat/x", "git-branch-force-delete"],
  ];
  for (const [command, rule] of GIT_GLOBAL_OPTION_CAUGHT) {
    it(`catches git behind a global option: ${command}`, () => {
      assert.deepEqual(classifyDestructiveBash(command), { destructive: true, rule });
    });
  }

  const GIT_GLOBAL_OPTION_ALLOWED: ReadonlyArray<string> = [
    "git -C ../wt status",
    "git -C ../wt log --oneline -5",
    "git -C ../wt clean -n",
    "git -C ../wt push origin feat/x",
    "git -C ../wt push -u origin feat/x",
    "git -C ../wt branch -d feat/merged",
    "git -C ../wt branch --delete feat/merged",
    "git -C ../wt reset --soft HEAD~1",
    "git -C ../wt reset HEAD~1",
    "git -C ../wt checkout -b feat/y",
    "git -C ../wt restore --staged a.ts",
    "git -C ../wt stash list",
    'git -C ../wt commit -m "reset --hard was the wrong call"',
    "git commit -C HEAD~1",
    "git -c core.autocrlf=false diff --stat",
    "git --no-pager log -3",
    "tar -C /tmp -xf a.tar",
    // A flag-looking word inside a quoted argument is data, not a flag.
    'git push origin "refs/heads/feat/x" --follow-tags',
    'rm -r "notes -f draft"',
  ];
  for (const command of GIT_GLOBAL_OPTION_ALLOWED) {
    it(`allows a harmless git command behind a global option: ${command}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, false, `expected allowed: ${command} (rule ${verdict.rule})`);
    });
  }

  // The rules compared the command word to the bare name, so `git.exe`, a path
  // to the program, a quoted path behind the call operator and a capture
  // written without spaces (`$out=git …`) all hid the command.
  const COMMAND_WORD_SPELLING_CAUGHT: ReadonlyArray<[string, string]> = [
    ["git.exe reset --hard origin/main", "git-reset-hard"],
    ["git.exe clean -fdx", "git-clean-force"],
    ["git.exe checkout -- .", "git-checkout-discard"],
    ["git.exe push --force origin feat/x", "git-push-force"],
    ["GIT.EXE stash drop", "git-stash-drop"],
    ["Git clean -fdx", "git-clean-force"],
    ['& "C:\\Program Files\\Git\\cmd\\git.exe" reset --hard origin/main', "git-reset-hard"],
    ['& "C:\\Program Files\\Git\\cmd\\git.exe" clean -fdx', "git-clean-force"],
    ['"C:\\Program Files\\Git\\cmd\\git.exe" clean -fdx', "git-clean-force"],
    ["& 'C:\\Program Files\\Git\\cmd\\git.exe' -C D:\\repo restore .", "git-restore-discard"],
    ["/usr/bin/git clean -fdx", "git-clean-force"],
    ["C:\\tools\\git\\bin\\git.exe branch -D feat/x", "git-branch-force-delete"],
    ["$out=git clean -fdx", "git-clean-force"],
    ["$r=git stash drop", "git-stash-drop"],
    ["$out= git clean -fdx", "git-clean-force"],
    ["$out =git clean -fdx", "git-clean-force"],
    ["$script:out=git.exe reset --hard", "git-reset-hard"],
    ["/bin/rm -r -f build", "rm-recursive-force"],
    ["/usr/bin/find . -name '*.orig' -delete", "find-delete"],
    ["Microsoft.PowerShell.Management\\Remove-Item build -Recurse -Force", "powershell-remove-item"],
    ["C:\\Windows\\System32\\format.com d: /q", "format-volume"],
    ["C:\\Windows\\System32\\cmd.exe /c rd /s /q build", "cmd-rmdir-tree"],
    // The substring fallback reads git.exe as git too.
    ["xargs -n1 git.exe reset --hard", "substring:git reset --hard"],
  ];
  for (const [command, rule] of COMMAND_WORD_SPELLING_CAUGHT) {
    it(`catches the command however its word is spelled: ${command}`, () => {
      assert.deepEqual(classifyDestructiveBash(command), { destructive: true, rule });
    });
  }

  const COMMAND_WORD_SPELLING_ALLOWED: ReadonlyArray<string> = [
    "git.exe status",
    "git.exe clean -n",
    "git.exe push origin feat/x",
    '& "C:\\Program Files\\Git\\cmd\\git.exe" status',
    '"C:\\Program Files\\Git\\cmd\\git.exe" push origin feat/x',
    "/usr/bin/git log --oneline -3",
    "$out=git status",
    "$r=git stash list",
    "$count=5",
    "$env:GIT_PAGER='cat'; git log -3",
    "$git = 'C:\\Program Files\\Git\\cmd\\git.exe'",
    "/bin/rm -f scratch.txt",
    "./node_modules/.bin/prettier --write .",
    // A quoted word with no directory in it is a string, not a program.
    "'format' -f $name",
    '"Format complete" | Out-File build.log',
  ];
  for (const command of COMMAND_WORD_SPELLING_ALLOWED) {
    it(`allows a harmless command however its word is spelled: ${command}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, false, `expected allowed: ${command} (rule ${verdict.rule})`);
    });
  }

  // A shell started with -c, -Command or /c runs its argument as a command
  // line. Only `cmd /c` was unwrapped, and only with /c as the first switch, so
  // the Bash tool reached PowerShell's delete (and any structured rule) unseen.
  const WRAPPED_CAUGHT: ReadonlyArray<[string, string]> = [
    ['pwsh -c "Remove-Item build -Recurse -Force"', "powershell-remove-item"],
    ['powershell -NoProfile -Command "Remove-Item build -Recurse -Force"', "powershell-remove-item"],
    ["powershell -Command Remove-Item build -Recurse -Force", "powershell-remove-item"],
    [
      'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item build -Recurse -Force"',
      "powershell-remove-item",
    ],
    ['pwsh -NoLogo -c "Get-ChildItem build -Recurse | Remove-Item"', "powershell-remove-item-pipeline"],
    ['pwsh -Command "& { git clean -fdx }"', "git-clean-force"],
    ['bash -c "git clean -fdx"', "git-clean-force"],
    ["bash -lc 'git reset --hard origin/main'", "git-reset-hard"],
    ["sh -c 'find . -name \"*.orig\" -delete'", "find-delete"],
    ['zsh -c "git stash drop"', "git-stash-drop"],
    ['bash -c "cd /tmp && rm -r -f cache"', "rm-recursive-force"],
    ['sudo bash -c "git clean -fdx"', "git-clean-force"],
    ['bash -c "pwsh -c \'Remove-Item build -Recurse -Force\'"', "powershell-remove-item"],
    ["cmd //c rd //s //q build", "cmd-rmdir-tree"],
    ["cmd /d /c rd /s /q build", "cmd-rmdir-tree"],
    ['cmd /d /s /c "rd /s /q build"', "cmd-rmdir-tree"],
    ['powershell -Command "cmd /c rd /s /q build"', "cmd-rmdir-tree"],
    ["cmd /c del /f /s /q build", "cmd-del-tree"],
    ["cmd /c del /s /q build\\*", "cmd-del-tree"],
    ["cmd.exe /c erase /s /q build", "cmd-del-tree"],
    ['Invoke-Expression "Remove-Item build -Recurse -Force"', "powershell-remove-item"],
    ["iex 'git clean -fdx'", "git-clean-force"],
  ];
  for (const [command, rule] of WRAPPED_CAUGHT) {
    it(`catches the command a shell wrapper runs: ${command}`, () => {
      assert.deepEqual(classifyDestructiveBash(command), { destructive: true, rule });
    });
  }

  const WRAPPED_ALLOWED: ReadonlyArray<string> = [
    'pwsh -c "Get-ChildItem -Recurse src"',
    'powershell -NoProfile -Command "Get-Date -Format o"',
    "pwsh -File scripts/clean.ps1 -Recurse",
    "pwsh -c \"Write-Host 'Format complete'\"",
    'bash -c "git status"',
    'bash -lc "npm test"',
    'sh -c "git clean -n"',
    // -c after the script name is the script's own argument.
    "bash scripts/run.sh -c release",
    "bash -c 'echo \"(git clean -fd would remove the fixtures)\"'",
    "cmd /c dir /s /b build",
    "cmd /c del /q scratch.txt",
    'cmd /c "echo done"',
    'Invoke-Expression "Get-ChildItem src"',
  ];
  for (const command of WRAPPED_ALLOWED) {
    it(`allows the harmless command a shell wrapper runs: ${command}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, false, `expected allowed: ${command} (rule ${verdict.rule})`);
    });
  }

  // The policy for PowerShell's delete. -Recurse gates, alone or with -Force,
  // and so does a delete fed by a pipeline. -Force alone is the PowerShell
  // spelling of `rm -f file` and passes like it, for the cmdlet and every
  // alias, wherever the switch sits. -WhatIf is a dry run, like `git clean -n`.
  // A provider path that is not a file tree (Env:, Function:, Alias:,
  // Variable:) is not a tree delete.
  const POWERSHELL_POLICY_ALLOWED: ReadonlyArray<string> = [
    "Remove-Item scratch.txt -Force",
    "Remove-Item -Force scratch.txt",
    "Remove-Item x -Force:$true",
    "Remove-Item $tmp -Force -ErrorAction SilentlyContinue",
    "if (Test-Path out.zip) { Remove-Item out.zip -Force }",
    "del scratch.txt -Force",
    "ri *.tmp -Force",
    "erase -Force a.log, b.log",
    "rm -Force scratch.txt",
    "Remove-Item .\\dist\\app.zip -Force -ErrorAction SilentlyContinue; Compress-Archive -Path dist\\* -DestinationPath dist\\app.zip",
    'pwsh -c "Remove-Item scratch.txt -Force"',
    'Write-Host "Remove-Item -Force deletes a read-only file"',
    "Remove-Item x.txt -Recurse:$false",
    // A dry run.
    "Remove-Item build -Recurse -Force -WhatIf",
    "Remove-Item -Recurse -Force build -WhatIf",
    "Remove-Item (Join-Path $root build) -Recurse -WhatIf",
    'Write-Host "Remove-Item -Recurse build -WhatIf shows what would go"',
    "Get-ChildItem -Recurse | Remove-Item -WhatIf",
    // A provider path that is not a file tree.
    "Remove-Item Env:\\FOO -Force",
    "Remove-Item Env:\\FOO",
    "Remove-Item Alias:\\ll -Force",
    "Remove-Item -Path Function:\\Invoke-Thing -Recurse -Force",
    "Remove-Item Variable:\\tmp -Recurse -ErrorAction SilentlyContinue",
  ];
  for (const command of POWERSHELL_POLICY_ALLOWED) {
    it(`allows the PowerShell delete that is not a tree delete: ${command}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, false, `expected allowed: ${command} (rule ${verdict.rule})`);
    });
  }

  const POWERSHELL_POLICY_CAUGHT: ReadonlyArray<[string, string]> = [
    ["Remove-Item -Force -Recurse build", "powershell-remove-item"],
    ["Remove-Item build -Force -Recurse:$true", "powershell-remove-item"],
    ["Remove-Item build -Recurse -Force -WhatIf:$false", "powershell-remove-item"],
    ["Remove-Item HKCU:\\Software\\Acme -Recurse", "powershell-remove-item"],
    ["Remove-Item Env:\\FOO, build -Recurse", "powershell-remove-item"],
    ["rm -Force -r build", "powershell-remove-item"],
    ["Get-ChildItem *.tmp | Remove-Item", "powershell-remove-item-pipeline"],
    ["Get-ChildItem *.tmp | Remove-Item -Force", "powershell-remove-item-pipeline"],
    // The pipeline item as the operand is a delete fed by a pipeline too.
    [
      "Get-ChildItem build -Recurse | ForEach-Object { Remove-Item $_.FullName -Force }",
      "powershell-remove-item-pipeline",
    ],
    ["Get-ChildItem *.tmp | ForEach-Object { Remove-Item $_ }", "powershell-remove-item-pipeline"],
    ["gci build | % { ri $_ -r -fo }", "powershell-remove-item"],
    // The switch-first spelling inside a quoted argument keeps the reach the
    // "Remove-Item -Recurse" and "Remove-Item -Force" substrings gave it.
    ['Start-Process powershell -ArgumentList "Remove-Item -Recurse -Force build"', "powershell-remove-item"],
    ['Start-Process powershell -ArgumentList "Remove-Item -Force -Recurse build"', "powershell-remove-item"],
    ["Set-Content clean.ps1 'Remove-Item -Recurse -Force build'", "powershell-remove-item"],
  ];
  for (const [command, rule] of POWERSHELL_POLICY_CAUGHT) {
    it(`catches the PowerShell tree delete: ${command}`, () => {
      assert.deepEqual(classifyDestructiveBash(command), { destructive: true, rule });
    });
  }

  // `rm` is two commands. Under the PowerShell tool it is the Remove-Item alias
  // and -r abbreviates -Recurse, so `rm -r build` deletes a tree. The classifier
  // was not told which tool sent the command and read every `rm` as POSIX rm.
  const RM_UNDER_POWERSHELL_CAUGHT: ReadonlyArray<[string, string]> = [
    ["rm -r build", "powershell-remove-item"],
    ["rm build -r", "powershell-remove-item"],
    ["rm -Path build -r", "powershell-remove-item"],
    ["if (Test-Path build) { rm -r build }", "powershell-remove-item"],
    ["gci *.tmp | rm", "powershell-remove-item-pipeline"],
    ["gci build | rmdir", "powershell-remove-item-pipeline"],
  ];
  for (const [command, rule] of RM_UNDER_POWERSHELL_CAUGHT) {
    it(`reads rm as Remove-Item under the PowerShell tool: ${command}`, () => {
      assert.deepEqual(classifyDestructiveBash(command, "PowerShell"), { destructive: true, rule });
    });
  }

  it("keeps the POSIX reading of rm under the Bash tool, and when no tool is named", () => {
    for (const command of ["rm -r tmp", "rm -R tmp", "rm build -r", "ls | rm", "rm -f scratch.txt"]) {
      assert.deepEqual(classifyDestructiveBash(command, "Bash"), { destructive: false, rule: null }, command);
      assert.deepEqual(classifyDestructiveBash(command), { destructive: false, rule: null }, command);
    }
    assert.equal(classifyDestructiveBash("rm -f scratch.txt", "PowerShell").destructive, false);
    assert.equal(classifyDestructiveBash("rm scratch.txt", "PowerShell").destructive, false);
  });

  it("a shell wrapper decides which rm its command line means", () => {
    const denied = { destructive: true, rule: "powershell-remove-item" };
    assert.deepEqual(classifyDestructiveBash('pwsh -c "rm -r build"', "Bash"), denied);
    assert.deepEqual(classifyDestructiveBash('powershell -NoProfile -Command "rm -r build"'), denied);
    assert.equal(classifyDestructiveBash('bash -c "rm -r build"', "PowerShell").destructive, false);
  });

  // A string literal is an expression, not a command. The rules stripped a
  // leading quote from the first word, so a PowerShell string that begins with
  // "Format" was read as the volume formatter, and one that begins with "rd"
  // as cmd's tree delete.
  const STRING_LITERAL_ALLOWED: ReadonlyArray<string> = [
    '$msg = "Format complete"; Write-Host $msg',
    '$title = "Format check failed"',
    '"Format complete" | Out-File build.log',
    'Write-Host ("format {0} as json" -f $name)',
    "Write-Output ('Format done at {0}' -f (Get-Date))",
    'if ($ok) { "Format passed" } else { "Format failed" }',
    '$results | ForEach-Object { "format $_" }',
    "'format string here'.Length",
    "$title = 'Format Report'; Write-Host $title",
    "Write-Host 'x'; \"format json output\" | Set-Content x.txt",
    '"rd /s removes a whole tree" | Out-File notes.txt',
    "$hint = 'rd /S is the cmd spelling'",
  ];
  for (const command of STRING_LITERAL_ALLOWED) {
    it(`allows a string literal that begins with a command name: ${command}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, false, `expected allowed: ${command} (rule ${verdict.rule})`);
    });
  }

  it("still reads the quoted argument of cmd /c as a command", () => {
    assert.deepEqual(classifyDestructiveBash('cmd /c "format d: /q"'), { destructive: true, rule: "format-volume" });
    assert.deepEqual(classifyDestructiveBash('cmd /c "rd /s /q build"'), { destructive: true, rule: "cmd-rmdir-tree" });
  });

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

  // A heredoc or here-string body is data being written to a file, and a
  // regex alternation or a `case` pattern is not a pipeline. The block split
  // and the piped-delete rule read both as commands, so notes and tables that
  // only mention a command were denied.
  const PROSE_AND_PATTERNS_ALLOWED: ReadonlyArray<string> = [
    "cat >> NOTES.md <<'EOF'\nDo not run cleanup here (git clean -fd would remove the fixtures).\nEOF",
    "cat >> NOTES.md <<'EOF'\nIf the stash is stale (git stash drop discards it) ask first.\nEOF",
    "cat >> NOTES.md <<EOF\n| alias | cmdlet |\n| del | Remove-Item |\nEOF",
    "cat >> NOTES.md <<-'EOF'\n\t| del | Remove-Item |\n\tEOF\necho done",
    "$note = @'\nDon't run cleanup here (git clean -fd would remove the fixtures).\n'@\nSet-Content NOTES.md $note",
    '$note = @"\n| del | Remove-Item |\n"@\nAdd-Content NOTES.md $note',
    '[[ "$cmd" =~ ^(rm|del|rd|erase)$ ]] && echo yes',
    'case "$1" in rm|del|erase) shift ;; esac',
    "cat <<A <<B\none (git stash drop)\nA\ntwo | del | x\nB",
    // A heredoc or here-string that is the commit message or the PR body is
    // prose, whatever quotes it contains and however it reaches the flag.
    'git commit -m "$(cat <<\'EOF\'\nfix: the "old" helper ran rm -rf on the cache\nEOF\n)"',
    "git commit -F - <<'EOF'\nfix: stop the helper that ran rm -rf on the cache\nEOF",
    "gh pr create --title \"notes\" --body-file - <<'EOF'\nRecovery is manual (git stash drop discards the stash).\nEOF",
    "git commit -m @'\nfix: stop the helper that ran rm -rf on the cache\n'@",
  ];
  for (const command of PROSE_AND_PATTERNS_ALLOWED) {
    it(`allows prose in a heredoc body, and a pattern that is not a pipeline: ${JSON.stringify(command)}`, () => {
      const verdict = classifyDestructiveBash(command);
      assert.equal(verdict.destructive, false, `expected allowed (rule ${verdict.rule})`);
    });
  }

  const AROUND_HEREDOC_CAUGHT: ReadonlyArray<[string, string]> = [
    // A command after the heredoc is still a command, in a group or a block too.
    ["cat > notes.md <<'EOF'\nplain text (see below)\nEOF\n(git clean -fdx)", "git-clean-force"],
    ["$body = @'\ntext (git stash drop discards it)\n'@\nif ($?) { git stash drop }", "git-stash-drop"],
    ["cat > list.txt <<EOF\nkeep\nEOF\nGet-ChildItem build -Recurse | Remove-Item", "powershell-remove-item-pipeline"],
    // An apostrophe in the body used to open a quote that swallowed the rest.
    ["cat <<'EOF' > notes.md\nDon't touch\nEOF\ngit clean -fdx", "git-clean-force"],
    ['git commit -m "$(cat <<\'EOF\'\nnotes\nEOF\n)" && git clean -fdx', "git-clean-force"],
    // Text with no terminator line is not a heredoc body.
    ["cat <<EOF\n(git clean -fdx)", "git-clean-force"],
    // A body line that is itself a command keeps the reach it had before the block split.
    ["cat > cleanup.sh <<'EOF'\ngit clean -fdx\nEOF", "git-clean-force"],
    ["cat > cleanup.sh <<'EOF'\n#!/bin/sh\ncd /tmp && rm -r -f cache\nEOF", "rm-recursive-force"],
    ["psql \"$DATABASE_URL\" <<'SQL'\nDROP TABLE users;\nSQL", "substring:drop table"],
    // Only git and gh read a message from `-F -` or `--body-file -`. Another
    // program's `--file -` is its input, and SQL on that input is still read.
    ["psql --file - <<'SQL'\nDROP TABLE users;\nSQL", "substring:drop table"],
    ["psql \"$DATABASE_URL\" --file=- <<'SQL'\nTRUNCATE users;\nSQL", "substring:truncate "],
    // A pipeline into the cmdlet, however the pipe is spaced or wrapped.
    ["Get-ChildItem build -Recurse |Remove-Item", "powershell-remove-item-pipeline"],
    ["Get-ChildItem build -Recurse |\n  Remove-Item", "powershell-remove-item-pipeline"],
    ["Get-ChildItem build -Recurse\n  | Remove-Item", "powershell-remove-item-pipeline"],
    ["gci *.tmp|ri", "powershell-remove-item-pipeline"],
  ];
  for (const [command, rule] of AROUND_HEREDOC_CAUGHT) {
    it(`still catches a command next to a heredoc, and a real piped delete: ${JSON.stringify(command)}`, () => {
      assert.deepEqual(classifyDestructiveBash(command), { destructive: true, rule });
    });
  }

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

  // A comment is not code. The classifier read it as code in two ways: the
  // block split cut a command out of a comment that mentions one inside
  // parentheses or braces (allowed before the split existed, denied after),
  // and an apostrophe in a comment opened a string that swallowed the lines
  // below it, so a real command on the next line was never seen. An escaped
  // quote inside a string lost the pass its place the same way.
  const COMMENT_ALLOWED: ReadonlyArray<[string, string | undefined]> = [
    ["# stash note (git stash drop would lose it)\nnpm test", "Bash"],
    ["# cleanup (git clean -fd) is manual, do not automate\nnpm run build", "Bash"],
    ["npm test # then maybe (git checkout -- .) by hand", "Bash"],
    ["# the old helper was { git restore . } and it is gone\nnpm run lint", "Bash"],
    ["# cleanup (Remove-Item build -Recurse) happens in CI\nnpm test", "PowerShell"],
    ["# note (git stash drop would lose the wip)\ngit status", "PowerShell"],
    ["# never run rm -rf here\nnpm test", "Bash"],
    ["git status # then git reset --hard, by hand", undefined],
    // An escaped quote does not end the message it sits in.
    ['git commit -m "docs: say \\"rm -rf\\" is gated"', "Bash"],
    ['git commit -m "docs: say `"rm -rf`" is gated"', "PowerShell"],
  ];
  for (const [command, tool] of COMMENT_ALLOWED) {
    it(`allows a command that is only mentioned in a comment: ${JSON.stringify(command)}`, () => {
      assert.deepEqual(classifyDestructiveBash(command, tool), { destructive: false, rule: null });
    });
  }

  const AFTER_COMMENT_CAUGHT: ReadonlyArray<[string, string, string | undefined]> = [
    ["# don't skip this step\ngit clean -fdx", "git-clean-force", "Bash"],
    ["# it's safe: the tree was committed\ngit checkout -- .", "git-checkout-discard", "Bash"],
    ['echo "it\\"s" ; git clean -fdx', "git-clean-force", "Bash"],
    ["# don't skip this step\nRemove-Item build -Recurse -Force", "powershell-remove-item", "PowerShell"],
    ['Write-Host "a `" b"; git clean -fdx', "git-clean-force", "PowerShell"],
    ["npm test # don't stop here\ngit stash drop", "git-stash-drop", undefined],
    ["npm test # then clean up\ngit clean -fdx", "git-clean-force", "Bash"],
    // A heredoc body that is a script keeps its reach past a comment line.
    ["cat > cleanup.sh <<'EOF'\n# don't run this twice\ngit clean -fdx\nEOF", "git-clean-force", "Bash"],
    // The command line of a wrapper has lost one layer of escaping.
    ['bash -c "git commit -m \\"x\\" && git clean -fdx"', "git-clean-force", "Bash"],
    ['bash -c "echo \\"# not a comment\\"; git clean -fdx"', "git-clean-force", "Bash"],
    // cmd.exe has no `#` comment: the rest of the line still runs.
    ['cmd /c "echo #1 & rd /s /q build"', "cmd-rmdir-tree", "Bash"],
    // `#` inside a word or a string is not a comment.
    ["echo issue#12; git clean -fdx", "git-clean-force", "Bash"],
    ['echo "# heading" > notes.md; git clean -fdx', "git-clean-force", "Bash"],
  ];
  for (const [command, rule, tool] of AFTER_COMMENT_CAUGHT) {
    it(`catches the command after a comment or an odd quote: ${JSON.stringify(command)}`, () => {
      assert.deepEqual(classifyDestructiveBash(command, tool), { destructive: true, rule });
    });
  }

  // PowerShell's block comment, `<#` to `#>`, is a comment too. It is read as
  // one only under PowerShell: in Bash `<#` opens no comment block.
  it("reads a PowerShell block comment as a comment, under PowerShell only", () => {
    const allowed = [
      "<# block (git clean -fd) #>\ngit status",
      "git status <# tail (git stash drop) #>",
      "<#\n  cleanup (Remove-Item build -Recurse) happens in CI\n  don't automate it\n#>\nnpm test",
      'pwsh -c "<# note (git stash drop) #> git status"',
    ];
    for (const command of allowed) {
      const tool = command.startsWith("pwsh") ? "Bash" : "PowerShell";
      assert.deepEqual(classifyDestructiveBash(command, tool), { destructive: false, rule: null }, command);
    }
    const caught: ReadonlyArray<[string, string, string]> = [
      ["<# note #> git clean -fdx", "git-clean-force", "PowerShell"],
      ["<# don't\n skip #>\nRemove-Item build -Recurse -Force", "powershell-remove-item", "PowerShell"],
      ["<# first #> git status; <# second #> git stash drop", "git-stash-drop", "PowerShell"],
      // No closing `#>`: not a comment block, the text stays code.
      ["git status <# (git clean -fdx)", "git-clean-force", "PowerShell"],
      ["cat <#x; git clean -fdx #>", "git-clean-force", "Bash"],
    ];
    for (const [command, rule, tool] of caught) {
      assert.deepEqual(classifyDestructiveBash(command, tool), { destructive: true, rule }, command);
    }
  });

  // The substring list is the fallback for text that no rule reads as a
  // command, and it read text that is data by the command it is written on:
  // the message after git's clustered `-am` and gh's short `-b` / `-t` / `-n`,
  // the pattern of a search command, and the text a print command sends to the
  // terminal. Each of these was denied with no way to clear the deny.
  const DATA_BY_ITS_COMMAND_ALLOWED: ReadonlyArray<[string, string]> = [
    ['git commit -am "docs: explain why rm -rf is gated"', "Bash"],
    ['git commit -am "chore: drop table of contents from the README"', "Bash"],
    ['git commit -sm "fix(ci): stop calling git reset --hard in the release script"', "Bash"],
    ['git tag -am "release: the drop table migration is 0043" v1.2.0', "Bash"],
    // Any short cluster of a git command that ends in m: -u and -S are flags too.
    ['git stash push -um "wip: before rm -rf of the old build dir"', "Bash"],
    ['git commit -Sm "docs: drop table of contents from the README"', "Bash"],
    ["git commit -am \"$(cat <<'EOF'\nfix: the helper ran rm -rf on the cache\nEOF\n)\"", "Bash"],
    ['gh pr comment 271 -b "the gate now covers rm -rf behind pwsh -c"', "Bash"],
    ['gh pr create -t "fix(hooks): gate git reset --hard behind -C" -b "see the plan doc"', "Bash"],
    ['gh release create v1.2.0 -n "drop table users moved to a migration" -t "v1.2.0"', "Bash"],
    ['grep -rn "git reset --hard" docs/ README.md', "Bash"],
    ['rg "rm -rf" --glob "*.sh" scripts/', "Bash"],
    ['grep -rni "drop table" migrations/ | head', "Bash"],
    ['cd repo && grep -n -i "create table\\|drop table\\|rename to" migrations/0043.sql', "Bash"],
    ['findstr /s /c:"rmdir /s" *.cmd', "Bash"],
    ["Select-String -Path .\\src\\*.ts -Pattern 'Remove-Item -Recurse'", "PowerShell"],
    ['Select-String -Path .\\docs\\*.md -Pattern "git reset --hard"', "PowerShell"],
    ['Write-Host "Next step: Remove-Item -Recurse -Force .\\dist (ask first)"', "PowerShell"],
    ['npm test; Write-Host "git reset --hard was not needed"', "PowerShell"],
    ['Write-Output "git push --force is blocked by the gate"', "PowerShell"],
    ['echo "next: rm -rf build, by hand"', "Bash"],
    ['npm test && echo "git reset --hard was not needed"', "Bash"],
    ['printf "%s\\n" "drop table users is in migration 0043"', "Bash"],
  ];
  for (const [command, tool] of DATA_BY_ITS_COMMAND_ALLOWED) {
    it(`allows text that is data by the command it is written on (${tool}): ${JSON.stringify(command)}`, () => {
      assert.deepEqual(classifyDestructiveBash(command, tool), { destructive: false, rule: null });
    });
  }

  // Text handed to something that runs it keeps the reach the substring list
  // gave it, and so does a print command whose output goes anywhere but the
  // terminal: into a pipe, a file or a substitution.
  const TEXT_THAT_RUNS_CAUGHT: ReadonlyArray<[string, string, string]> = [
    ['psql -c "DROP TABLE users"', "substring:drop table", "Bash"],
    ['ssh build-host "rm -rf /srv/app/build"', "substring:rm -rf", "Bash"],
    ['echo "DROP TABLE users;" | psql "$DATABASE_URL"', "substring:drop table", "Bash"],
    ['echo "rm -rf build" | bash', "substring:rm -rf", "Bash"],
    ['echo "DROP TABLE users;" \\\n  | psql "$DATABASE_URL"', "substring:drop table", "Bash"],
    ['echo "DROP TABLE users;"\n  | psql $env:DATABASE_URL', "substring:drop table", "PowerShell"],
    ['printf "%s" "git reset --hard" | sh', "substring:git reset --hard", "Bash"],
    ['echo "rm -rf build" > cleanup.sh', "substring:rm -rf", "Bash"],
    ['echo "rm -rf build" \\\n  >> cleanup.sh', "substring:rm -rf", "Bash"],
    ["eval \"$(echo 'rm -rf build')\"", "substring:rm -rf", "Bash"],
    ['x=$(echo "rm -rf build"); $x', "substring:rm -rf", "Bash"],
    ['x=`echo "rm -rf build"`; $x', "substring:rm -rf", "Bash"],
    ['{ echo "DROP TABLE users;"; echo "COMMIT;"; } | psql "$DATABASE_URL"', "substring:drop table", "Bash"],
    ['(echo "rm -rf build") | bash', "substring:rm -rf", "Bash"],
    ['echo "rm -rf build" ${EXTRA} | bash', "substring:rm -rf", "Bash"],
    ['echo "rm -rf build" &> cleanup.sh', "substring:rm -rf", "Bash"],
    ['echo "a" \\\\\npsql -c "DROP TABLE users"', "substring:drop table", "Bash"],
    ['Write-Output "Remove-Item -Recurse -Force build" | Invoke-Expression', "powershell-remove-item", "PowerShell"],
    ['grep -rl "TODO" . | xargs rm -rf', "substring:rm -rf", "Bash"],
    ['grep -q "x" notes.txt && rm -rf build', "rm-recursive-force", "Bash"],
    ['git commit -am "wip"; rm -rf build', "rm-recursive-force", "Bash"],
    ["git commit -am wip; git reset --hard HEAD~1", "git-reset-hard", "Bash"],
    ['gh pr comment 1 -b "x"; git push --force origin main', "git-push-force", "Bash"],
    // Outside git and gh these letters are other flags, and their next word is not a message.
    ["xargs -t rm -rf < list.txt", "substring:rm -rf", "Bash"],
    ['deploy-tool -am "rm -rf /srv/app/build"', "substring:rm -rf", "Bash"],
    ['runner -b "git reset --hard origin/main" -t nightly', "substring:git reset --hard", "Bash"],
    ["docker exec -t app rm -rf /data", "substring:rm -rf", "Bash"],
    ["Remove-Item build -Confirm -Recurse", "powershell-remove-item", "PowerShell"],
    // An unclosed quote hides nothing.
    ['grep "rm -rf build', "substring:rm -rf", "Bash"],
  ];
  for (const [command, rule, tool] of TEXT_THAT_RUNS_CAUGHT) {
    it(`still catches text that something runs (${tool}): ${JSON.stringify(command)}`, () => {
      assert.deepEqual(classifyDestructiveBash(command, tool), { destructive: true, rule });
    });
  }

  const LONG_DATA_INPUTS: ReadonlyArray<[string, string]> = [
    ["clustered message flags", 'git commit -am "x" '.repeat(11_000)],
    ["search commands", 'grep "a" b; '.repeat(17_000)],
    ["print commands", "echo 'x' ; ".repeat(19_000)],
    ["indented line breaks", "\n      ".repeat(29_000)],
    ["backslash line breaks", "a \\\n".repeat(50_000)],
  ];
  for (const [name, command] of LONG_DATA_INPUTS) {
    it(`finds the data of 200 KB of ${name} in under a second`, () => {
      for (const tool of ["Bash", "PowerShell"]) {
        const started = performance.now();
        classifyDestructiveBash(command, tool);
        const elapsed = performance.now() - started;
        assert.ok(elapsed < 1000, `${tool} took ${elapsed.toFixed(0)} ms for ${command.length} chars`);
      }
    });
  }

  // Two ordinary Bash shapes hid a command from every structured rule. A shell
  // keyword (`then`, `do`, `else`) was read as the command word, and a line
  // that ends in a backslash was not joined to the next, so the flags written
  // there were lost.
  const KEYWORD_AND_CONTINUATION_CAUGHT: ReadonlyArray<[string, string]> = [
    ['for wt in ../wt-a ../wt-b; do git -C "$wt" reset --hard origin/main; done', "git-reset-hard"],
    ['if [ -n "$(git status --porcelain)" ]; then git checkout -- .; fi', "git-checkout-discard"],
    ["if npm test; then echo ok; else git stash drop; fi", "git-stash-drop"],
    ["if [ -d build ]; then echo skip; elif git clean -fdx; then echo cleaned; fi", "git-clean-force"],
    ["while ! git clean -fdx; do sleep 1; done", "git-clean-force"],
    ["until git restore .; do sleep 1; done", "git-restore-discard"],
    ["time git clean -fdx", "git-clean-force"],
    ["if git clean -fdx; then echo done; fi", "git-clean-force"],
    ["git clean \\\n  -fdx", "git-clean-force"],
    ["git clean \\\r\n  -fdx", "git-clean-force"],
    ["find . -name '*.pyc' \\\n  -delete", "find-delete"],
    ["git push \\\n  --force \\\n  origin feat/x", "git-push-force"],
    ["rm -r \\\n  -f build", "rm-recursive-force"],
    ["echo one \\\n  two; git clean -fdx", "git-clean-force"],
  ];
  for (const [command, rule] of KEYWORD_AND_CONTINUATION_CAUGHT) {
    it(`catches the command after a shell keyword or across a backslash continuation: ${JSON.stringify(command)}`, () => {
      assert.deepEqual(classifyDestructiveBash(command, "Bash"), { destructive: true, rule });
      assert.deepEqual(classifyDestructiveBash(command), { destructive: true, rule });
    });
  }

  const KEYWORD_AND_CONTINUATION_ALLOWED: ReadonlyArray<string> = [
    "if [ -f a.txt ]; then git status; fi",
    'for f in src/*.ts; do echo "$f"; done',
    "if npm test; then echo ok; else git stash list; fi",
    "while ! nc -z localhost 5432; do sleep 1; done",
    "time npm test",
    "git log \\\n  --oneline -5",
    "git clean \\\n  -n",
    "npm run build \\\n  && npm test",
    // An escaped backslash before the line break is not a continuation.
    "echo C:\\\\\ngit status",
    // Prose in a heredoc body keeps the reading it had: a line that opens with
    // a keyword is not a command.
    "cat >> NOTES.md <<'EOF'\nif git clean -fd fails, ask first\nthen git stash drop is the last resort\nEOF",
  ];
  for (const command of KEYWORD_AND_CONTINUATION_ALLOWED) {
    it(`allows a harmless command after a keyword or across a continuation: ${JSON.stringify(command)}`, () => {
      assert.deepEqual(classifyDestructiveBash(command, "Bash"), { destructive: false, rule: null });
    });
  }

  it("under PowerShell a backslash that ends a line is the end of a path, not a continuation", () => {
    assert.deepEqual(classifyDestructiveBash("Set-Location C:\\repo\\\ngit clean -fdx", "PowerShell"), {
      destructive: true,
      rule: "git-clean-force",
    });
    assert.equal(classifyDestructiveBash("Get-ChildItem C:\\repo\\\nGet-ChildItem -Recurse", "PowerShell").destructive, false);
    assert.equal(classifyDestructiveBash("Remove-Item C:\\scratch\\\nGet-ChildItem -Recurse", "PowerShell").destructive, false);
  });

  // The comment pass is one walk over the text: an opener with no closer must
  // not send it looking through the rest of the text again and again.
  const LONG_COMMENT_INPUTS: ReadonlyArray<[string, string]> = [
    ["unclosed block comment openers", "<# ".repeat(70_000)],
    ["closed block comments", "<# c #> ".repeat(25_000)],
    ["comment lines", "# c\n".repeat(50_000)],
    ["escaped quotes", '\\" `" '.repeat(34_000)],
  ];
  for (const [name, command] of LONG_COMMENT_INPUTS) {
    it(`reads 200 KB of ${name} in under a second`, () => {
      for (const tool of ["Bash", "PowerShell"]) {
        const started = performance.now();
        classifyDestructiveBash(command, tool);
        const elapsed = performance.now() - started;
        assert.ok(elapsed < 1000, `${tool} took ${elapsed.toFixed(0)} ms for ${command.length} chars`);
      }
    });
  }

  // `git branch -d` is the safe delete: git refuses it for an unmerged branch.
  // The substring `git branch -D` was compared in lower case, so every `-d`
  // that no global option separated from `branch` was denied as a force delete.
  const SAFE_BRANCH_DELETE_ALLOWED: ReadonlyArray<string> = [
    "git branch -d fix/merged-branch",
    "git.exe branch -d fix/merged-branch",
    "git fetch --prune && git branch -d fix/guard-regression",
    "git branch -d fix/guard-regression; git fetch --prune",
    "git branch --merged main | grep -v main | xargs -r git branch -d",
    "git branch --merged | Where-Object { $_ -notmatch 'main' } | ForEach-Object { git branch -d $_.Trim() }",
    'ssh build-host "cd repo && git branch -d fix/merged-branch"',
  ];
  for (const tool of [undefined, "Bash", "PowerShell", "Monitor"]) {
    for (const command of SAFE_BRANCH_DELETE_ALLOWED) {
      it(`allows the safe branch delete (${tool ?? "no tool named"}): ${command}`, () => {
        assert.deepEqual(classifyDestructiveBash(command, tool), { destructive: false, rule: null });
      });
    }
  }

  const FORCE_BRANCH_DELETE_CAUGHT: ReadonlyArray<[string, string]> = [
    ["git branch -D feat/old", "git-branch-force-delete"],
    ["GIT.EXE branch -D feat/old", "git-branch-force-delete"],
    ["git branch -d --force feat/old", "git-branch-force-delete"],
    // Text no rule reads as a command keeps the substring, with its capital D.
    ["git branch --merged | xargs git branch -D", "substring:git branch -D"],
    ["git branch --merged | xargs -n1 git.exe branch -D", "substring:git branch -D"],
    ['ssh build-host "cd repo && git branch -D feat/old"', "substring:git branch -D"],
  ];
  for (const tool of [undefined, "Bash", "PowerShell", "Monitor"]) {
    for (const [command, rule] of FORCE_BRANCH_DELETE_CAUGHT) {
      it(`still catches the force delete (${tool ?? "no tool named"}): ${command}`, () => {
        assert.deepEqual(classifyDestructiveBash(command, tool), { destructive: true, rule });
      });
    }
  }

  // A one-word message written without quotes ends at the separator that
  // follows it. The value pattern took every non-blank character, so the `;`
  // or `&&` went with the message and the next command was glued to the commit.
  const AFTER_UNQUOTED_MESSAGE_CAUGHT: ReadonlyArray<[string, string, string | undefined]> = [
    ["git commit -m wip; git clean -fdx", "git-clean-force", undefined],
    ["git commit -m wip&&git clean -fdx", "git-clean-force", undefined],
    ["git commit --message=wip; git stash drop", "git-stash-drop", undefined],
    ["git commit -m wip|| git checkout -- .", "git-checkout-discard", undefined],
    ["git commit -m wip; Remove-Item build -Recurse -Force", "powershell-remove-item", "PowerShell"],
  ];
  for (const [command, rule, tool] of AFTER_UNQUOTED_MESSAGE_CAUGHT) {
    it(`catches the command after an unquoted one-word message: ${command}`, () => {
      assert.deepEqual(classifyDestructiveBash(command, tool), { destructive: true, rule });
    });
  }

  it("an unquoted message ends at a separator, and a quoted one keeps its separators", () => {
    assert.equal(stripMessageArgs("git commit -m wip; git push"), "git commit -m ; git push");
    assert.equal(stripMessageArgs("git commit -m wip&&git push"), "git commit -m &&git push");
    assert.equal(stripMessageArgs("git commit --message=wip|cat"), "git commit --message |cat");
    assert.equal(stripMessageArgs('git commit -m "a; b && c"'), "git commit -m ");
    assert.equal(classifyDestructiveBash("git commit -m wip; git status").destructive, false);
    assert.equal(classifyDestructiveBash('git commit -m "wip; git clean -fdx"').destructive, false);
  });

  it("stripMessageArgs blanks message and body values but keeps the flag", () => {
    assert.equal(stripMessageArgs('git commit -m "rm -rf x"'), "git commit -m ");
    assert.equal(stripMessageArgs("gh pr create --body-file body.md"), "gh pr create --body-file ");
    assert.equal(stripMessageArgs('bash -c "rm -rf /tmp/x"'), 'bash -c "rm -rf /tmp/x"');
  });

  it("stripMessageArgs leaves the directory of git -C alone", () => {
    assert.equal(stripMessageArgs("git -C ../wt clean -fdx"), "git -C ../wt clean -fdx");
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

// The push gate asks where each git command runs. `dirs` carried the command's
// own `-C` values only, so a `cd` earlier on the line was lost.
describe("lib/destructive-bash — gitInvocations: where each git command runs", () => {
  const where = (command: string, tool?: string): string[] =>
    gitInvocations(command, tool).map((git) => `${git.sub}@${git.dirs.join("|")}`);

  const rows: ReadonlyArray<[string, string | undefined, string[]]> = [
    ["git push", undefined, ["push@"]],
    ["cd ../wt && git push -u origin HEAD", undefined, ["push@../wt"]],
    ['cd "D:/my repo" && git commit -m x', undefined, ['commit@"D:/my repo"']],
    ["cd a && cd b && git -C c status", undefined, ["status@a|b|c"]],
    ["cd -P ../wt 2>/dev/null && git push", undefined, ["push@../wt"]],
    // `popd` and `cd -` go back to a place the reader cannot name.
    ["pushd ../wt; git push; popd; git status", undefined, ["push@../wt", "status@-"]],
    ["cd && git status", undefined, ["status@~"]],
    ["cd - && git status", undefined, ["status@-"]],
    ["Set-Location ..\\wt; git push", "PowerShell", ["push@..\\wt"]],
    ["Set-Location -LiteralPath 'D:\\my repo'; git push", "PowerShell", ["push@'D:\\my repo'"]],
    ["sl ..\\wt; if ($?) { git push }", "PowerShell", ["push@..\\wt"]],
    ['cmd /c "cd /d D:\\wt && git push"', undefined, ["push@D:\\wt"]],
    // A cd inside a group ends with the group; inside braces it does not.
    ["(cd ../wt && git fetch) && git push", undefined, ["fetch@../wt", "push@"]],
    ["{ cd ../wt; git fetch; }; git push", undefined, ["fetch@../wt", "push@../wt"]],
    // A wrapper starts where the line stands and keeps its own cd to itself.
    ['cd ../wt && bash -c "cd sub && git status"; git push', undefined, ["status@../wt|sub", "push@../wt"]],
    // A directory named in a message or a string is not a cd.
    ['git commit -m "cd ../wt first" && git push', undefined, ["commit@", "push@"]],
    ['echo "cd ../wt"; git push', undefined, ["push@"]],
  ];
  for (const [command, tool, expected] of rows) {
    it(`reads ${JSON.stringify(command)}`, () => {
      assert.deepEqual(where(command, tool), expected);
    });
  }

  it("reads 200 KB of cd commands, in a row and in groups, in under a second", () => {
    for (const command of ["cd x; ".repeat(34_000), "(cd x)".repeat(34_000), "cd x && git push; ".repeat(11_000)]) {
      const started = performance.now();
      gitInvocations(command, "Bash");
      const elapsed = performance.now() - started;
      assert.ok(elapsed < 1000, `took ${elapsed.toFixed(0)} ms for ${command.length} chars`);
    }
  });
});
