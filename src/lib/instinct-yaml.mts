// instinct-yaml.mts: the one parser for an instinct file
// (~/.claude/instincts/<project-hash>/<id>.yaml or ~/.claude/instincts/global/<id>.yaml).
//
// bin/mcp-server.mjs (ci_instincts, ci_reinforce, ci_distill_promote) and
// hooks/session.mjs (the SessionStart lesson block) both import it, so a file is
// an instinct, and has the confidence it has, by the same rules on both paths.
// The format is what writeInstinct in src/bin/mcp-server.mts writes: `key: value`
// lines, a `---` line, then the body.

export type InstinctScope = "project" | "global";

export interface Instinct {
  body: string;
  confidence: number;
  created?: string;
  domain?: string;
  id: string;
  last_seen?: string;
  observation_count?: number;
  project_id?: string;
  scope?: InstinctScope;
  source?: string;
  trigger: string;
}

export function parseYamlInstinct(content: string): Instinct | null {
  const lines = content.split("\n");
  const meta: Partial<Instinct> = {};
  let body = "";
  let inBody = false;

  for (const line of lines) {
    if (line.trim() === "---" && Object.keys(meta).length > 0) {
      inBody = true;
      continue;
    }

    if (inBody) {
      body += `${line}\n`;
      continue;
    }

    const match = line.match(/^(\w[\w_-]*):\s*(.+)/);
    if (!match) {
      continue;
    }

    const rawValue = match[2].trim().replace(/^["']|["']$/g, "");
    const value = rawValue !== "" && !Number.isNaN(Number(rawValue))
      ? Number(rawValue)
      : rawValue;
    (meta as Record<string, string | number | undefined>)[match[1]] = value;
  }

  if (typeof meta.id !== "string" || typeof meta.trigger !== "string") {
    return null;
  }

  return {
    id: meta.id,
    trigger: meta.trigger,
    body: body.trim(),
    confidence: typeof meta.confidence === "number" ? meta.confidence : 0.6,
    domain: typeof meta.domain === "string" ? meta.domain : undefined,
    source: typeof meta.source === "string" ? meta.source : undefined,
    scope: meta.scope === "global" || meta.scope === "project" ? meta.scope : undefined,
    project_id: typeof meta.project_id === "string" ? meta.project_id : undefined,
    created: typeof meta.created === "string" ? meta.created : undefined,
    last_seen: typeof meta.last_seen === "string" ? meta.last_seen : undefined,
    observation_count: typeof meta.observation_count === "number" ? meta.observation_count : undefined,
  };
}
