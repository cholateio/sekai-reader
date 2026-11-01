import { StaticChibiArt } from '../../art/StaticChibiArt';
import { renderChat } from '../../render/chat';
import { renderComic } from '../../render/comic';
import { h } from '../../render/dom';
import type { Episode } from '../../scenario/types';
import type { Storyboard } from '../../storyboard/types';
import type { Manifest } from '../load';
import { prefs } from '../storage';
import { go, rerender } from './common';

export interface ReaderCtx {
  title: string;
  sub: string;
  back: string;
  manifest: Manifest;
  /** Next episode in the same event; href null when it is not available yet. */
  next: { title: string; href: string | null } | null;
}

const SIZE_MIN = 13, SIZE_MAX = 22, SIZE_DEFAULT = 16;

export function applyPrefs(): void {
  document.documentElement.style.setProperty('--reader-size', `${prefs.get('size', SIZE_DEFAULT)}px`);
  document.body.classList.toggle('nomood', !prefs.get('mood', true));
}

export function viewReader(ep: Episode, board: Storyboard, ctx: ReaderCtx): HTMLElement[] {
  const mode = prefs.get<'comic' | 'chat'>('mode', 'comic');
  applyPrefs();
  document.body.classList.toggle('paper', mode === 'comic');
  const bg = new Set(ctx.manifest.bg);
  const body = mode === 'comic'
    ? renderComic(ep, board, new StaticChibiArt('/sd', ctx.manifest.sd.length ? ctx.manifest.sd : undefined),
      { bgUrl: id => (bg.has(id) ? `/bg/${id}.webp` : null) })
    : renderChat(ep);

  const setSize = (d: number) => {
    prefs.set('size', Math.min(SIZE_MAX, Math.max(SIZE_MIN, prefs.get('size', SIZE_DEFAULT) + d)));
    applyPrefs();
  };
  const tools = h('div', { class: 'tools', hidden: true },
    h('button', { class: 'iconbtn', 'aria-label': '縮小字級', onclick: () => setSize(-1) }, 'A−'),
    h('button', { class: 'iconbtn', 'aria-label': '放大字級', onclick: () => setSize(1) }, 'A＋'),
    mode === 'chat' ? h('button', {
      class: 'iconbtn', 'aria-pressed': String(prefs.get('mood', true)), 'aria-label': '顯示表情標記',
      onclick: (ev: Event) => {
        const v = !prefs.get('mood', true);
        prefs.set('mood', v);
        (ev.currentTarget as HTMLElement).setAttribute('aria-pressed', String(v));
        applyPrefs();
      },
    }, '表情') : null);
  const setMode = (m: 'comic' | 'chat') => { prefs.set('mode', m); rerender(); };

  const end = h('div', { class: 'end' });
  if (ctx.next) {
    end.append(h('b', {}, `下一話：${ctx.next.title}`), ctx.next.href
      ? h('button', { class: 'primary', onclick: () => go(ctx.next!.href!) }, '繼續閱讀')
      : h('span', { class: 'sub' }, '下一話尚未提供。'));
  } else end.append(h('b', {}, '這期活動讀完了'));
  end.append(h('button', { class: 'ghost', onclick: () => go(ctx.back) }, '回到話數列表'));

  return [
    h('header', { class: 'bar rbar' },
      h('button', { class: 'iconbtn', onclick: () => go(ctx.back), 'aria-label': '返回' }, '←'),
      h('div', { class: 'ttl' }, h('b', {}, ctx.title), h('span', {}, ctx.sub)),
      h('div', { class: 'seg', role: 'group', 'aria-label': '閱讀方式' },
        h('button', { 'aria-pressed': String(mode === 'comic'), onclick: () => setMode('comic') }, '漫畫'),
        h('button', { 'aria-pressed': String(mode === 'chat'), onclick: () => setMode('chat') }, '對話')),
      h('button', { class: 'iconbtn', 'aria-label': '閱讀設定', onclick: () => { tools.hidden = !tools.hidden; } }, 'Aa'),
      h('div', { class: 'break' }), tools,
      h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i'))),
    body, end,
  ];
}
