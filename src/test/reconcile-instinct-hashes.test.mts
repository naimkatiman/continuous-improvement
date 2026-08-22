import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { applyGroup, discoverGroups, mergeJsonl, selectGroups } from "../bin/reconcile-instinct-hashes.mjs";

describe("mergeJsonl", () => {
  it("dedupes identical lines and sorts by ts", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-merge-jsonl-"));
    const a = join(dir, "a.jsonl");
    const b = join(dir, "b.jsonl");
    writeFileSync(a, '{"ts":"2026-08-22T02:00:00Z","tool":"Read"}\n{"ts":"2026-08-22T01:00:00Z","tool":"Bash"}\n');
    writeFileSync(b, '{"ts":"2026-08-22T01:00:00Z","tool":"Bash"}\n{"ts":"2026-08-22T03:00:00Z","tool":"Edit"}\n');
    const merged = mergeJsonl([a, b]).trim().split("\n");
    assert.equal(merged.length, 3);
    assert.match(merged[0]!, /01:00:00Z/);
    assert.match(merged[2]!, /03:00:00Z/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("discoverGroups + applyGroup", () => {
  let root = "";

  before(() => {
    root = mkdtempSync(join(tmpdir(), "ci-reconcile-"));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("merges a C:/ alias into the canonical c:/ hash and is idempotent", () => {
    const canonical = hashProjectRoot("c:/Ai/DrSaid-standup");
    const alias = "3ef4426c6e15";
    const aliasDir = join(root, alias);
    mkdirSync(aliasDir, { recursive: true });
    writeFileSync(
      join(aliasDir, "project.json"),
      `${JSON.stringify({ id: alias, name: "DrSaid-standup", root: "C:/Ai/DrSaid-standup", created_at: "2026-06-24T02:49:40Z" })}\n`,
    );
    writeFileSync(
      join(aliasDir, "observations.jsonl"),
      '{"ts":"2026-06-24T02:49:40Z","tool":"Read","project_name":"DrSaid-standup"}\n{"ts":"2026-08-22T02:50:09Z","tool":"Edit","project_name":"DrSaid-standup"}\n',
    );
    writeFileSync(join(aliasDir, "keep-me.yaml"), "id: keep-me\nconfidence: 0.6\n---\nbody\n");

    const planned = discoverGroups(root);
    assert.equal(planned.length, 1);
    assert.equal(planned[0]!.canonicalHash, canonical);
    assert.equal(planned[0]!.members[0]!.hash, alias);

    const first = applyGroup(root, planned[0]!);
    assert.equal(first.copiedRows, 2);
    assert.deepEqual(first.aliases, [alias]);

    const destObs = readFileSync(join(root, canonical, "observations.jsonl"), "utf8").trim().split("\n");
    assert.equal(destObs.length, 2);
    const destProject = JSON.parse(readFileSync(join(root, canonical, "project.json"), "utf8")) as { root: string };
    assert.equal(destProject.root, "c:/Ai/DrSaid-standup");
    assert.ok(readFileSync(join(root, canonical, "keep-me.yaml"), "utf8").includes("keep-me"));
    const aliasMarker = JSON.parse(readFileSync(join(aliasDir, "alias.json"), "utf8")) as { canonical: string };
    assert.equal(aliasMarker.canonical, canonical);

    const secondPlan = discoverGroups(root);
    assert.equal(secondPlan.length, 0, "already-migrated alias must not reappear");
  });

  it("selectGroups --only matches alias or canonical hash", () => {
    const groups = [
      {
        canonicalHash: "fd437f3c26bd",
        canonicalRoot: "c:/Ai/DrSaid-standup",
        name: "DrSaid-standup",
        members: [{ hash: "3ef4426c6e15", root: "C:/Ai/DrSaid-standup", name: "DrSaid-standup", rows: 9 }],
      },
      {
        canonicalHash: "8168f29d38ac",
        canonicalRoot: "c:/Ai/continuous-improvement",
        name: "continuous-improvement",
        members: [{ hash: "137f2f54ec70", root: "C:/Ai/continuous-improvement", name: "ci", rows: 2 }],
      },
    ];
    assert.equal(selectGroups(groups, []).length, 2);
    assert.equal(selectGroups(groups, ["3ef4426c6e15"]).length, 1);
    assert.equal(selectGroups(groups, ["3ef4426c6e15"])[0]!.name, "DrSaid-standup");
    assert.equal(selectGroups(groups, ["8168f29d38ac"]).length, 1);
  });
});
