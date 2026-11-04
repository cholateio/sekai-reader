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
| `npm run pipeline -- <fetch\|direct\|mark-deployed> [--event N] [--direct N]` | One pipeline phase locally (state in `data/pipeline-state.json`). `fetch --event N` hits storage.sekai.best; `direct` needs `ANTHROPIC_API_KEY` in the environment and spends money. Without either it is a safe offline dry run |
| `python3 scripts/fetch_episode.py --event <id>` | Download one event's assets into `assets/raw/` (max 40 requests, 5 s apart, stops at the budget and reports `partial`; a Japanese first episode reports `jp` and keeps nothing). `<sid>` instead of `--event` fetches one episode. The hourly pipeline runs this; by hand only when files are lost |

## Environment variables

Local development needs none. `check:layout` looks for Chromium in `~/.cache/ms-playwright/chromium-*`; set `CHROME_PATH` to override.

The pipeline workflow reads these (set once with `bash scripts/pipeline/setup.sh`, which opens a Notepad template and uploads it with `gh secret set -f`):

| Name | Kind | Used by |
|------|------|---------|
| `ANTHROPIC_API_KEY` | secret | direct phase only (storyboard batches) |
| `CLOUDFLARE_API_TOKEN` | secret | deploy step only (Account > Cloudflare Pages > Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | secret | deploy step and the R2 endpoint |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | secret | the two rclone steps only (Object Read & Write on the bucket) |
| `R2_BUCKET` | variable | bucket name, default `sekai-reader-assets` |
| `BACKFILL` | variable | `on` lets the queue fetch old events (one per hour); default `off` |
| `DIRECT_DAILY_USD` | variable | daily storyboard spend cap in US$, default `20` |

## Deploy

- Hosting: Cloudflare Pages project `sekai-reader` on `sekai-reader.pages.dev`, deployed by direct upload (`wrangler pages deploy dist`), never by Git integration.
- Pipeline: `.github/workflows/pipeline.yml` runs hourly at :17 and on manual dispatch. Order: sync R2 down → refresh the index → `fetch` phase (at most one event: forced > new > resume a partial fetch > Japanese recheck > backfill) → sync R2 up → `direct` phase (reconcile with the Anthropic account, collect ended batches, submit due episodes) → commit state/index/storyboards to main → build and deploy if `pendingDeploy` → `mark-deployed` and a second commit.
- Manual run: `gh workflow run pipeline.yml -f event=<id>` processes that event first; naming an old event also authorizes its storyboards. `-f direct=<n>` authorizes the newest n old events whose assets are done. Old events never get storyboards without one of these.
- Queueing: GitHub keeps only one pending run per concurrency group and cancels the older pending one. If a manual run shows cancelled, trigger it again.
- Assets: the private R2 bucket holds `raw/` and `public/` (mirrors of `assets/`); it has no public URL. `dist/` contains the assets after a build, so never commit `dist/`.
- Costs: set a monthly spend limit in the Anthropic Console as the hard stop; `DIRECT_DAILY_USD` reserves the worst case (input plus 16,000 output tokens) per episode at submission.
- Database: none. `data/pipeline-state.json` is the pipeline's only state and only the pipeline edits it.

## Easy to forget

- Episode identity is the asset's `m_Name`; `ScenarioId` inside the file can be stale (event_173_01 says event_172_01).
- FX7 (background change) comes before the next location caption, so the caption's `bg` is already the new background.
- Storyboards hold line numbers only. The validator rejects any CJK text outside `sfx`/`cast`, unknown fields, missing or repeated lines; a rejected board silently falls back to the rule-based board (see the console warning).
- Cloudflare Pages free plan: 20,000 files per site and 25 MiB per file. Voice files for all episodes would not fit.
- The Spine runtime needs a Spine Editor license before chibi animation can ship; `src/art/CharacterArt.ts` is the only seam to swap.
- `fetch_episode.py` fetches one event per run; never loop it over events.
- GitHub disables scheduled workflows in public repos after 60 days without repository activity. If the Actions tab shows the pipeline disabled, re-enable it there.
- Pushes made with `GITHUB_TOKEN` do not trigger other workflows, so pipeline commits never start kit-guard or another pipeline run.
- Bubble outlines are SVG drawn after layout (`fitBubbles`): they need the comic mounted, and redraw on font load and width change. The reading size is fixed at 14px (no Aa control). Measure with `offsetWidth`/`offsetHeight`, never `getBoundingClientRect` (the impact entry animation scales bubbles).
- Bubble shape comes from `src/render/comic/shape.ts` rules; a storyboard `shape` override is for when the rule is wrong, not for decoration.
- Seams stay 10px of visible paper because `applyEdges` pulls each row up by the slant (22px) plus one ink width per side without ink (est). A scene change without a trans card keeps a 20px pacing gap on purpose.
- Full-panel halftone is a design anti-goal (user found it noisy): dots only on the far side of beat panels, flash edges, phone bubbles. No animated SVG filters (slow on iOS).
- Black-and-white mode composes `blur(var(--blur))` with grayscale in CSS; never write `filter` inline on `.bgl`.
- `npm run check:layout` measures seams from screenshot pixels after painting panels a sentinel green; if it fails, look at `scratch/layout-*.png` first.
- The seam scan in `check_layout.ts` matches the page colour (`PAPER`, = `--bg` in app.css); change both together. It also reloads once so the opening curtain (first load of a session only) is gone before measuring.

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
