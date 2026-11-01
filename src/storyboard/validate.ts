import type { Episode } from '../scenario/types';
import { BUBBLE_SHAPES, PANEL_TYPES, type Storyboard } from './types';

export type ValidationResult = { ok: true; board: Storyboard } | { ok: false; errors: string[] };

const PANEL_KEYS = new Set(['t', 'l', 'caps', 'cut', 'fx', 'tone', 'big', 'cast', 'sfx', 'wide', 'cam', 'edge', 'bg', 'shape']);
const ENUMS: Record<string, readonly string[]> = {
  fx: ['blush', 'sparkle'], tone: ['day', 'office', 'serious'], big: ['quote', 'num'],
};
// Dialogue must come only from the episode; any CJK in a structural field means the model leaked text.
// sfx (onomatopoeia) and cast (character names) are the only fields allowed to carry CJK.
const CJK = /[　-〿぀-ヿ㐀-鿿豈-﫿＀-￯]/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(n => Number.isInteger(n));
const inUnit = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

function findCjk(v: unknown, path: string, errors: string[]) {
  if (typeof v === 'string') { if (CJK.test(v)) errors.push(`CJK text in ${path}`); }
  else if (Array.isArray(v)) v.forEach((x, i) => findCjk(x, `${path}[${i}]`, errors));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) findCjk(x, `${path}.${k}`, errors);
}

export function validateStoryboard(input: unknown, ep: Episode): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['storyboard is not an object'] };
  const meta = input.meta;
  if (!isObj(meta) || (meta.director !== 'ai' && meta.director !== 'auto')
    || typeof meta.promptVersion !== 'string' || typeof meta.generatedAt !== 'string'
    || (meta.model !== undefined && typeof meta.model !== 'string')) errors.push('invalid meta');
  else findCjk(meta, 'meta', errors);
  if (!Array.isArray(input.panels)) return { ok: false, errors: [...errors, 'panels is not an array'] };

  const known = new Set(ep.lines.map(l => l.r));
  const seen = new Set<number>();
  const capsSeen = new Set<number>();
  let prev = -Infinity;
  let impacts = 0;

  input.panels.forEach((p: unknown, i: number) => {
    const at = `panel ${i}`;
    if (!isObj(p)) { errors.push(`${at}: not an object`); return; }
    for (const k of Object.keys(p)) if (!PANEL_KEYS.has(k)) errors.push(`${at}: unknown field ${k}`);
    if (!PANEL_TYPES.includes(p.t as never)) errors.push(`${at}: unknown type ${String(p.t)}`);
    if (p.t === 'impact') impacts++;

    if (p.l !== undefined) {
      if (!isIntArray(p.l)) errors.push(`${at}: l must be integers`);
      else for (const r of p.l) {
        if (!known.has(r)) errors.push(`${at}: unknown line r=${r}`);
        else if (seen.has(r)) errors.push(`${at}: duplicate line r=${r}`);
        else if (r < prev) errors.push(`${at}: line r=${r} out of order`);
        seen.add(r);
        prev = Math.max(prev, r);
      }
    }
    // Shape rules mirror what src/render/comic/panels.ts draws, so every accepted board renders every line/caption.
    if (p.t === 'trans' && Array.isArray(p.l) && p.l.length) errors.push(`${at}: trans cannot carry lines`);
    if (p.t === 'split' && Array.isArray(p.l) && p.l.length > 2) errors.push(`${at}: split takes at most 2 lines`);
    const nLines = Array.isArray(p.l) ? p.l.length : 0;
    if (p.t === 'pair' && nLines !== 2) errors.push(`${at}: pair needs exactly 2 lines`);
    if (p.t === 'inset' && (nLines < 2 || nLines > 4)) errors.push(`${at}: inset needs 2-4 lines`);
    if (p.shape !== undefined) {
      if (!Array.isArray(p.shape)) errors.push(`${at}: shape must be an array`);
      else {
        if (p.shape.length !== nLines) errors.push(`${at}: shape length ${p.shape.length} != l length ${nLines}`);
        for (const s of p.shape) if (!BUBBLE_SHAPES.includes(s as never)) errors.push(`${at}: invalid shape ${String(s)}`);
      }
    }
    if (p.caps !== undefined && p.t !== 'est' && p.t !== 'trans' && Array.isArray(p.caps) && p.caps.length)
      errors.push(`${at}: caps only allowed on est/trans`);
    if (p.caps !== undefined) {
      if (!isIntArray(p.caps)) errors.push(`${at}: caps must be integers`);
      else for (const c of p.caps) {
        if (c < 0 || c >= ep.scenes.length) errors.push(`${at}: unknown caption ${c}`);
        else if (capsSeen.has(c)) errors.push(`${at}: duplicate caption ${c}`);
        capsSeen.add(c);
      }
    }
    if (p.cut !== undefined && (!isIntArray(p.cut) || !p.cut.every(r => isIntArray(p.l) && p.l.includes(r))))
      errors.push(`${at}: cut must be a subset of l`);
    for (const [k, allowed] of Object.entries(ENUMS))
      if (p[k] !== undefined && !allowed.includes(p[k] as string)) errors.push(`${at}: invalid ${k}`);
    if (p.cast !== undefined && !(Array.isArray(p.cast) && p.cast.every(s => typeof s === 'string')))
      errors.push(`${at}: cast must be strings`);
    if (p.sfx !== undefined && typeof p.sfx !== 'string') errors.push(`${at}: sfx must be a string`);
    if (p.bg !== undefined && typeof p.bg !== 'string') errors.push(`${at}: bg must be a string`);
    if (p.wide !== undefined && typeof p.wide !== 'boolean') errors.push(`${at}: wide must be boolean`);
    if (p.edge !== undefined && p.edge !== -1 && p.edge !== 0 && p.edge !== 1) errors.push(`${at}: invalid edge`);
    if (p.cam !== undefined) {
      const c = p.cam;
      const ok = isObj(c) && Array.isArray(c.focus) && c.focus.length === 2 && c.focus.every(inUnit)
        && typeof c.zoom === 'number' && Number.isFinite(c.zoom) && c.zoom >= 1
        && (c.blur === undefined || (typeof c.blur === 'number' && Number.isFinite(c.blur) && c.blur >= 0))
        && Object.keys(c).every(k => k === 'focus' || k === 'zoom' || k === 'blur');
      if (!ok) errors.push(`${at}: invalid cam`);
    }
    const { sfx: _sfx, cast: _cast, ...rest } = p;
    findCjk(rest, at, errors);
  });

  for (const r of known) if (!seen.has(r)) errors.push(`missing line r=${r}`);
  for (let c = 0; c < ep.scenes.length; c++) if (!capsSeen.has(c)) errors.push(`missing caption ${c}`);
  if (impacts > 1) errors.push(`impact used ${impacts} times (max 1)`);

  return errors.length ? { ok: false, errors } : { ok: true, board: input as unknown as Storyboard };
}
