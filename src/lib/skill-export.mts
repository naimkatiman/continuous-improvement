// skill-export.mts — The skills, and the commands as skills, that
// `install --target <agent> --hooks` copies for each agent
// (docs/plans/2026-11-21-all-agents.md, PR 15). The name skill-catalog.mts is
// taken by the HTML catalog renderer.
//
// The source is the plugin bundle the package ships
// (plugins/continuous-improvement/skills/<name>/SKILL.md and commands/*.md),
// the same files Claude Code loads. Each copy has every `${CLAUDE_PLUGIN_ROOT}/`
// path rewritten to the stable runtime copy, because no other agent expands
// that variable, and a marker line after the frontmatter, so a later install
// replaces only copies it wrote. Planning is pure: files are read through the
// context, nothing is written here.
//
// Every dir and rule below comes from the verified research of 2026-11-21
// (result.json research agent_skills and custom_commands, skeptic verdicts
// applied), by agent:
// - codex: user ~/.agents/skills (skeptic: the documented user root;
//   $CODEX_HOME/skills is deprecated), project .agents/skills (scanned from the
//   cwd up to the repo root); .claude/skills not scanned. Custom prompts are
//   deprecated and user-only (skeptic: the plugin migration skips 12 of 29), so
//   the commands come as skills.
// - qwen: ~/.qwen/skills, .qwen/skills; ~/.claude/skills only through
//   skills.directories. Commands: .qwen/commands markdown.
// - grok: $GROK_HOME/skills (default ~/.grok), .grok/skills; also reads
//   ~/.claude/skills unless GROK_CLAUDE_SKILLS_ENABLED=false or
//   `[compat.claude] skills = false` (skeptic: the Grok TUI config sets it;
//   the dotted and inline-table TOML spellings count the same).
//   Commands: commands/*.md.
// - devin: user ~/.agents/skills (`devin skills paths`), project .devin/skills;
//   imports ~/.claude/skills by default. No command type: a skill is the slash
//   command.
// - droid: ~/.factory/skills, .factory/skills; .claude/skills not mentioned.
//   Commands: .factory/commands markdown.
// - gemini: ~/.gemini/skills, .gemini/skills (skeptic: workspace skills need a
//   trusted folder); no .claude path. Commands: .gemini/commands TOML.
// - cursor: ~/.cursor/skills, .cursor/skills; ~/.claude/skills only while
//   third-party extensibility is on, so not counted. Commands: .cursor/commands.
// - copilot: ~/.copilot/skills, .github/skills (skeptic: the only dirs the VS
//   Code Copilot harness is documented with); the CLI reads no ~/.claude/skills.
//   No command files in the CLI (prompt files: VS Code Local harness only).
// - kiro: ~/.kiro/skills (KIRO_HOME), .kiro/skills; no .claude or .agents
//   dirs. No commands dir: skills are the slash commands.
// - auggie: ~/.augment/skills, .augment/skills; also reads ~/.claude/skills.
//   Commands: .augment/commands (and .claude/commands).
// - junie: ~/.junie/skills, .junie/skills (project .agents/skills is read only
//   in trusted projects); .claude/skills is only offered for import.
//   Commands: .junie/commands.
// - goose: ~/.agents/skills, .agents/skills (a plugin's skills/ is also read,
//   but the hook-only plugin dir carries no manifest); also reads
//   ~/.claude/skills. Commands are recipes, not markdown.
// - cline: ~/.cline/skills, .cline/skills (skeptic: .agents/skills is
//   source-only); no ~/.claude/skills at user level. Commands: workflows.
// - opencode: ~/.config/opencode/skills, .opencode/skills; also reads
//   ~/.claude/skills unless OPENCODE_DISABLE_CLAUDE_CODE_SKILLS or
//   OPENCODE_DISABLE_EXTERNAL_SKILLS is set (skeptic). Commands:
//   .opencode/commands.
// - amp: user ~/.config/amp/skills, project .agents/skills (the only project
//   dir besides .claude/skills); also reads ~/.claude/skills. No file commands
//   (plugin palette only).

import { readdirSync, readFileSync } from "node:fs";
import { join as nativeJoin, posix } from "node:path";

import { PACKAGE_NAME } from "./plugin-metadata.mjs";

export interface SkillSource {
  name: string;
  text: string;
}

