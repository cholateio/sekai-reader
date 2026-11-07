// Shared by build_episode.ts and build_banners.ts: manifest.json lists what assets/public holds, so the
// reader never requests a file that is not deployed.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ManifestFile { episodes: string[]; bg: string[]; sd: number[]; banners: string[] }

const names = (dir: string, re: RegExp) =>
  existsSync(dir) ? readdirSync(dir).map(f => re.exec(f)?.[1]).filter((x): x is string => !!x).sort() : [];

/** Rewrites manifest.json atomically; changed = its content differs from what was there. */
export function writeManifest(pub: string): ManifestFile & { changed: boolean } {
  const small = new Set(names(join(pub, 'banner', 's'), /^([a-z0-9_]+)\.webp$/));
  const m: ManifestFile = {
    episodes: names(join(pub, 'episodes'), /^(.+)\.json$/),
    bg: names(join(pub, 'bg'), /^(.+)\.webp$/),
    sd: names(join(pub, 'sd'), /^chr_sd_(\d+)_01\.webp$/).map(Number).sort((a, b) => a - b),
    // A banner is listed only when both sizes exist (list thumbnail and event-page backdrop).
    banners: names(join(pub, 'banner'), /^([a-z0-9_]+)\.webp$/).filter(b => small.has(b)),
  };
  const path = join(pub, 'manifest.json');
  const text = JSON.stringify(m);
  const changed = !existsSync(path) || readFileSync(path, 'utf8') !== text;
  if (changed) {
    writeFileSync(`${path}.tmp`, text);
    renameSync(`${path}.tmp`, path);
  }
  return Object.assign(m, { changed });
}
