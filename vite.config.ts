import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

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

export default defineConfig({
  // Reader runtime only sees assets/public (git-ignored); raw .asset files stay out of dist.
  publicDir: 'assets/public',
  plugins: [storyboards()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
