/**
 * Skills, and commands as skills, exported at install time
 * (docs/plans/2026-11-21-all-agents.md, PR 15). `install --target <agent>
 * --hooks` copies the plugin's SKILL.md set into the skills dir the agent
 * reads, with `${CLAUDE_PLUGIN_ROOT}/` rewritten to the stable runtime copy.
 * An agent with no command files of its own also gets each command that has
 * no skill of the same name, as a skill. A skill the agent already reads from
 * ~/.claude/skills is not copied again.
 *
 * Every skills dir, command format and ~/.claude/skills reader below comes
 * from the verified research of 2026-11-21 (result.json research agent_skills
 * and custom_commands, with the skeptic verdicts applied); src/lib/skill-export.mts
 * cites each one.
 *
 * RED first: skill-export.mjs did not exist, the planner wrote no skills, and
 * the runtime copy had no scripts/ for the rewritten paths to reach.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { type PlanContext, parseLedger, planAgentInstall, toLedgerFile } from "../lib/agent-install-plans.mjs";
import { installRuntime } from "../lib/install-runtime.mjs";
import {
  SKILL_EXPORT_AGENTS,
  SKILL_MARK,
  type SkillCatalog,
  parseSkillSource,
  planSkillExport,
  readSkillCatalog,
  renderExportedSkill,
} from "../lib/skill-export.mjs";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const INSTALL = join(REPO_ROOT, "bin", "install.mjs");
const VERSION = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;
const RT = "/home/u/.claude/instincts/runtime/9.9.9";
const HOME = "/home/u";
const ROOT = "/work/repo";
const PLACEHOLDER = "${CLAUDE_PLUGIN_ROOT}";
const roots: string[] = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function temp(prefix: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

function ctx(over: Partial<PlanContext> = {}, files: Record<string, string> = {}): PlanContext {
  return {
    scope: "project", runtimeDir: RT, projectRoot: ROOT, home: HOME, platform: "linux", env: {}, failClosed: false,
    read: (path) => (Object.hasOwn(files, path) ? files[path]! : null),
    listDir: () => [],
    documentsDir: () => null,
    ...over,
  };
}

const skill = (name: string, body = "Body.\n", extra = ""): string => `---\nname: ${name}\ndescription: The ${name} skill.\n${extra}---\n\n${body}`;
const CATALOG: SkillCatalog = {
  skills: [{ name: "gateguard", text: skill("gateguard", `Run \`node "${PLACEHOLDER}/bin/gateguard-clear.mjs"\`.\n`) }, { name: "ship", text: skill("ship") }],
  commands: [{ name: "ship", text: skill("ship", "The ship command.\n") }, { name: "dashboard", text: skill("dashboard", "Show $ARGUMENTS.\n") }],
};

// The verified skills dir for each agent and scope (result.json agent_skills, skeptic verdicts applied).
const DIRS: Record<string, { project: string; user: string }> = {
  codex: { project: `${ROOT}/.agents/skills`, user: `${HOME}/.agents/skills` },
  qwen: { project: `${ROOT}/.qwen/skills`, user: `${HOME}/.qwen/skills` },
  grok: { project: `${ROOT}/.grok/skills`, user: `${HOME}/.grok/skills` },
  devin: { project: `${ROOT}/.devin/skills`, user: `${HOME}/.agents/skills` },
  droid: { project: `${ROOT}/.factory/skills`, user: `${HOME}/.factory/skills` },
  gemini: { project: `${ROOT}/.gemini/skills`, user: `${HOME}/.gemini/skills` },
  cursor: { project: `${ROOT}/.cursor/skills`, user: `${HOME}/.cursor/skills` },
  copilot: { project: `${ROOT}/.github/skills`, user: `${HOME}/.copilot/skills` },
  kiro: { project: `${ROOT}/.kiro/skills`, user: `${HOME}/.kiro/skills` },
  auggie: { project: `${ROOT}/.augment/skills`, user: `${HOME}/.augment/skills` },
  junie: { project: `${ROOT}/.junie/skills`, user: `${HOME}/.junie/skills` },
  goose: { project: `${ROOT}/.agents/skills`, user: `${HOME}/.agents/skills` },
  cline: { project: `${ROOT}/.cline/skills`, user: `${HOME}/.cline/skills` },
  opencode: { project: `${ROOT}/.opencode/skills`, user: `${HOME}/.config/opencode/skills` },
  amp: { project: `${ROOT}/.agents/skills`, user: `${HOME}/.config/amp/skills` },
};
// No command files of their own (verified matrix Commands column): their commands are copied as skills.
const COMMANDS_AS_SKILLS = ["codex", "copilot", "devin", "kiro", "goose", "amp"];
// Read ~/.claude/skills by default (verified agent_skills): a skill already there is not copied.
const READS_CLAUDE = ["grok", "devin", "auggie", "goose", "opencode", "amp"];

const names = (agent: string, c: PlanContext, catalog = CATALOG): string[] => planSkillExport(agent, c, catalog).files.map((file) => file.name);

describe("the skill catalog", () => {
  it("reads every bundled skill and command from the package, each with a name that matches its dir and a description", () => {
    const catalog = readSkillCatalog(REPO_ROOT);
    const bundle = join(REPO_ROOT, "plugins", "continuous-improvement");
    const skillDirs = readdirSync(join(bundle, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    assert.deepEqual(catalog.skills.map((entry) => entry.name), skillDirs);
    assert.deepEqual(catalog.commands.map((entry) => entry.name), readdirSync(join(bundle, "commands")).filter((file) => file.endsWith(".md")).map((file) => file.slice(0, -3)).sort());
    assert.ok(catalog.skills.length > 20 && catalog.commands.length > 20);
  });

  it("refuses a malformed skill or command: no frontmatter, empty, a name that does not match, no description, a bad name", () => {
    const bad: Array<[string, string]> = [
      ["ship", ""],
      ["ship", "no frontmatter\n"],
      ["ship", "---\nname: ship\ndescription: x\n"],
      ["ship", skill("other")],
      ["ship", "---\nname: ship\n---\nbody\n"],
      ["ship", "---\nname: ship\ndescription:   \n---\nbody\n"],
      ["Ship", skill("Ship")],
      ["../ship", skill("../ship")],
      ["ship_it", skill("ship_it")],
      ["", skill("")],
      ["a".repeat(65), skill("a".repeat(65))],
    ];
    for (const [name, text] of bad) assert.throws(() => parseSkillSource(name, text), Error, `${name}: ${JSON.stringify(text)}`);
    assert.equal(parseSkillSource("ship", skill("ship")).name, "ship");
    assert.equal(parseSkillSource("ship", "---\r\nname: \"ship\"\r\ndescription: 'x'\r\n---\r\nbody\r\n").name, "ship");
  });

  it("refuses a package whose skill dir holds more than SKILL.md, or has no skills, rather than copying part of a skill", () => {
    const pkg = temp("ci-skill-pkg-");
    const bundle = join(pkg, "plugins", "continuous-improvement");
    mkdirSync(join(bundle, "commands"), { recursive: true });
    assert.throws(() => readSkillCatalog(pkg));
    mkdirSync(join(bundle, "skills", "ship"), { recursive: true });
    writeFileSync(join(bundle, "skills", "README.md"), "# index\n");
    writeFileSync(join(bundle, "skills", "ship", "SKILL.md"), skill("ship"));
    assert.deepEqual(readSkillCatalog(pkg).skills.map((entry) => entry.name), ["ship"]);
    writeFileSync(join(bundle, "skills", "ship", "notes.txt"), "an asset\n");
    assert.throws(() => readSkillCatalog(pkg), /notes\.txt/);
  });
});

describe("renderExportedSkill", () => {
  it("rewrites each ${CLAUDE_PLUGIN_ROOT}/ path to the runtime and marks the copy after the frontmatter", () => {
    const text = skill("x", `node "${PLACEHOLDER}/bin/reconcile.mjs" and bash "${PLACEHOLDER}/scripts/a.sh"; Claude Code replaces \`${PLACEHOLDER}\` itself.\n`);
    const out = renderExportedSkill(text, "C:\\Users\\u\\.claude\\instincts\\runtime\\9.9.9");
    assert.ok(out.startsWith("---\nname: x\ndescription: The x skill.\n---\n"));
    assert.ok(out.includes(`---\n${SKILL_MARK}\n`));
    assert.ok(out.includes('node "C:/Users/u/.claude/instincts/runtime/9.9.9/bin/reconcile.mjs"'));
    assert.ok(out.includes('bash "C:/Users/u/.claude/instincts/runtime/9.9.9/scripts/a.sh"'));
    assert.ok(!out.includes(`${PLACEHOLDER}/`));
    assert.ok(out.includes(`\`${PLACEHOLDER}\` itself`), "a mention that is not a path stays as written");
    assert.ok(renderExportedSkill(text, "/r/$&/9").includes('"/r/$&/9/bin/reconcile.mjs"'), "a $ in the runtime path is not a replacement pattern");
  });

  it("points every rewritten path of the real skills and commands at a file the installed runtime has", () => {
    const instincts = temp("ci-skill-rt-");
    const rt = installRuntime(REPO_ROOT, instincts, "9.9.9");
    const catalog = readSkillCatalog(REPO_ROOT);
    const referenced = new Set<string>();
    for (const source of [...catalog.skills, ...catalog.commands]) {
      for (const match of source.text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g)) referenced.add(match[1]!);
    }
    assert.ok(referenced.size > 5);
    for (const rel of referenced) assert.ok(existsSync(join(rt, rel)), `runtime is missing ${rel}`);
  });
});

describe("planSkillExport", () => {
  it("covers exactly the hook and plugin agents, and refuses an unknown one", () => {
    assert.deepEqual([...SKILL_EXPORT_AGENTS].sort(), Object.keys(DIRS).sort());
    for (const agent of ["mystery", "", "claude", "windsurf", "zed"]) assert.throws(() => planSkillExport(agent, ctx(), CATALOG), Error, agent);
  });

  it("writes into the skills dir the agent reads, per scope", () => {
    for (const [agent, dirs] of Object.entries(DIRS)) {
      for (const scope of ["project", "user"] as const) {
        const plan = planSkillExport(agent, ctx({ scope }), CATALOG);
        assert.equal(plan.dir, dirs[scope], `${agent} ${scope}`);
        for (const file of plan.files) assert.equal(file.path, `${dirs[scope]}/${file.name}/SKILL.md`);
      }
    }
  });

  it("follows GROK_HOME and KIRO_HOME at user scope, and ignores a relative one", () => {
    assert.equal(planSkillExport("grok", ctx({ scope: "user", env: { GROK_HOME: "/g/.grok-tui" } }), CATALOG).dir, "/g/.grok-tui/skills");
    assert.equal(planSkillExport("kiro", ctx({ scope: "user", env: { KIRO_HOME: "/k" } }), CATALOG).dir, "/k/skills");
    assert.equal(planSkillExport("grok", ctx({ scope: "user", env: { GROK_HOME: "rel" } }), CATALOG).dir, `${HOME}/.grok/skills`);
  });

  it("copies the commands with no same-name skill as skills only for an agent with no command files of its own", () => {
    for (const agent of Object.keys(DIRS)) {
      const expected = COMMANDS_AS_SKILLS.includes(agent) ? ["gateguard", "ship", "dashboard"] : ["gateguard", "ship"];
      assert.deepEqual(names(agent, ctx()), expected, agent);
      const ship = planSkillExport(agent, ctx(), CATALOG).files.find((file) => file.name === "ship")!;
      assert.ok(!ship.content.includes("The ship command."), `${agent}: the skill wins over a same-name command`);
    }
  });

  it("does not copy a skill the agent already reads from ~/.claude/skills, and says which", () => {
    const files = { [`${HOME}/.claude/skills/ship/SKILL.md`]: skill("ship") };
    for (const agent of Object.keys(DIRS)) {
      const plan = planSkillExport(agent, ctx({}, files), CATALOG);
      if (READS_CLAUDE.includes(agent)) {
        assert.ok(!plan.files.some((file) => file.name === "ship"), agent);
        assert.ok(plan.notes.some((note) => note.includes("~/.claude/skills") && note.includes("ship")), agent);
      } else {
        assert.ok(plan.files.some((file) => file.name === "ship"), agent);
      }
    }
  });

  it("copies it anyway when the agent's ~/.claude/skills reading is switched off", () => {
    const files = { [`${HOME}/.claude/skills/ship/SKILL.md`]: skill("ship") };
    const has = (agent: string, c: PlanContext): boolean => names(agent, c).includes("ship");
    assert.ok(has("grok", ctx({ env: { GROK_CLAUDE_SKILLS_ENABLED: "false" } }, files)));
    assert.ok(has("grok", ctx({ scope: "user", env: { GROK_HOME: "/g" } }, { ...files, "/g/config.toml": "[compat.claude]\nskills = false\n" })));
    assert.ok(!has("grok", ctx({}, { ...files, [`${HOME}/.grok/config.toml`]: "[compat.claude]\nhooks = false\n[skills]\nenabled = false\n" })));
    assert.ok(has("opencode", ctx({ env: { OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1" } }, files)));
    assert.ok(has("opencode", ctx({ env: { OPENCODE_DISABLE_EXTERNAL_SKILLS: "true" } }, files)));
    assert.ok(!has("opencode", ctx({ env: { OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "0" } }, files)));
  });

  it("leaves a same-name skill it did not write, with a warning, and replaces one it wrote", () => {
    const mine = `${ROOT}/.qwen/skills/ship/SKILL.md`;
    const theirs = `${ROOT}/.qwen/skills/gateguard/SKILL.md`;
    const plan = planSkillExport("qwen", ctx({}, { [theirs]: skill("gateguard", "Mine.\n"), [mine]: renderExportedSkill(skill("ship", "old\n"), "/old") }), CATALOG);
    assert.deepEqual(plan.files.map((file) => [file.name, file.created]), [["ship", false]]);
    assert.ok(plan.warnings.some((warning) => warning.includes(theirs)));
  });
});

describe("the install planner exports the skills", () => {
  it("adds one owned SKILL.md write per skill when the catalog is given, and none without it", () => {
    for (const agent of Object.keys(DIRS)) {
      const without = planAgentInstall(agent, ctx());
      assert.ok(!without.writes.some((write) => write.skill !== undefined), agent);
      const plan = planAgentInstall(agent, ctx({ catalog: CATALOG }));
      assert.equal(plan.error, undefined, agent);
      const skills = plan.writes.filter((write) => write.skill !== undefined);
      assert.deepEqual(skills.map((write) => write.skill), names(agent, ctx()), agent);
      for (const write of skills) {
        assert.match(write.script?.sha256 ?? "", /^[0-9a-f]{64}$/, agent);
        assert.ok(write.content.includes(`${RT}/bin/gateguard-clear.mjs`) || write.skill !== "gateguard", agent);
        const file = toLedgerFile(write);
        assert.equal(file.skill, write.skill);
        const ledger = { version: 1, entries: [{ target: agent, scope: "project", project: ROOT, version: "9.9.9", runtime: RT, installedAt: "t", files: [file], runs: [] }] };
        assert.deepEqual(parseLedger(JSON.stringify(ledger))!.entries[0]!.files[0], file);
      }
    }
  });

  it("refuses a ledger whose skill field is not a string", () => {
    const file = { path: "/p/SKILL.md", created: true, hooksAt: null, hookCommands: [], mcpAt: null, mcp: null, script: { sha256: "a" }, skill: 1 };
    const ledger = { version: 1, entries: [{ target: "qwen", scope: "user", project: null, version: "9", runtime: RT, installedAt: "t", files: [file], runs: [] }] };
    assert.equal(parseLedger(JSON.stringify(ledger)), null);
  });

  it("fails the agent's plan, writing nothing, when a skill path cannot be read", () => {
    const plan = planAgentInstall("qwen", ctx({ catalog: CATALOG, read: (path) => { if (path.endsWith("/SKILL.md")) throw new Error("EISDIR"); return null; } }));
    assert.match(plan.error ?? "", /EISDIR/);
    assert.deepEqual(plan.writes, []);
  });
});

describe("install --hooks copies the skills (spawned)", () => {
  function run(home: string, project: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (["path", "pathext", "systemroot", "comspec", "temp", "tmp", "windir", "systemdrive"].includes(key.toLowerCase()) && value !== undefined) env[key] = value;
    }
    Object.assign(env, {
      HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData", "Roaming"), CLAUDE_PROJECT_DIR: project, CLAUDE_CI_UPDATE_CHECK: "off", GIT_CEILING_DIRECTORIES: join(home, ".."),
    });
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    env[pathKey] = `${join(home, "nobin")}${delimiter}${env[pathKey] ?? ""}`;
    const result = spawnSync(process.execPath, [INSTALL, ...args], { cwd: project, env, encoding: "utf8", timeout: 60_000 });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it("writes rewritten skills, summarises them, and the uninstall of one agent keeps the copies another install still records", () => {
    const root = temp("ci-skill-install-");
    const home = join(root, "home");
    const project = join(root, "project");
    mkdirSync(home, { recursive: true });
    mkdirSync(project, { recursive: true });
    const rt = join(home, ".claude", "instincts", "runtime", VERSION).replace(/\\/g, "/");
    const shared = join(home, ".agents", "skills");

    const out = run(home, project, ["install", "--target", "codex,devin", "--hooks", "--scope", "user"]);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /codex → \d+ skills in .*\.agents\/skills/);
    const reconcile = readFileSync(join(shared, "reconcile", "SKILL.md"), "utf8");
    assert.ok(reconcile.includes(`node "${rt}/bin/reconcile.mjs"`));
    assert.ok(reconcile.includes(SKILL_MARK));
    assert.ok(existsSync(join(rt, "bin", "reconcile.mjs")));
    assert.ok(existsSync(join(shared, "dashboard", "SKILL.md")), "codex has no command files, so the dashboard command is a skill");
    assert.ok(!out.stdout.includes(`${slashed(shared)}/reconcile/SKILL.md`), "skill files are summarised, not listed one by one");

    const codexGone = run(home, project, ["--uninstall", "--target", "codex", "--scope", "user"]);
    assert.equal(codexGone.status, 0, codexGone.stderr);
    assert.ok(existsSync(join(shared, "reconcile", "SKILL.md")), "devin still records the shared copy");
    const devinGone = run(home, project, ["--uninstall", "--target", "devin", "--scope", "user"]);
    assert.equal(devinGone.status, 0, devinGone.stderr);
    assert.ok(!existsSync(join(shared, "reconcile")), "the last uninstall removes the copy and its dir");
  });

  it("the dry run lists the skills dir and writes nothing", () => {
    const root = temp("ci-skill-dry-");
    const home = join(root, "home");
    const project = join(root, "project");
    mkdirSync(home, { recursive: true });
    mkdirSync(project, { recursive: true });
    const out = run(home, project, ["install", "--target", "kiro", "--hooks", "--dry-run"]);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /would write \d+ skills to .*\.kiro\/skills \(kiro\)/);
    assert.deepEqual(readdirSync(project), []);
    assert.deepEqual(readdirSync(home), []);
  });
});

function slashed(path: string): string {
  return path.replace(/\\/g, "/");
}
