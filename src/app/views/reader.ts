import { StaticChibiArt } from '../../art/StaticChibiArt';
import { renderComic } from '../../render/comic';
import type { UnitFlavor } from '../../render/comic/flavor';
import { h } from '../../render/dom';
import type { Episode } from '../../scenario/types';
import type { Storyboard } from '../../storyboard/types';
import type { Manifest } from '../load';
import { prefs } from '../storage';
import { go } from './common';

export interface ReaderCtx {
  title: string;
  sub: string;
  back: string;
  manifest: Manifest;
  /** Next episode in the same event; href null when it is not available yet. */
  next: { title: string; href: string | null } | null;
  /** Unit easter egg for the comic; null/undefined for mixed events. */
  unit?: UnitFlavor | null;
}

// Fixed reading size (user, 2026-11-02: smaller text, no Aa control); older stored sizes are ignored.
const READER_SIZE = 14;

export function applyPrefs(): void {
  document.documentElement.style.setProperty('--reader-size', `${READER_SIZE}px`);
  document.body.classList.toggle('bw', prefs.get('bw', false));
}

export function viewReader(ep: Episode, board: Storyboard, ctx: ReaderCtx): HTMLElement[] {
  applyPrefs();
  document.body.classList.add('paper');
  const bg = new Set(ctx.manifest.bg);
  const body = renderComic(ep, board, new StaticChibiArt('/sd', ctx.manifest.sd.length ? ctx.manifest.sd : undefined),
    { bgUrl: id => (bg.has(id) ? `/bg/${id}.webp` : null), unit: ctx.unit ?? null });

  const scrim = h('div', { class: 'scrim', hidden: true });
  const menu = h('button', { class: 'iconbtn menu', 'aria-label': '選單', 'aria-expanded': 'false', 'aria-controls': 'reader-drawer' }, '☰');
  const bwBtn = h('button', {
    class: 'drawer-item toggle', 'aria-pressed': String(prefs.get('bw', false)), 'aria-label': '黑白',
    onclick: () => {
      const v = !prefs.get('bw', false);
      prefs.set('bw', v);
      bwBtn.setAttribute('aria-pressed', String(v));
      applyPrefs();
    },
  }, h('span', {}, '黑白'), h('i', { class: 'switch', 'aria-hidden': 'true' }));
  const drawer = h('nav', { class: 'drawer', id: 'reader-drawer', 'aria-label': '選單', hidden: true },
    h('div', { class: 'drawer-head' }, h('b', {}, ctx.title), h('span', {}, ctx.sub)),
    h('button', { class: 'drawer-item', 'data-go': 'event', onclick: () => { setOpen(false); go(ctx.back); } }, '這期的話數列表'),
    h('button', { class: 'drawer-item', 'data-go': 'library', onclick: () => { setOpen(false); go('library'); } }, '活動目錄'),
    bwBtn);
  const setOpen = (open: boolean) => {
    drawer.hidden = scrim.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
  };
  menu.addEventListener('click', () => setOpen(drawer.hidden));
  scrim.addEventListener('click', () => setOpen(false));
  const onKey = (e: KeyboardEvent) => {
    if (!drawer.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') setOpen(false);
  };
  document.addEventListener('keydown', onKey);

  const end = h('div', { class: 'end' });
  if (ctx.next) {
    end.append(h('b', {}, `下一話：${ctx.next.title}`), ctx.next.href
      ? h('button', { class: 'primary', onclick: () => go(ctx.next!.href!) }, '繼續閱讀')
      : h('span', { class: 'sub' }, '下一話尚未提供。'));
  } else end.append(h('b', {}, '這期活動讀完了'));
  end.append(h('button', { class: 'ghost', onclick: () => go(ctx.back) }, '回到話數列表'));

  return [
    h('header', { class: 'bar rbar' }, menu, h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i'))),
    scrim, drawer, body, end,
  ];
}
