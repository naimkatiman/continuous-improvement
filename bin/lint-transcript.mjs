#!/usr/bin/env node
/**
 * Agent Transcript Linter
 *
 * Analyzes AI agent transcripts/observations for compliance with
 * the 7 Laws of AI Agent Discipline.
 *
 * Usage:
 *   node bin/lint-transcript.mjs <file.jsonl>         # Lint a transcript file
 *   cat observations.jsonl | node bin/lint-transcript.mjs --stdin  # Pipe input
 *   node bin/lint-transcript.mjs --help
 *
 * Exit codes:
 *   0 — no violations (or --strict not set)
 *   1 — violations found (with --strict)
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
const LAWS = {
    1: { name: "Research Before Executing", patterns: [] },
    2: { name: "Plan Is Sacred", patterns: [] },
    3: { name: "One Thing at a Time", patterns: [] },
    4: { name: "Verify Before Reporting", patterns: [] },
    5: { name: "Reflect After Sessions", patterns: [] },
    6: { name: "Iterate One Change", patterns: [] },
    7: { name: "Learn From Every Session", patterns: [] },
};
function analyzeTranscript(events, parseFailures) {
    const violations = [];
    const stats = {
        totalEvents: events.length,
        toolCalls: 0,
        researchTools: 0,
        writeTools: 0,
        verifyTools: 0,
        sessions: new Set(),
        parseFailures,
    };
    for (const event of events) {
        stats.toolCalls++;
        if (event.session_id) {
            stats.sessions.add(event.session_id);
        }
        const tool = event.tool || event.tool_name || "";
        const input = event.tool_input || event.input || {};
        const command = typeof input.command === "string" ? input.command : "";
        if (["Grep", "Glob", "Read"].includes(tool)) {
            stats.researchTools++;
        }
        if (["Write", "Edit"].includes(tool)) {
            stats.writeTools++;
        }
        if (tool === "Bash" && /\b(test|build|npm run|jest|vitest|bun test|deno test|ava|tap|mocha|pytest|go test|cargo test|gradle test|mvn test)\b/.test(command)) {
            stats.verifyTools++;
        }
    }
    let lastResearchIdx = -1;
    for (let index = 0; index < events.length; index++) {
        const tool = events[index]?.tool || events[index]?.tool_name || "";
        if (["Grep", "Glob", "Read"].includes(tool)) {
            lastResearchIdx = index;
        }
        if (["Write", "Edit"].includes(tool) && lastResearchIdx === -1) {
            violations.push({
                law: 1,
                severity: "high",
                message: `Write/Edit at event ${index} without any prior research (Grep/Glob/Read)`,
                event: index,
            });
            // Continue checking for more violations
        }
    }
    if (stats.writeTools > 0 && stats.researchTools === 0) {
        violations.push({
            law: 1,
            severity: "high",
            message: `${stats.writeTools} writes with 0 research operations. Agent likely skipped research.`,
        });
    }
    else if (stats.writeTools > stats.researchTools * 3) {
        violations.push({
            law: 1,
            severity: "medium",
            message: `Write-to-research ratio is ${stats.writeTools}:${stats.researchTools}. Consider more research.`,
        });
    }
    let consecutiveEdits = 0;
    const editedFiles = new Set();
    for (const event of events) {
        const tool = event.tool || event.tool_name || "";
        const input = event.tool_input || event.input || {};
        if (["Write", "Edit"].includes(tool)) {
            consecutiveEdits++;
            if (typeof input.file_path === "string") {
                editedFiles.add(input.file_path);
            }
        }
        else {
            // Reset on any non-write tool (verification, research, etc.)
            consecutiveEdits = 0;
        }
        if (consecutiveEdits > 5) {
            violations.push({
                law: 3,
                severity: "medium",
                message: `${consecutiveEdits} consecutive edits without verification. Editing multiple files at once.`,
            });
            consecutiveEdits = 0;
        }
    }
    if (stats.writeTools > 0 && stats.verifyTools === 0) {
        violations.push({
            law: 4,
            severity: "high",
            message: `${stats.writeTools} code changes with 0 verification commands (test/build). Agent may have declared done without verifying.`,
        });
    }
    if (editedFiles.size > 8) {
        violations.push({
            law: 6,
            severity: "medium",
            message: `${editedFiles.size} different files modified. Consider smaller, focused iterations.`,
        });
    }
    const maxViolations = 7;
    const violationWeight = violations.reduce((sum, violation) => {
        return sum + (violation.severity === "high" ? 2 : 1);
    }, 0);
    const score = Math.max(0, Math.round(100 - (violationWeight / maxViolations) * 100));
    return { violations, stats, score, parseFailures };
}
function formatReport(result) {
    const { violations, stats, score, parseFailures } = result;
    const lines = [];
    lines.push("## Agent Discipline Report");
    lines.push("");
    lines.push(`**Score:** ${score}/100`);
    lines.push(`**Events analyzed:** ${stats.totalEvents}`);
    lines.push(`**Tool calls:** ${stats.toolCalls}`);
    lines.push(`**Research ops:** ${stats.researchTools} | **Write ops:** ${stats.writeTools} | **Verify ops:** ${stats.verifyTools}`);
    if (parseFailures > 0) {
        lines.push(`**Parse failures:** ${parseFailures} (malformed JSON lines skipped)`);
    }
    lines.push("");
    if (violations.length === 0) {
        lines.push("No law violations detected. Good discipline!");
    }
    else {
        lines.push(`### Violations (${violations.length})`);
        lines.push("");
        for (const violation of violations) {
            const severity = violation.severity === "high" ? "HIGH" : "MEDIUM";
            lines.push(`- **[${severity}] Law ${violation.law}: ${LAWS[violation.law].name}**`);
            lines.push(`  ${violation.message}`);
        }
    }
    lines.push("");
    lines.push("---");
    lines.push("*Generated by [continuous-improvement](https://github.com/naimkatiman/continuous-improvement) transcript linter*");
    return lines.join("\n");
}
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Agent Transcript Linter — The 7 Laws of AI Agent Discipline

Usage:
  node bin/lint-transcript.mjs <file.jsonl>         Lint a transcript file
  cat obs.jsonl | node bin/lint-transcript.mjs --stdin  Pipe input
  node bin/lint-transcript.mjs --help               Show help

Options:
  --stdin     Read from stdin
  --strict    Exit 1 if violations found
  --json      Output as JSON instead of markdown
`);
    process.exit(0);
}
const isStrict = args.includes("--strict");
const isJson = args.includes("--json");
const isStdin = args.includes("--stdin");
async function main() {
    let lines = [];
    if (isStdin) {
        const rl = createInterface({ input: process.stdin, terminal: false });
        for await (const line of rl) {
            if (line.trim()) {
                lines.push(line.trim());
            }
        }
    }
    else {
        const filePath = args.find((arg) => !arg.startsWith("--"));
        if (!filePath) {
            console.error("Error: provide a file path or use --stdin");
            process.exit(1);
        }
        const content = readFileSync(filePath, "utf8");
        lines = content.split("\n").filter((line) => line.trim().length > 0);
    }
    const events = [];
    let parseFailures = 0;
    for (const line of lines) {
        try {
            events.push(JSON.parse(line));
        }
        catch {
            parseFailures++;
        }
    }
    if (events.length === 0) {
        console.log("No events found to analyze.");
        process.exit(0);
    }
    const result = analyzeTranscript(events, parseFailures);
    if (isJson) {
        console.log(JSON.stringify(result, null, 2));
    }
    else {
        console.log(formatReport(result));
    }
    if (process.env.GITHUB_OUTPUT) {
        const outputLines = [
            `violations=${result.violations.length}`,
            `score=${result.score}`,
        ];
        const { appendFileSync } = await import("node:fs");
        for (const line of outputLines) {
            appendFileSync(process.env.GITHUB_OUTPUT, line + "\n");
        }
    }
    if (isStrict && result.violations.length > 0) {
        process.exit(1);
    }
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
