import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isReadOnlyLookup } from "../lib/shell-intent.mjs";

// The transcript linter asks of every Bash or PowerShell call whether it looked
// something up without changing anything. The answer comes from the command
// word of each simple command on the line, never from a word that merely
// appears somewhere in it.
describe("isReadOnlyLookup", () => {
  const LOOKUPS: readonly string[] = [
    "cat src/a.ts",
    "head -50 README.md",
    "tail -n 20 build.log",
    "less notes.txt",
    "sed -n '1,40p' src/a.ts",
    "rg -n retry src",
    'grep -rn "retry" src/',
    "ls",
    "ls -la src",
    'find . -name "*.ts" -not -path "./node_modules/*"',
    'find src -name "*.ts" -exec grep -l retry {} +',
    "git log --oneline -5",
    "git -C ../other show HEAD:src/a.ts",
    "git --no-pager diff --stat",
    "git status --short",
    "git blame -L 1,10 src/a.ts",
    "git grep -n retry",
    "gh pr view 12 --json title",
    "gh issue list --state open",
    "gh repo view owner/repo",
    "gh api repos/owner/repo/readme",
    "gh api -X GET search/code -f q=retry",
    "curl -s https://example.com/api",
    "curl -fsSL https://example.com/x.json",
    "Get-Content src/a.ts -TotalCount 40",
    "Select-String -Path src/*.ts -Pattern retry",
    "Get-ChildItem -Recurse src",
    "Test-Path out.txt",
    "gc package.json",
  ];

  for (const command of LOOKUPS) {
    it(`a lookup: ${command}`, () => {
      assert.equal(isReadOnlyLookup(command), true);
    });
  }

  const LOOKUPS_INSIDE_A_LONGER_LINE: readonly string[] = [
    "cd /repo && git log --oneline -3",
    "cat package.json | head -20",
    "git log | head -5",
    "FOO=1 git status",
    "(cd sub && ls)",
    'echo "---"; cat a.txt',
    "npm install\ngit status",
    "mkdir -p out; ls out",
    'echo "$(date)" && rg -n retry src 2>/dev/null',
    "if [ -f a.txt ]; then cat a.txt; fi",
    'for f in src/*.ts; do grep -l retry "$f"; done',
    "sudo cat /etc/hosts",
    "timeout 30 git log -3",
    'bash -lc "git status"',
    'pwsh -NoProfile -Command "Get-Content a.txt"',
    "cmd /c type a.txt",
    "/usr/bin/git log -3",
    '& "C:\\Program Files\\Git\\bin\\git.exe" log -3',
    "$log = git log --oneline -5",
    "Get-ChildItem src | Select-String retry",
    "git log `\n  --oneline -5",
    "git log \\\n  --oneline -5",
    // `<<` inside a quoted argument is not a here-document
    'echo "a << b" && cat a.txt',
    // the line after a here-document is a command again
    "cat > notes.txt <<'EOF'\nhello\nEOF\ngit status",
  ];

  for (const command of LOOKUPS_INSIDE_A_LONGER_LINE) {
    it(`a lookup at a command position: ${JSON.stringify(command)}`, () => {
      assert.equal(isReadOnlyLookup(command), true);
    });
  }

  const NOT_LOOKUPS: readonly string[] = [
    "",
    "   ",
    "npm install",
    "npm test",
    "mkdir -p src/new",
    'git commit -m "read the docs"',
    "git push origin feature",
    "git checkout -b feature",
    "git add src/a.ts",
    "echo cat > notes.txt",
    'echo "grep this"',
    // a word that only appears in the line
    "node scripts/cat.js",
    "npx grep-cli",
    "./ls-remote.sh",
    // cat that writes a file from a here-document reads nothing
    "cat > notes.txt <<'EOF'\nhello\nEOF",
    "cat <<'EOF' > a.txt\ngit log\nEOF",
    // the body of a here-document is text, not commands
    "node - <<'EOF'\ncat src/a.ts\nEOF",
    "python - <<PY\nls\nPY",
    'git commit -m "$(cat <<\'EOF\'\nfix: it\'s done\n\ngit log shows "the fix"\nEOF\n)"',
    "@'\ngit log\n'@ | Set-Content notes.txt",
    // sed that edits in place, or prints a rewritten file
    "sed -i 's/a/b/' src/a.ts",
    "sed -i -n 's/a/b/p' src/a.ts",
    'find . -name "*.tmp" -delete',
    'find . -name "*.orig" -exec mv {} /backup \\;',
    "gh pr create --title x --body y",
    "gh pr merge 5 --squash",
    "gh api -X POST repos/owner/repo/issues -f title=x",
    "gh api repos/owner/repo/issues -f title=x",
    "gh api --method DELETE repos/owner/repo/git/refs/heads/x",
    'curl -X POST https://example.com -d \'{"a":1}\'',
    "curl -sS --data-binary @payload.json https://example.com",
    "curl -T file.bin https://example.com/upload",
    "curl -F file=@a.png https://example.com",
    // a filter on another command's output looks nothing up
    "npm install 2>&1 | tail -5",
    "npm run build | grep error",
    "docker compose up -d | head",
    "# cat src/a.ts",
    "echo done # ls",
    'Set-Content a.txt "x"',
    "New-Item -ItemType Directory out",
    "node -e \"require('child_process').execSync('git log')\"",
    "git stash",
  ];

  for (const command of NOT_LOOKUPS) {
    it(`not a lookup: ${JSON.stringify(command)}`, () => {
      assert.equal(isReadOnlyLookup(command), false);
    });
  }
});
