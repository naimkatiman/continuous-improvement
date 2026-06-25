// version-check.test.mts — unit tests for the pure update-check core and the
// injected-fetch npm helper. No network: every test injects the clock and/or a
// fake fetch, matching how the lib is structured for offline determinism.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TTL_UP_TO_DATE_MS,
  TTL_UPGRADE_MS,
  evaluateUpdateCheck,
  fetchLatestNpmVersion,
  isNewer,
  isThrottled,
  parseSemver,
  pendingNotice,
} from "../lib/version-check.mjs";

describe("parseSemver", () => {
  it("parses a plain triple and strips a leading v / suffixes", () => {
    assert.deepEqual(parseSemver("3.15.0"), [3, 15, 0]);
    assert.deepEqual(parseSemver("v3.15.0"), [3, 15, 0]);
    assert.deepEqual(parseSemver("3.16.0-beta.1"), [3, 16, 0]);
  });
  it("fails closed on non-semver", () => {
    for (const bad of ["", "3.15", "3.15.x", "latest", "3.15.0.1", "abc"]) {
      assert.equal(parseSemver(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });
});

describe("isNewer", () => {
  it("is true only when remote is strictly greater", () => {
    assert.equal(isNewer("3.16.0", "3.15.0"), true);
    assert.equal(isNewer("3.15.1", "3.15.0"), true);
    assert.equal(isNewer("4.0.0", "3.15.0"), true);
  });
  it("is false on equal, lower, or non-semver", () => {
    assert.equal(isNewer("3.15.0", "3.15.0"), false);
    assert.equal(isNewer("3.14.9", "3.15.0"), false);
    assert.equal(isNewer("garbage", "3.15.0"), false);
    assert.equal(isNewer("3.16.0", "garbage"), false);
  });
});

describe("isThrottled", () => {
  const now = 1_000_000_000_000;
  it("is not throttled with no cache (fail open → fetch)", () => {
    assert.equal(isThrottled(null, now), false);
    assert.equal(isThrottled(undefined, now), false);
  });
  it("is not throttled on a NaN/absent checkedAt", () => {
    assert.equal(isThrottled({ status: "up-to-date" }, now), false);
    assert.equal(isThrottled({ checkedAt: NaN }, now), false);
  });
  it("uses the 60-min TTL when up-to-date", () => {
    assert.equal(isThrottled({ status: "up-to-date", checkedAt: now - (TTL_UP_TO_DATE_MS - 1) }, now), true);
    assert.equal(isThrottled({ status: "up-to-date", checkedAt: now - TTL_UP_TO_DATE_MS }, now), false);
  });
  it("uses the 720-min TTL when an upgrade is pending", () => {
    assert.equal(isThrottled({ status: "upgrade-available", checkedAt: now - (TTL_UPGRADE_MS - 1) }, now), true);
    assert.equal(isThrottled({ status: "upgrade-available", checkedAt: now - TTL_UPGRADE_MS }, now), false);
  });
});

describe("pendingNotice", () => {
  it("re-surfaces a still-valid pending upgrade from cache", () => {
    const notice = pendingNotice({ status: "upgrade-available", remote: "3.16.0" }, "3.15.0");
    assert.match(notice ?? "", /3\.16\.0 is available/);
  });
  it("is null when the cache is up-to-date, has no remote, or the local caught up", () => {
    assert.equal(pendingNotice({ status: "up-to-date", remote: "3.16.0" }, "3.15.0"), null);
    assert.equal(pendingNotice({ status: "upgrade-available" }, "3.15.0"), null);
    assert.equal(pendingNotice({ status: "upgrade-available", remote: "3.16.0" }, "3.16.0"), null);
    assert.equal(pendingNotice(null, "3.15.0"), null);
  });
});

describe("evaluateUpdateCheck", () => {
  const now = 1_000_000_000_000;
  it("flags an available upgrade with a notice and a cache write", () => {
    const d = evaluateUpdateCheck({ local: "3.15.0", remote: "3.16.0", now });
    assert.equal(d.status, "upgrade-available");
    assert.match(d.notice ?? "", /3\.16\.0 is available \(you have 3\.15\.0\)/);
    assert.deepEqual(d.nextCache, { status: "upgrade-available", local: "3.15.0", remote: "3.16.0", checkedAt: now });
  });
  it("records up-to-date with no notice when equal or ahead", () => {
    const d = evaluateUpdateCheck({ local: "3.15.0", remote: "3.15.0", now });
    assert.equal(d.status, "up-to-date");
    assert.equal(d.notice, null);
    assert.equal(d.nextCache?.status, "up-to-date");
    const ahead = evaluateUpdateCheck({ local: "3.16.0", remote: "3.15.0", now });
    assert.equal(ahead.status, "up-to-date");
    assert.equal(ahead.notice, null);
  });
  it("returns unknown (no notice, no cache write) on a null or non-semver remote", () => {
    for (const remote of [null, "not-a-version"]) {
      const d = evaluateUpdateCheck({ local: "3.15.0", remote, now });
      assert.equal(d.status, "unknown");
      assert.equal(d.notice, null);
      assert.equal(d.nextCache, null);
    }
  });
});

describe("fetchLatestNpmVersion", () => {
  function fakeFetch(impl: () => Promise<unknown>): typeof fetch {
    return (async () => impl()) as unknown as typeof fetch;
  }

  it("returns the version on a 200 with a semver body", async () => {
    const v = await fetchLatestNpmVersion("continuous-improvement", {
      fetchImpl: fakeFetch(async () => ({ ok: true, json: async () => ({ version: "3.16.0" }) })),
    });
    assert.equal(v, "3.16.0");
  });
  it("returns null on non-2xx, malformed JSON, missing/garbage version, or a throw", async () => {
    const non200 = await fetchLatestNpmVersion("p", {
      fetchImpl: fakeFetch(async () => ({ ok: false, json: async () => ({ version: "9.9.9" }) })),
    });
    assert.equal(non200, null);
    const badJson = await fetchLatestNpmVersion("p", {
      fetchImpl: fakeFetch(async () => ({ ok: true, json: async () => { throw new Error("bad json"); } })),
    });
    assert.equal(badJson, null);
    const noVersion = await fetchLatestNpmVersion("p", {
      fetchImpl: fakeFetch(async () => ({ ok: true, json: async () => ({}) })),
    });
    assert.equal(noVersion, null);
    const garbage = await fetchLatestNpmVersion("p", {
      fetchImpl: fakeFetch(async () => ({ ok: true, json: async () => ({ version: "latest" }) })),
    });
    assert.equal(garbage, null);
    const threw = await fetchLatestNpmVersion("p", {
      fetchImpl: fakeFetch(async () => { throw new Error("network down"); }),
    });
    assert.equal(threw, null);
  });
});
