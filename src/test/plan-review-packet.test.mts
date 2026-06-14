import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildReviewPacket,
  extractTldr,
  splitSections,
} from "../lib/plan-review-packet.mjs";

const SAMPLE = [
  "# Slim the ci CLI",
  "",
  "Date: 2026-06-08",
  "",
  "## Goal",
  "",
  "Remove the parts that overlap the core product.",
  "Keep the one piece that is distinct.",
  "",
  "## Changes",
  "",
  "Delete three libs and rewrite the CLI.",
  "",
  "### Sub-detail",
  "",
  "A nested section under Changes.",
  "",
  "## Verification",
  "",
  "Run the full verify suite.",
].join("\n");

describe("splitSections", () => {
  test("numbers each level-2/3 section with an incrementing anchor", () => {
    const sections = splitSections(SAMPLE);
    assert.deepEqual(
      sections.map((s) => s.anchor),
      ["R1", "R2", "R3", "R4"],
    );
    assert.deepEqual(
      sections.map((s) => s.heading),
      ["Goal", "Changes", "Sub-detail", "Verification"],
    );
  });

  test("does not treat the level-1 title as a reviewable section", () => {
    const sections = splitSections(SAMPLE);
    assert.ok(!sections.some((s) => s.heading === "Slim the ci CLI"));
  });

  test("captures the section body up to the next heading", () => {
    const goal = splitSections(SAMPLE).find((s) => s.heading === "Goal");
    assert.ok(goal);
    assert.match(goal.body, /overlap the core product/);
    assert.doesNotMatch(goal.body, /Delete three libs/);
  });

  test("returns no sections for heading-only or empty input", () => {
    assert.deepEqual(splitSections(""), []);
    assert.deepEqual(splitSections("# Title only\n"), []);
  });
});

describe("extractTldr", () => {
  test("pulls the first paragraph of a Goal/Summary/Overview section", () => {
    assert.match(extractTldr(SAMPLE), /Remove the parts that overlap/);
  });

  test("is case-insensitive on the section heading", () => {
    const md = "# T\n\n## summary\n\nThe one-line summary.\n\n## Other\n\nx";
    assert.equal(extractTldr(md), "The one-line summary.");
  });

  test("falls back to the first non-heading paragraph when no Goal section", () => {
    const md = "# Title\n\nFirst real paragraph here.\n\n## Body\n\nmore";
    assert.equal(extractTldr(md), "First real paragraph here.");
  });

  test("returns an empty string for empty input", () => {
    assert.equal(extractTldr(""), "");
  });
});

describe("buildReviewPacket", () => {
  test("includes the plan title and a TLDR line", () => {
    const packet = buildReviewPacket(SAMPLE, { source: "docs/plans/x.md" });
    assert.match(packet, /Slim the ci CLI/);
    assert.match(packet, /TLDR/);
    assert.match(packet, /Remove the parts that overlap/);
    assert.match(packet, /docs\/plans\/x\.md/);
  });

  test("emits a comment placeholder per section keyed to its anchor", () => {
    const packet = buildReviewPacket(SAMPLE);
    assert.match(packet, /\[R1\]/);
    assert.match(packet, /\[R4\]/);
    assert.match(packet, /> Comment \(R1\):/);
    assert.match(packet, /> Comment \(R4\):/);
  });

  test("fails closed on input with no reviewable sections", () => {
    const packet = buildReviewPacket("# Just a title\n");
    assert.doesNotThrow(() => buildReviewPacket(""));
    assert.match(packet, /No reviewable sections/i);
  });

  test("produces identical anchors for CRLF and LF input", () => {
    const lf = buildReviewPacket(SAMPLE);
    const crlf = buildReviewPacket(SAMPLE.replace(/\n/g, "\r\n"));
    const anchorsOf = (s: string) => (s.match(/\[R\d+\]/g) ?? []).join(",");
    assert.equal(anchorsOf(crlf), anchorsOf(lf));
  });
});
