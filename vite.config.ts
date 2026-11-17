import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { publishableGate } from './scripts/check_publishable';

const BOARD_DIR = 'storyboards';
const BOARD_FILE = /^[a-z0-9_]+\.json$/;
const minified = (f: string) => JSON.stringify(JSON.parse(readFileSync(join(BOARD_DIR, f), 'utf8')));

/**
 * Serves the committed storyboards as /storyboards/{sid}.json (dev) and emits them into dist (build), so the
 * reader fetches one board per episode instead of bundling all of them. Unhashed on purpose: a tab left open
 * across an hourly deploy still finds every board (src/storyboard/index.ts fetches this path).
 */
function storyboards(): Plugin {
  return {
    name: 'sekai-storyboards',
    configureServer(server) {
      server.middlewares.use('/storyboards/', (req, res, next) => {
        const f = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (!BOARD_FILE.test(f) || !existsSync(join(BOARD_DIR, f))) return next();
        res.setHeader('content-type', 'application/json');
        res.end(minified(f));
      });
    },
    generateBundle() {
      for (const f of readdirSync(BOARD_DIR).filter(f => BOARD_FILE.test(f)))
        this.emitFile({ type: 'asset', fileName: `storyboards/${f}`, source: minified(f) });
    },
  };
}

const STATIC_DIR = 'static';
const STATIC_TYPES: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png' };

/**
 * Committed site files (favicon, share preview) served at the site root. publicDir is the git-ignored asset
 * store, so these live in static/ and are copied here instead. og:image needs this fixed absolute path.
 */
function staticFiles(): Plugin {
  const files = () => readdirSync(STATIC_DIR).filter(f => /^[a-z0-9-]+\.(svg|png)$/.test(f));
  return {
    name: 'sekai-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const f = (req.url ?? '').split('?')[0].replace(/^\//, '');
        if (!files().includes(f)) return next();
        res.setHeader('content-type', STATIC_TYPES[f.slice(f.lastIndexOf('.'))]);
        res.end(readFileSync(join(STATIC_DIR, f)));
      });
    },
    generateBundle() {
      for (const f of files()) this.emitFile({ type: 'asset', fileName: f, source: readFileSync(join(STATIC_DIR, f)) });
    },
  };
}

export default defineConfig({
  // Reader runtime only sees assets/public (git-ignored); raw .asset files stay out of dist.
  publicDir: 'assets/public',
  plugins: [storyboards(), staticFiles(), publishableGate()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
