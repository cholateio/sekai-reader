import type { CharacterArt, ArtSize } from '../../art/CharacterArt';
import { artRequest } from '../../art/CharacterArt';
import { resolveCharacter, SIDE_COLOR } from '../../data/characters';
import type { Episode, Line } from '../../scenario/types';
import { stripParen } from '../../scenario/text';
import type { Panel } from '../../storyboard/types';
import { h } from '../dom';
import { bubble, lineEl, speakerSide, type Side } from './bubbles';
import type { UnitFlavor } from './flavor';
import { shapeFor } from './shape';

export interface PanelCtx {
  ep: Episode;
  lines: Map<number, Line>;
  art: CharacterArt;
  sides: ReturnType<typeof speakerSide>;
  /** Called on every .pn element so later layers (backgrounds) can decorate it. */
  decorate(el: HTMLElement, p: Panel, part?: number): void;
  flavor?: UnitFlavor | null;
}

const colorOf = (name: string) => resolveCharacter(name)?.color ?? SIDE_COLOR;

function chip(ctx: PanelCtx, line: Line | undefined, size: ArtSize = 'sm'): HTMLElement | null {
  if (!line || !line.who) return null;
  return ctx.art.render(artRequest(line), size);
}

function stage(ctx: PanelCtx, L: Line[]): HTMLElement | null {
  const firsts = new Map<string, Line>();
  for (const x of L) {
    const key = String(resolveCharacter(x.who)?.id ?? x.who);
    if (x.who && !firsts.has(key)) firsts.set(key, x);
  }
  if (!firsts.size) return null;
  const byside = (s: string) => [...firsts.values()].filter(x => ctx.sides.side(x.who) === s).map(x => chip(ctx, x));
  return h('div', { class: 'stage' }, h('span', { class: 'side' }, byside('l')), h('span', { class: 'side' }, byside('r')));
}

/** A bubble for line `x` of panel `p`, with the shape from the rules (or the board's override). */
function bub(ctx: PanelCtx, p: Panel, x: Line, side: Side, extra = '', text?: string): HTMLElement {
  return bubble(x, side, shapeFor(x, p, (p.l ?? []).indexOf(x.r), ctx.flavor), extra, text);
}

const bubbles = (ctx: PanelCtx, p: Panel, L: Line[], extra = '', side?: Side) =>
  h('div', { class: 'bubbles' }, L.map(x => bub(ctx, p, x, side ?? ctx.sides.side(x.who), extra)));

export function buildPanel(p: Panel, ctx: PanelCtx): HTMLElement {
  const L = (p.l ?? []).map(r => ctx.lines.get(r)).filter((x): x is Line => !!x);
  const caps = (p.caps ?? []).map(i => ctx.ep.scenes[i]).filter(Boolean);
  const tone = p.tone === 'serious' ? ' serious' : '';
  const pn = (cls: string, ...kids: Parameters<typeof h>[2][]) => {
    const el = h('div', { class: `pn ${cls}`.trim() }, ...kids);
    ctx.decorate(el, p);
    return el;
  };
  const t = p.t === 'split' && L.length < 2 ? 'talk' : p.t;

  switch (t) {
    case 'trans':
      return h('div', { class: 'trans' }, caps.map(c => c.text).join('　'));
    case 'est': {
      const time = caps.find(c => c.time)?.time;
      return pn(`est tone-bg ${p.tone ?? ''}`,
        caps.map(c => h('span', { class: 'cap' }, c.text)), time ? h('span', { class: 'cap' }, time) : null,
        p.sfx ? h('span', { class: 'sfx', 'aria-hidden': 'true' }, p.sfx) : null,
        L.length ? bubbles(ctx, p, L) : null, stage(ctx, L));
    }
    case 'insert':
      return pn('insert-pn', h('div', { class: 'insert' },
        L.map(x => [h('small', {}, `${x.who || '旁白'} 唸出的內容`), lineEl('span', 'itext', x)])));
    case 'close': {
      // The close-up figure always sits on the left of the grid, so tails point left.
      const el = pn(`closeup${tone}`, chip(ctx, L[0], 'lg'), bubbles(ctx, p, L, '', 'l'));
      el.style.setProperty('--hue', colorOf(L[0]?.who ?? ''));
      if (p.fx === 'blush') el.append(h('span', { class: 'fx blush', 'aria-hidden': 'true' }, '///'));
      return el;
    }
    case 'pop': {
      const el = pn('pop', bubbles(ctx, p, L, ' big'), stage(ctx, L));
      el.style.setProperty('--hue', colorOf(L[0]?.who ?? ''));
      if (p.fx === 'sparkle') el.append(h('span', { class: 'fx sparkle', 'aria-hidden': 'true' }, '✦ ✧ ✦'));
      return el;
    }
    case 'beat': {
      const s = L[0] ? ctx.sides.side(L[0].who) : 'l';
      return h('div', { class: `beatrow ${s === 'r' ? 'r' : 'l'}` }, pn('beat tone-bg', bubbles(ctx, p, L), stage(ctx, L)));
    }
    case 'split':
      return h('div', { class: 'split' }, L.map((x, k) => {
        const el = h('div', { class: 'pn half' }, bub(ctx, p, x, 'c'), h('div', { class: 'center' }, chip(ctx, x, 'md')));
        ctx.decorate(el, p, k);
        return el;
      }));
    case 'impact':
      return pn('impact', L.map(x => bub(ctx, p, x, 'c')), h('div', { class: 'center' }, chip(ctx, L[0])));
    case 'reveal': {
      const x = L[0];
      const m = x ? (p.big === 'num' ? x.body.match(/\d[\d,]{2,}/) : p.big === 'quote' ? x.body.match(/「([^」]+)」/) : null) : null;
      const big = m ? (m[1] ?? m[0]) : '';
      return pn('reveal tone-bg', big ? h('div', { class: 'bigtxt', 'aria-hidden': 'true' }, big) : null,
        L.map(y => bub(ctx, p, y, 'c', ' small')), chip(ctx, x));
    }
    case 'shout': {
      const names = p.cast?.length ? p.cast : [...new Set(L.map(x => x.who).filter(Boolean))];
      return pn('shout-pn', h('div', { class: 'shout-wrap' },
        L.map(x => bub(ctx, p, x, 'c', ' huge', x.body.replace(/^「|」$/g, '')))),
        h('div', { class: 'cast' }, names.map(n => ctx.art.render({ name: n, face: '', motion: '', mood: null }, 'sm'))));
    }
    case 'mono':
      return pn('mono tone-bg', h('div', { class: 'bubbles' },
        L.map((x, k) => bub(ctx, p, x, k % 2 ? 'r' : 'l', '', x.who ? stripParen(x.body) : x.body))));
    case 'sfx':
      return pn(`sfx-pn tone-bg${tone}`, h('span', { class: 'sfx big', 'aria-hidden': 'true' }, p.sfx ?? ''),
        L.length ? bubbles(ctx, p, L) : null, stage(ctx, L));
    default:
      return pn(`talk${p.wide ? ' tone-bg wide' : ''}${tone}`, bubbles(ctx, p, L), stage(ctx, L));
  }
}
