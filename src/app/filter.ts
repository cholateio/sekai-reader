import { charById, charsOf, TYPES, UNIT_SHORT, UNITS, unitOf, type EventInfo } from './catalog';

/** Library filter state; `unit`/`type` are 'all' or a catalog key, `char` a known character id. */
export interface LibraryQuery { q: string; unit: string; char: number | null; type: string }

export const EMPTY_QUERY: LibraryQuery = { q: '', unit: 'all', char: null, type: 'all' };

const unitOk = (u: string) => u in UNITS && u !== 'piapro';

/** Parses the part after `library?`; unknown or malformed values fall back to the default. */
export function parseQuery(search: string): LibraryQuery {
  const p = new URLSearchParams(search);
  const unit = p.get('unit') ?? '';
  const type = p.get('type') ?? '';
  const c = Number(p.get('char'));
  return {
    q: p.get('q') ?? '',
    unit: unitOk(unit) ? unit : 'all',
    char: Number.isInteger(c) && charById.has(c) ? c : null,
    type: type in TYPES ? type : 'all',
  };
}

export function isFiltered(qy: LibraryQuery): boolean {
  return qy.unit !== 'all' || qy.char != null || qy.type !== 'all' || qy.q.trim() !== '';
}

/** `library` or `library?unit=…&char=…&type=…&q=…` with only non-default keys, in that order. */
export function toHash(qy: LibraryQuery): string {
  const parts: string[] = [];
  if (qy.unit !== 'all') parts.push(`unit=${qy.unit}`);
  if (qy.char != null) parts.push(`char=${qy.char}`);
  if (qy.type !== 'all') parts.push(`type=${qy.type}`);
  if (qy.q !== '') parts.push(`q=${encodeURIComponent(qy.q)}`);
  return parts.length ? `library?${parts.join('&')}` : 'library';
}

function haystack(e: EventInfo): string {
  const names = charsOf(e).flatMap(c => [c.given, c.first + c.given]);
  return [e.name, ...e.eps.map(x => x[1]), ...names, unitOf(e.unit)[0], UNIT_SHORT[e.unit] ?? ''].join('\n').toLowerCase();
}

export function filterEvents(events: EventInfo[], qy: LibraryQuery): EventInfo[] {
  const q = qy.q.trim().toLowerCase();
  return events.filter(e => (qy.unit === 'all' || e.unit === qy.unit)
    && (qy.type === 'all' || e.type === qy.type)
    && (qy.char == null || (e.chars ?? []).includes(qy.char))
    && (!q || String(e.id) === q || haystack(e).includes(q)));
}
