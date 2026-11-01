# Development

Everything you need to pick this project back up after months away.

## Restart in 30 seconds

```bash
npm install
# assets/raw/ is git-ignored: restore event_173_01.asset, bg/*.webp, sd/*.webp from your local backup
npm run build:episode event_173_01   # -> assets/public/ (episodes, bg thumbnails, sd, manifest.json)
npm run dev                          # -> http://localhost:5173 (opens #read-173-1)
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development (Vite serves `assets/public/` as the public dir) |
| `npm run build` | Type-check and production build into `dist/` (includes `assets/public/`) |
| `npm run preview` | Serve `dist/` |
| `npm test` | Vitest (jsdom) + Python unittest. Real-data tests skip when `assets/raw/event_173_01.asset` is absent |
| `npm run build:episode <sid>` | `.asset` → episode JSON, backgrounds resized to 1280 px WebP q82, chibi copied, manifest rebuilt; non-zero exit if a needed background is missing |
| `npm run check:layout` | Build + preview + headless Chromium at 390×844: scroll width, panel count, 49 lines, no broken images, no `sekai.best`; screenshots in `scratch/` |
| `python3 scripts/fetch_episode.py <sid>` | One-off download of one episode's assets into `assets/raw/` (max 20 requests, 1 s apart). Only when files are lost |

## Environment variables

None. `check:layout` looks for Chromium in `~/.cache/ms-playwright/chromium-*`; set `CHROME_PATH` to override.

## Deploy

- Hosting: not deployed yet. Planned: a Cloudflare Pages project on `*.pages.dev`, uploading `dist/`.
- Database: none.
- Assets: local only (`assets/`, git-ignored). `dist/` contains them after a build, so never commit `dist/`.

## Easy to forget

- Episode identity is the asset's `m_Name`; `ScenarioId` inside the file can be stale (event_173_01 says event_172_01).
- FX7 (background change) comes before the next location caption, so the caption's `bg` is already the new background.
- Storyboards hold line numbers only. The validator rejects any CJK text outside `sfx`/`cast`, unknown fields, missing or repeated lines; a rejected board silently falls back to the rule-based board (see the console warning).
- Cloudflare Pages free plan: 20,000 files per site and 25 MiB per file. Voice files for all episodes would not fit.
- The Spine runtime needs a Spine Editor license before chibi animation can ship; `src/art/CharacterArt.ts` is the only seam to swap.
- Never point `fetch_episode.py` at more than one episode per run, and never loop it.
- Bubble outlines are SVG drawn after layout (`fitBubbles`): they need the comic mounted, and redraw on font load, width change and the Aa buttons (`refitComics`). Measure with `offsetWidth`/`offsetHeight`, never `getBoundingClientRect` (the impact entry animation scales bubbles).
- Bubble shape comes from `src/render/comic/shape.ts` rules; a storyboard `shape` override is for when the rule is wrong, not for decoration.
- Seams stay 10px of visible paper because `applyEdges` pulls each row up by the slant (22px) plus one ink width per side without ink (est). A scene change without a trans card keeps a 20px pacing gap on purpose.
- Full-panel halftone is a design anti-goal (user found it noisy): dots only on the far side of beat panels, flash edges, phone bubbles. No animated SVG filters (slow on iOS).
- Black-and-white mode composes `blur(var(--blur))` with grayscale in CSS; never write `filter` inline on `.bgl`.
- `npm run check:layout` measures seams from screenshot pixels after painting panels a sentinel green; if it fails, look at `scratch/layout-*.png` first.

## Docs map

| File | What it holds |
|------|---------------|
| `AGENTS.md` | Goal, stack, layout, constraints and conventions (tool-neutral) |
| `docs/specs/` | Requirement specs (authoritative) |
| `docs/PLAN.md` | Original project plan (background; superseded where the spec differs) |
| `scripts/build_index.py` | Rebuilds `data/tc-event-index.json` from the Sekai-World TC master DB on GitHub (not storage.sekai.best) |
| `scripts/compact_script.py` | `.asset` → compact script, the AI director's input format |
| `prompts/storyboard_director.md` | AI director prompt used to produce storyboards |
| `docs/DEVELOPMENT.md` | This file |
