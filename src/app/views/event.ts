import { h } from '../../render/dom';
import { eventById, TYPES } from '../catalog';
import type { Manifest } from '../load';
import { prefs } from '../storage';
import { go, siteHeader, unitChip, viewMissing } from './common';

export function viewEvent(id: number, manifest: Manifest): HTMLElement[] {
  const e = eventById.get(id);
  if (!e) return viewMissing('找不到這期活動，回到活動列表重新選擇。');
  const available = new Set(manifest.episodes);
  const eps = h('div', { class: 'eps' }, e.eps.map(([no, title, sid]) => {
    const pos = prefs.get(`pos:${sid}`, 0);
    return h('div', { class: 'ep' },
      h('span', { class: 'no' }, no),
      h('span', { class: 't' }, title),
      h('span', { class: 'acts' }, available.has(sid)
        ? [h('button', { class: 'read', onclick: () => go(`read-${e.id}-${no}`) }, pos > 0.02 ? '繼續閱讀' : '閱讀'),
          pos > 0.02 ? h('span', { class: 'prog' }, pos > 0.97 ? '已讀完' : `讀到 ${Math.round(pos * 100)}%`) : null]
        : h('span', { class: 'na' }, '尚未提供')));
  }));
  return [
    ...siteHeader({ title: `第 ${e.id} 期 · ${TYPES[e.type] ?? e.type}` }),
    h('div', { class: 'evhead' }, h('h2', {}, e.name), h('div', { class: 'evmeta' }, unitChip(e.unit), `${e.date} 開始`)),
    eps,
  ];
}
