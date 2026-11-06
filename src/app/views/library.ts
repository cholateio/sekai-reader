import { h } from '../../render/dom';
import { BUILT, charById, charsOf, EVENTS, eventLabel, TYPE_SHORT, UNIT_SHORT, UNITS, unitOf, type EventInfo } from '../catalog';
import { EMPTY_QUERY, filterEvents, isFiltered, toHash, type LibraryQuery } from '../filter';
import type { Manifest } from '../load';
import { prefs } from '../storage';
import { siteFooter, siteHeader } from './common';
import { openFilterSheet } from './sheet';

const CAST_MAX = 8;

function progressOf(e: EventInfo): string {
  let last = 0, done = 0;
  for (const [no, , sid] of e.eps) {
    const p = prefs.get(`pos:${sid}`, 0);
    if (p > 0.02) last = Math.max(last, no);
    if (p > 0.97) done++;
  }
  if (done === e.eps.length && e.eps.length) return '讀完';
  return last ? `讀到第 ${last} 話` : '';
}

export function castRow(e: EventInfo): HTMLElement | null {
  const cs = charsOf(e);
  if (!cs.length) return null;
  return h('span', { class: 'cast' },
    cs.slice(0, CAST_MAX).map(c => h('span', { class: 'c' }, h('i', { class: 'dot', style: `background:${c.color}` }), c.given)),
    cs.length > CAST_MAX ? h('span', { class: 'more-cast' }, `等 ${cs.length} 人`) : null);
}

export function eventMeta(e: EventInfo, available: Set<string>): HTMLElement[] {
  const label = eventLabel(e);
  const type = TYPE_SHORT[e.type] ?? e.type;
  const n = e.eps.filter(x => available.has(x[2])).length;
  const prog = progressOf(e);
  return [e.date, label, type === label ? null : type, `${e.eps.length} 話`, n ? `可讀 ${n}/${e.eps.length}` : null, prog || null]
    .filter((x): x is string => !!x).map(x => h('span', {}, x));
}

function moreLabel(qy: LibraryQuery): (HTMLElement | string)[] {
  const c = qy.char != null ? charById.get(qy.char) : null;
  const parts: (HTMLElement | string)[] = [];
  if (c) parts.push(h('i', { class: 'dot', style: `background:${c.color}` }), c.given);
  if (qy.type !== 'all') parts.push(c ? ' · ' : '', TYPE_SHORT[qy.type] ?? qy.type);
  return parts.length ? parts : ['角色 ▾'];
}

export function viewLibrary(manifest: Manifest, initial: LibraryQuery = EMPTY_QUERY): HTMLElement[] {
  const available = new Set(manifest.episodes);
  let qy = initial;
  const list = h('div', { class: 'list' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': '篩選' });
  const count = h('p', { class: 'lib-count', hidden: true });

  const clearLink = () => h('a', {
    class: 'clear-all', href: '#library',
    onclick: (ev: Event) => { ev.preventDefault(); apply(EMPTY_QUERY); },
  }, '清除篩選');

  // Filter changes rewrite the hash in place (no history entry, no hashchange) so Back leaves the library.
  const apply = (next: LibraryQuery) => {
    qy = next;
    history.replaceState(null, '', `#${toHash(qy)}`);
    search.value = qy.q;
    draw();
  };

  const draw = () => {
    const rows = filterEvents(EVENTS, qy);
    count.hidden = !isFiltered(qy);
    count.replaceChildren(`符合 ${rows.length} 期 · `, clearLink());
    list.replaceChildren(...(rows.length ? rows.map(e => h('a', { class: 'ev', href: `#event-${e.id}` },
      h('i', { class: 'stripe', style: `background:${e.color || unitOf(e.unit)[1]}` }),
      h('span', { class: 'main' },
        h('span', { class: 'nm' }, e.name),
        h('span', { class: 'meta' }, eventMeta(e, available)),
        castRow(e)),
      h('span', { class: 'num' }, `#${e.id}`)))
      : [h('p', { class: 'empty' }, '找不到符合的活動。', h('br'), clearLink())]));
    const unitChips = [['all', '全部', null] as const, ...Object.entries(UNITS).filter(([k]) => k !== 'piapro').map(([k, [, c]]) => [k, UNIT_SHORT[k], c] as const)]
      .map(([k, n, c]) => h('button', {
        class: 'chip', 'data-unit': k, 'aria-pressed': String(qy.unit === k), onclick: () => apply({ ...qy, unit: k }),
      }, c ? h('i', { class: 'dot', style: `background:${c}` }) : null, n));
    const active = qy.char != null || qy.type !== 'all';
    const more = h('button', {
      class: 'chip more', 'aria-pressed': String(active), 'aria-haspopup': 'dialog',
      onclick: () => openFilterSheet(qy, apply, more),
    }, moreLabel(qy), active ? h('span', {
      class: 'clear', role: 'button', 'aria-label': '清除角色與類型',
      onclick: (ev: Event) => { ev.stopPropagation(); apply({ ...qy, char: null, type: 'all' }); },
    }, '×') : null);
    chips.replaceChildren(...unitChips, more);
  };

  const search = h('input', {
    class: 'search', type: 'search', placeholder: '搜尋活動、話數、角色', value: qy.q, 'aria-label': '搜尋活動',
    oninput: (ev: Event) => apply({ ...qy, q: (ev.target as HTMLInputElement).value }),
  }) as HTMLInputElement;
  draw();
  return [
    ...siteHeader(),
    h('p', { class: 'sub lib-sub' }, `台服活動劇情 · ${EVENTS.length} 期 · 目錄更新於 ${BUILT}`),
    search, chips, count, list, siteFooter(),
  ];
}
