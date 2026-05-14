#!/usr/bin/env node
/**
 * Runtime UserPromptSubmit prompt-router hook.
 *
 * Reads the user prompt, matches it against patterns in
 * hooks/route-table.json, and emits a single `<system-reminder>` recommending
 * the matched skill. When no row matches, the hook emits nothing — the prompt
 * passes through untouched.
 *
 * Stdin  : JSON { prompt, session_id?, transcript_path?, cwd? }
 * Stdout : JSON { hookSpecificOutput: { hookEventName: "UserPromptSubmit",
 *                                       additionalContext: string } }
 *          OR empty when there is no match.
 * Exit   : 0 always — routing decisions live in stdout, never in exit code.
 *
 * Fail-open: any unexpected error reading stdin / parsing the route table /
 * compiling a pattern → emit nothing and exit 0. The hook never blocks a
 * prompt on its own bugs.
 *
 * Telemetry: each match appends one JSONL line to
 * ~/.claude/instincts/<project-hash>/route-prompt.jsonl with the row index,
 * skill, and pattern. Telemetry failures never change the decision.
 *
 * Route table schema (hooks/route-table.json):
 *   {
 *     "rows": [
 *       { "pattern": "regex source", "flags": "i", "skill": "skill-name",
 *         "reason": "one-line description" }
 *     ]
 *   }
 * Rows are evaluated in order; first match wins.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
function readStdin() {
    try {
        return readFileSync(0, "utf8");
    }
    catch {
        return "";
    }
}
function resolveHome() {
    return process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}
function resolveProjectRoot() {
    const fromEnv = process.env.CLAUDE_PROJECT_DIR;
    if (fromEnv)
        return fromEnv;
    try {
        const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (root)
            return root;
    }
    catch {
        // not in a git repo
    }
    return "global";
}
function telemetryPath(home) {
    const hash = createHash("sha256")
        .update(resolveProjectRoot())
        .digest("hex")
        .slice(0, 12);
    return join(home, ".claude", "instincts", hash, "route-prompt.jsonl");
}
function writeTelemetry(home, event) {
    try {
        const path = telemetryPath(home);
        const dir = dirname(path);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        appendFileSync(path, `${JSON.stringify(event)}\n`);
    }
    catch {
        // fail-open
    }
}
function loadRouteTable() {
    // Hook lives at <plugin-root>/hooks/route-prompt.mjs at runtime; the table
    // sits next to it. import.meta.url gives the file:// URL of the compiled
    // .mjs.
    try {
        const here = fileURLToPath(new URL(".", import.meta.url));
        const tablePath = join(here, "route-table.json");
        const raw = readFileSync(tablePath, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.rows))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function findMatch(prompt, table) {
    for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        if (!row || typeof row.pattern !== "string" || typeof row.skill !== "string") {
            continue;
        }
        let rx;
        try {
            rx = new RegExp(row.pattern, row.flags ?? "");
        }
        catch {
            continue;
        }
        if (rx.test(prompt)) {
            return { row, index: i };
        }
    }
    return null;
}
function buildContext(row) {
    const reason = row.reason
        ? `${row.reason}\nConsider invoking \`/${row.skill}\` now.`
        : `Consider invoking \`/${row.skill}\` now.`;
    return `<system-reminder>\nPrompt-router suggestion: ${reason}\n</system-reminder>`;
}
function emit(output) {
    if (output !== null) {
        process.stdout.write(`${JSON.stringify(output)}\n`);
    }
    process.exit(0);
}
function main() {
    const raw = readStdin();
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        emit(null);
        return;
    }
    const prompt = payload.prompt;
    if (typeof prompt !== "string" || prompt.length === 0) {
        emit(null);
        return;
    }
    const table = loadRouteTable();
    if (!table) {
        emit(null);
        return;
    }
    const match = findMatch(prompt, table);
    const home = resolveHome();
    if (!match) {
        writeTelemetry(home, {
            ts: new Date().toISOString(),
            hook: "route-prompt",
            matched: false,
        });
        emit(null);
        return;
    }
    writeTelemetry(home, {
        ts: new Date().toISOString(),
        hook: "route-prompt",
        matched: true,
        row_index: match.index,
        skill: match.row.skill,
        pattern: match.row.pattern,
    });
    emit({
        hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: buildContext(match.row),
        },
    });
}
main();
