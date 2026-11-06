import { h } from '../../render/dom';
import { eventById, eventLabel, neighbours, TYPE_SHORT } from '../catalog';
import type { Manifest } from '../load';
import { prefs } from '../storage';
import { navLink, siteFooter, siteHeader, unitChip, viewMissing } from './common';
import { castRow } from './library';

export function viewEvent(id: number, manifest: Manifest): HTMLElement[] {
  const e = eventById.get(id);
  if (!e) return viewMissing('找不到這期活動，回到活動列表重新選擇。');
  const available = new Set(manifest.episodes);
  const readable = e.eps.filter(x => available.has(x[2]));
  const posOf = (sid: string) => prefs.get(`pos:${sid}`, 0);
  // Continue = the last readable episode that was started but not finished; otherwise episode 1.
  const resume = [...readable].reverse().find(([, , sid]) => { const p = posOf(sid); return p > 0.02 && p <= 0.97; });
  const start = resume ?? readable[0];
  const cont = start ? h('a', { class: 'primary continue', href: `#read-${e.id}-${start[0]}` },
    resume ? `繼續閱讀 第 ${start[0]} 話` : `從第 ${start[0]} 話開始`) : null;

  // A readable episode is one link covering the whole row (long-press / new tab); unavailable rows stay inert.
  const eps = h('div', { class: 'eps' }, e.eps.map(([no, title, sid]) => {
    const pos = posOf(sid);
    const ok = available.has(sid);
    return h(ok ? 'a' : 'div', { class: 'ep', href: ok ? `#read-${e.id}-${no}` : null },
      h('span', { class: 'no' }, no),
      h('span', { class: 't' }, title),
      h('span', { class: 'acts' }, ok
        ? [h('span', { class: 'read' }, pos > 0.02 && pos <= 0.97 ? '繼續閱讀' : '閱讀'),
          pos > 0.02 ? h('span', { class: 'prog' }, pos > 0.97 ? '已讀完' : `讀到 ${Math.round(pos * 100)}%`) : null]
        : h('span', { class: 'na' }, '尚未提供')));
  }));
  const { prev, next } = neighbours(e.id);
  const evLink = (x: typeof prev, label: string, cls: string) => x
    ? h('a', { class: `evnav-link ${cls}`, href: `#event-${x.id}` }, h('small', {}, `${label} #${x.id}`), h('span', {}, x.name)) : null;
  const label = eventLabel(e);
  const type = TYPE_SHORT[e.type] ?? e.type;
  return [
    ...siteHeader({
      title: [`第 ${e.id} 期`, label, type === label ? null : type].filter(Boolean).join(' · '),
      items: [prev ? navLink(`#event-${prev.id}`, `上一期 #${prev.id}`, prev.name) : null, next ? navLink(`#event-${next.id}`, `下一期 #${next.id}`, next.name) : null]
        .filter((x): x is HTMLAnchorElement => !!x),
    }),
    h('div', { class: 'evhead' },
      h('h2', {}, e.name),
      h('div', { class: 'evmeta' }, unitChip(e.unit), h('span', {}, label), `${e.date} 開始`, h('span', {}, `${e.eps.length} 話`),
        readable.length ? h('span', {}, `可讀 ${readable.length}/${e.eps.length}`) : null),
      castRow(e),
      cont),
    eps,
    h('nav', { class: 'evnav', 'aria-label': '相鄰活動' }, evLink(prev, '上一期', 'prev'), evLink(next, '下一期', 'next')),
    siteFooter(),
  ];
}
