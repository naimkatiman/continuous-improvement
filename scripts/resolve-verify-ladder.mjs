#!/usr/bin/env node
// scripts/resolve-verify-ladder.mjs
//
// Resolve the per-project verification ladder for `verification-loop` Phase 0.
// Encodes the four-step resolution priority — manifest > package.json sniff >
// per-language toolchain > ask-operator — so the skill body cites this script
// instead of restating the 80+ lines of priority prose inline.
//
// Usage:
//   node scripts/resolve-verify-ladder.mjs              # pretty fenced block, cwd
//   node scripts/resolve-verify-ladder.mjs <repo-root>  # pretty, explicit root
//   node scripts/resolve-verify-ladder.mjs --json       # JSON for machines
//   node scripts/resolve-verify-ladder.mjs --json <repo-root>
//
// Output (default — pretty fenced block):
//
//   verify-ladder (resolved):
//     build:            npm run build  (sniff:package.json:scripts.build)
//     typecheck:        npx tsc --noEmit  (manifest)
//     ...
//
// Output (--json — single JSON object on stdout):
//
//   { "build": { "command": "npm run build", "source": "sniff:..." }, ... }
//
// Phases: build, typecheck, lint, test, security, deploy_receipt, synthetic_checks.
// Sources: "manifest", "manifest:null" (explicitly skipped), "sniff:package.json:<key>",
//          "sniff:Cargo.toml" | "sniff:go.mod" | "sniff:pyproject.toml" | "sniff:Gemfile",
//          "ask-operator" (nothing matched).
//
// Cited by:
//   - skills/verification-loop.md Phase 0

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit, stdout } from "node:process";

const PHASES = [
  "build",
  "typecheck",
  "lint",
  "test",
  "security",
  "deploy_receipt",
  "synthetic_checks",
];

function parseArgs() {
  const args = argv.slice(2);
  let json = false;
  let root = cwd();
  for (const a of args) {
    if (a === "--json") {
      json = true;
    } else if (a === "-h" || a === "--help") {
      stdout.write(
        "usage: resolve-verify-ladder.mjs [--json] [<repo-root>]\n",
      );
      exit(0);
    } else {
      root = a;
    }
  }
  return { json, root };
}

function safeReadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readManifest(root) {
  return safeReadJson(join(root, ".claude", "verify-ladder.json"));
}

function readPackageJson(root) {
  return safeReadJson(join(root, "package.json"));
}

function sniffPackageJsonScript(pkg, phase) {
  if (!pkg || !pkg.scripts) return null;
  const scripts = pkg.scripts;
  // Priority: verify:<phase> > <phase> > <phase>:* (wildcard tail).
  // Phase aliases:
  //   typecheck also matches `tsc` (common in repos that just use `tsc`).
  //   security also matches `audit` (common in npm projects).
  const candidates = [`verify:${phase}`, phase];
  if (phase === "typecheck") candidates.push("tsc");
  if (phase === "security") candidates.push("audit");

  for (const name of candidates) {
    if (typeof scripts[name] === "string") {
      const cmd = name === "test" ? "npm test" : `npm run ${name}`;
      return {
        command: cmd,
        source: `sniff:package.json:scripts.${name}`,
      };
    }
  }

  // Last resort: <phase>:* wildcard tail.
  const wildcardKey = Object.keys(scripts).find((k) => k.startsWith(`${phase}:`));
  if (wildcardKey) {
    return {
      command: `npm run ${wildcardKey}`,
      source: `sniff:package.json:scripts.${wildcardKey}`,
    };
  }

  return null;
}

const PER_LANGUAGE = [
  {
    marker: "Cargo.toml",
    commands: {
      build: "cargo build",
      typecheck: "cargo check --all-targets",
      lint: "cargo clippy --all-targets -- -D warnings",
      test: "cargo test",
      security: "cargo audit",
    },
  },
  {
    marker: "go.mod",
    commands: {
      build: "go build ./...",
      typecheck: "go vet ./...",
      lint: "go vet ./...",
      test: "go test ./...",
    },
  },
  {
    marker: "pyproject.toml",
    commands: {
      typecheck: "pyright",
      lint: "ruff check .",
      test: "pytest",
    },
  },
  {
    marker: "Gemfile",
    commands: {
      lint: "bundle exec rubocop",
      test: "bundle exec rspec",
    },
  },
];

function sniffPerLanguage(root, phase) {
  for (const lang of PER_LANGUAGE) {
    if (!existsSync(join(root, lang.marker))) continue;
    if (lang.commands[phase]) {
      return { command: lang.commands[phase], source: `sniff:${lang.marker}` };
    }
  }
  return null;
}

function resolve(root) {
  const manifest = readManifest(root);
  const pkg = readPackageJson(root);
  const ladder = {};

  for (const phase of PHASES) {
    // 1. Manifest layer. Underscore-prefixed keys in the manifest are
    //    documentation/examples — verify-ladder.example.json uses keys like
    //    "_doc", "_node_example" — so PHASES never starts with "_" and we
    //    can rely on hasOwn for an exact phase match.
    if (
      manifest &&
      Object.prototype.hasOwnProperty.call(manifest, phase) &&
      !phase.startsWith("_")
    ) {
      const value = manifest[phase];
      if (value === null) {
        ladder[phase] = { command: null, source: "manifest:null" };
      } else if (typeof value === "string") {
        ladder[phase] = { command: value, source: "manifest" };
      } else {
        ladder[phase] = { command: null, source: "manifest:invalid" };
      }
      continue;
    }

    // 2. package.json scripts sniff.
    const pkgHit = sniffPackageJsonScript(pkg, phase);
    if (pkgHit) {
      ladder[phase] = pkgHit;
      continue;
    }

    // 3. Per-language toolchain sniff.
    const langHit = sniffPerLanguage(root, phase);
    if (langHit) {
      ladder[phase] = langHit;
      continue;
    }

    // 4. Nothing matched — operator must declare or set to null.
    ladder[phase] = { command: null, source: "ask-operator" };
  }

  return ladder;
}

function pretty(ladder) {
  const widest = Math.max(...Object.keys(ladder).map((k) => k.length));
  const lines = ["verify-ladder (resolved):"];
  for (const [phase, entry] of Object.entries(ladder)) {
    const label = `${phase}:`.padEnd(widest + 2);
    let line;
    if (entry.command === null && entry.source === "ask-operator") {
      line = `  ${label} (ask operator — no marker found)`;
    } else if (entry.command === null && entry.source === "manifest:null") {
      line = `  ${label} (skipped — manifest set this field to null)`;
    } else if (entry.command === null) {
      line = `  ${label} (skipped — ${entry.source})`;
    } else {
      line = `  ${label} ${entry.command}  (${entry.source})`;
    }
    lines.push(line);
  }
  return lines.join("\n") + "\n";
}

function main() {
  const { json, root } = parseArgs();
  const ladder = resolve(root);
  if (json) {
    stdout.write(JSON.stringify(ladder, null, 2) + "\n");
  } else {
    stdout.write(pretty(ladder));
  }
}

main();
