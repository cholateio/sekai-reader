// Usage: npx tsx scripts/build_banners.ts
// Converts assets/raw/banner/{bundle}.webp into assets/public/banner/{bundle}.webp (720 wide) and
// assets/public/banner/s/{bundle}.webp (200 wide), skipping ones already built, then rewrites the manifest.
// Prints one JSON line {built, changed, failed}: the pipeline deploys when anything was built or the manifest
// changed, and refetches the bundles in `failed` (their raw file could not be decoded and was deleted).
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { writeManifest } from './manifest';

const SIZES = [{ dir: '', width: 720 }, { dir: 's', width: 200 }];
const QUALITY = 80;

export interface BannerBuild { built: number; changed: boolean; failed: string[] }

export async function buildBanners(raw: string, pub: string, log: (line: string) => void = console.log): Promise<BannerBuild> {
  const src = join(raw, 'banner');
  let built = 0;
  const failed: string[] = [];
  const files = existsSync(src) ? readdirSync(src).filter(f => /^[a-z0-9_]+\.webp$/.test(f)).sort() : [];
  for (const f of files) {
    const outs = SIZES.map(s => ({ ...s, path: join(pub, 'banner', s.dir, f) }));
    if (outs.every(o => existsSync(o.path))) continue;
    try {
      for (const o of outs) {
        mkdirSync(join(pub, 'banner', o.dir), { recursive: true });
        await sharp(join(src, f)).resize({ width: o.width, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(o.path);
      }
      built++;
    } catch (e) {
      log(`banner ${f}: ${e instanceof Error ? e.message : String(e)}`);
      for (const o of outs) rmSync(o.path, { force: true });
      failed.push(f.slice(0, -5));
    }
  }
  const { changed } = writeManifest(pub);
  // Only after the manifest is written: if that throws, the bad raw file stays and the next run reports it again.
  for (const b of failed) rmSync(join(src, `${b}.webp`), { force: true });
  return { built, changed, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  buildBanners('assets/raw', 'assets/public').then(r => { console.log(JSON.stringify(r)); }, err => { console.error(err); process.exit(1); });
}
