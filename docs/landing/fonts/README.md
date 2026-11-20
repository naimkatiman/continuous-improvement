# Fonts served with the landing page

The page loads these three files from this folder and makes no third-party request.

| File | Family in the CSS | Cut from | Axes kept | Bytes |
|---|---|---|---|---|
| `newsreader-display.woff2` | `Newsreader Display` | Newsreader roman, optical size 72 | weight 400 to 600 | 28,552 |
| `newsreader-text.woff2` | `Newsreader` | Newsreader roman, optical size 17 | weight 400 to 650 | 29,164 |
| `jetbrains-mono.woff2` | `JetBrains Mono` | JetBrains Mono roman | weight 400 to 700 | 11,404 |

## Sources

Both source files come from the Fontsource packages, which republish the Google Fonts builds.

- Newsreader, font version 1.003, package `@fontsource-variable/newsreader@5.3.0`,
  file `files/newsreader-latin-opsz-normal.woff2`
  (sha256 `6e4f2958c3a7c4a80acde4e5a679abe7e01bc1e30b92be3c7a8b696ef401d101`)
  - Package: https://www.npmjs.com/package/@fontsource-variable/newsreader/v/5.3.0
  - Upstream: https://github.com/productiontype/Newsreader
- JetBrains Mono, font version 2.211, package `@fontsource-variable/jetbrains-mono@5.3.0`,
  file `files/jetbrains-mono-latin-wght-normal.woff2`
  (sha256 `18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e`)
  - Package: https://www.npmjs.com/package/@fontsource-variable/jetbrains-mono/v/5.3.0
  - Upstream: https://github.com/JetBrains/JetBrainsMono

## Licence

Both families are under the SIL Open Font License 1.1. The licence text, with each project's
copyright line, sits beside this file: `OFL-Newsreader.txt` and `OFL-JetBrainsMono.txt`.
Neither project declares a Reserved Font Name.

## What was changed

The files here are modified versions. Each was instanced to the axis values in the table and
subset to Basic Latin, the Latin-1 punctuation block (U+00A0 to U+00BF), `×`, `é`, `÷`, and the
dashes, quotes, bullet and ellipsis from General Punctuation. JetBrains Mono's coding ligatures
were dropped, so captured output shows the characters that were printed. A character outside
that set falls back to the next font in the stack.

## Rebuild

Needs `fonttools` and `brotli` (`pip install fonttools brotli`). Download the two source files
(`npm pack <package>@<version>`, then extract `package/files/<file>`), check the sha256, and run:

```
U="U+0020-007E,U+00A0-00BF,U+00D7,U+00E9,U+00F7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026"
N="--name-IDs=0,1,2,3,4,5,6,13,14 --notdef-outline --flavor=woff2"
T="--layout-features=kern,liga,pnum,tnum,mark,mkmk"

python -m fontTools.varLib.instancer newsreader-latin-opsz-normal.woff2 opsz=72 wght=400:600 -o nr-display.ttf
python -m fontTools.subset nr-display.ttf --unicodes="$U" $T $N --output-file=newsreader-display.woff2

python -m fontTools.varLib.instancer newsreader-latin-opsz-normal.woff2 opsz=17 wght=400:650 -o nr-text.ttf
python -m fontTools.subset nr-text.ttf --unicodes="$U" $T $N --output-file=newsreader-text.woff2

python -m fontTools.varLib.instancer jetbrains-mono-latin-wght-normal.woff2 wght=400:700 -o jbm.ttf
python -m fontTools.subset jbm.ttf --unicodes="$U" --layout-features=ccmp,mark $N --output-file=jetbrains-mono.woff2
```

The stylesheet in `../index.html` also declares two local fallback faces (`Newsreader Fallback`
on Georgia, `JetBrains Mono Fallback` on Consolas) whose `size-adjust` and ascent and descent
overrides were computed from the metrics of the files above. If a cut changes, recompute them.
