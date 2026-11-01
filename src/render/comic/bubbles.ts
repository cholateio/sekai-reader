import { resolveCharacter } from '../../data/characters';
import type { Line } from '../../scenario/types';
import type { BubbleShape } from '../../storyboard/types';
import { h } from '../dom';
import { drawBubble, type Tail } from './bubbleSvg';

export type Side = 'l' | 'r' | 'c';

export function speakerSide(): { side(name: string): Side; reset(): void } {
  let sides = new Map<string, Side>();
  let next = 0;
  return {
    side(name: string): Side {
      if (!name) return 'c';
      const key = String(resolveCharacter(name)?.id ?? name);
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
const TAILLESS: ReadonlySet<BubbleShape> = new Set(['box', 'cut']);

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
    'data-tail': TAILLESS.has(shape) ? 'none' : side,
  }, svg, h('span', { class: 'bt' }, text));
}

export interface FitOpts { stroke?: string; roundRadius?: number }

const round1 = (v: number) => Math.round(v * 10) / 10;

/** (Re)draws every bubble outline under `root` from its current layout size; zero-size bubbles are skipped. */
export function fitBubbles(root: ParentNode, opts: FitOpts = {}): void {
  for (const bb of root.querySelectorAll<HTMLElement>('.bb')) {
    const svg = bb.querySelector<SVGSVGElement>('svg.bo');
    if (!svg) continue;
    const { width, height } = bb.getBoundingClientRect();
    if (!width || !height) continue;
    const w = round1(width), hgt = round1(height);
    svg.setAttribute('viewBox', `0 0 ${round1(w + 2 * PAD)} ${round1(hgt + 2 * PAD)}`);
    svg.setAttribute('width', String(round1(w + 2 * PAD)));
    svg.setAttribute('height', String(round1(hgt + 2 * PAD)));
    svg.style.left = svg.style.top = `-${PAD}px`;
    const shape = ([...bb.classList].find(c => c.startsWith('bb-'))?.slice(3) ?? 'round') as BubbleShape;
    drawBubble(svg, shape, (bb.dataset.tail ?? 'none') as Tail, { w, h: hgt, pad: PAD }, {
      seed: Number(bb.dataset.seed ?? 0), stroke: opts.stroke ?? INK, radius: opts.roundRadius ?? 18,
      double: bb.classList.contains('huge'),
    });
  }
}
