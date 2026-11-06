<!-- Tool-neutral project memory. Never put local paths, costs or personal data here. -->
# sekai-reader

## Project goal

A static web reader that turns Project SEKAI Traditional Chinese event stories into phone-friendly vertical comics for fans who want to read without the game.

## Stack

- Language / framework: TypeScript, Vite 6, no UI framework (own `h()` helper); Python 3 for the one-off fetch script
- Services: GitHub Actions pipeline started hourly by a Cloudflare Worker cron, Cloudflare Pages (direct upload) + private R2 bucket, Anthropic API (storyboards)
- Test: `npm test`

## File layout

- `src/scenario/` — `.asset` → episode model (`parseScenario`), mood labels
- `src/storyboard/` — storyboard types, validation, rule-based fallback board, bundled boards
- `src/render/` — comic renderer (`comic/`: panels, bubble shape rules `shape.ts`, SVG outlines `bubbleSvg.ts`, backgrounds and effect layers, slanted layout)
- `src/art/` — `CharacterArt` seam (static chibi now, Spine later) and fallback name circles
- `src/app/` — hash router, data loading, prefs (`storage.ts`: `bw`, `recent`, `pos:*`), unit easter eggs (`units.ts`), library query model (`filter.ts`: `#library?unit=&q=`), recent episodes (`recent.ts`), views (`views/`: library, event, reader, shared header/drawer)
- `data/` — event index (`tc-event-index.json`: events with episodes, `unit` (card-derived for events the master data leaves `none`) and featured character ids `chars`, character table), pipeline state (`pipeline-state.json`, edited only by the pipeline)
- `storyboards/` — AI-director storyboards, line numbers only (committed)
- `prompts/` — storyboard director prompt
- `scripts/` — `build_episode.ts`, `fetch_episode.py`, `check_layout.ts`, `build_index.py`, `compact_script.py`
- `scripts/pipeline/` — hourly pipeline: `state.ts` (queue, spend), `director.ts` (storyboard batches), `run.ts` (phases), `commit.sh`, `setup.sh`, `setup-cron.sh`
- `worker/` — Cloudflare Worker `sekai-reader-cron`: hourly cron that dispatches the pipeline workflow
- `assets/` — git-ignored game assets: `raw/` inputs, `public/` reader files (Vite publicDir)
- `tests/` — Vitest + unittest; `fixtures/` holds an original synthetic script; `real/` skips without assets
- `docs/specs/` — requirement specs; the authority for what to build

## Constraints

- Game assets (`.asset` scripts, backgrounds, character images, and `dist/` which contains them) are never committed; they live only under the git-ignored `assets/`.
- The reader never contacts Sekai-World at runtime, and no page may contain a `sekai.best` URL or a file picker for downloaded scripts.
- Requests to storage.sekai.best go only through `scripts/fetch_episode.py`. One run fetches at most one event (its scripts, backgrounds and character images) within a 40-request budget, with at least 5 s between requests; runs are started only by the hourly pipeline (or a person, by hand), never in a loop; never write code that scans or enumerates Sekai-World. Exception, approved by the owner on 2026-11-05 to use expiring API credit: while the repo variable `SCRIPTS_FIRST` is `on`, an hourly run whose queue made at most one request may instead fetch scripts only (no images) of several old events, within an 80-request budget and at least 20 s between requests; the event list comes from the committed index, never from scanning Sekai-World. Turn `SCRIPTS_FIRST` off when the lane is empty.
- Storyboards contain structure only (line numbers, framing); dialogue text must never be written into a storyboard.
- No full-panel halftone and no animated SVG filters in the comic (user-rejected noise; iOS performance).
- Path-type constraints are mirrored in `kit.toml [protected]`; keep the two in sync (one glob per line).

## Conventions

- Docs, prose and commit messages in Traditional Chinese; code comments in English, only for invariants, cross-file coupling and non-obvious reasons.
- Every rendered line carries `data-r`; tests assert each line appears exactly once, keep that invariant when adding panel types.
- GitHub Actions: top-level `permissions: contents: read`, raised per job only when needed.
- GitHub Actions: pin every `uses:` to a 40-character commit SHA with a trailing `# vX.Y.Z` comment.

## Where to look

- `docs/specs/` — requirements and design decisions
- `docs/DEVELOPMENT.md` — restart, commands, environment variables, deploy, gotchas

## Guiding the owner through dashboards

- The owner's Cloudflare dashboard uses the redesigned UI (as of 2026-11), in Traditional Chinese. The sidebar groups features under 帳戶首頁, 網域, 組建 (運算, AI, 儲存空間和資料庫, ...), 保護與連接 and 管理帳戶; there is no top-level "Workers & Pages" or "R2" entry. Do not give old menu paths from memory or old docs: point to the group and tell the owner to confirm the sub-item on screen, or to use the Ctrl+K quick search with the feature name.
- The Account ID is the 32-character hex segment right after `dash.cloudflare.com/` in the address bar.
- Labels are Chinese: e.g. the API-token permission "Workers Scripts" shows as 「Workers 指令碼」, "Edit" as 「編輯」.
