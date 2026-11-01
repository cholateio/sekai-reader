# SEKAI Story Reader（SEKAI 劇情閱讀器）

You want to catch up on a Project SEKAI (Traditional Chinese server) event story without opening the game and tapping through every line. Open the reader on your phone and each episode scrolls by as a vertical comic: real backgrounds, slanted manga panels, speech bubbles with the original dialogue.

```
event_173_01 (MVP)
┌──────────────────────────┐   36 panels, 49 lines, two scenes
│ 午休時間 / 中庭  [est]    │   every line appears exactly once
├─────────────────────────╲┤   panels touch both screen edges
│ (chibi)  speech bubble   │   comic ⇄ chat mode toggle
└──────────────────────────┘
```

- **Comic mode**: an AI director decides panel types, framing and slant; the dialogue is always the original text, referenced by line number only.
- **Chat mode**: the same episode as a message thread with scene cards, flashback boxes and mood tags.
- **Exactly once**: automated tests check that every line of the episode is rendered once, in order, in both modes.
- **Static site**: the build output is plain files; there is no server, no login and no tracking.

Only event 173 episode 1 is readable for now; every other episode shows 「尚未提供」.

## How it works

```
.asset script ──► episode JSON ─┐
storyboard JSON (line numbers) ─┼──► comic / chat renderer ──► static page
background + chibi images ──────┘
```

Scripts, storyboards and images are three separate layers; changing one never requires regenerating the others. Game assets are kept out of git and copied into the build locally.

## Install

You need Node.js 22 or newer and Python 3, plus the episode's assets (one `.asset` file, its background images and chibi images) on your machine.

1. `npm install`
2. Put the files into `assets/raw/` (`event_173_01.asset`, `bg/*.webp`, `sd/chr_sd_XX_01.webp`).
3. `npm run build:episode event_173_01`
4. `npm run dev` and open the printed URL; it lands directly on episode 173-1.

## Privacy & security

- The reader stores only your reading preferences (comic/chat mode, font size, scroll position) in your browser's localStorage.
- At runtime the page loads its own files and Google Fonts; it never contacts Sekai-World or any game server.
- No accounts, keys or secrets are involved.

## License

The source code is [MIT](LICENSE). The MIT license does not cover game content: scenario text, backgrounds and character images belong to SEGA / Colorful Palette, and the data comes from Sekai-World. This is a non-commercial fan project.
