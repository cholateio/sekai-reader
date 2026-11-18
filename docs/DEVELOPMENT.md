# Development

Everything you need to pick this project back up after months away.

## Restart in 30 seconds

```bash
npm install
# assets/ is git-ignored. If assets/raw/ lost event_173_01, fetch that one episode by hand (one run only):
python3 scripts/fetch_episode.py event_173_01
npm run build:episode event_173_01   # -> assets/public/ (episodes, bg thumbnails, sd, manifest.json)
npm run dev                          # -> http://localhost:5173 (opens #library)
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development (Vite serves `assets/public/` as the public dir) |
| `npm run build` | Type-check and production build into `dist/` (includes `assets/public/`). Every Vite build, `check:layout` included, first runs the publish gate in `scripts/check_publishable.ts`: it fails if `assets/public` has a path outside the expected layout, or an episode whose event has not closed, is not in the index, or whose content `sid` differs from its file name |
| `npm run preview` | Serve `dist/` |
| `npm test` | Vitest (jsdom) + Python unittest. Real-data tests skip when `assets/raw/event_173_01.asset` is absent |
| `npm run build:episode <sid>` | `.asset` → episode JSON (each line names its speaker's Spine chibi from `data/chibi-index.json`), backgrounds resized to 1280 px WebP q82, chibi copied, manifest rebuilt; non-zero exit if a needed background is missing |
| `npx tsx scripts/build_banners.ts` | `assets/raw/banner/{bundle}.webp` → `assets/public/banner/` (720 px) and `banner/s/` (200 px) WebP q80, manifest rebuilt with `banners`; prints `built N`; the pipeline runs it every fetch phase |
| `npm run check:layout` | Build + preview + headless Chromium at 390×844: scroll width, panel count, 49 lines, no broken images, no `sekai.best`; screenshots in `scratch/` |
| `npm run pipeline -- <plan\|fetch\|direct\|mark-deployed> [--event N] [--direct N]` | One pipeline phase locally (state in `data/pipeline-state.json`). `plan` only reports whether the run has work. `fetch --event N` hits storage.sekai.best; `direct` needs `ANTHROPIC_API_KEY` in the environment and spends money. Without either it is a safe offline dry run |
| `python3 scripts/fetch_episode.py --event <id>` | Download one event's assets into `assets/raw/` (max 40 requests, 5 s apart, stops at the budget and reports `partial`; a Japanese first episode reports `jp` and keeps nothing; a script the mirror does not have yet reports `missing`, exit 5). `<sid>` instead of `--event` fetches one episode. The hourly pipeline runs this; by hand only when files are lost |

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
| `CHIBIS` | variable | `on` runs the chibi lane (spec 2026-11-18): after the banners, at most 4 Spine chibi sets per hour into `assets/raw/chibi/` (raw only, no deploy); default `off`. After any failure the lane rests until the next UTC day; the third failed try of a set (atlas and texture count together) or of the skeleton is recorded as `missing`; three runs that fail as a whole set `chibiHalted` in `data/pipeline-state.json`, and the lane stays off until a person removes that field (and `chibiFails`) in a commit |
| `BACKFILL` | variable | `on` lets the queue fetch old events (one per hour); default `off`. Off since 2026-11-17: every old event was fetched by 2026-11-16 |
| `DIRECT_DAILY_USD` | variable | daily storyboard spend cap in US$, default `20` |

## Deploy

- Hosting: Cloudflare Pages project `sekai-reader` on `sekai-reader.pages.dev`, deployed only by the pipeline's build-and-deploy step, which runs `npm run build` (publish gate included) immediately before `wrangler pages deploy dist`. Never upload an existing `dist/` by hand (it may predate the gate or the current index), and never use Git integration.
- Pipeline: `.github/workflows/pipeline.yml`, started every hour at :23 by the Cloudflare Worker `sekai-reader-cron` (`worker/`), which calls GitHub's workflow_dispatch API with a fine-grained token (Actions: read and write on this repo only). GitHub's own `schedule` fired only 2 of about 14 hourly slots on 2026-11-05, which is why the Worker exists. One-time setup: `bash scripts/pipeline/setup-cron.sh` (Notepad flow; needs a Cloudflare token with Workers Scripts: Edit). The workflow has no `schedule` trigger of its own, so the Worker is the only hourly starter. The fine-grained token expires: GitHub e-mails the owner before that date; create a new token and re-run the script. A failing dispatch shows only in the Worker's logs: in the Cloudflare dashboard press Ctrl+K, open `sekai-reader-cron`, then its logs tab. Workers Free allows 5 cron triggers per account. Only events past their TC close time (`closed` in the index) are ever picked, forced runs included; a running event waits in the state as `pending` (AGENTS.md constraint). Order: refresh the index → `plan` (has this run any work: a picked event, banners due, chibis due while `CHIBIS` is `on`, an episode rebuild due, storyboards due or in flight, a pending deploy, manual inputs; most hours it has none and the run stops after committing the index) → sync R2 down → `fetch` phase (at most one event: forced > new > resume a partial fetch > recheck of Japanese or not-yet-mirrored events: daily in the week after the event closes, weekly after that > backfill; then banners, chibis, and a rebuild of every published episode JSON from its raw script whenever the parser, `scripts/episode_json.ts` or `data/chibi-index.json` changed — local only, deploys only if a file changed; a rebuild that fails as a whole is retried only by runs that have other work) → sync R2 up → `direct` phase (reconcile with the Anthropic account, collect ended batches, submit due episodes) → commit state/index/storyboards to main → build and deploy if `pendingDeploy` → `mark-deployed` (records the site fingerprint) and a second commit.
- Code changes deploy themselves: `plan` hashes the site sources (`SITE_PATHS` in `scripts/pipeline/run.ts`: `src/`, `index.html`, `static/`, `storyboards/`, the event index, build config) and sets `pendingDeploy` when the hash differs from the last deploy's, so a push reaches the site within an hour. The index's daily `built` date counts as a change (the library shows it), which costs one deploy a day.
- Manual run: `gh workflow run pipeline.yml -f event=<id>` processes that event first; naming an old event also authorizes its storyboards. `-f direct=<n>` authorizes the newest n old events whose assets are done. Old events never get storyboards without one of these.
- Queueing: GitHub keeps only one pending run per concurrency group and cancels the older pending one. If a manual run shows cancelled, trigger it again.
- Assets: the private R2 bucket holds `raw/` and `public/` (mirrors of `assets/`); it has no public URL. `dist/` contains the assets after a build, so never commit `dist/`.
- The director parses the raw `.asset` script (through `compact_script.py`), not the built episode JSON, so a storyboard can exist before the episode's images; an episode appears on the site once its images are built.
- Costs: set a monthly spend limit in the Anthropic Console as the hard stop; `DIRECT_DAILY_USD` reserves the worst case (input plus 16,000 output tokens) per episode at submission.
- Database: none. `data/pipeline-state.json` is the pipeline's only state and only the pipeline edits it.

## Easy to forget

- Running events stay off the site: `fetch_episode.py` (`--event` and SID) refuses an event whose `closed` time is missing or ahead, the queue never picks one, and every Vite build fails if one slipped into `assets/public`. A local build with an index from before 2026-11-17 has no `closed` and fails that check: `git pull` (the pipeline refreshes the index hourly) or run `python3 scripts/build_index.py data/tc-event-index.json --state data/pipeline-state.json`.

- Episode identity is the asset's `m_Name`; `ScenarioId` inside the file can be stale (event_173_01 says event_172_01).
- FX7 (background change) comes before the next location caption, so the caption's `bg` is already the new background.
- Storyboards hold line numbers only. The validator rejects any CJK text outside `sfx`/`cast`, unknown fields, missing or repeated lines; a rejected board silently falls back to the rule-based board (see the console warning).
- Cloudflare Pages free plan: 20,000 files per site and 25 MiB per file. Voice files for all episodes would not fit.
- Animated characters (Spine or Live2D, not decided) need a license first; `src/art/CharacterArt.ts` is the only seam to swap.
- `fetch_episode.py` fetches one event per run; never loop it over events.
- Pushes made with `GITHUB_TOKEN` do not trigger other workflows, so pipeline commits never start kit-guard or another pipeline run.
- Library filters live in the hash: `#library?unit=street&q=…` (`src/app/filter.ts`). Filter changes use `history.replaceState`, so Back from an event returns to the same filtered list; unknown keys and values are ignored. Character names in search, the event page's cast row and the 「繪名5箱」 label all come from the index's per-event `chars` (event cards, banner first); an index built before 2026-11-06 falls back to the unit short name and no cast row. The game's master data tags `events[].unit` only from #37 (2022-10) on, so `build_index.py` derives the unit of earlier events from their cards (all non-VIRTUAL-SINGER characters in one unit = that unit's box event).
- Every navigation target is a real `<a href="#…">` (rows, episodes, drawer, prev/next); `go()` is only for programmatic jumps. jsdom does not navigate on anchor clicks, so tests assert `href` attributes, not `location.hash`.
- `localStorage` keys are allow-listed in `src/app/storage.ts` (`bw`, `dark`, `recent`, `pos:<sid>`); `recent` holds the last 5 episodes opened, `pos:*` is kept only for those 5, and the drawer shows the 3 newest that still exist in the index.
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
| `docs/PLAN.md` | Original plan from 2026-10-30, historical only; its prototype details (file picker, scripts in localStorage) are now forbidden |
| `scripts/build_index.py` | Rebuilds `data/tc-event-index.json` from the Sekai-World TC master DB on GitHub (not storage.sekai.best) |
| `scripts/compact_script.py` | `.asset` → compact script, the AI director's input format |
| `prompts/storyboard_director.md` | AI director prompt used to produce storyboards |
| `docs/DEVELOPMENT.md` | This file |
