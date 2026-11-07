import { h } from '../../render/dom';
import { BUILT, EVENTS, eventLabel, UNIT_SHORT, UNITS, unitOf, type EventInfo } from '../catalog';
import { EMPTY_QUERY, filterEvents, isFiltered, toHash, type LibraryQuery } from '../filter';
import { bannerUrl, type Manifest } from '../load';
import { prefs } from '../storage';
import { siteFooter, siteHeader } from './common';

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

/** Second row of a library entry: date · box label · progress. Episode counts live on the event page. */
export function eventMeta(e: EventInfo): HTMLElement[] {
  return [e.date, eventLabel(e), progressOf(e) || null]
    .filter((x): x is string => !!x).map(x => h('span', {}, x));
}

// Every row keeps the same box (a tinted block when there is no banner) so titles stay aligned.
function thumb(e: EventInfo, manifest: Manifest): HTMLElement {
  const src = bannerUrl(manifest, e.bundle, true);
  return h('span', { class: 'thumb', 'aria-hidden': 'true' },
    src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async', width: '200', height: '100' }) : null);
}

export function viewLibrary(manifest: Manifest, initial: LibraryQuery = EMPTY_QUERY): HTMLElement[] {
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
    list.replaceChildren(...(rows.length ? rows.map(e => h('a', { class: 'ev', href: `#event-${e.id}`, style: `--tone:${e.color || unitOf(e.unit)[1]}` },
      h('i', { class: 'stripe' }),
      thumb(e, manifest),
      h('span', { class: 'main' },
        h('span', { class: 'nm' }, e.name),
        h('span', { class: 'meta' }, eventMeta(e))),
      h('span', { class: 'num' }, `#${e.id}`)))
      : [h('p', { class: 'empty' }, '找不到符合的活動。', h('br'), clearLink())]));
    // No 「全部」 chip: nothing pressed means all units; tapping the pressed chip again clears it.
    const unitChips = Object.entries(UNITS).filter(([k]) => k !== 'piapro').map(([k, [, c]]) => h('button', {
      class: 'chip', 'data-unit': k, 'aria-pressed': String(qy.unit === k),
      onclick: () => apply({ ...qy, unit: qy.unit === k ? 'all' : k }),
    }, h('i', { class: 'dot', style: `background:${c}` }), UNIT_SHORT[k]));
    chips.replaceChildren(...unitChips);
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
