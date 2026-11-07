# SEKAI Story Reader（SEKAI 劇情閱讀器）

You want to catch up on a Project SEKAI (Traditional Chinese server) event story without opening the game and tapping through every line. Open the reader on your phone and each episode scrolls by as a vertical comic: real backgrounds, slanted manga panels, speech bubbles with the original dialogue.

```
event_173_01 (MVP)
┌──────────────────────────┐   36 panels, 49 lines, two scenes
│ 午休時間 / 中庭  [est]    │   every line appears exactly once
├─────────────────────────╲┤   panels touch both screen edges
│ (chibi)  speech bubble   │   one menu button, nothing else
└──────────────────────────┘
```

- **AI-directed panels**: an AI director decides panel types, framing and slant; the dialogue is always the original text, referenced by line number only.
- **Manga vocabulary**: eight bubble shapes chosen from the line itself, focus and speed lines, sound effects, slanted gutters of equal width.
- **Exactly once**: automated tests check that every line of the episode is rendered once, in order.
- **Static site**: the build output is plain files; there is no server, no login and no tracking.

Only event 173 episode 1 is readable for now; every other episode shows 「尚未提供」.

## How it works

```
.asset script ──► episode JSON ─┐
storyboard JSON (line numbers) ─┼──► comic renderer ──► static page
background + chibi images ──────┘
```

Scripts, storyboards and images are three separate layers; changing one never requires regenerating the others. Game assets are kept out of git and copied into the build locally.

## Install

You need Node.js 22 or newer and Python 3, plus the episode's assets (one `.asset` file, its background images and chibi images) on your machine.

1. `npm install`
2. Put the files into `assets/raw/` (`event_173_01.asset`, `bg/*.webp`, `sd/chr_sd_XX_01.webp`).
3. `npm run build:episode event_173_01`
4. `npm run dev` and open the printed URL; it lands directly on episode 173-1.

## Deploy

An hourly GitHub Actions workflow keeps the site current: it checks the Taiwan-server event list, fetches at most one event's assets into a private Cloudflare R2 bucket, asks Claude (Message Batches) to direct new episodes, and uploads the build to Cloudflare Pages. One-time setup is `bash scripts/pipeline/setup.sh`; details are in `docs/DEVELOPMENT.md`.

## Privacy & security

- The reader stores only your reading preferences (black-and-white mode, scroll position) in your browser's localStorage.
- At runtime the page loads its own files and Google Fonts; it never contacts Sekai-World or any game server.
- The site has no accounts. The pipeline's keys live only in GitHub Actions secrets and are passed to the single step that needs each one.

## License

The source code is [MIT](LICENSE). The MIT license does not cover game content: scenario text, backgrounds, event banners and character images belong to SEGA / Colorful Palette, and the data comes from Sekai-World. This is a non-commercial fan project.
