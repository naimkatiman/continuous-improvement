// audit-actions.test.mts — TDD tests for the GitHub Actions security scanner.
//
// Portfolio-spine train (docs/plans/2026-07-04-portfolio-spine.md). The scanner
// hand-rolls line-oriented parsing of the constrained GitHub-workflow YAML
// subset (zero runtime deps — no YAML library). Every check the command ships
// is covered here with synthetic YAML, including a clean workflow that must
// produce zero findings.
//
// These tests run RED-first against an as-yet-unwritten src/bin/audit-actions.mts.
// The .mjs import resolves only after `npm run build` — per the .mts-is-source
// rule, never edit the .mjs directly.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditWorkflows,
  renderReport,
  type Finding,
} from "../bin/audit-actions.mjs";

const SHA40 = "8ade135a41bc03ea155e62e844d188df1ea18608";

const CLEAN_WORKFLOW = `name: CI
on:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@${SHA40}
      - run: npm test
`;

function findingsFor(content: string, path = ".github/workflows/ci.yml"): Finding[] {
  return auditWorkflows([{ path, content }]);
}

function checks(findings: Finding[]): string[] {
  return findings.map((f) => f.check);
}

describe("auditWorkflows — clean workflow", () => {
  it("produces zero findings for a fully hardened workflow", () => {
    const findings = findingsFor(CLEAN_WORKFLOW);
    assert.deepEqual(findings, []);
  });
});

describe("auditWorkflows — permissions (checks a + b)", () => {
  it("flags high when permissions are absent at workflow AND job level", () => {
    const yaml = `name: t
on: workflow_dispatch
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: npm test
`;
    const findings = findingsFor(yaml);
    const perm = findings.filter((f) => f.check === "missing-permissions");
    assert.equal(perm.length, 1);
    assert.equal(perm[0].severity, "high");
  });

  it("does not flag missing-permissions when the workflow level declares them", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: npm test
`;
    assert.ok(!checks(findingsFor(yaml)).includes("missing-permissions"));
  });

  it("does not flag missing-permissions when a job level declares them", () => {
    const yaml = `name: t
on: workflow_dispatch
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - run: npm test
`;
    assert.ok(!checks(findingsFor(yaml)).includes("missing-permissions"));
  });

  it("flags permissions: write-all as high with the offending line number", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions: write-all
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: npm test
`;
    const findings = findingsFor(yaml);
    const wa = findings.filter((f) => f.check === "write-all-permissions");
    assert.equal(wa.length, 1);
    assert.equal(wa[0].severity, "high");
    assert.equal(wa[0].line, 3);
  });
});

describe("auditWorkflows — action pinning (check c)", () => {
  it("flags a third-party action pinned to a tag as medium", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: pnpm/action-setup@v4
      - run: npm test
`;
    const findings = findingsFor(yaml);
    const pin = findings.filter((f) => f.check === "unpinned-third-party-action");
    assert.equal(pin.length, 1);
    assert.equal(pin[0].severity, "medium");
    assert.match(pin[0].message, /pnpm\/action-setup/);
  });

  it("accepts a third-party action pinned to a 40-hex commit SHA", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: pnpm/action-setup@${SHA40}
      - run: npm test
`;
    const found = checks(findingsFor(yaml));
    assert.ok(!found.includes("unpinned-third-party-action"));
    assert.ok(!found.includes("unpinned-first-party-action"));
  });

  it("flags first-party actions/* not SHA-pinned as low", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;
    const findings = findingsFor(yaml);
    const pin = findings.filter((f) => f.check === "unpinned-first-party-action");
    assert.equal(pin.length, 1);
    assert.equal(pin[0].severity, "low");
  });

  it("ignores local (./) and docker:// uses references", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: ./.github/actions/local-thing
      - uses: docker://alpine:3.20
      - run: npm test
`;
    const found = checks(findingsFor(yaml));
    assert.ok(!found.includes("unpinned-third-party-action"));
    assert.ok(!found.includes("unpinned-first-party-action"));
  });
});

describe("auditWorkflows — job timeouts (check d)", () => {
  it("flags each job missing timeout-minutes as medium, naming the job", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - run: npm publish --dry-run
`;
    const findings = findingsFor(yaml);
    const t = findings.filter((f) => f.check === "missing-timeout");
    assert.equal(t.length, 1);
    assert.equal(t[0].severity, "medium");
    assert.match(t[0].message, /build/);
  });

  it("does not require timeout-minutes on reusable-workflow call jobs", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  call:
    uses: naimkatiman/shared/.github/workflows/reuse.yml@${SHA40}
`;
    assert.ok(!checks(findingsFor(yaml)).includes("missing-timeout"));
  });
});

describe("auditWorkflows — concurrency (check e)", () => {
  it("flags a push-triggered workflow without a concurrency block as low", () => {
    const yaml = `name: t
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: npm test
`;
    const findings = findingsFor(yaml);
    const c = findings.filter((f) => f.check === "missing-concurrency");
    assert.equal(c.length, 1);
    assert.equal(c[0].severity, "low");
  });

  it("flags a schedule-triggered workflow (inline list form) without concurrency", () => {
    const yaml = `name: t
on: [schedule, workflow_dispatch]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: npm test
`;
    assert.ok(checks(findingsFor(yaml)).includes("missing-concurrency"));
  });

  it("does not flag a workflow_dispatch-only workflow without concurrency", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: npm test
`;
    assert.ok(!checks(findingsFor(yaml)).includes("missing-concurrency"));
  });
});

