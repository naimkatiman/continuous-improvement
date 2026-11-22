# Brand visuals & demo assets

Reproducible sources for the marketing/discovery images. Both render to exactly **1280×640** (GitHub's recommended social-preview size).

| Source | Renders to | Used for |
|---|---|---|
| [`social-card.html`](social-card.html) | `assets/social-preview.png` | GitHub repo **Social preview** (Settings) + link-share Open Graph card |
| [`gateguard-demo.html`](gateguard-demo.html) | `assets/gateguard-demo.png` | A still of the gateguard deny. The README does not use it; its images are under "README images" below |

## Regenerate the PNGs

Any headless browser at a 1280×640 viewport works. The repo was built with a local static server + Playwright:

```bash
# 1. serve this folder
npx http-server demo -p 8799        # or: python -m http.server 8799 -d demo

# 2. screenshot at 1280x640 (Playwright example)
npx playwright screenshot --viewport-size=1280,640 \
  http://localhost:8799/social-card.html   assets/social-preview.png
npx playwright screenshot --viewport-size=1280,640 \
  http://localhost:8799/gateguard-demo.html assets/gateguard-demo.png
```

Keep each PNG **under 1 MB** (GitHub's social-preview cap).

## Upload the social preview (manual — no API)

GitHub does not expose social preview via API or `gh`. Upload it once in the browser:

> Repo **Settings → General → Social preview → Edit → Upload an image** → pick `assets/social-preview.png`.

## Capture a *real* animated gateguard GIF (optional follow-up)

`gateguard-demo.png` is a faithful still of the real `hooks/gateguard.mjs` block. For an animated hero, record an actual session rather than faking frames:

```bash
# record a real session where gateguard blocks an unresearched edit
asciinema rec gateguard.cast
#   then in the session:  Edit scratch.txt and put "hello" in it. Don't research first.
#   gateguard blocks the Write; exit the recording.

# render the cast to a GIF
agg gateguard.cast assets/gateguard-demo.gif      # github.com/asciinema/agg
# or use charmbracelet/vhs with a .tape script for a fully scripted capture
```

The README does not use `assets/combined.gif` or `gateguard-demo.png`. Its images are the SVGs below, drawn from captured runs.

## README images

The README's images live in `assets/readme/` and are drawn by code, not by hand:

```bash
npm run build
node bin/capture-readme-demos.mjs        # runs the hooks in a temp HOME, writes demo/captures/demos.json
node bin/render-readme-assets.mjs --write # draws the terminal cards and diagrams from it
node bin/check-agent-matrix.mjs --write   # draws assets/readme/agents-map.svg from src/lib/agent-support.mts
```

`src/test/render-readme-assets.test.mts` fails when a committed image differs from what its data draws, when a card shows a line the capture does not hold, and when the capture no longer matches what the hooks print. GitHub and npm load these images from the default branch, so merge an image change before the release that needs it.
