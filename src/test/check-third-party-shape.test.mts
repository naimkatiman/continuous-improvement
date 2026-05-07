import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkThirdPartyShape,
  discoverSnapshots,
  parseManifestEntries,
} from "../bin/check-third-party-shape.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-third-party-shape.mjs");

const SHA_40 = "f2cbfbefebbfef77321e4c9abc9e949826bea9d7";
const SHA_40_ALT = "742dca58ae557bc67afec9ea8e6de59c085f0534";

function setupFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "third-party-shape-test-"));
  mkdirSync(join(root, "third-party"), { recursive: true });
  return root;
}

function writeSnapshot(
  root: string,
  name: string,
  options: {
    ourNotes?: string | null;
    license?: string | null;
  } = {},
): void {
  const dir = join(root, "third-party", name);
  mkdirSync(dir, { recursive: true });
  if (options.ourNotes !== null) {
    writeFileSync(
      join(dir, "OUR_NOTES.md"),
      options.ourNotes ?? `# OUR_NOTES — ${name}\nNon-empty.`,
    );
  }
  if (options.license !== null) {
    writeFileSync(
      join(dir, "LICENSE"),
      options.license ?? "MIT License\n\nCopyright (c) test\n",
    );
  }
}

function writeManifest(
  root: string,
  entries: Array<{
    heading: string;
    pinnedSha: string | null;
    localPath: string | null;
  }>,
): void {
  const blocks = entries.map((e) => {
    const rows: string[] = [`### ${e.heading}`, "", "| Field | Value |", "|---|---|"];
    if (e.pinnedSha !== null) {
      rows.push(`| Pinned SHA | \`${e.pinnedSha}\` |`);
    }
    if (e.localPath !== null) {
      rows.push(`| Local path | \`${e.localPath}\` |`);
    }
    return rows.join("\n");
  });
  const body = ["# third-party/MANIFEST.md", "", ...blocks, ""].join("\n\n");
  writeFileSync(join(root, "third-party", "MANIFEST.md"), body);
}

