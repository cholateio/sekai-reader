// Usage: npm run build:episode <sid>
// Reads assets/raw/{sid}.asset (+ raw bg/sd images) and writes reader-ready files into assets/public/ (Vite publicDir).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { parseScenario } from '../src/scenario/parse';
import type { RawScenario } from '../src/scenario/types';
import { writeManifest } from './manifest';

const RAW = 'assets/raw';
const PUB = 'assets/public';
const BG_LONG_EDGE = 1280;
const BG_QUALITY = 82;

async function main(): Promise<number> {
  const sid = process.argv[2];
  if (!sid || !/^[a-z0-9_]+$/.test(sid)) { console.error('usage: build_episode <sid>'); return 2; }
  const src = join(RAW, `${sid}.asset`);
  if (!existsSync(src)) { console.error(`missing ${src}`); return 1; }
  for (const d of ['episodes', 'bg', 'sd']) mkdirSync(join(PUB, d), { recursive: true });

  const ep = parseScenario(JSON.parse(readFileSync(src, 'utf8')) as RawScenario);
  writeFileSync(join(PUB, 'episodes', `${sid}.json`), JSON.stringify(ep));
  console.log(`episode ${sid}: ${ep.lines.length} lines, ${ep.scenes.length} scenes`);

  const needed = new Set<string>();
  for (const id of [ep.firstBg, ...ep.lines.map(l => l.bg), ...ep.scenes.map(s => s.bg)]) if (id) needed.add(id);
  const missing: string[] = [];
  for (const id of needed) {
    const raw = join(RAW, 'bg', `${id}.webp`);
    // fetch_episode marks backgrounds the mirror lacks; those panels render plain (not in the manifest).
    if (!existsSync(raw)) { if (existsSync(join(RAW, 'bg', `${id}.missing`))) console.log(`bg ${id}: missing on the mirror, plain panels`); else missing.push(id); continue; }
    const out = join(PUB, 'bg', `${id}.webp`);
    const info = await sharp(raw)
      .resize({ width: BG_LONG_EDGE, height: BG_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: BG_QUALITY })
      .toFile(out);
    console.log(`bg ${id}: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`);
  }

  const sdDir = join(RAW, 'sd');
  if (existsSync(sdDir)) for (const f of readdirSync(sdDir)) {
    if (/^chr_sd_\d+_01\.webp$/.test(f)) copyFileSync(join(sdDir, f), join(PUB, 'sd', f));
  }

  const manifest = writeManifest(PUB);
  console.log(`manifest: episodes=${manifest.episodes.join(',')} bg=${manifest.bg.join(',')} sd=${manifest.sd.join(',')} banners=${manifest.banners.length}`);

  if (missing.length) { console.error(`missing backgrounds: ${missing.join(', ')}`); return 1; }
  return 0;
}

main().then(code => process.exit(code), err => { console.error(err); process.exit(1); });
