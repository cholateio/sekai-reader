// Publish boundary for the AGENTS.md constraint on running events. Vite copies all of assets/public into dist, so
// the whole tree is checked against the layout the build scripts write; an episode must be a closed event's
// top-level episodes/{sid}.json whose content says the same sid. Any other path fails the build instead of shipping.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { isClosed, type IndexFile } from './pipeline/state';

const ALLOWED = [
  /^manifest\.json$/, /^bg\/[A-Za-z0-9_]+\.webp$/, /^sd\/chr_sd_\d+_01\.webp$/,
  /^banner\/[a-z0-9_]+\.webp$/, /^banner\/s\/[a-z0-9_]+\.webp$/,
];
const EPISODE = /^episodes\/([a-z0-9_]+)\.json$/;

export function unpublishable(publicDir: string, index: IndexFile, now: Date): string[] {
  if (!fs.existsSync(publicDir)) return [];
  const eventOf = new Map(index.events.flatMap(e => e.eps.map(([, , sid]) => [sid, e] as const)));
  const bad: string[] = [];
  const walk = (rel: string) => {
    for (const f of fs.readdirSync(path.join(publicDir, rel))) {
      const r = rel ? `${rel}/${f}` : f;
      const abs = path.join(publicDir, r);
      if (fs.statSync(abs).isDirectory()) { walk(r); continue; }
      const m = EPISODE.exec(r);
      if (!m) { if (!ALLOWED.some(re => re.test(r))) bad.push(r); continue; }
      const ev = eventOf.get(m[1]);
      let sid: unknown;
      try { sid = (JSON.parse(fs.readFileSync(abs, 'utf8')) as { sid?: unknown }).sid; } catch { sid = undefined; }
      if (!ev || !isClosed(ev, now) || sid !== m[1]) bad.push(r);
    }
  };
  walk('');
  return bad.sort();
}

/** Runs in every production build (npm run build, check:layout, a bare vite build) before anything reaches dist. */
export function publishableGate(publicDir = path.join('assets', 'public'), indexPath = path.join('data', 'tc-event-index.json')): Plugin {
  return {
    name: 'sekai-publishable',
    apply: 'build',
    buildStart() {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as IndexFile;
      const bad = unpublishable(publicDir, index, new Date());
      if (bad.length) this.error(`not publishable (running or unknown event, sid mismatch, or unexpected path): ${bad.join(', ')}`);
    },
  };
}

function main(): number {
  const index = JSON.parse(fs.readFileSync('data/tc-event-index.json', 'utf8')) as IndexFile;
  const bad = unpublishable(path.join('assets', 'public'), index, new Date());
  if (bad.length) {
    console.error(`not publishable (running or unknown event, sid mismatch, or unexpected path): ${bad.join(', ')}`);
    console.error('remove them from assets/public (and the R2 public/ copy) or wait for the event to close');
    return 1;
  }
  console.log('publishable: assets/public matches the expected layout and every episode belongs to a closed event');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main());
