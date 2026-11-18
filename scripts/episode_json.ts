// The episode JSON both build_episode.ts and rebuild_episodes.ts write. The pipeline's rebuild key hashes this file,
// src/scenario/ and data/chibi-index.json (EPISODE_PATHS in pipeline/run.ts), so changing any of them rebuilds
// every published episode once.
import { existsSync, readFileSync } from 'node:fs';
import { parseChibiCatalogue, type ChibiCatalogue } from '../src/scenario/chibi';
import { parseScenario } from '../src/scenario/parse';
import type { Episode, RawScenario } from '../src/scenario/types';

export const CHIBI_INDEX = 'data/chibi-index.json';

/** Throws on a missing, malformed or empty catalogue: building without it would strip every chibi silently. */
export function loadChibis(path = CHIBI_INDEX): ChibiCatalogue {
  if (!existsSync(path)) throw new Error(`missing chibi catalogue ${path}`);
  const c = parseChibiCatalogue(readFileSync(path, 'utf8'));
  if (!c) throw new Error(`invalid or empty chibi catalogue ${path}`);
  return c;
}

export function episodeOf(rawText: string, chibis: ChibiCatalogue): Episode {
  return parseScenario(JSON.parse(rawText) as RawScenario, chibis);
}