export interface SkillCatalog {
  skills: readonly SkillSource[];
  commands: readonly SkillSource[];
}

/** What the planner needs; PlanContext satisfies it. */
export interface SkillExportContext {
  scope: "project" | "user";
  runtimeDir: string;
  projectRoot: string;
  home: string;
  env: Readonly<Record<string, string | undefined>>;
  /** A file's text, or null when it does not exist. */
  read: (path: string) => string | null;
}

export interface SkillFile {
  name: string;
  path: string;
  content: string;
  created: boolean;
}

export interface SkillExport {
  dir: string;
  files: SkillFile[];
  notes: string[];
  warnings: string[];
}

/** In every copy, after the frontmatter: a same-name SKILL.md without it is not ours. */
export const SKILL_MARK = "<!-- continuous-improvement skill, copied by `install --target <agent> --hooks`; `--uninstall --target <agent>` removes it. -->";

const slash = (path: string): string => path.replace(/\\/g, "/");
const join = (...parts: string[]): string => posix.join(...parts.map(slash));

function absEnv(ctx: SkillExportContext, key: string): string | null {
  const value = ctx.env[key]?.trim();
  return value && (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) ? slash(value) : null;
}

const envSet = (ctx: SkillExportContext, key: string): boolean => !["", "0", "false"].includes((ctx.env[key] ?? "").trim().toLowerCase());

interface SkillTarget {
  label: string;
  user: (ctx: SkillExportContext) => string;
  project: string;
  /** The agent's own command files, or null when it has none and the commands come as skills. */
  commandFormat: string | null;
  readsClaudeSkills: (ctx: SkillExportContext) => boolean;
}

const never = (): boolean => false;
const always = (): boolean => true;
const home = (dir: string) => (ctx: SkillExportContext): string => join(ctx.home, dir);
const grokHome = (ctx: SkillExportContext): string => absEnv(ctx, "GROK_HOME") ?? join(ctx.home, ".grok");

