import { h } from '../../render/dom';
import { charsOf, eventById, eventLabel, neighbours, TYPE_SHORT, unitOf, type EventInfo } from '../catalog';
import type { Manifest } from '../load';
import { prefs } from '../storage';
import { navLink, siteFooter, siteHeader, viewMissing } from './common';

const CAST_MAX = 8;

/** Featured characters as colour dots + given names; null when the index has no `chars` for the event. */
export function castRow(e: EventInfo): HTMLElement | null {
  const cs = charsOf(e);
  if (!cs.length) return null;
  return h('span', { class: 'cast' },
    cs.slice(0, CAST_MAX).map(c => h('span', { class: 'c' }, h('i', { class: 'dot', style: `background:${c.color}` }), c.given)),
    cs.length > CAST_MAX ? h('span', { class: 'more-cast' }, `等 ${cs.length} 人`) : null);
}


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

  // A readable episode is one link covering the whole cell (long-press / new tab); unavailable cells stay inert
  // and muted, and 「尚未提供」 is said once in the head instead of on every cell.
  const eps = h('ol', { class: 'eps' }, e.eps.map(([no, title, sid]) => {
    const pos = posOf(sid);
    const ok = available.has(sid);
    const state = pos > 0.97 ? '讀完' : pos > 0.02 ? `讀到 ${Math.round(pos * 100)}%` : '開始閱讀';
    return h('li', {}, h(ok ? 'a' : 'div', { class: ok ? 'ep' : 'ep na', href: ok ? `#read-${e.id}-${no}` : null },
      h('span', { class: 'no' }, no),
      h('span', { class: 't' }, title),
      ok ? h('span', { class: 'prog' }, state) : null,
      ok && pos > 0.02 ? h('i', { class: 'bar', style: `--p:${Math.min(1, pos)}`, 'aria-hidden': 'true' }) : null));
  }));
  const { prev, next } = neighbours(e.id);
  const evLink = (x: typeof prev, label: string, cls: string) => x
    ? h('a', { class: `evnav-link ${cls}`, href: `#event-${x.id}` }, h('small', {}, `${label} #${x.id}`), h('span', {}, eventLabel(x)))
    : h('span', { class: `evnav-empty ${cls}`, 'aria-hidden': 'true' });
  const label = eventLabel(e);
  const type = TYPE_SHORT[e.type] ?? e.type;
  const [unitName, unitColor] = unitOf(e.unit);
  const status = readable.length === e.eps.length ? null
    : readable.length ? `可讀 ${readable.length}/${e.eps.length} 話，其餘尚未提供。` : '這期的漫畫尚未提供，先列出各話標題。';
  return [
    ...siteHeader({
      title: `第 ${e.id} 期`, sub: label,
      items: [prev ? navLink(`#event-${prev.id}`, `上一期 #${prev.id}`, eventLabel(prev)) : null, next ? navLink(`#event-${next.id}`, `下一期 #${next.id}`, eventLabel(next)) : null]
        .filter((x): x is HTMLAnchorElement => !!x),
    }),
    h('section', { class: 'evhead', style: `--tone:${e.color || unitColor}` },
      h('p', { class: 'evunit' }, unitName),
      h('h1', { class: 'evbox' }, label),
      h('p', { class: 'evname' }, e.name),
      h('p', { class: 'evmeta' }, h('span', {}, `${e.date} 開始`), type === label ? null : h('span', {}, type), h('span', {}, `全 ${e.eps.length} 話`)),
      castRow(e),
      status ? h('p', { class: 'evstatus' }, status) : null,
      cont),
    eps,
    h('nav', { class: 'evnav', 'aria-label': '相鄰活動' }, evLink(prev, '上一期', 'prev'), evLink(next, '下一期', 'next')),
    siteFooter(),
  ];
}
