/**
 * The per-agent support table is the public promise: docs/AGENT-SUPPORT.md,
 * the README and landing tier tables and .cloudplugin compatibleWith are
 * rendered from lib/agent-support.mjs, and verify:agent-matrix fails when a doc
 * claims blocking for an agent whose row says it cannot block.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { HOOK_AGENT_IDS, PLUGIN_AGENT_IDS } from "../lib/agent-install-plans.mjs";
import { AGENT_PROFILES } from "../lib/agent-profiles.mjs";
import {
  AGENT_SUPPORT,
  blocksPreTool,
  compatibleWith,
  renderCloudplugin,
  supportTier,
  type AgentSupport,
} from "../lib/agent-support.mjs";
import {
  BLOCK_END,
  BLOCK_START,
  CLAIM_SCAN_FILES,
  checkAgentMatrix,
  findBlockingClaims,
  renderSupportDoc,
  renderTierHtml,
  renderTierMarkdown,
  spliceBlock,
  supportViolations,
  writeAgentMatrix,
} from "../bin/check-agent-matrix.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const row = (over: Partial<AgentSupport>): AgentSupport => ({
  id: "x",
  names: ["Xagent"],
  compat: [],
  canBlockPreTool: true,
  blocks: "yes",
  lessons: "hook",
  stopGate: true,
  mcp: true,
  evidence: "docs",
  install: ["npx continuous-improvement install --target x --hooks"],
  then: "",
  cannot: "Nothing.",
  source: "test",
  ...over,
});

describe("agent support table", () => {
  it("has one row per id, and a row for claude, every agent profile, every hook and plugin agent, zed and aider", () => {
    const ids = AGENT_SUPPORT.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
    for (const id of ["claude", ...AGENT_PROFILES.map((p) => p.id), ...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS, "zed", "aider"]) {
      assert.ok(ids.includes(id), `no support row for ${id}`);
    }
  });

  it("passes its own consistency check", () => {
    assert.deepEqual(supportViolations(AGENT_SUPPORT), []);
  });

  it("claims blocking only for claude and the agents the installer wires a pre-tool hook for", () => {
    const wired = new Set(["claude", ...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS]);
    for (const r of AGENT_SUPPORT.filter(blocksPreTool)) assert.ok(wired.has(r.id), `${r.id} blocks but has no hook install`);
    assert.deepEqual(AGENT_SUPPORT.filter((r) => !blocksPreTool(r)).map((r) => r.id), ["zed", "aider"]);
  });

  it("derives the tier from the flags", () => {
    assert.equal(supportTier(row({})), "full");
    assert.equal(supportTier(row({ lessons: "rules file" })), "partial");
    assert.equal(supportTier(row({ lessons: "none" })), "partial");
    assert.equal(supportTier(row({ stopGate: false })), "partial");
    assert.equal(supportTier(row({ canBlockPreTool: false, blocks: "no" })), "rules only");
  });

  it("fails closed on a malformed canBlockPreTool: only a literal true blocks", () => {
    for (const value of [undefined, null, "true", 1, {}]) {
      const bad = row({ canBlockPreTool: value as unknown as boolean });
      assert.equal(blocksPreTool(bad), false, `${String(value)} must not count as blocking`);
      assert.equal(supportTier(bad), "rules only");
    }
  });

  it("matches the public tier table the plan states", () => {
    const tiers = Object.fromEntries(AGENT_SUPPORT.map((r) => [r.id, supportTier(r)]));
    assert.deepEqual(tiers, {
      claude: "full", codex: "full", gemini: "full", qwen: "full", cursor: "full", copilot: "full", grok: "partial",
      devin: "full", kiro: "full", droid: "full", auggie: "partial", junie: "partial", cline: "partial",
      goose: "partial", opencode: "partial", amp: "full", zed: "rules only", aider: "rules only",
    });
  });
});

describe("supportViolations", () => {
  it("flags a 'blocks' cell that contradicts canBlockPreTool", () => {
    assert.equal(supportViolations([row({ id: "codex", canBlockPreTool: false, blocks: "yes" })]).length, 1);
    assert.equal(supportViolations([row({ id: "codex", blocks: "no" })]).length, 1);
  });

  it("flags a blocking row with no hook install, a duplicate id, an empty install and a pipe or newline in a cell", () => {
    assert.match(supportViolations([row({ id: "nosuchagent" })]).join("\n"), /no pre-tool hook/);
    assert.match(supportViolations([row({ id: "codex" }), row({ id: "codex" })]).join("\n"), /duplicate/);
    assert.match(supportViolations([row({ id: "codex", install: [] })]).join("\n"), /install/);
    assert.match(supportViolations([row({ id: "codex", cannot: "a | b" })]).join("\n"), /\|/);
    assert.match(supportViolations([row({ id: "codex", then: "a\nb" })]).join("\n"), /newline/);
  });

  it("accepts an empty table as no rows, and reports it", () => {
    assert.match(supportViolations([]).join("\n"), /no rows/);
  });
});

describe("findBlockingClaims", () => {
  const rows = [row({ id: "codex", names: ["Codex"] }), row({ id: "zed", names: ["Zed"], canBlockPreTool: false, blocks: "no" })];

  it("flags a sentence that names a non-blocking agent with a blocking verb", () => {
    for (const text of ["Zed blocks destructive commands.", "The guard denies rm -rf on zed too.", "It enforces the rules in Zed.", "Zed: refused before it runs"]) {
      assert.equal(findBlockingClaims("README.md", text, rows).length, 1, text);
    }
  });

  it("does not flag a negated sentence, a blocking agent, or a name inside a longer word", () => {
    for (const text of [
      "Zed has no hooks, so nothing is blocked.",
      "Zed cannot block a tool call.",
      "Zed does not deny anything.",
      "Codex blocks destructive commands.",
      "Zedd blocks everything.",
      "Zed gets a rules file.",
      "",
    ]) {
      assert.deepEqual(findBlockingClaims("README.md", text, rows), [], text);
    }
  });

  it("judges each sentence on its own, and reads HTML as text", () => {
    assert.equal(findBlockingClaims("x.md", "Zed has no hooks. Zed blocks pushes.", rows).length, 1);
    assert.equal(findBlockingClaims("x.html", "<td>Zed</td><td><b>blocks</b> pushes</td>", rows).length, 1);
    assert.deepEqual(findBlockingClaims("x.html", "<td>Zed</td><td>no hooks; nothing <b>blocked</b></td>", rows), []);
  });

  it("treats a row with a malformed flag as non-blocking (fail closed)", () => {
    const odd = [row({ id: "odd", names: ["Oddagent"], canBlockPreTool: "yes" as unknown as boolean })];
    assert.equal(findBlockingClaims("x.md", "Oddagent blocks rm -rf.", odd).length, 1);
  });

  it("names the file and line", () => {
    const [hit] = findBlockingClaims("docs/x.md", "intro\nZed blocks it.", rows);
    assert.equal(hit?.file, "docs/x.md");
    assert.equal(hit?.line, 2);
  });

  // PR 17 review: the scan failed open on each of these. A negation counts only
  // when it governs the verb, a sentence is read across wrapped lines, and the
  // blocking synonyms count.
  it("flags a claim whose only negation governs something else", () => {
    for (const text of [
      "Zed blocks destructive commands, not just blind edits.",
      "The guard blocks rm in Zed, and Aider has no hooks.",
      "Aider has no hooks and the guard blocks rm in Zed.",
      "Zed cannot block a push, but the guard stops rm.",
      "Zed blocks pushes: not just edits.",
    ]) {
      assert.equal(findBlockingClaims("README.md", text, rows).length, 1, text);
    }
  });

  it("flags the blocking synonyms", () => {
    for (const text of [
      "In Zed the guard stops destructive commands before they run.",
      "Zed: prevents force pushes.",
      "Zed gates every push.",
      "The guard guards against rm in Zed.",
    ]) {
      assert.equal(findBlockingClaims("README.md", text, rows).length, 1, text);
    }
  });

  it("reads a sentence wrapped across lines, and reports the verb's line", () => {
    const hits = findBlockingClaims("README.md", "The guard now runs in Zed and\nblocks destructive commands before they run.", rows);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.line, 2);
    assert.equal(findBlockingClaims("x.html", "<p>The guard runs in Zed and\n  <b>blocks</b> pushes.</p>", rows).length, 1);
    assert.equal(findBlockingClaims("x.html", "<td>Zed</td>\n<td><b>blocks</b> pushes</td>", rows).length, 1);
  });

  it("keeps paragraphs, table rows, headings, list items and HTML blocks apart", () => {
    for (const [file, text] of [
      ["x.md", "Zed gets a rules file\n\nthe guard blocks pushes in Codex."],
      ["x.md", "| Zed | rules |\n| Codex | blocks |"],
      ["x.md", "## Zed\nCodex blocks pushes."],
      ["x.md", "- Zed: rules file\n- Codex blocks pushes"],
      ["x.html", "<tr><th>Zed</th><td>rules</td></tr>\n<tr><th>Codex</th><td>blocks</td></tr>"],
      ["x.html", "<li>Zed</li><li>Codex blocks</li>"],
      ["x.md", "<p>Zed</p>\n<p>Codex blocks</p>"],
    ] as const) {
      assert.deepEqual(findBlockingClaims(file, text, rows), [], text);
    }
  });

  it("still accepts a negation that governs the verb, a 'verb: no' label, and the Stop event name", () => {
    for (const text of [
      "Zed never blocks anything.",
      "Zed doesn't stop a push.",
      "Neither Zed nor Aider can block.",
      "Zed. Blocks: no.",
      "Zed blocks: no",
      "Zed has no Stop gate and no Stop hook.",
    ]) {
      assert.deepEqual(findBlockingClaims("README.md", text, rows), [], text);
    }
  });
});

describe("spliceBlock", () => {
  const doc = `a\n${BLOCK_START}\nold\n${BLOCK_END}\nb\n`;

  it("replaces only the text between the markers", () => {
    assert.equal(spliceBlock(doc, "new"), `a\n${BLOCK_START}\nnew\n${BLOCK_END}\nb\n`);
  });

  it("refuses a missing, unpaired, repeated or reversed marker", () => {
    for (const bad of ["no markers", `${BLOCK_START} only`, `${BLOCK_END} only`, `${doc}${doc}`, `${BLOCK_END}\n${BLOCK_START}`]) {
      assert.equal(spliceBlock(bad, "new"), null, bad);
    }
  });
});

describe("renderers", () => {
  it("render every agent, its tier, its first install command and what it cannot do", () => {
    const md = renderTierMarkdown(AGENT_SUPPORT);
    const html = renderTierHtml(AGENT_SUPPORT);
    const doc = renderSupportDoc(AGENT_SUPPORT);
    for (const r of AGENT_SUPPORT) {
      for (const text of [md, doc]) {
        assert.ok(text.includes(r.names[0]!), `${r.id} name`);
        assert.ok(text.includes(r.install[0]!), `${r.id} install`);
      }
      assert.ok(html.includes(r.names[0]!), `${r.id} name in html`);
      assert.ok(doc.includes(r.cannot), `${r.id} cannot`);
    }
  });

  it("escapes HTML and turns backticks into code", () => {
    const html = renderTierHtml([row({ cannot: "a <b> & `c`" })]);
    assert.match(html, /a &lt;b&gt; &amp; <code>c<\/code>/);
  });

  it("make no blocking claim for a non-blocking agent, and no unanchored runtime-claim phrase", () => {
    for (const [file, text] of [["md", renderTierMarkdown(AGENT_SUPPORT)], ["html", renderTierHtml(AGENT_SUPPORT)], ["doc", renderSupportDoc(AGENT_SUPPORT)]] as const) {
      assert.deepEqual(findBlockingClaims(file, text, AGENT_SUPPORT), []);
      assert.doesNotMatch(text, /pretooluse hook|physically block|runtime gate/i, file);
    }
  });

  it("names the hook file behind each runtime claim in the support doc", () => {
    const doc = renderSupportDoc(AGENT_SUPPORT);
    for (const file of ["hooks/gateguard.mjs", "hooks/session.mjs", "hooks/typecheck-stop.mjs", "hooks/goal-drift-stop.mjs", "bin/mcp-server.mjs"]) {
      assert.ok(doc.includes(file), file);
    }
  });
});

describe("cloudplugin manifest", () => {
  it("sets version and compatibleWith and keeps every other key", () => {
    const out = JSON.parse(renderCloudplugin(JSON.stringify({ name: "n", version: "1.0.0", compatibleWith: ["old"], tags: ["t"] }), "9.9.9"));
    assert.equal(out.version, "9.9.9");
    assert.deepEqual(out.compatibleWith, compatibleWith());
    assert.deepEqual(out.tags, ["t"]);
    assert.equal(out.name, "n");
  });

  it("lists claude first, keeps the claude-code and gemini-cli ids, and lists no agent the research did not cover", () => {
    const ids = compatibleWith();
    assert.equal(ids[0], "claude");
    assert.ok(ids.includes("claude-code") && ids.includes("gemini-cli"));
    assert.ok(!ids.includes("openclaw"));
  });

  it("refuses a manifest that is not a JSON object", () => {
    for (const bad of ["[]", "null", "1", "{not json"]) assert.throws(() => renderCloudplugin(bad, "1.0.0"), bad);
  });
});

describe("checkAgentMatrix", () => {
  const dirs: string[] = [];
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function fixtureRepo(): string {
    const root = mkdtempSync(join(tmpdir(), "agent-matrix-"));
    dirs.push(root);
    mkdirSync(join(root, "docs", "landing"), { recursive: true });
    mkdirSync(join(root, ".cloudplugin"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: "3.27.0" }));
    writeFileSync(join(root, ".cloudplugin", "marketplace.json"), JSON.stringify({ name: "n", version: "3.13.0", compatibleWith: ["claude"] }));
    writeFileSync(join(root, "docs", "AGENT-SUPPORT.md"), "stale\n");
    writeFileSync(join(root, "README.md"), `# r\n${BLOCK_START}\nold\n${BLOCK_END}\n`);
    writeFileSync(join(root, "docs", "landing", "index.html"), `<p>x</p>\n${BLOCK_START}\nold\n${BLOCK_END}\n`);
    writeFileSync(join(root, "QUICKSTART.md"), "# q\n");
    writeFileSync(join(root, "llms.txt"), "# l\n");
    return root;
  }

  it("reports every stale surface, then passes after --write", () => {
    const root = fixtureRepo();
    const before = checkAgentMatrix(root).join("\n");
    for (const what of ["docs/AGENT-SUPPORT.md", "README.md", "docs/landing/index.html", "compatibleWith", "version"]) {
      assert.match(before, new RegExp(what.replace(/[.]/g, "\\.")), what);
    }
    writeAgentMatrix(root);
    assert.deepEqual(checkAgentMatrix(root), []);
    assert.equal(JSON.parse(readFileSync(join(root, ".cloudplugin", "marketplace.json"), "utf8")).version, "3.27.0");
  });

  it("fails closed on a missing scanned file or a missing block", () => {
    const root = fixtureRepo();
    writeAgentMatrix(root);
    rmSync(join(root, "llms.txt"));
    writeFileSync(join(root, "README.md"), "# r, no block\n");
    const out = checkAgentMatrix(root).join("\n");
    assert.match(out, /llms\.txt/);
    assert.match(out, /README\.md.*marker/);
  });

  it("flags a hand-written blocking claim for Zed or Aider anywhere in a scanned file", () => {
    const root = fixtureRepo();
    writeAgentMatrix(root);
    writeFileSync(join(root, "QUICKSTART.md"), "# q\n\nThe guard blocks rm -rf in Aider too.\n");
    assert.match(checkAgentMatrix(root).join("\n"), /QUICKSTART\.md:3: .*Aider/);
  });

  it("passes on this repository", () => {
    assert.deepEqual(checkAgentMatrix(REPO_ROOT), []);
  });

  it("scans the docs people read before installing", () => {
    assert.deepEqual([...CLAIM_SCAN_FILES], ["README.md", "QUICKSTART.md", "llms.txt", "docs/AGENT-SUPPORT.md", "docs/landing/index.html"]);
  });
});

// llms.txt lists the agents per tier in prose; each list must be exactly the
// non-Claude rows of that tier, so the hand-written lines cannot drift.
describe("llms.txt tier lists", () => {
  const llms = readFileSync(join(REPO_ROOT, "llms.txt"), "utf8").split(/\r?\n/);
  const lists: ReadonlyArray<readonly [string, string]> = [["- Full tier", "full"], ["- Partial tier", "partial"], ["- Rules file only", "rules only"]];

  for (const [prefix, tier] of lists) {
    it(`"${prefix}" names exactly the ${tier} agents`, () => {
      const line = llms.find((l) => l.startsWith(prefix));
      assert.ok(line, `llms.txt has no "${prefix}" line`);
      const items = line.slice(line.lastIndexOf(":") + 1).split(",").map((item) => item.replace(/\(.*?\)/g, "").trim());
      const named = items.map((item) => AGENT_SUPPORT.find((r) => r.names.includes(item))?.id ?? `unknown:${item}`);
      const want = AGENT_SUPPORT.filter((r) => r.id !== "claude" && supportTier(r) === tier).map((r) => r.id);
      assert.deepEqual(named, want);
    });
  }
});

// AGENTS.md is CLAUDE.md with "Claude" replaced by "Codex", which turned real
// paths into ones that do not exist (.Codex-plugin/, third-party/oh-my-Codex/).
describe("root AGENTS.md references", () => {
  const text = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
  const top = new Set(readdirSync(REPO_ROOT));

  it("has no path broken by the Claude-to-Codex rename", () => {
    assert.doesNotMatch(text, /\.Codex-plugin|oh-my-Codex/);
  });

  it("names only repository paths that exist", () => {
    const missing = [...text.matchAll(/`([^`\s<>*]+\/[^`\s<>*]*)`/g)]
      .map((m) => m[1]!)
      .filter((p) => top.has(p.split("/")[0]!))
      .filter((p) => !existsSync(join(REPO_ROOT, p)));
    assert.deepEqual(missing, []);
  });
});
