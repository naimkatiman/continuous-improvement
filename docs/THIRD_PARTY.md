# Third-Party Plugins

This repository ships four upstream Claude Code plugins as **vendored** snapshots under `third-party/<name>/` (each pinned to a specific SHA, refreshed via the recipes in `third-party/MANIFEST.md`):

- `superpowers` — Obra's core skills library
- `agent-skills` — Addy Osmani's SDLC skills
- `ruflo-swarm` — agent swarm + Monitor stream
- `oh-my-claudecode` — multi-agent orchestration

A fifth surface — **product management** — is supplied **out-of-band via Claude Code's plugin marketplace** rather than vendored here.

## PM Skills (Pawel Huryn)

- **Upstream:** https://github.com/phuryn/pm-skills
- **Author:** Pawel Huryn — pawel@productcompass.pm — https://www.productcompass.pm
- **License:** MIT (each plugin ships its own `LICENSE`)
- **Distribution:** Claude Code marketplace (not vendored here)

### Install

```bash
claude plugin marketplace add phuryn/pm-skills
claude plugin install pm-toolkit@pm-skills
claude plugin install pm-product-strategy@pm-skills
claude plugin install pm-product-discovery@pm-skills
claude plugin install pm-market-research@pm-skills
claude plugin install pm-data-analytics@pm-skills
claude plugin install pm-marketing-growth@pm-skills
claude plugin install pm-go-to-market@pm-skills
claude plugin install pm-execution@pm-skills
```

Install only the plugins you actually need. Each one is independently versioned upstream.

### Plugins

| Plugin | Coverage |
|---|---|
| `pm-product-discovery` | Ideation, experiments, assumption testing, prioritization, interview synthesis |
| `pm-product-strategy` | Vision, strategy canvas, value props, lean canvas, BMC, SWOT, PESTLE, Ansoff, Five Forces, monetization |
| `pm-execution` | PRDs, OKRs, roadmaps, sprints, pre-mortems, stakeholder maps, user stories, prioritization |
| `pm-market-research` | Personas, segmentation, sentiment analysis, competitive analysis |
| `pm-data-analytics` | SQL generation, cohort analysis |
| `pm-go-to-market` | GTM strategy, growth loops, motions, beachhead segments, ICP |
| `pm-marketing-growth` | Marketing ideas, value prop statements, North Star metrics, naming, positioning |
| `pm-toolkit` | Resume review, NDA drafting, privacy policy, grammar/flow checking |

### Why marketplace install instead of vendoring

The four upstream surfaces in `third-party/` are vendored because we want a pinned, audited slice of each (selective scope, CLAUDE.md stripped, MANIFEST.md SHA tracked). PM Skills ships as **eight independently-versioned plugins**, each maintained by the upstream author with its own release cadence. Marketplace install lets users:

- Pick only the plugins they need (most users want 2-3, not all 8).
- Get upstream updates as soon as the author publishes them, without waiting for a refresh PR here.
- Avoid an ~8 MB snapshot tax on a repo that does not need to fork the content.

The earlier `product-on-purpose/pm-skills` snapshot was removed on 2026-05-08 in favor of this marketplace path. See `third-party/MANIFEST.md` for that decision record.

### Cross-plugin dependencies (informational)

The `prioritize-features` skill in `pm-product-discovery` references the `prioritization-frameworks` skill in `pm-execution`. If you install `pm-product-discovery` without `pm-execution`, the cross-reference points at a skill that is not present locally — the skill still runs (it inlines a short summary of ICE/RICE), but the linked deep-dive will be unavailable. Install both together when prioritization is in scope.

### Reporting issues

- Plugin content (skills, commands, prompts) → upstream: https://github.com/phuryn/pm-skills/issues
- Routing or dispatcher integration in this repo → here: https://github.com/naimkatiman/continuous-improvement/issues

### Routing in `/superpowers`

The unified `/superpowers` dispatcher mentions PM coverage as a single routing target rather than enumerating every PM skill name. Because phuryn's plugins use plugin-namespaced skill IDs (`pm-execution:prd`, `pm-product-discovery:hypothesis`, etc.) that you only see after install, the dispatcher does not pre-resolve them — install the plugins and let Claude Code's host resolve the namespace at runtime.
