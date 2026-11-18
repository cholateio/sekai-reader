// Usage: tsx scripts/rebuild_episodes.ts
// Rewrites every published assets/public/episodes/{sid}.json from assets/raw/{sid}.asset with the current parser
// and chibi catalogue. Only files already published are touched, so no new episode can appear here; the
// publishable gate still checks them at build time. Temp files go to assets/.rebuild (outside the synced and
// published trees), so a run killed midway leaves only whole files behind. Prints one JSON line.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { episodeOf, loadChibis } from './episode_json';

export interface RebuildResult { checked: number; changed: string[]; skipped: string[]; failed: string[] }

export function rebuildEpisodes(raw: string, pub: string, chibiIndex?: string, staging = join(pub, '..', '.rebuild')): RebuildResult {
  const r: RebuildResult = { checked: 0, changed: [], skipped: [], failed: [] };
  const chibis = loadChibis(chibiIndex);
  const dir = join(pub, 'episodes');
  if (!existsSync(dir)) return r;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  for (const f of readdirSync(dir).sort()) {
    const sid = /^([a-z0-9_]+)\.json$/.exec(f)?.[1];
    if (!sid) continue;
    r.checked++;
    const src = join(raw, `${sid}.asset`);
    if (!existsSync(src)) { r.skipped.push(sid); continue; }
    try {
      const ep = episodeOf(readFileSync(src, 'utf8'), chibis);
      // Same sid check as the publishable gate: a mismatching rebuild would fail the site build.
      if (ep.sid !== sid) { r.failed.push(sid); continue; }
      const out = join(dir, f);
      const text = JSON.stringify(ep);
      if (readFileSync(out, 'utf8') === text) continue;
      const tmp = join(staging, f);
      writeFileSync(tmp, text);
      renameSync(tmp, out);
      r.changed.push(sid);
    } catch {
      r.failed.push(sid);
    }
  }
  rmSync(staging, { recursive: true, force: true });
  return r;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const r = rebuildEpisodes('assets/raw', 'assets/public');
    console.log(JSON.stringify({ status: 'done', checked: r.checked, changed: r.changed.length, skipped: r.skipped, failed: r.failed }));
  } catch (e) {
    console.log(JSON.stringify({ status: 'error', error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  }
}
