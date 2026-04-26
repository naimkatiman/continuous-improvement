# Third-Party Plugins

This repository vendors third-party plugins under their original licenses. Original copyright holders retain full ownership; this is a redistribution, not a fork.

## PM Skills (Pawel Huryn)

- **Upstream:** https://github.com/phuryn/pm-skills
- **Author:** Pawel Huryn — pawel@productcompass.pm — https://www.productcompass.pm
- **License:** MIT (see `plugins/pm-*/LICENSE` in each vendored plugin folder)
- **Vendored at:** 2026-04-27, against pm-skills `main` (version 1.0.1)

### Plugins included

| Plugin | Skills | Commands |
|---|---|---|
| `pm-product-discovery` | Ideation, experiments, assumption testing, prioritization, interview synthesis | yes |
| `pm-product-strategy` | Vision, strategy canvas, value props, lean canvas, BMC, SWOT, PESTLE, Ansoff, Five Forces, monetization | yes |
| `pm-execution` | PRDs, OKRs, roadmaps, sprints, pre-mortems, stakeholder maps, user stories, prioritization | yes |
| `pm-market-research` | Personas, segmentation, sentiment analysis, competitive analysis | yes |
| `pm-data-analytics` | SQL generation, cohort analysis | yes |
| `pm-go-to-market` | GTM strategy, growth loops, motions, beachhead segments, ICP | yes |
| `pm-marketing-growth` | Marketing ideas, value prop statements, North Star metrics, naming, positioning | yes |
| `pm-toolkit` | Resume review, NDA drafting, privacy policy, grammar/flow checking | yes |

### What was changed

Nothing inside the plugin directories was modified. Each plugin retains its original `plugin.json` (with Pawel Huryn as author and version 1.0.1), `README.md`, `skills/`, and `commands/`. The MIT `LICENSE` from upstream is preserved in each plugin folder.

### What was added at the marketplace level

Entries for all 8 plugins were added to `.claude-plugin/marketplace.json` with `source: ./plugins/pm-*`, attribution to Pawel Huryn in each `author` block, and `category: product-management`.

### Re-syncing from upstream

```bash
git clone --depth=1 https://github.com/phuryn/pm-skills.git /tmp/pm-skills
for p in pm-data-analytics pm-execution pm-go-to-market pm-marketing-growth pm-market-research pm-product-discovery pm-product-strategy pm-toolkit; do
  rm -rf plugins/$p
  cp -r /tmp/pm-skills/$p plugins/$p
  cp /tmp/pm-skills/LICENSE plugins/$p/LICENSE
done
```

If upstream bumps versions or adds plugins, also update `.claude-plugin/marketplace.json` to match.

### Cross-plugin dependencies (informational)

The `prioritize-features` skill in `pm-product-discovery` references the `prioritization-frameworks` skill that lives in `pm-execution`. If a user installs `pm-product-discovery` without `pm-execution`, the cross-reference points at a skill that is not present locally — the skill still runs (it inlines a short summary of ICE/RICE), but the linked deep-dive will be unavailable. Recommend installing both together when prioritization work is in scope.

### Reporting issues with PM Skills content

File issues against the upstream repo: https://github.com/phuryn/pm-skills/issues — not against this repo. Issues with the marketplace wiring (entry definitions, vendoring) belong here.