describe("auditWorkflows — untrusted input in run (check f)", () => {
  it("flags \${{ github.event.* }} inside a multiline run block as high", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: |
          echo "title: \${{ github.event.pull_request.title }}"
          npm test
`;
    const findings = findingsFor(yaml);
    const f = findings.filter((x) => x.check === "untrusted-input-in-run");
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, "high");
    assert.equal(f[0].line, 11);
  });

  it("flags \${{ github.head_ref }} in an inline run as high", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: git checkout "\${{ github.head_ref }}"
`;
    const f = findingsFor(yaml).filter((x) => x.check === "untrusted-input-in-run");
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, "high");
  });

  it("does not flag github.event interpolation outside run blocks (env indirection)", () => {
    const yaml = `name: t
on: workflow_dispatch
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - env:
          PR_TITLE: \${{ github.event.pull_request.title }}
        run: echo "$PR_TITLE"
`;
    assert.ok(!checks(findingsFor(yaml)).includes("untrusted-input-in-run"));
  });
});

describe("auditWorkflows — dangerous triggers (check g)", () => {
  it("flags pull_request_target + secrets.* usage as high", () => {
    const yaml = `name: t
on:
  pull_request_target:
    types: [opened]
permissions:
  contents: read
concurrency:
  group: prt
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: npm test
        env:
          TOKEN: \${{ secrets.NPM_TOKEN }}
`;
    const f = findingsFor(yaml).filter((x) => x.check === "dangerous-trigger-with-secrets");
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, "high");
  });

  it("flags issue_comment + write permissions as high", () => {
    const yaml = `name: t
on: issue_comment
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: npm test
`;
    const f = findingsFor(yaml).filter((x) => x.check === "dangerous-trigger-with-secrets");
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, "high");
  });

  it("does not flag pull_request_target with read-only permissions and no secrets", () => {
    const yaml = `name: t
on: pull_request_target
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: npm test
`;
    assert.ok(!checks(findingsFor(yaml)).includes("dangerous-trigger-with-secrets"));
  });
});

describe("auditWorkflows — determinism", () => {
  const messy = `name: m
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - uses: pnpm/action-setup@v4
      - run: echo "\${{ github.head_ref }}"
`;

  it("returns identical output across repeated runs", () => {
    const first = auditWorkflows([{ path: "b.yml", content: messy }, { path: "a.yml", content: CLEAN_WORKFLOW }]);
    const second = auditWorkflows([{ path: "b.yml", content: messy }, { path: "a.yml", content: CLEAN_WORKFLOW }]);
    assert.deepEqual(first, second);
  });

  it("sorts findings by file, then line, regardless of input order", () => {
    const reversed = auditWorkflows([{ path: "b.yml", content: messy }, { path: "a.yml", content: messy }]);
    const files = reversed.map((f) => f.file);
    assert.deepEqual(files, [...files].sort());
    for (const file of new Set(files)) {
      const lines = reversed.filter((f) => f.file === file).map((f) => f.line);
      assert.deepEqual(lines, [...lines].sort((x, y) => x - y));
    }
  });
});

describe("renderReport", () => {
  it("renders a summary table, per-file grouping, and remediation text", () => {
    const yaml = `name: m
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo "\${{ github.head_ref }}"
`;
    const findings = findingsFor(yaml, ".github/workflows/messy.yml");
    const report = renderReport(findings, { scannedFiles: [".github/workflows/messy.yml"] });
    assert.match(report, /\| Severity \|/);
    assert.match(report, /\.github\/workflows\/messy\.yml/);
    assert.match(report, /Remediation/);
    assert.match(report, /high/i);
  });

  it("renders an explicit all-clear when there are no findings", () => {
    const report = renderReport([], { scannedFiles: [".github/workflows/ci.yml"] });
    assert.match(report, /No findings/i);
  });
});
