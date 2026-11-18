/** data/chibi-index.json as written by scripts/build_index.py; parseScenario reads costumes, default and chars. */
export interface ChibiCatalogue {
  chibis: string[];
  /** Script costume (costume2ds live2dAssetbundleName) -> chibi name. */
  costumes: Record<string, string>;
  /** Game character id -> that character's default chibi. */
  default: Record<string, string>;
  /** character2d id -> game character id, game characters only. */
  chars: Record<string, number>;
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Game characters 1-26 each have a v2 chibi; a catalogue missing any of them is truncated upstream data.
 *  Kept in step with GAME_CHARACTERS in scripts/build_index.py. */
export const GAME_CHARACTERS = 26;
/** Same pattern as CHIBI_NAME (scripts/pipeline/state.ts) and CHIBI_RE (scripts/build_index.py). */
const NAME = /^v2_sd_\d{2}[a-z]+_[a-z0-9_]+$/;

/** The costume's chibi, else the character's default chibi; undefined for side characters and mobs. */
export function chibiOf(cat: ChibiCatalogue, c2d: number, costume: string | undefined): string | undefined {
  if (costume && own(cat.costumes, costume)) return cat.costumes[costume];
  const key = String(c2d);
  if (!own(cat.chars, key)) return undefined;
  const cid = String(cat.chars[key]);
  return own(cat.default, cid) ? cat.default[cid] : undefined;
}

/** null unless the text has the catalogue's shape and is complete and consistent: valid chibi names, a default for
 *  every game character, every mapped chibi listed, and every character in chars with a default. A null catalogue
 *  stops the episode build (episode_json.ts) instead of stripping chibis from every episode. */
export function parseChibiCatalogue(text: string): ChibiCatalogue | null {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return null; }
  const strMap = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'string');
  if (!j || typeof j !== 'object') return null;
  const c = j as Record<string, unknown>;
  const chars = c.chars;
  if (!Array.isArray(c.chibis) || !strMap(c.costumes) || !strMap(c.default)) return null;
  if (!chars || typeof chars !== 'object' || Array.isArray(chars) || !Object.values(chars).every(x => Number.isInteger(x))) return null;
  const cat = c as unknown as ChibiCatalogue;
  if (!cat.chibis.every(n => typeof n === 'string' && NAME.test(n))) return null;
  for (let cid = 1; cid <= GAME_CHARACTERS; cid++) if (!own(cat.default, String(cid))) return null;
  const listed = new Set(cat.chibis);
  const tables = [cat.chibis, Object.keys(cat.costumes), Object.keys(cat.default), Object.keys(cat.chars)];
  if (tables.some(t => t.length === 0)) return null;
  if (![...Object.values(cat.costumes), ...Object.values(cat.default)].every(n => listed.has(n))) return null;
  if (!Object.values(cat.chars).every(cid => own(cat.default, String(cid)))) return null;
  return cat;
}
