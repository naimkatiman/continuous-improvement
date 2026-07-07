/**
 * Unit tests for the pure query-cost-gate helpers (RISA 5 / G5).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildQueryCostReminder,
  changedQueryPaths,
  isQueryPath,
  parseChangedFiles,
  resolveQueryCostNudge,
} from "../lib/query-cost-gate.mjs";

describe("query-cost-gate — resolveQueryCostNudge", () => {
  it("defaults to off unless explicitly on", () => {
    assert.equal(resolveQueryCostNudge(undefined), "off");
    assert.equal(resolveQueryCostNudge(""), "off");
    assert.equal(resolveQueryCostNudge("block"), "off");
    assert.equal(resolveQueryCostNudge("ON"), "on");
    assert.equal(resolveQueryCostNudge(" on "), "on");
  });
});

describe("query-cost-gate — isQueryPath", () => {
  it("matches DB/query source paths", () => {
    for (const p of [
      "db/queries.sql",
      "prisma/schema.prisma",
      "migrations/0001_init.sql",
      "src/migration/0002.ts",
      "src/db/client.ts",
      "app/schema.ts",
      "drizzle/schema.ts",
      "packages/api/drizzle.config.ts",
    ]) {
      assert.equal(isQueryPath(p), true, `${p} should be a query path`);
    }
  });

  it("ignores non-DB paths", () => {
    for (const p of ["src/components/Button.tsx", "README.md", "src/util/date.ts", "package.json"]) {
      assert.equal(isQueryPath(p), false, `${p} should NOT be a query path`);
    }
    assert.equal(isQueryPath(""), false);
  });

  it("normalizes backslashes", () => {
    assert.equal(isQueryPath("src\\db\\client.ts"), true);
  });
});

describe("query-cost-gate — parseChangedFiles / changedQueryPaths", () => {
  it("parses git output and filters to query paths", () => {
    const files = parseChangedFiles("src/a.ts\nmigrations/0003.sql\n\n  README.md \n");
    assert.deepEqual(files, ["src/a.ts", "migrations/0003.sql", "README.md"]);
    assert.deepEqual(changedQueryPaths(files), ["migrations/0003.sql"]);
  });

  it("returns empty when nothing is a query path", () => {
    assert.deepEqual(changedQueryPaths(["a.ts", "b.md"]), []);
  });
});

describe("query-cost-gate — buildQueryCostReminder", () => {
  it("names the changed files, database-reviewer, and the D1 rows_read cost", () => {
    const reminder = buildQueryCostReminder(["migrations/0003.sql"]);
    assert.match(reminder, /<system-reminder>/);
    assert.match(reminder, /migrations\/0003\.sql/);
    assert.match(reminder, /database-reviewer/);
    assert.match(reminder, /rows_read/);
    assert.match(reminder, /EXPLAIN QUERY PLAN/);
    assert.match(reminder, /CLAUDE_QUERY_COST_NUDGE/);
  });

  it("caps the listed paths at 8", () => {
    const many = Array.from({ length: 12 }, (_, i) => `migrations/${i}.sql`);
    const reminder = buildQueryCostReminder(many);
    assert.match(reminder, /migrations\/7\.sql/);
    assert.doesNotMatch(reminder, /migrations\/8\.sql/);
  });
});
