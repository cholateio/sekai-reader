import { h } from '../../render/dom';
import { BUILT, EVENTS, UNITS, unitOf } from '../catalog';
import type { Manifest } from '../load';
import { go, siteFooter, siteHeader } from './common';

const filter = { q: '', unit: 'all' };

export function viewLibrary(manifest: Manifest): HTMLElement[] {
  const available = new Set(manifest.episodes);
  const list = h('div', { class: 'list' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': '依團體篩選' });
  const draw = () => {
    const q = filter.q.trim().toLowerCase();
    const rows = EVENTS.filter(e => (filter.unit === 'all' || e.unit === filter.unit)
      && (!q || e.name.toLowerCase().includes(q) || String(e.id) === q || e.eps.some(x => x[1].toLowerCase().includes(q))));
    list.replaceChildren(...(rows.length ? rows.map(e => {
      const n = e.eps.filter(x => available.has(x[2])).length;
      return h('button', { class: 'ev', onclick: () => go(`event-${e.id}`) },
        h('i', { class: 'stripe', style: `background:${e.color || unitOf(e.unit)[1]}` }),
        h('span', { class: 'main' },
          h('span', { class: 'nm' }, e.name),
          h('span', { class: 'meta' }, h('span', {}, e.date), h('span', {}, unitOf(e.unit)[0]), h('span', {}, `${e.eps.length} 話`),
            n ? h('span', { class: 'badge ok' }, `可閱讀 ${n}/${e.eps.length}`) : null)),
        h('span', { class: 'num' }, `#${e.id}`));
    }) : [h('p', { class: 'empty' }, '找不到符合的活動。試試活動名稱、話數標題或期數。')]));
    chips.replaceChildren(...[['all', '全部', null] as const, ...Object.entries(UNITS).filter(([k]) => k !== 'piapro').map(([k, [n, c]]) => [k, n, c] as const)]
      .map(([k, n, c]) => h('button', {
        class: 'chip', 'aria-pressed': String(filter.unit === k), onclick: () => { filter.unit = k; draw(); },
      }, c ? h('i', { class: 'dot', style: `background:${c}` }) : null, n)));
  };
  const search = h('input', {
    class: 'search', type: 'search', placeholder: '搜尋活動或話數標題', value: filter.q, 'aria-label': '搜尋活動',
    oninput: (ev: Event) => { filter.q = (ev.target as HTMLInputElement).value; draw(); },
  });
  draw();
  return [
    ...siteHeader(),
    h('p', { class: 'sub lib-sub' }, `台服活動劇情 · ${EVENTS.length} 期 · 目錄更新於 ${BUILT}`),
    search, chips, list, siteFooter(),
  ];
}