describe("check-third-party-shape — pure functions", () => {
  it("discoverSnapshots returns snapshot dir names, ignoring files at third-party/ root", () => {
    const root = setupFixture();
    try {
      writeSnapshot(root, "alpha");
      writeSnapshot(root, "beta");
      writeFileSync(join(root, "third-party", "MANIFEST.md"), "# manifest\n");
      writeFileSync(join(root, "third-party", "README.md"), "# readme\n");

      const names = discoverSnapshots(root)
        .map((s) => s.name)
        .sort();
      assert.deepEqual(names, ["alpha", "beta"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("discoverSnapshots reports OUR_NOTES.md and LICENSE presence per snapshot", () => {
    const root = setupFixture();
    try {
      writeSnapshot(root, "complete"); // has both
      writeSnapshot(root, "no-notes", { ourNotes: null });
      writeSnapshot(root, "no-license", { license: null });

      const map = new Map(discoverSnapshots(root).map((s) => [s.name, s]));
      assert.equal(map.get("complete")?.hasOurNotes, true);
      assert.equal(map.get("complete")?.hasLicense, true);
      assert.equal(map.get("no-notes")?.hasOurNotes, false);
      assert.equal(map.get("no-license")?.hasLicense, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("parseManifestEntries extracts heading + pinnedSha + localPath", () => {
    const text = [
      "# manifest",
      "",
      "### foo",
      "",
      "| Pinned SHA | `" + SHA_40 + "` |",
      "| Local path | `third-party/foo/` |",
      "",
      "### bar/qux",
      "",
      "| Pinned SHA | `" + SHA_40_ALT + "` |",
      "| Local path | `third-party/bar-qux/` |",
      "",
    ].join("\n");
    const entries = parseManifestEntries(text);
    assert.equal(entries.length, 2);
    const byHeading = new Map(entries.map((e) => [e.heading, e]));
    assert.equal(byHeading.get("foo")?.pinnedSha, SHA_40);
    assert.equal(byHeading.get("foo")?.localPath, "third-party/foo/");
    assert.equal(byHeading.get("bar/qux")?.pinnedSha, SHA_40_ALT);
    assert.equal(byHeading.get("bar/qux")?.localPath, "third-party/bar-qux/");
  });

  it("parseManifestEntries omits entries without a Local path (pending snapshots)", () => {
    const text = [
      "# manifest",
      "",
      "### vendored-thing",
      "",
      "| Pinned SHA | `" + SHA_40 + "` |",
      "| Local path | `third-party/vendored-thing/` |",
      "",
      "## Pending snapshots",
      "",
      "### pending-thing",
      "- License audited: MIT",
      "- decline to vendor.",
      "",
    ].join("\n");
    const entries = parseManifestEntries(text);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].heading, "vendored-thing");
  });
});

describe("check-third-party-shape — checkThirdPartyShape", () => {
  it("reports zero drifts when all snapshots have OUR_NOTES.md, LICENSE, and a matching pinned MANIFEST entry", () => {
    const root = setupFixture();
    try {
      writeSnapshot(root, "alpha");
      writeSnapshot(root, "obra-superpowers");
      writeManifest(root, [
        {
          heading: "alpha",
          pinnedSha: SHA_40,
          localPath: "third-party/alpha/",
        },
        {
          heading: "obra/superpowers",
          pinnedSha: SHA_40_ALT,
          localPath: "third-party/obra-superpowers/",
        },
      ]);

      const result = checkThirdPartyShape(root);
      assert.deepEqual(result.drifts, []);
      assert.equal(result.snapshotCount, 2);
      assert.equal(result.manifestEntryCount, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a missing OUR_NOTES.md", () => {
    const root = setupFixture();
    try {
      writeSnapshot(root, "alpha", { ourNotes: null });
      writeManifest(root, [
        { heading: "alpha", pinnedSha: SHA_40, localPath: "third-party/alpha/" },
      ]);
      const result = checkThirdPartyShape(root);
      assert.equal(result.drifts.length, 1);
      assert.equal(result.drifts[0].kind, "missing-our-notes");
      assert.equal(result.drifts[0].snapshot, "alpha");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a missing LICENSE", () => {
    const root = setupFixture();
    try {
      writeSnapshot(root, "alpha", { license: null });
      writeManifest(root, [
        { heading: "alpha", pinnedSha: SHA_40, localPath: "third-party/alpha/" },
      ]);
      const result = checkThirdPartyShape(root);
      assert.equal(result.drifts.length, 1);
      assert.equal(result.drifts[0].kind, "missing-license");
      assert.equal(result.drifts[0].snapshot, "alpha");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a snapshot dir with no matching MANIFEST entry", () => {
    const root = setupFixture();
    try {
      writeSnapshot(root, "orphan");
      writeManifest(root, []);
      const result = checkThirdPartyShape(root);
      assert.equal(result.drifts.length, 1);
      assert.equal(result.drifts[0].kind, "no-manifest-entry");
      assert.equal(result.drifts[0].snapshot, "orphan");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a non-40-char or non-hex Pinned SHA", () => {
    const root = setupFixture();
    try {
      writeSnapshot(root, "shorty");
      writeSnapshot(root, "non-hex");
      writeManifest(root, [
        {
          heading: "shorty",
          pinnedSha: "abc1234", // 7 chars
          localPath: "third-party/shorty/",
        },
        {
          heading: "non-hex",
          pinnedSha: "g".repeat(40), // 40 chars, not hex
          localPath: "third-party/non-hex/",
        },
      ]);
      const result = checkThirdPartyShape(root);
      assert.equal(result.drifts.length, 2);
      const kinds = result.drifts.map((d) => d.kind).sort();
      assert.deepEqual(kinds, ["invalid-sha", "invalid-sha"]);
      const names = result.drifts.map((d) => d.snapshot).sort();
      assert.deepEqual(names, ["non-hex", "shorty"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("handles heading != dir name (looks up by Local path, not by heading)", () => {
    const root = setupFixture();
    try {
      // realistic case: dir is "superpowers", heading is "obra/superpowers"
      writeSnapshot(root, "superpowers");
      writeManifest(root, [
        {
          heading: "obra/superpowers",
          pinnedSha: SHA_40,
          localPath: "third-party/superpowers/",
        },
      ]);
      const result = checkThirdPartyShape(root);
      assert.deepEqual(result.drifts, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags an empty OUR_NOTES.md as missing-our-notes", () => {
    const root = setupFixture();
    try {
      writeSnapshot(root, "alpha", { ourNotes: "" });
      writeManifest(root, [
        { heading: "alpha", pinnedSha: SHA_40, localPath: "third-party/alpha/" },
      ]);
      const result = checkThirdPartyShape(root);
      assert.equal(result.drifts.length, 1);
      assert.equal(result.drifts[0].kind, "missing-our-notes");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("check-third-party-shape — live repo acceptance gate", () => {
  it("the four current snapshots all pass the shape invariant", () => {
    const result = checkThirdPartyShape(REPO_ROOT);
    assert.deepEqual(
      result.drifts,
      [],
      `live repo drifts: ${JSON.stringify(result.drifts, null, 2)}`,
    );
    assert.ok(
      result.snapshotCount >= 4,
      `expected at least 4 snapshots, found ${result.snapshotCount}`,
    );
  });

  it("the CLI exits 0 against the live repo", () => {
    const stdout = execFileSync("node", [CHECKER, REPO_ROOT], {
      encoding: "utf8",
    });
    assert.match(stdout, /^OK third-party-shape:/);
  });
});
