#!/usr/bin/env node
/**
 * plan-pack (`ci-plan-pack`).
 *
 * Turn a plan doc into a commentable review packet a colleague can mark up.
 *
 *   node bin/plan-pack.mjs <plan.md>            write <plan>.review.md
 *   node bin/plan-pack.mjs <plan.md> --stdout   print the packet to stdout
 *   node bin/plan-pack.mjs <plan.md> --gh-issue write the packet, then print a
 *                                               ready-to-run `gh issue create`
 *                                               command (does NOT auto-post)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { buildReviewPacket } from "../lib/plan-review-packet.mjs";
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function reviewPathFor(source) {
    const ext = extname(source);
    return ext ? `${source.slice(0, -ext.length)}.review${ext}` : `${source}.review.md`;
}
function packetTitle(packet) {
    const match = /^# Review packet: (.*)$/m.exec(packet);
    return match ? match[1].trim() : "Plan review";
}
const HELP = `
plan-pack (ci-plan-pack) - turn a plan doc into a commentable review packet

Usage: ci-plan-pack <plan.md> [--stdout] [--gh-issue]

Options:
  --stdout      Print the packet to stdout instead of writing a file
  --gh-issue    Write the packet, then print a 'gh issue create' command
                (does not post anything - you run it)

Examples:
  ci-plan-pack docs/plans/2026-06-15-plan-pack.md
  ci-plan-pack docs/plans/2026-06-15-plan-pack.md --stdout
`;
function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
        console.log(HELP);
        process.exit(args.length === 0 ? 1 : 0);
    }
    const toStdout = args.includes("--stdout");
    const ghIssue = args.includes("--gh-issue");
    const source = args.find((a) => !a.startsWith("-"));
    if (!source) {
        throw new Error("Usage: ci-plan-pack <plan.md> [--stdout] [--gh-issue]");
    }
    const markdown = readFileSync(source, "utf8");
    const packet = buildReviewPacket(markdown, { source });
    if (toStdout) {
        process.stdout.write(packet.endsWith("\n") ? packet : `${packet}\n`);
        return;
    }
    const outPath = reviewPathFor(source);
    writeFileSync(outPath, packet.endsWith("\n") ? packet : `${packet}\n`);
    console.log(`Wrote review packet: ${outPath}`);
    if (ghIssue) {
        const title = packetTitle(packet);
        console.log("\nTo open it for comments on GitHub, run:");
        console.log(`  gh issue create --title "${title}" --body-file "${outPath}"`);
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main();
    }
    catch (error) {
        console.error(`Error: ${getErrorMessage(error)}`);
        process.exit(1);
    }
}
