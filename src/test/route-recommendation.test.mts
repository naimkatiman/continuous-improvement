import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
assert.ok(
  existsSync(join(REPO_ROOT, "package.json")),
  `REPO_ROOT sanity check failed — ${REPO_ROOT}/package.json not found`,
);
const SCRIPT = join(REPO_ROOT, "scripts", "route-recommendation.mjs");
const ROUTES = join(REPO_ROOT, "scripts", "route-recommendation.routes.json");

interface RouteMatch {
  name: string;
  preferred: string[];
  fallback: string;
  marker?: string;
}
interface MatchResult {
  input: string;
  match: RouteMatch | null;
  candidates: RouteMatch[];
}

function runMatch(item: string, extraArgs: string[] = []): { exitCode: number; result: MatchResult | null; stderr: string; stdout: string } {
  const result = spawnSync("node", [SCRIPT, "--json", ...extraArgs, item], { encoding: "utf8" });
  let parsed: MatchResult | null = null;
  if (result.stdout) {
    try {
      parsed = JSON.parse(result.stdout) as MatchResult;
    } catch {
      // leave null
    }
  }
  return {
    exitCode: result.status ?? -1,
    result: parsed,
    stderr: (result.stderr ?? "").trim(),
    stdout: result.stdout ?? "",
  };
}

describe("scripts/route-recommendation.mjs", () => {
  it("ships a routes.json file with at least 20 rows", () => {
    assert.ok(existsSync(ROUTES), "routes.json present");
    const json = JSON.parse(readFileSync(ROUTES, "utf8")) as { rows: RouteMatch[] };
    assert.ok(Array.isArray(json.rows));
    assert.ok(json.rows.length >= 20, `routes.json must declare the audit's routing surface (≥20 rows); found ${json.rows.length}`);
    for (const row of json.rows) {
      assert.ok(row.name, "row.name");
      assert.ok(Array.isArray(row.preferred), "row.preferred is array");
      assert.ok(row.fallback, "row.fallback");
    }
  });

  it("routes 'fix the bug in auth' to systematic-debugging", () => {
    const out = runMatch("fix the bug in auth");
    assert.equal(out.exitCode, 0, `stderr: ${out.stderr}`);
    assert.ok(out.result!.match, "match present");
    assert.match(out.result!.match!.name, /bug|debug|failure/i);
    assert.ok(
      out.result!.match!.preferred.some((p) => /systematic-debugging|debug/i.test(p)),
      `preferred: ${JSON.stringify(out.result!.match!.preferred)}`,
    );
  });

  it("routes 'write tests for the parser' to TDD", () => {
    const out = runMatch("write tests for the parser");
    assert.ok(out.result!.match, "match present");
    assert.ok(
      out.result!.match!.preferred.some((p) => /tdd|test-driven/i.test(p)),
      `preferred: ${JSON.stringify(out.result!.match!.preferred)}`,
    );
  });

  it("routes 'commit and push the changes' to commit-commands", () => {
    const out = runMatch("commit and push the changes");
    assert.ok(out.result!.match);
    assert.ok(
      out.result!.match!.preferred.some((p) => /commit/i.test(p)),
      `preferred: ${JSON.stringify(out.result!.match!.preferred)}`,
    );
  });

  it("routes 'security review of the auth flow' to security-review", () => {
    const out = runMatch("security review of the auth flow");
    assert.ok(out.result!.match);
    assert.ok(
      out.result!.match!.preferred.some((p) => /security/i.test(p)),
      `preferred: ${JSON.stringify(out.result!.match!.preferred)}`,
    );
  });

  it("routes 'refactor duplicated helper' to simplify", () => {
    const out = runMatch("refactor duplicated helper");
    assert.ok(out.result!.match);
    assert.ok(
      out.result!.match!.preferred.some((p) => /simplify|refactor/i.test(p)),
      `preferred: ${JSON.stringify(out.result!.match!.preferred)}`,
    );
  });

  it("returns null match with ask-operator hint when no row matches", () => {
    const out = runMatch("xyzzy-no-such-routing-term-here");
    assert.equal(out.exitCode, 0);
    assert.equal(out.result!.match, null);
    assert.match(out.stderr.length > 0 ? out.stderr : out.stdout, /ask.operator|no match/i);
  });

  it("exits 2 with usage error when no input is given", () => {
    const result = spawnSync("node", [SCRIPT], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr ?? "", /usage|input/i);
  });

  it("--list mode emits every route row", () => {
    const result = spawnSync("node", [SCRIPT, "--list", "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const json = JSON.parse(result.stdout) as { rows: RouteMatch[] };
    const routes = JSON.parse(readFileSync(ROUTES, "utf8")) as { rows: RouteMatch[] };
    assert.equal(json.rows.length, routes.rows.length);
  });

  it("default mode (no --json) prints a human-readable match block", () => {
    const result = spawnSync("node", [SCRIPT, "fix the bug in auth"], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Match:/i);
    assert.match(result.stdout, /Preferred:/i);
    assert.match(result.stdout, /Fallback:/i);
  });
});
