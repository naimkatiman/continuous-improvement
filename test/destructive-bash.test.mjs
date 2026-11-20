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
const CAUGHT = [
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
const POWERSHELL_DELETE_CAUGHT = [
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
const POWERSHELL_DELETE_ALLOWED = [
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
const ALLOWED = [
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
    const FORMAT_PARAMETER_ALLOWED = [
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
    const GIT_GLOBAL_OPTION_CAUGHT = [
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
    const GIT_GLOBAL_OPTION_ALLOWED = [
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
    const COMMAND_WORD_SPELLING_CAUGHT = [
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
    const COMMAND_WORD_SPELLING_ALLOWED = [
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
    // A string literal is an expression, not a command. The rules stripped a
    // leading quote from the first word, so a PowerShell string that begins with
    // "Format" was read as the volume formatter, and one that begins with "rd"
    // as cmd's tree delete.
    const STRING_LITERAL_ALLOWED = [
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
    const FORMAT_VOLUME_CAUGHT = [
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
    const SCRIPT_BLOCK_CAUGHT = [
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
    const SCRIPT_BLOCK_ALLOWED = [
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
    const AFTER_BACKTICK_SUBSTITUTION_CAUGHT = [
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
    const PROSE_AND_PATTERNS_ALLOWED = [
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
    const AROUND_HEREDOC_CAUGHT = [
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
