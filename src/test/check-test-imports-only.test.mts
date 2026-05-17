import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
assert.ok(
  existsSync(join(REPO_ROOT, "package.json")),
  `REPO_ROOT sanity check failed — ${REPO_ROOT}/package.json not found`,
);
const CHECKER = join(REPO_ROOT, "bin", "check-test-imports-only.mjs");

interface FixtureFile {
  relPath: string;
  contents: string;
}

function setupRepo(files: FixtureFile[]): string {
  const root = mkdtempSync(join(tmpdir(), "test-imports-only-"));
  mkdirSync(join(root, "src", "test"), { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  for (const file of files) {
    const full = join(root, file.relPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, file.contents);
  }
  return root;
}

function runChecker(altRoot: string): { exit: number; stdout: string; stderr: string } {
  try {
    const out = execFileSync("node", [CHECKER, altRoot], { encoding: "utf8" });
    return { exit: 0, stdout: out, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { exit: e.status ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("check-test-imports-only — integration", () => {
  it("CLI exits 0 when imports are all in the allow-list (node:* + ../bin/*.mjs + ../lib/*.mjs)", () => {
    const root = setupRepo([
      {
        relPath: "src/test/a.test.mts",
        contents: `import assert from "node:assert/strict";\nimport { x } from "../bin/check-a.mjs";\n`,
      },
      {
        relPath: "src/test/b.test.mts",
        contents: `import { describe, it } from "node:test";\nimport { y } from "../lib/util-b.mjs";\n`,
      },
    ]);
    try {
      const { exit, stdout } = runChecker(root);
      assert.equal(exit, 0, `expected exit 0, got ${exit}`);
      assert.match(stdout, /OK test-imports-only:/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CLI exits 1 and names the offender when a test imports another test file", () => {
    const root = setupRepo([
      {
        relPath: "src/test/a.test.mts",
        contents: `import assert from "node:assert/strict";\nimport { shared } from "./helpers.test.mjs";\n`,
      },
      {
        relPath: "src/test/helpers.test.mts",
        contents: `export const shared = 1;\n`,
      },
    ]);
    try {
      const { exit, stderr } = runChecker(root);
      assert.equal(exit, 1, `expected exit 1, got ${exit}`);
      assert.match(stderr, /FAIL test-imports-only/);
      assert.match(stderr, /a\.test\.mts:2 — imports "\.\/helpers\.test\.mjs"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CLI exits 1 when a test imports a bare npm specifier", () => {
    const root = setupRepo([
      {
        relPath: "src/test/a.test.mts",
        contents: `import assert from "node:assert/strict";\nimport _ from "lodash";\n`,
      },
    ]);
    try {
      const { exit, stderr } = runChecker(root);
      assert.equal(exit, 1, `expected exit 1, got ${exit}`);
      assert.match(stderr, /a\.test\.mts:2 — imports "lodash"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CLI exits 1 when a test reaches into hooks/", () => {
    const root = setupRepo([
      {
        relPath: "src/test/a.test.mts",
        contents: `import { h } from "../hooks/some-hook.mjs";\n`,
      },
    ]);
    try {
      const { exit, stderr } = runChecker(root);
      assert.equal(exit, 1, `expected exit 1, got ${exit}`);
      assert.match(stderr, /a\.test\.mts:1 — imports "\.\.\/hooks\/some-hook\.mjs"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CLI exits 1 when a test reaches into a deeper bin path", () => {
    const root = setupRepo([
      {
        relPath: "src/test/a.test.mts",
        contents: `import { x } from "../bin/sub/deep.mjs";\n`,
      },
    ]);
    try {
      const { exit, stderr } = runChecker(root);
      assert.equal(exit, 1, `expected exit 1, got ${exit}`);
      assert.match(stderr, /a\.test\.mts:1 — imports "\.\.\/bin\/sub\/deep\.mjs"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CLI handles multi-line import { … } from … blocks", () => {
    const root = setupRepo([
      {
        relPath: "src/test/a.test.mts",
        contents: `import {\n  describe,\n  it,\n} from "node:test";\nimport {\n  shared,\n} from "./helpers.test.mjs";\n`,
      },
    ]);
    try {
      const { exit, stderr } = runChecker(root);
      assert.equal(exit, 1, `expected exit 1, got ${exit}`);
      assert.match(stderr, /a\.test\.mts:7 — imports "\.\/helpers\.test\.mjs"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the live repo passes the lint (de facto baseline holds)", () => {
    const out = execFileSync("node", [CHECKER, REPO_ROOT], { encoding: "utf8" });
    assert.match(out, /OK test-imports-only:/);
  });
});
