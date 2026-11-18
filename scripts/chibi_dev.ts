// Dev-server side of the Spine chibis (spec 2026-11-18, phase 3); used by the sekai-chibis-dev plugin in vite.config.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CHIBI_RAW = 'assets/raw/chibi';
export const CHIBI_INDEX = 'data/chibi-index.json';
export const CHIBI_FILE = /^(v2_sd_main\.skel|v2_sd_\d{2}[a-z]+_[a-z0-9_]+\/sekai_atlas\.(atlas\.txt|png))$/;
export const CHIBI_TYPES: Record<string, string> = { skel: 'application/octet-stream', txt: 'text/plain; charset=utf-8', png: 'image/png' };

/** Sets with both files on disk, plus the catalogue's never-mirrored list; the reader's dev-only availability list. */
export function chibiDevIndex(raw = CHIBI_RAW, index = CHIBI_INDEX): { names: string[]; noflip: string[] } {
  if (!existsSync(join(raw, 'v2_sd_main.skel'))) return { names: [], noflip: [] };
  const names = readdirSync(raw).filter(n => CHIBI_FILE.test(`${n}/sekai_atlas.png`)
    && existsSync(join(raw, n, 'sekai_atlas.png')) && existsSync(join(raw, n, 'sekai_atlas.atlas.txt'))).sort();
  let noflip: string[] = [];
  try { noflip = (JSON.parse(readFileSync(index, 'utf8')) as { noflip?: string[] }).noflip ?? []; } catch { /* none */ }
  return { names, noflip };
}
