# Brand visuals & demo assets

Reproducible sources for the link-preview and demo images.

| Source | Renders to | Size | Used for |
|---|---|---|---|
| [`social-card.html`](social-card.html) | `docs/landing/social-preview.png`, copied to `assets/social-preview.png` | 1200×630 | The landing page's `og:image` and `twitter:image`, and the GitHub repository **Social preview** (Settings) |
| [`gateguard-demo.html`](gateguard-demo.html) | `assets/gateguard-demo.png` | 1280×640 | A still of the gateguard deny. The README does not use it; its images are under "README images" below |

## Regenerate the PNGs

The social card shows the headline, the two pillars and the loop's seven steps with their marks. It loads the landing page's fonts by relative path, so open it from the file system, not from a server rooted at `demo/`. Render it with headless Edge or Chrome from the repository root:

```bash
msedge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=4000 \
  --screenshot=docs/landing/social-preview.png "file:///<repo>/demo/social-card.html"
cp docs/landing/social-preview.png assets/social-preview.png
```

The card states no version, so a release does not redraw it. After any change to it, render again and update `og:image:alt` and `twitter:image:alt` in `docs/landing/index.html` to say what the card shows: `src/test/loop-stages.test.mts` holds the card's headline, agent count, step names and marks to `src/lib/loop-stages.mts` and the agent table, the alt text to the card, and both PNGs to 1200×630.

`gateguard-demo.html` renders the same way at `--window-size=1280,640`.

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
