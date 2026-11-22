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

import { HOOK_AGENT_IDS, PLUGIN_AGENT_IDS, planAgentInstall, resolveHookAgent } from "../lib/agent-install-plans.mjs";
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
  AGENT_MAP_SVG,
  BLOCK_END,
  BLOCK_START,
  CHANGELOG_FILE,
  CLAIM_SCAN_FILES,
  changelogClaims,
  checkAgentMatrix,
  findBlockingClaims,
  renderAgentMapSvg,
  renderReadmeTierMarkdown,
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
  preToolVerdict: "yes",
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

  // PR 17 review: the Then cell left out the MCP step the installer prints for
  // Codex at project scope, Auggie and Amp. Every row whose documented install
  // prints a step the user must carry out says so.
  it("names the printed step in Then for every install that prints one", () => {
    for (const r of AGENT_SUPPORT) {
      for (const cmd of r.install) {
        const target = /--target (\S+)/.exec(cmd)?.[1];
        if (!target || !cmd.includes("--hooks")) continue;
        const agent = resolveHookAgent(target);
        assert.ok(agent, `${r.id}: ${target} is not a hook agent`);
        const scope = /--scope (\S+)/.exec(cmd)?.[1] === "user" ? "user" : "project";
        const plan = planAgentInstall(agent, {
          scope,
          runtimeDir: "/home/u/rt",
          projectRoot: "/work/repo",
          home: "/home/u",
          platform: "linux",
          env: {},
          failClosed: false,
          read: () => null,
          listDir: () => [],
          documentsDir: () => null,
        });
        assert.equal(plan.error, undefined, `${r.id}: ${plan.error}`);
        if (plan.printed.length > 0) assert.match(r.then, /\bprinted\b/, `${r.id}: the install prints ${plan.printed.length} step(s) but Then does not name them`);
      }
    }
  });

  it("says a Kiro hook crash exits 1, which Kiro CLI allows", () => {
    const kiro = AGENT_SUPPORT.find((r) => r.id === "kiro");
    assert.match(kiro?.cannot ?? "", /crash exits 1, which Kiro CLI allows/);
  });

  it("claims blocking only for claude and the agents the installer wires a pre-tool hook for", () => {
    const wired = new Set(["claude", ...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS]);
    for (const r of AGENT_SUPPORT.filter(blocksPreTool)) assert.ok(wired.has(r.id), `${r.id} blocks but has no hook install`);
    assert.deepEqual(AGENT_SUPPORT.filter((r) => !blocksPreTool(r)).map((r) => r.id), ["kiro-ide", "zed", "aider"]);
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
      devin: "full", kiro: "full", "kiro-ide": "partial", droid: "full", auggie: "partial", junie: "partial", cline: "partial",
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
    for (const what of ["docs/AGENT-SUPPORT.md", "README.md", "docs/landing/index.html", "assets/readme/agents-map.svg", "compatibleWith", "version"]) {
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

  it("fails when the agents map is edited by hand", () => {
    const root = fixtureRepo();
    writeAgentMatrix(root);
    const path = join(root, AGENT_MAP_SVG);
    writeFileSync(path, readFileSync(path, "utf8").replace("Cursor", "Zed"));
    assert.match(checkAgentMatrix(root).join("\n"), /assets\/readme\/agents-map\.svg: differs from the rows/);
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

// PR 20 (closeout, critic gap 8): one "Kiro CLI and IDE" row claimed exit-2
// blocking for both, while the verified matrix rates the IDE's pre-tool block
// partial (its two hook docs disagree on exit codes). verify:agent-matrix could
// not see it, because the row's canBlockPreTool was true. Each row now carries
// the matrix verdict for its surface, and a row rated anything but yes cannot
// claim blocking.
describe("Kiro CLI and Kiro IDE, and the pre-tool verdict", () => {
  const cli = AGENT_SUPPORT.find((r) => r.names[0] === "Kiro CLI");
  const ide = AGENT_SUPPORT.find((r) => r.names[0] === "Kiro IDE");

  it("rates Kiro CLI full, blocking with exit 2", () => {
    assert.equal(cli?.id, "kiro");
    assert.equal(cli?.preToolVerdict, "yes");
    assert.equal(blocksPreTool(cli!), true);
    assert.match(cli!.blocks, /^yes \(exit 2\)$/);
    assert.equal(supportTier(cli!), "full");
  });

  it("rates Kiro IDE partial, a variant of --target kiro that claims no blocking", () => {
    assert.equal(ide?.id, "kiro-ide");
    assert.equal(ide?.variantOf, "kiro");
    assert.equal(ide?.preToolVerdict, "partial");
    assert.equal(blocksPreTool(ide!), false);
    assert.doesNotMatch(ide!.blocks, /^yes\b/i);
    assert.equal(supportTier(ide!), "partial");
    assert.ok(ide!.install.every((cmd) => cmd.includes("--target kiro --hooks")));
    assert.match(ide!.cannot, /disagree/);
  });

  it("flags a row rated partial that claims blocking, through the flag or a Blocks: yes cell", () => {
    assert.match(supportViolations([row({ id: "kiro", preToolVerdict: "partial" })]).join("\n"), /rates .*partial/);
    const variant = (over: Partial<AgentSupport>): AgentSupport[] => [
      row({ id: "kiro" }),
      row({ id: "kiro-ide", variantOf: "kiro", names: ["Kiro IDE"], canBlockPreTool: false, preToolVerdict: "partial", blocks: "not claimed", ...over }),
    ];
    assert.deepEqual(supportViolations(variant({})), []);
    assert.match(supportViolations(variant({ blocks: "yes (exit 2)" })).join("\n"), /kiro-ide.*partial/);
    assert.match(supportViolations(variant({ canBlockPreTool: true, blocks: "yes" })).join("\n"), /kiro-ide.*partial/);
  });

  it("fails closed on a missing or malformed verdict: a blocking row must say yes", () => {
    for (const value of [undefined, null, "Yes", "partial ", 1]) {
      const out = supportViolations([row({ id: "codex", preToolVerdict: value as unknown as AgentSupport["preToolVerdict"] })]);
      assert.match(out.join("\n"), /rates/, String(value));
    }
    for (const value of [undefined, "Partial", "no"]) {
      const bad = row({ canBlockPreTool: false, blocks: "no", preToolVerdict: value as unknown as AgentSupport["preToolVerdict"] });
      assert.equal(supportTier(bad), "rules only", String(value));
    }
    assert.equal(supportTier(row({ canBlockPreTool: false, blocks: "not claimed", preToolVerdict: "partial" })), "partial");
  });

  it("flags a variant of an id with no base row, and a variant of a variant", () => {
    const ide = row({ id: "kiro-ide", variantOf: "kiro", canBlockPreTool: false, preToolVerdict: "partial", blocks: "not claimed" });
    assert.match(supportViolations([ide]).join("\n"), /variant of kiro, which has no row/);
    const nested = row({ id: "kiro-web", variantOf: "kiro-ide", canBlockPreTool: false, preToolVerdict: "partial", blocks: "not claimed" });
    assert.match(supportViolations([row({ id: "kiro" }), ide, nested]).join("\n"), /kiro-web: variant of kiro-ide/);
  });

  it("flags a hand-written blocking claim for the Kiro IDE, and none for the Kiro CLI", () => {
    assert.equal(findBlockingClaims("README.md", "The guard blocks force pushes in the Kiro IDE.", AGENT_SUPPORT).length, 1);
    assert.deepEqual(findBlockingClaims("README.md", "Kiro CLI blocks force pushes with exit 2.", AGENT_SUPPORT), []);
    assert.deepEqual(findBlockingClaims("README.md", "The Kiro IDE: no blocking is claimed.", AGENT_SUPPORT), []);
  });

  it("lists the Kiro IDE in compatibleWith right after kiro", () => {
    const ids = compatibleWith();
    assert.ok(ids.includes("kiro-ide"));
    assert.equal(ids.indexOf("kiro-ide"), ids.indexOf("kiro") + 1);
  });
});

// PR 20 (closeout, critic doc claim 2): the support doc said the guard covers
// blind edits on every hook agent. A read through a file tool whose path key
// the research does not document (Copilot and Auggie view, and Devin and
// Auggie read unless it names the file as `path`) leaves an empty row, so it
// never clears the gate; the doc says so.
describe("the blind-edit claim in the support doc", () => {
  const doc = renderSupportDoc(AGENT_SUPPORT);

  it("says which reads count and which file tools do not", () => {
    assert.match(doc, /A shell command that names the file counts as a read on every hook agent/);
    assert.match(doc, /Copilot, Devin and Auggie document none for their file-read tools, so a read through `view` never counts/);
    assert.match(doc, /names no session/);
  });

  it("names the shell read in the Copilot, Devin and Auggie rows", () => {
    for (const id of ["copilot", "devin", "auggie"]) {
      const r = AGENT_SUPPORT.find((x) => x.id === id);
      assert.match(r?.cannot ?? "", /blind-edit gate/, id);
    }
  });
});

// PR 20 review fixes. (1) Junie's matrix cell is "partial H (Early Access
// only)", but the row was hand-encoded "yes", so the check that a partial
// verdict claims no blocking passed it unseen. The cell now reads
// "conditional": the matrix rates it partial because the block holds only on
// a build or setting, and a conditional row may claim blocking only when its
// Blocks cell states that condition. (2) A non-blocking row rated partial is
// published as "hooks run", so it needs a hook install like a blocking row.
// (3) kiro-ide is in compatibleWith, so `--target kiro-ide` installs the Kiro
// hooks instead of saying there is no hook install.
describe("the conditional verdict, a partial row's hook install, and the variant target", () => {
  it("records Junie's matrix cell, partial on the Early Access build only, as conditional", () => {
    const junie = AGENT_SUPPORT.find((r) => r.id === "junie");
    assert.equal(junie?.preToolVerdict, "conditional");
    assert.equal(blocksPreTool(junie!), true);
    assert.equal(junie!.blocks, "yes, on the Early Access build");
    assert.deepEqual(supportViolations(AGENT_SUPPORT), []);
  });

  it("copies the matrix cell on every row: no for Zed and Aider, partial for the Kiro IDE, conditional for Junie, yes elsewhere", () => {
    const want: Record<string, string> = { zed: "no", aider: "no", "kiro-ide": "partial", junie: "conditional" };
    for (const r of AGENT_SUPPORT) assert.equal(r.preToolVerdict, want[r.id] ?? "yes", r.id);
  });

  it("lets a conditional row claim blocking only when its Blocks cell states the condition", () => {
    const junie = (blocks: string): AgentSupport => row({ id: "junie", preToolVerdict: "conditional", blocks });
    assert.deepEqual(supportViolations([junie("yes, on the Early Access build")]), []);
    for (const blocks of ["yes", "yes (exit 2)", "yes,", "yes, "]) {
      assert.match(supportViolations([junie(blocks)]).join("\n"), /conditional.*names no condition/, blocks);
    }
    assert.deepEqual(supportViolations([row({ id: "junie", canBlockPreTool: false, blocks: "no", preToolVerdict: "conditional" })]), []);
  });

  it("flags a non-blocking row rated partial that has no hook install, by its own id or its base id", () => {
    const zed = row({ id: "zed", canBlockPreTool: false, blocks: "not claimed (no hooks)", preToolVerdict: "partial" });
    assert.match(supportViolations([zed]).join("\n"), /zed: rated partial .*no hook install/);
    const ide = row({ id: "kiro-ide", variantOf: "kiro", canBlockPreTool: false, blocks: "not claimed", preToolVerdict: "partial" });
    assert.deepEqual(supportViolations([row({ id: "kiro" }), ide]), []);
    assert.deepEqual(supportViolations([row({ id: "zed", canBlockPreTool: false, blocks: "no", preToolVerdict: "no" })]), []);
  });

  it("installs every variant row through its own id as well as its base target", () => {
    const variants = AGENT_SUPPORT.filter((r) => r.variantOf !== undefined);
    assert.ok(variants.length > 0);
    for (const r of variants) assert.equal(resolveHookAgent(r.id), r.variantOf, r.id);
  });
});

// PR 21: the [Unreleased] CHANGELOG lead for PR 8 said "a deny blocks on ...
// Kiro, Junie ..." with no qualifier, against a table where the Kiro IDE claims
// no blocking and Junie blocks only on its Early Access build. The scan did not
// read CHANGELOG.md, a conditional row's claim needed no condition, and the
// bare "Kiro" (the Kiro CLI row's short name) also names the Kiro IDE.
describe("conditional and ambiguous blocking claims, and the CHANGELOG leads", () => {
  it("flags a blocking claim for Junie that does not name its Early Access build", () => {
    for (const text of ["A deny blocks on Junie too.", "Junie CLI blocks rm -rf.", "The guard denies force pushes in Junie on Early Access."]) {
      const [hit, ...rest] = findBlockingClaims("README.md", text, AGENT_SUPPORT);
      assert.equal(rest.length, 0, text);
      assert.match(hit?.reason ?? "", /Junie.*Early Access build/, text);
    }
  });

  it("accepts a Junie claim that names the condition, and a negated one", () => {
    for (const text of [
      "A deny blocks on Junie's Early Access build.",
      "Junie CLI blocks rm -rf on the Early Access build.",
      "On stable builds Junie does not block anything.",
      "Junie gets a rules file.",
    ]) {
      assert.deepEqual(findBlockingClaims("README.md", text, AGENT_SUPPORT), [], text);
    }
  });

  it("fails closed on a conditional row whose Blocks cell names an empty condition", () => {
    const odd = [row({ id: "odd", names: ["Oddagent"], preToolVerdict: "conditional", blocks: "yes, on the " })];
    assert.equal(findBlockingClaims("x.md", "Oddagent blocks rm -rf on the build.", odd).length, 1);
    assert.equal(findBlockingClaims("x.md", "Oddagent blocks rm -rf.", odd).length, 1);
  });

  it("flags a bare Kiro beside a blocking verb, since the Kiro IDE claims no blocking", () => {
    for (const text of ["A deny blocks on Kiro too.", "Kiro's hooks block rm -rf.", "kiro blocks it."]) {
      const [hit, ...rest] = findBlockingClaims("README.md", text, AGENT_SUPPORT);
      assert.equal(rest.length, 0, text);
      assert.match(hit?.reason ?? "", /"Kiro".*Kiro CLI.*Kiro IDE/i, text);
    }
    for (const text of ["Kiro CLI blocks force pushes with exit 2.", "Kiro has no Stop hook.", "Kiro does not block in the IDE."]) {
      assert.deepEqual(findBlockingClaims("README.md", text, AGENT_SUPPORT), [], text);
    }
  });

  it("does not call a short name ambiguous when no non-blocking row shares it", () => {
    const rows = [row({ id: "kiro", names: ["Kiro CLI", "Kiro"] })];
    assert.deepEqual(findBlockingClaims("README.md", "A deny blocks on Kiro too.", rows), []);
    const both = [...rows, row({ id: "kiro-ide", variantOf: "kiro", names: ["Kiro IDE"], canBlockPreTool: false, preToolVerdict: "partial", blocks: "not claimed" })];
    assert.equal(findBlockingClaims("README.md", "A deny blocks on Kiro too.", both).length, 1);
  });

  it("reads only the bold lead of each [Unreleased] entry, at its own line", () => {
    const text = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Added",
      "",
      "- **The hooks now answer each agent, so a deny blocks on Gemini, Kiro, Junie and Cline too** — body.",
      "- **Zed gets a rules file** — the body says Zed blocks nothing here, and a deny blocks on Junie.",
      "",
      "## [1.0.0] — 2026-01-01",
      "",
      "- **A deny blocks on Zed** — released history is not rescanned.",
      "",
    ].join("\n");
    const claims = changelogClaims(text, AGENT_SUPPORT);
    assert.equal(claims.length, 2, JSON.stringify(claims));
    assert.ok(claims.every((claim) => claim.file === CHANGELOG_FILE && claim.line === 7));
    assert.deepEqual(claims.map((claim) => (/Junie/.test(claim.reason ?? "") ? "junie" : "kiro")).sort(), ["junie", "kiro"]);
  });

  it("finds nothing in an empty CHANGELOG, one with no [Unreleased] section, or one whose entries have no bold lead", () => {
    for (const text of [
      "",
      "# Changelog\n\n## [1.0.0]\n\n- **A deny blocks on Zed** — x.\n",
      "## [Unreleased]\n\n- a deny blocks on Zed\n",
      "## [Unreleased]\n\n- **unclosed lead, a deny blocks on Zed\n",
    ]) {
      assert.deepEqual(changelogClaims(text, AGENT_SUPPORT), [], JSON.stringify(text));
    }
  });

  it("fails checkAgentMatrix on an unqualified CHANGELOG lead, and passes when CHANGELOG.md is absent", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-matrix-cl-"));
    try {
      mkdirSync(join(root, "docs", "landing"), { recursive: true });
      mkdirSync(join(root, ".cloudplugin"));
      writeFileSync(join(root, "package.json"), JSON.stringify({ version: "3.27.0" }));
      writeFileSync(join(root, ".cloudplugin", "marketplace.json"), JSON.stringify({ name: "n", version: "3.27.0", compatibleWith: [] }));
      writeFileSync(join(root, "README.md"), `# r\n${BLOCK_START}\n${BLOCK_END}\n`);
      writeFileSync(join(root, "docs", "landing", "index.html"), `<p>x</p>\n${BLOCK_START}\n${BLOCK_END}\n`);
      writeFileSync(join(root, "QUICKSTART.md"), "# q\n");
      writeFileSync(join(root, "llms.txt"), "# l\n");
      writeAgentMatrix(root);
      assert.deepEqual(checkAgentMatrix(root), []);
      writeFileSync(join(root, CHANGELOG_FILE), "## [Unreleased]\n\n- **A deny now blocks on Junie too** — x.\n");
      assert.match(checkAgentMatrix(root).join("\n"), /CHANGELOG\.md:3: .*Junie.*Early Access build/);
      writeFileSync(join(root, CHANGELOG_FILE), "## [Unreleased]\n\n- **A deny now blocks on Junie's Early Access build too** — x.\n");
      assert.deepEqual(checkAgentMatrix(root), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds no unqualified claim in this repository's [Unreleased] leads", () => {
    assert.deepEqual(changelogClaims(readFileSync(join(REPO_ROOT, CHANGELOG_FILE), "utf8"), AGENT_SUPPORT), []);
  });
});

// PR 21: the Gemini install merges its hooks into .gemini/settings.json and
// writes no extension, so the Cannot cell no longer describes an extension's
// hooks/hooks.json.
describe("the Gemini row describes the settings.json install", () => {
  it("says no CLI command lists the hooks and names no extension hooks.json", () => {
    const gemini = AGENT_SUPPORT.find((r) => r.id === "gemini");
    assert.doesNotMatch(gemini!.cannot, /hooks\.json/);
    assert.match(gemini!.cannot, /No CLI command lists the hooks/);
    assert.match(gemini!.cannot, /\/hooks panel/);
  });
});

// Owner, 2026-11-22: the README names only the agents it works on. The README
// tier table and its map keep the rows that block a destructive command; the
// support doc and the landing table keep every row.
describe("the README lists only the agents where the guard blocks", () => {
  const blind = AGENT_SUPPORT.filter((r) => !blocksPreTool(r));
  const working = AGENT_SUPPORT.filter((r) => blocksPreTool(r));

  it("leaves the non-blocking rows out of the README table", () => {
    assert.deepEqual(blind.map((r) => r.names[0]), ["Kiro IDE", "Zed", "Aider"]);
    const md = renderReadmeTierMarkdown(AGENT_SUPPORT);
    for (const r of blind) assert.ok(!md.includes(`| ${r.names[0]} |`), `${r.id} is listed in the README table`);
    for (const r of working) assert.ok(md.includes(`| ${r.names[0]} |`), `${r.id} is missing from the README table`);
    assert.equal(md.split("\n").length, 2 + working.length);
  });

  it("keeps every row, the three non-blocking ones included, in the support doc and the landing table", () => {
    const doc = renderSupportDoc(AGENT_SUPPORT);
    const html = renderTierHtml(AGENT_SUPPORT);
    assert.equal(AGENT_SUPPORT.length, 19);
    for (const r of AGENT_SUPPORT) {
      assert.ok(doc.includes(`### ${r.names[0]}`), `${r.id} section`);
      assert.ok(html.includes(r.names[0]!), `${r.id} landing row`);
    }
    assert.equal(renderTierMarkdown(AGENT_SUPPORT).split("\n").length, 2 + AGENT_SUPPORT.length);
  });

  it("does not frame the support doc as Claude Code first", () => {
    assert.doesNotMatch(renderSupportDoc(AGENT_SUPPORT), /Claude Code first/);
  });

  it("draws one tile per blocking row in the agents map, with the condition and the surface named", () => {
    const svg = renderAgentMapSvg(AGENT_SUPPORT);
    for (const r of working) assert.ok(svg.includes(`>${r.names[0]}</text>`), `${r.id} tile`);
    for (const r of blind) assert.ok(!svg.includes(r.names[0]!), `${r.id} is drawn`);
    assert.match(svg, /Early Access build/);
    assert.match(svg, />Kiro CLI<\/text>/);
    assert.doesNotMatch(svg, />Kiro<\/text>/);
  });

  it("draws an image GitHub and npm can show: a title, a dark scheme, and no script, font or link", () => {
    const svg = renderAgentMapSvg(AGENT_SUPPORT);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /<title id="title">[^<]+<\/title>/);
    assert.match(svg, /@media \(prefers-color-scheme:dark\)/);
    assert.doesNotMatch(svg, /<script|@import|@font-face|href=|url\(/i);
  });
});
