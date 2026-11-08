import { StaticChibiArt } from '../../art/StaticChibiArt';
import { renderComic } from '../../render/comic';
import type { UnitFlavor } from '../../render/comic/flavor';
import { h } from '../../render/dom';
import type { Episode } from '../../scenario/types';
import type { Storyboard } from '../../storyboard/types';
import type { Manifest } from '../load';
import { prefs } from '../storage';
import { navLink, siteHeader } from './common';

export interface ReaderCtx {
  title: string;
  sub: string;
  back: string;
  manifest: Manifest;
  /** Neighbouring episodes in the same event; href (a complete `#…`) is null when not available yet.
   *  Only `next` is shown (end of the page); the drawer has no episode stepping (owner, 2026-11-08). */
  prev?: { no: number; title: string; href: string | null } | null;
  next: { no: number; title: string; href: string | null } | null;
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

  const bwBtn = h('button', {
    class: 'drawer-item toggle', 'aria-pressed': String(prefs.get('bw', false)), 'aria-label': '黑白',
    onclick: () => {
      const v = !prefs.get('bw', false);
      prefs.set('bw', v);
      bwBtn.setAttribute('aria-pressed', String(v));
      applyPrefs();
    },
  }, h('span', {}, '黑白'), h('i', { class: 'switch', 'aria-hidden': 'true' }));
  const header = siteHeader({
    title: ctx.title, sub: ctx.sub, progress: true,
    items: [navLink(ctx.back, '這期的話數列表')],
    settings: [bwBtn],
  });

  // End of the episode: a 「完」 mark, then the next episode as one full-width row (or why there is none).
  const n = ctx.next;
  const nextRow = !n ? h('p', { class: 'end-last' }, '這期活動讀完了')
    : h(n.href ? 'a' : 'div', { class: n.href ? 'end-next' : 'end-next na', href: n.href },
      h('small', {}, n.href ? `下一話 · 第 ${n.no} 話` : `下一話 · 第 ${n.no} 話 · 尚未提供`),
      h('span', { class: 'end-title' }, n.title),
      n.href ? h('i', { class: 'end-arrow', 'aria-hidden': 'true' }, '→') : null);
  const end = h('nav', { class: 'end', 'aria-label': '這話結束' },
    h('p', { class: 'end-mark' }, `${/^第 \d+ 話/.exec(ctx.title)?.[0] ?? '本話'} 完`),
    nextRow,
    h('a', { class: 'end-back', href: ctx.back }, '回到這期的話數列表'));

  return [...header, body, end];
}
