import { resolveCharacter } from '../../data/characters';
import type { Line } from '../../scenario/types';
import type { BubbleShape } from '../../storyboard/types';
import { h } from '../dom';
import { drawBubble, type Aim, type Tail } from './bubbleSvg';

export type Side = 'l' | 'r' | 'c';

/** One key per character however the script spells the name; bubbles and figures carry it as data-who. */
export const speakerKey = (name: string): string => String(resolveCharacter(name)?.id ?? name);

export function speakerSide(): { side(name: string): Side; reset(): void } {
  let sides = new Map<string, Side>();
  let next = 0;
  return {
    side(name: string): Side {
      if (!name) return 'c';
      const key = speakerKey(name);
      let s = sides.get(key);
      if (!s) { s = next++ % 2 ? 'r' : 'l'; sides.set(key, s); }
      return s;
    },
    reset() { sides = new Map(); next = 0; },
  };
}

/** Every rendered line carries data-r; tests assert each r appears exactly once. */
export function lineEl(tag: string, cls: string, line: Line, text: string = line.body): HTMLElement {
  return h(tag, { class: cls, 'data-r': line.r }, text);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 16;
const INK = '#14161b';
const TAILLESS: ReadonlySet<BubbleShape> = new Set(['box', 'cut', 'shout']);

/**
 * Text lives in normal DOM (.bt); the outline is an SVG (.bo) behind it, drawn later by fitBubbles once the
 * text box has a size. Tests count data-r, so the SVG must never carry text.
 */
export function bubble(line: Line, side: Side, shape: BubbleShape, extra = '', text: string = line.body): HTMLElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'bo');
  svg.setAttribute('aria-hidden', 'true');
  return h('div', {
    class: `bb bb-${shape} ${side}${extra}`, 'data-r': line.r, 'data-seed': line.r,
    'data-tail': TAILLESS.has(shape) ? 'none' : side, 'data-who': line.who ? speakerKey(line.who) : null,
  }, svg, h('span', { class: 'bt' }, text));
}

export interface FitOpts { stroke?: string; roundRadius?: number }

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Panels whose figure stands beside the bubbles, not under them: their tails keep the fixed side. */
const BESIDE = '.closeup, .beat';

/**
 * The speaker's figure in the same panel (or the same inset), as a point near its head in the bubble's SVG canvas
 * coordinates, so the tail tells who is talking when a panel shows several people. Undefined without one.
 */
function aimOf(bb: HTMLElement): Aim | undefined {
  const who = bb.dataset.who;
  if (!who || bb.dataset.tail === 'none' || bb.closest(BESIDE)) return undefined;
  const inset = bb.closest('.inset'), box = inset ?? bb.closest('.pn');
  if (!box) return undefined;
  const fig = [...box.querySelectorAll<HTMLElement>('.cc')].find(c => c.dataset.who === who && c.closest('.inset') === inset);
  if (!fig) return undefined;
  const b = bb.getBoundingClientRect(), f = fig.getBoundingClientRect();
  if (!b.width || !f.width) return undefined;
  // Frames are drawn 3px outside their boxes (bubbleSvg frame()): this frame ends at b.bottom + 3 and the next
  // stacked one starts at next.top - 3; 2px more keeps the tip clear of that outline's stroke.
  const next = bb.nextElementSibling?.classList.contains('bb') ? bb.nextElementSibling.getBoundingClientRect() : null;
  const room = next && next.height ? Math.max(0, next.top - 3 - (b.bottom + 3) - 2) : undefined;
  return { x: round1(f.left + f.width / 2 - b.left + PAD), y: round1(f.top + f.height * 0.2 - b.top + PAD), room };
}

/** (Re)draws every bubble outline under `root` from its current layout size; zero-size bubbles are skipped. */
export function fitBubbles(root: ParentNode, opts: FitOpts = {}): void {
  for (const bb of root.querySelectorAll<HTMLElement>('.bb')) {
    const svg = bb.querySelector<SVGSVGElement>('svg.bo');
    if (!svg) continue;
    // offset* is the untransformed layout size: the impact entry animation scales bubbles while they scroll in,
    // and getBoundingClientRect would report the shrunken box. jsdom has no layout, so fall back to the rect.
    const rect = bb.getBoundingClientRect();
    const width = bb.offsetWidth || rect.width, height = bb.offsetHeight || rect.height;
    if (!width || !height) continue;
    const w = round1(width), hgt = round1(height);
    svg.setAttribute('viewBox', `0 0 ${round1(w + 2 * PAD)} ${round1(hgt + 2 * PAD)}`);
    svg.setAttribute('width', String(round1(w + 2 * PAD)));
    svg.setAttribute('height', String(round1(hgt + 2 * PAD)));
    svg.style.left = svg.style.top = `-${PAD}px`;
    const shape = ([...bb.classList].find(c => c.startsWith('bb-'))?.slice(3) ?? 'round') as BubbleShape;
    drawBubble(svg, shape, (bb.dataset.tail ?? 'none') as Tail, { w, h: hgt, pad: PAD }, {
      seed: Number(bb.dataset.seed ?? 0), stroke: opts.stroke ?? INK, radius: opts.roundRadius ?? 18,
      double: bb.classList.contains('huge'), aim: aimOf(bb),
    });
  }
}