// True when config.toml sets compat.claude.skills = false in any TOML spelling:
// the [compat.claude] table, a dotted key under [compat] or at the top level,
// or an inline table. A line scan, not a TOML parser.
function grokConfigTurnsClaudeOff(config: string): boolean {
  let table = "";
  for (const line of config.split(/\r?\n/)) {
    const header = /^\s*\[(\[?)([^[\]]+)\]/.exec(line);
    if (header) {
      table = header[1] ? "[[array]]" : header[2]!.replace(/[\s"']/g, "");
      continue;
    }
    const pair = /^\s*([\w\s."'-]+?)\s*=\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = [table, pair[1]!.replace(/[\s"']/g, "")].filter(Boolean).join(".");
    const value = pair[2]!;
    if (key === "compat.claude.skills" && /^false\b/.test(value)) return true;
    if (key === "compat.claude" && /\bskills\s*=\s*false\b/.test(value)) return true;
    if (key === "compat" && /\bclaude\s*(?:\.\s*skills\s*=\s*false|=\s*\{[^}]*\bskills\s*=\s*false)\b/.test(value)) return true;
  }
  return false;
}

// Off when the env var says so or the config turns it off. A config that cannot
// be read counts as off: a duplicate skill is cheaper than a missing one.
function grokReadsClaude(ctx: SkillExportContext): boolean {
  const flag = ctx.env.GROK_CLAUDE_SKILLS_ENABLED?.trim().toLowerCase();
  if (flag !== undefined && flag !== "" && flag !== "true" && flag !== "1") return false;
  try {
    return !grokConfigTurnsClaudeOff(ctx.read(join(grokHome(ctx), "config.toml")) ?? "");
  } catch {
    return false;
  }
}

const TARGETS: Readonly<Record<string, SkillTarget>> = {
  codex: { label: "Codex", user: home(".agents/skills"), project: ".agents/skills", commandFormat: null, readsClaudeSkills: never },
  qwen: { label: "Qwen Code", user: home(".qwen/skills"), project: ".qwen/skills", commandFormat: ".qwen/commands", readsClaudeSkills: never },
  grok: { label: "Grok", user: (ctx) => join(grokHome(ctx), "skills"), project: ".grok/skills", commandFormat: ".grok/commands", readsClaudeSkills: grokReadsClaude },
  devin: { label: "Devin", user: home(".agents/skills"), project: ".devin/skills", commandFormat: null, readsClaudeSkills: always },
  droid: { label: "Factory Droid", user: home(".factory/skills"), project: ".factory/skills", commandFormat: ".factory/commands", readsClaudeSkills: never },
  gemini: { label: "Gemini CLI", user: home(".gemini/skills"), project: ".gemini/skills", commandFormat: ".gemini/commands (TOML)", readsClaudeSkills: never },
  cursor: { label: "Cursor", user: home(".cursor/skills"), project: ".cursor/skills", commandFormat: ".cursor/commands", readsClaudeSkills: never },
  copilot: { label: "GitHub Copilot", user: home(".copilot/skills"), project: ".github/skills", commandFormat: null, readsClaudeSkills: never },
  kiro: { label: "Kiro", user: (ctx) => join(absEnv(ctx, "KIRO_HOME") ?? join(ctx.home, ".kiro"), "skills"), project: ".kiro/skills", commandFormat: null, readsClaudeSkills: never },
  auggie: { label: "Auggie", user: home(".augment/skills"), project: ".augment/skills", commandFormat: ".augment/commands", readsClaudeSkills: always },
  junie: { label: "Junie", user: home(".junie/skills"), project: ".junie/skills", commandFormat: ".junie/commands", readsClaudeSkills: never },
  goose: { label: "Goose", user: home(".agents/skills"), project: ".agents/skills", commandFormat: null, readsClaudeSkills: always },
  cline: { label: "Cline", user: home(".cline/skills"), project: ".cline/skills", commandFormat: "workflows (.clinerules/workflows)", readsClaudeSkills: never },
  opencode: {
    label: "OpenCode", user: home(".config/opencode/skills"), project: ".opencode/skills", commandFormat: ".opencode/commands",
    readsClaudeSkills: (ctx) => !envSet(ctx, "OPENCODE_DISABLE_CLAUDE_CODE_SKILLS") && !envSet(ctx, "OPENCODE_DISABLE_EXTERNAL_SKILLS"),
  },
  amp: { label: "Amp", user: home(".config/amp/skills"), project: ".agents/skills", commandFormat: null, readsClaudeSkills: always },
};

export const SKILL_EXPORT_AGENTS: readonly string[] = Object.keys(TARGETS);

// Lowercase letters, digits and hyphens, at most 64, equal to the dir name: the
// strictest rule among the agents (Kiro, Copilot, Cline, OpenCode, Auggie).
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

function field(frontmatter: string, key: string): string | null {
  const line = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(frontmatter)?.[1]?.trim();
  if (line === undefined) return null;
  return /^(["']).*\1$/.test(line) ? line.slice(1, -1).trim() : line;
}

/** A skill or command whose frontmatter names it `name` and describes it; anything else throws. */
export function parseSkillSource(name: string, text: string): SkillSource {
  if (!NAME.test(name) || name.length > 64) throw new Error(`Skill name ${JSON.stringify(name)} is not lowercase letters, digits and hyphens (at most 64).`);
  const front = FRONTMATTER.exec(text);
  if (!front) throw new Error(`${name}: no frontmatter.`);
  if (field(front[1]!, "name") !== name) throw new Error(`${name}: its frontmatter name is not ${JSON.stringify(name)}.`);
  if (!field(front[1]!, "description")) throw new Error(`${name}: its frontmatter has no description.`);
  return { name, text };
}

/** The bundle's skills and commands. A skill dir with anything beside SKILL.md throws: only SKILL.md is copied. */
export function readSkillCatalog(packageRoot: string): SkillCatalog {
  const bundle = nativeJoin(packageRoot, "plugins", PACKAGE_NAME);
  const skillsDir = nativeJoin(bundle, "skills");
  const skills = readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().map((name) => {
    const extra = readdirSync(nativeJoin(skillsDir, name)).filter((entry) => entry !== "SKILL.md");
    if (extra.length > 0) throw new Error(`${slash(nativeJoin(skillsDir, name))} holds ${extra.join(", ")} beside SKILL.md; the skill export copies SKILL.md only.`);
    return parseSkillSource(name, readFileSync(nativeJoin(skillsDir, name, "SKILL.md"), "utf8"));
  });
  if (skills.length === 0) throw new Error(`${slash(skillsDir)} has no skills.`);
  const commandsDir = nativeJoin(bundle, "commands");
  const commands = readdirSync(commandsDir).filter((file) => file.endsWith(".md")).sort()
    .map((file) => parseSkillSource(file.slice(0, -3), readFileSync(nativeJoin(commandsDir, file), "utf8")));
  return { skills, commands };
}

/** The copy: each `${CLAUDE_PLUGIN_ROOT}/` path pointed at the runtime, the marker after the frontmatter. */
export function renderExportedSkill(text: string, runtimeDir: string): string {
  const rt = slash(runtimeDir);
  const rewritten = text.replace(/\$\{CLAUDE_PLUGIN_ROOT\}(?=\/)|\$CLAUDE_PLUGIN_ROOT(?=\/)/g, () => rt);
  const front = FRONTMATTER.exec(rewritten);
  if (!front) throw new Error("A skill without frontmatter cannot be exported.");
  const end = front[0].length;
  const eol = front[2] || "\n";
  return `${rewritten.slice(0, end)}${front[2] ? "" : eol}${SKILL_MARK}${eol}${rewritten.slice(end)}`;
}

// The npx installer's owner file beside its ~/.claude/skills/ship copy (src/bin/install.mts).
const SHIP_OWNER = ".continuous-improvement-owner";

// A ~/.claude/skills copy is ours when it is the bundled text (the npx installer
// copies it verbatim) or the npx installer's owned ship skill, of any version.
function ownClaudeCopy(ctx: SkillExportContext, source: SkillSource, dir: string, text: string): boolean {
  const lf = (value: string): string => value.replace(/\r\n/g, "\n");
  if (lf(text) === lf(source.text)) return true;
  return source.name === "ship" && ctx.read(join(dir, SHIP_OWNER)) === `${PACKAGE_NAME}\n`;
}

/**
 * The SKILL.md files `agent` gets in `ctx.scope`: every skill, plus each
 * command with no same-name skill when the agent has no command files. A
 * skill the agent already reads from ~/.claude/skills as our copy is left
 * out; a foreign skill of that name there gets ours anyway, with a warning.
 * One whose path holds a SKILL.md this installer did not write is left out.
 */
export function planSkillExport(agent: string, ctx: SkillExportContext, catalog: SkillCatalog): SkillExport {
  if (!Object.hasOwn(TARGETS, agent)) throw new Error(`${agent} has no skill export. Agents with one: ${SKILL_EXPORT_AGENTS.join(", ")}`);
  const target = TARGETS[agent]!;
  const dir = ctx.scope === "user" ? target.user(ctx) : join(ctx.projectRoot, target.project);
  const skillNames = new Set(catalog.skills.map((source) => source.name));
  const asSkills = target.commandFormat === null ? catalog.commands.filter((command) => !skillNames.has(command.name)) : [];
  const readsClaude = target.readsClaudeSkills(ctx);
  const plan: SkillExport = { dir, files: [], notes: [], warnings: [] };
  const already: string[] = [];
  for (const source of [...catalog.skills, ...asSkills]) {
    const claudeDir = join(ctx.home, ".claude", "skills", source.name);
    const claudeCopy = readsClaude ? ctx.read(join(claudeDir, "SKILL.md")) : null;
    if (claudeCopy !== null && ownClaudeCopy(ctx, source, claudeDir, claudeCopy)) {
      already.push(source.name);
      continue;
    }
    const path = join(dir, source.name, "SKILL.md");
    const existing = ctx.read(path);
    if (existing !== null && !existing.includes(SKILL_MARK)) {
      plan.warnings.push(`${path} is not a copy this installer wrote, so the ${source.name} skill was not copied there.`);
      continue;
    }
    if (claudeCopy !== null) {
      plan.warnings.push(`${claudeDir}/SKILL.md is another skill named ${source.name}, which ${target.label} also reads; ours is copied beside it, so ${target.label} sees two skills of that name.`);
    }
    plan.files.push({ name: source.name, path, content: renderExportedSkill(source.text, ctx.runtimeDir), created: existing === null });
  }
  if (already.length > 0) plan.notes.push(`${target.label} already reads ${already.join(", ")} from ~/.claude/skills, so those are not copied again.`);
  plan.notes.push(target.commandFormat === null
    ? `${target.label} has no command files, so the commands without a same-name skill (${asSkills.map((command) => command.name).join(", ") || "none"}) are copied as skills.`
    : `${target.label} reads its own command files (${target.commandFormat}); the commands are not copied, only the skills.`);
  return plan;
}
