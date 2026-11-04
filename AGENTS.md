<!-- Tool-neutral project memory. Never put local paths, costs or personal data here. -->
# sekai-reader

## Project goal

A static web reader that turns Project SEKAI Traditional Chinese event stories into phone-friendly vertical comics for fans who want to read without the game.

## Stack

- Language / framework: TypeScript, Vite 6, no UI framework (own `h()` helper); Python 3 for the one-off fetch script
- Services: GitHub Actions hourly pipeline, Cloudflare Pages (direct upload) + private R2 bucket, Anthropic API (storyboards)
- Test: `npm test`

## File layout

- `src/scenario/` — `.asset` → episode model (`parseScenario`), mood labels
- `src/storyboard/` — storyboard types, validation, rule-based fallback board, bundled boards
- `src/render/` — comic renderer (`comic/`: panels, bubble shape rules `shape.ts`, SVG outlines `bubbleSvg.ts`, backgrounds and effect layers, slanted layout)
- `src/art/` — `CharacterArt` seam (static chibi now, Spine later) and fallback name circles
- `src/app/` — hash router, data loading, prefs, unit easter eggs (`units.ts`), library / event / reader views
- `data/` — event index and character table (`tc-event-index.json`), pipeline state (`pipeline-state.json`, edited only by the pipeline)
- `storyboards/` — AI-director storyboards, line numbers only (committed)
- `prompts/` — storyboard director prompt
- `scripts/` — `build_episode.ts`, `fetch_episode.py`, `check_layout.ts`, `build_index.py`, `compact_script.py`
- `scripts/pipeline/` — hourly pipeline: `state.ts` (queue, spend), `director.ts` (storyboard batches), `run.ts` (phases), `commit.sh`, `setup.sh`
- `assets/` — git-ignored game assets: `raw/` inputs, `public/` reader files (Vite publicDir)
- `tests/` — Vitest + unittest; `fixtures/` holds an original synthetic script; `real/` skips without assets
- `docs/specs/` — requirement specs; the authority for what to build

## Constraints

- Game assets (`.asset` scripts, backgrounds, character images, and `dist/` which contains them) are never committed; they live only under the git-ignored `assets/`.
- The reader never contacts Sekai-World at runtime, and no page may contain a `sekai.best` URL or a file picker for downloaded scripts.
- Requests to storage.sekai.best go only through `scripts/fetch_episode.py`. One run fetches at most one event (its scripts, backgrounds and character images) within a 40-request budget, with at least 5 s between requests; runs are started only by the hourly pipeline (or a person, by hand), never in a loop; never write code that scans or enumerates Sekai-World.
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
