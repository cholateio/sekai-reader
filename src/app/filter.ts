import { charsOf, UNIT_SHORT, UNITS, unitOf, type EventInfo } from './catalog';

/** Library filter state; `unit` is 'all' or a catalog key. Character and type filters were dropped on 2026-11-06 (search covers names). */
export interface LibraryQuery { q: string; unit: string }

export const EMPTY_QUERY: LibraryQuery = { q: '', unit: 'all' };

const unitOk = (u: string) => u in UNITS && u !== 'piapro';

/** Parses the part after `library?`; unknown keys and malformed values fall back to the default. */
export function parseQuery(search: string): LibraryQuery {
  const p = new URLSearchParams(search);
  const unit = p.get('unit') ?? '';
  return { q: p.get('q') ?? '', unit: unitOk(unit) ? unit : 'all' };
}

export function isFiltered(qy: LibraryQuery): boolean {
  return qy.unit !== 'all' || qy.q.trim() !== '';
}

/** `library` or `library?unit=…&q=…` with only non-default keys, in that order. */
export function toHash(qy: LibraryQuery): string {
  const parts: string[] = [];
  if (qy.unit !== 'all') parts.push(`unit=${qy.unit}`);
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
    && (!q || String(e.id) === q || haystack(e).includes(q)));
}
