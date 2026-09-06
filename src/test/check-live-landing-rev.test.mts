import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  APEX_URL,
  PAGES_DEV_URL,
  extractRev,
  waitForLiveRev,
} from "../bin/check-live-landing-rev.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-live-landing-rev.mjs");
const WORKFLOW = join(REPO_ROOT, ".github", "workflows", "release.yml");

describe("extractRev", () => {
  it("returns the first REV x.y.z token", () => {
    assert.equal(extractRev('<span class="kicker">SPEC / REV 3.25.0</span>'), "3.25.0");
  });

  it("returns null when the page has no REV marker", () => {
    assert.equal(extractRev("<html>no version here</html>"), null);
  });
});

describe("waitForLiveRev", () => {
  it("succeeds on the first read when the live REV already matches", async () => {
    const fetches: string[] = [];
    const result = await waitForLiveRev({
      expected: "3.25.0",
      timeoutMs: 1000,
      intervalMs: 10,
      fetchHtml: async (url) => {
        fetches.push(url);
        return url === APEX_URL ? '<span>REV 3.25.0</span>' : null;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.live, "3.25.0");
    assert.equal(result.url, APEX_URL);
    assert.equal(result.attempts, 1);
    assert.deepEqual(fetches, [APEX_URL]);
  });

  it("falls back to pages.dev when the apex returns nothing (bot protection)", async () => {
    const result = await waitForLiveRev({
      expected: "3.25.0",
      timeoutMs: 1000,
      intervalMs: 10,
      fetchHtml: async (url) => (url === PAGES_DEV_URL ? "<span>REV 3.25.0</span>" : null),
    });
    assert.equal(result.ok, true);
    assert.equal(result.url, PAGES_DEV_URL);
  });

  it("retries after a stale first read instead of failing the release", async () => {
    let n = 0;
    const sleeps: number[] = [];
    const result = await waitForLiveRev({
      expected: "3.25.0",
      timeoutMs: 30_000,
      intervalMs: 5,
      now: (() => {
        let t = 0;
        return () => t;
      })(),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchHtml: async (url) => {
        if (url !== PAGES_DEV_URL) return null;
        n += 1;
        return n === 1 ? "<span>REV 3.24.0</span>" : "<span>REV 3.25.0</span>";
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.live, "3.25.0");
    assert.equal(result.attempts, 2);
    assert.deepEqual(sleeps, [5]);
  });

  it("fails closed if the live REV never matches before timeout", async () => {
    const result = await waitForLiveRev({
      expected: "3.25.0",
      timeoutMs: 20,
      intervalMs: 5,
      now: (() => {
        let t = 0;
        return () => {
          const cur = t;
          t += 10;
          return cur;
        };
      })(),
      sleep: async () => {},
      fetchHtml: async () => "<span>REV 3.24.0</span>",
    });
    assert.equal(result.ok, false);
    assert.equal(result.live, "3.24.0");
    assert.ok(result.attempts >= 2);
  });
});

describe("check-live-landing-rev CLI", () => {
  it("exits 0 when the injected fetch already serves package.json's version", () => {
    const root = mkdtempSync(join(tmpdir(), "live-rev-"));
    try {
      writeFileSync(join(root, "package.json"), JSON.stringify({ version: "9.9.9" }));
      const fake = join(root, "fake-fetch.mjs");
      writeFileSync(
        fake,
        "export default async () => '<span>REV 9.9.9</span>';\n",
      );
      const out = execFileSync("node", [CHECKER, root, `--fetch=${fake}`], {
        encoding: "utf8",
      });
      assert.match(out, /serving 9\.9\.9/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 1 when the live REV stays stale", () => {
    const root = mkdtempSync(join(tmpdir(), "live-rev-stale-"));
    try {
      writeFileSync(join(root, "package.json"), JSON.stringify({ version: "9.9.9" }));
      const fake = join(root, "fake-fetch.mjs");
      writeFileSync(fake, "export default async () => '<span>REV 1.0.0</span>';\n");
      let exited = false;
      try {
        execFileSync("node", [CHECKER, root, `--fetch=${fake}`, "--timeout-ms=20", "--interval-ms=5"], {
          encoding: "utf8",
        });
      } catch (err) {
        exited = true;
        const e = err as { status?: number; stderr?: string };
        assert.equal(e.status, 1);
        assert.match(e.stderr ?? "", /Landing deploy did not take/);
        assert.match(e.stderr ?? "", /1\.0\.0/);
        assert.match(e.stderr ?? "", /9\.9\.9/);
      }
      assert.ok(exited);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("release.yml uses the polling checker", () => {
  it("the verify step calls check-live-landing-rev.mjs instead of a one-shot curl compare", () => {
    const workflow = readFileSync(WORKFLOW, "utf8");
    const start = workflow.indexOf("Verify the deployed page serves this version");
    assert.notEqual(start, -1);
    const step = workflow.slice(start, start + 800);
    assert.match(step, /node bin\/check-live-landing-rev\.mjs/);
    assert.doesNotMatch(step, /live=\$\(rev /);
  });
});
