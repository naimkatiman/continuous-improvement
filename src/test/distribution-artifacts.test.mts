import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = existsSync(join(__dirname, "..", "package.json"))
  ? join(__dirname, "..")
  : join(__dirname, "..", "..");
assert.ok(
  existsSync(join(REPO_ROOT, "package.json")),
  `REPO_ROOT sanity check failed: ${REPO_ROOT}/package.json not found`,
);
const SOURCE_SCRIPTS = join(REPO_ROOT, "scripts");
const BUNDLED_SCRIPTS = join(
  REPO_ROOT,
  "plugins",
  "continuous-improvement",
  "scripts",
);

interface NpmPackFile {
  path: string;
}

interface NpmPackResult {
  files: NpmPackFile[];
}

interface LadderEntry {
  command: string | null;
  source: string;
}

function toPosix(filePath: string): string {
  return filePath.split(sep).join("/");
}

function listRelativeFiles(root: string): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(toPosix(relative(root, fullPath)));
      }
    }
  }

  walk(root);
  return files.sort();
}

function runNpm(args: string[]): string {
  const options = {
    cwd: REPO_ROOT,
    encoding: "utf8" as const,
    env: {
      ...process.env,
      npm_config_update_notifier: "false",
    },
    maxBuffer: 10 * 1024 * 1024,
  };

  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) {
    return execFileSync(process.execPath, [npmExecPath, ...args], options);
  }

  if (process.platform === "win32") {
    const command = ["npm", ...args].join(" ");
    return execFileSync(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", command],
      options,
    );
  }

  return execFileSync("npm", args, options);
}

function isNpmPackResult(candidate: unknown): candidate is NpmPackResult {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    Array.isArray((candidate as { files?: unknown }).files)
  );
}

function parseNpmPackResults(output: string): NpmPackResult[] {
  const parsed: unknown = JSON.parse(output);
  const candidates = Array.isArray(parsed)
    ? parsed
    : isNpmPackResult(parsed)
      ? [parsed]
      : typeof parsed === "object" && parsed !== null
        ? Object.values(parsed)
        : [];
  if (candidates.length === 0 || !candidates.every(isNpmPackResult)) {
    throw new TypeError("npm pack JSON must contain only package results with files arrays");
  }
  return candidates;
}

describe("distribution artifacts", () => {
  it("accepts npm pack JSON from supported npm versions", () => {
    const result: NpmPackResult = { files: [{ path: "package.json" }] };
    assert.deepEqual(parseNpmPackResults(JSON.stringify([result])), [result]);
    assert.deepEqual(parseNpmPackResults(JSON.stringify(result)), [result]);
    assert.deepEqual(
      parseNpmPackResults(JSON.stringify({ "continuous-improvement": result })),
      [result],
    );
    assert.throws(
      () => parseNpmPackResults(JSON.stringify([result, { files: null }])),
      /must contain only package results/,
    );
    assert.throws(
      () =>
        parseNpmPackResults(
          JSON.stringify({ "continuous-improvement": result, metadata: {} }),
        ),
      /must contain only package results/,
    );
    assert.throws(() => parseNpmPackResults("{}"), /must contain only package results/);
  });

  it("mirrors every root script into the generated plugin bundle byte-for-byte", () => {
    const sourceFiles = listRelativeFiles(SOURCE_SCRIPTS);
    const bundledFiles = listRelativeFiles(BUNDLED_SCRIPTS);

    assert.ok(sourceFiles.length > 0, "root scripts/ must contain distributable files");
    assert.deepEqual(
      bundledFiles,
      sourceFiles,
      "generated plugin scripts/ must contain exactly the root scripts/ inventory",
    );

    for (const relPath of sourceFiles) {
      assert.deepEqual(
        readFileSync(join(BUNDLED_SCRIPTS, relPath)),
        readFileSync(join(SOURCE_SCRIPTS, relPath)),
        `generated plugin script drift: ${relPath}`,
      );
    }
  });

  it("includes root and generated plugin scripts in the npm package", () => {
    const sourceFiles = listRelativeFiles(SOURCE_SCRIPTS);
    assert.ok(sourceFiles.length > 0, "root scripts/ must contain distributable files");

    const packOutput = runNpm([
      "pack",
      "--dry-run",
      "--json",
      "--ignore-scripts",
    ]);
    const packResults = parseNpmPackResults(packOutput);
    assert.equal(packResults.length, 1, "npm pack must describe exactly one package");
    const packResult = packResults[0];
    assert.ok(packResult, "npm pack result must be present");
    const packedPaths = new Set(packResult.files.map((file) => file.path));

    const missingPaths = sourceFiles
      .flatMap((relPath) => [
        `scripts/${relPath}`,
        `plugins/continuous-improvement/scripts/${relPath}`,
      ])
      .filter((relPath) => !packedPaths.has(relPath));

    assert.deepEqual(
      missingPaths,
      [],
      `npm package is missing script artifacts: ${missingPaths.join(", ")}`,
    );
  });

  it("executes a bundled helper against the consumer working directory", () => {
    const helper = join(BUNDLED_SCRIPTS, "resolve-verify-ladder.mjs");
    assert.ok(existsSync(helper), `bundled helper is missing: ${helper}`);

    const fixture = mkdtempSync(join(tmpdir(), "bundled-helper-consumer-"));
    try {
      writeFileSync(
        join(fixture, "package.json"),
        JSON.stringify({
          scripts: {
            build: "node build.mjs",
            test: "node --test",
          },
        }),
      );

      const output = execFileSync(process.execPath, [helper, "--json"], {
        cwd: fixture,
        encoding: "utf8",
      });
      const ladder = JSON.parse(output) as Record<string, LadderEntry>;

      assert.deepEqual(ladder.build, {
        command: "npm run build",
        source: "sniff:package.json:scripts.build",
      });
      assert.deepEqual(ladder.test, {
        command: "npm test",
        source: "sniff:package.json:scripts.test",
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
