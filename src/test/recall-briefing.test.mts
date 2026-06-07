import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideBriefing, formatBriefing } from "../lib/recall-briefing.mjs";
import type { RecallHit } from "../lib/recall-index.mjs";

function hit(partial: Partial<RecallHit> = {}): RecallHit {
  return {
    ts: "2026-06-01T10:00:00.000Z",
    session: "s1",
    tool: "Edit",
    snippet: "fixed the login redirect loop in useAuth.ts",
    score: 3.2,
    index: 0,
    ...partial,
  };
}

const LONG_PROMPT = "debug why the login redirect loops on mobile";

describe("decideBriefing — gating", () => {
  it("does not brief when disabled", () => {
    const d = decideBriefing({ enabled: false, alreadyBriefed: false, prompt: LONG_PROMPT, hits: [hit()] });
    assert.equal(d.shouldBrief, false);
    assert.equal(d.reminder, null);
  });

  it("does not brief when the session was already briefed", () => {
    const d = decideBriefing({ enabled: true, alreadyBriefed: true, prompt: LONG_PROMPT, hits: [hit()] });
    assert.equal(d.shouldBrief, false);
    assert.equal(d.reminder, null);
  });

  it("does not brief when there are no hits", () => {
    const d = decideBriefing({ enabled: true, alreadyBriefed: false, prompt: LONG_PROMPT, hits: [] });
    assert.equal(d.shouldBrief, false);
    assert.equal(d.reminder, null);
  });

  it("briefs on a fresh, enabled session with hits and a substantive prompt", () => {
    const d = decideBriefing({ enabled: true, alreadyBriefed: false, prompt: LONG_PROMPT, hits: [hit()] });
    assert.equal(d.shouldBrief, true);
    assert.ok(d.reminder && d.reminder.includes("<system-reminder>"));
    assert.ok(d.reminder!.includes("ci_recall"));
    assert.ok(d.reminder!.includes("useAuth.ts"));
  });
});

describe("decideBriefing — boundaries (fail closed, never throw)", () => {
  it("does not brief on an empty prompt", () => {
    const d = decideBriefing({ enabled: true, alreadyBriefed: false, prompt: "", hits: [hit()] });
    assert.equal(d.shouldBrief, false);
  });

  it("does not brief on a whitespace-only prompt", () => {
    const d = decideBriefing({ enabled: true, alreadyBriefed: false, prompt: "    \n\t  ", hits: [hit()] });
    assert.equal(d.shouldBrief, false);
  });

  it("does not brief on a too-short prompt (below the noise floor)", () => {
    const d = decideBriefing({ enabled: true, alreadyBriefed: false, prompt: "hi", hits: [hit()] });
    assert.equal(d.shouldBrief, false);
  });

  it("treats a non-string prompt as no brief without throwing", () => {
    const d = decideBriefing({
      enabled: true,
      alreadyBriefed: false,
      prompt: undefined as unknown as string,
      hits: [hit()],
    });
    assert.equal(d.shouldBrief, false);
  });

  it("treats non-array hits as no brief without throwing", () => {
    const d = decideBriefing({
      enabled: true,
      alreadyBriefed: false,
      prompt: LONG_PROMPT,
      hits: null as unknown as RecallHit[],
    });
    assert.equal(d.shouldBrief, false);
  });

  it("caps the briefing at maxHits", () => {
    const many = [hit({ index: 0 }), hit({ index: 1 }), hit({ index: 2 }), hit({ index: 3 }), hit({ index: 4 })];
    const d = decideBriefing({ enabled: true, alreadyBriefed: false, prompt: LONG_PROMPT, hits: many, maxHits: 2 });
    assert.equal(d.shouldBrief, true);
    const bulletCount = (d.reminder!.match(/^- /gm) || []).length;
    assert.equal(bulletCount, 2);
  });

  it("respects a custom minPromptLength", () => {
    const d = decideBriefing({
      enabled: true,
      alreadyBriefed: false,
      prompt: "short one",
      hits: [hit()],
      minPromptLength: 100,
    });
    assert.equal(d.shouldBrief, false);
  });
});

describe("formatBriefing", () => {
  it("wraps the briefing in a system-reminder and names ci_recall", () => {
    const out = formatBriefing([hit()]);
    assert.ok(out.startsWith("<system-reminder>"));
    assert.ok(out.trimEnd().endsWith("</system-reminder>"));
    assert.ok(out.includes("ci_recall"));
  });

  it("renders one bullet per hit with the tool name", () => {
    const out = formatBriefing([hit({ tool: "Edit" }), hit({ tool: "Bash", snippet: "ran npm test" })]);
    assert.ok(out.includes("Edit"));
    assert.ok(out.includes("Bash"));
    assert.equal((out.match(/^- /gm) || []).length, 2);
  });

  it("collapses whitespace and tolerates empty tool/snippet/ts", () => {
    const out = formatBriefing([{ ts: "", session: "", tool: "", snippet: "a\n\n  b", score: 1, index: 0 }]);
    assert.ok(!out.includes("\n\n  b"));
    assert.ok(out.includes("a b"));
  });
});
