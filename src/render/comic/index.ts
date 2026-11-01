import type { CharacterArt } from '../../art/CharacterArt';
import type { Episode } from '../../scenario/types';
import type { Cam, Panel, Storyboard } from '../../storyboard/types';
import { h } from '../dom';
import { fitBubbles, speakerSide, type FitOpts } from './bubbles';
import { backgroundLayer, camFor, panelBg } from './background';
import type { UnitFlavor } from './flavor';
import { applyEdges } from './layout';
import { buildPanel, type PanelCtx } from './panels';
import './comic.css';

export interface ComicOptions { bgUrl: (id: string) => string | null; unit?: UnitFlavor | null }

export function renderComic(ep: Episode, board: Storyboard, art: CharacterArt, opts: ComicOptions): HTMLElement {
  const out = h('div', { class: 'comic' },
    h('div', { class: 'credit' },
      h('span', {}, board.meta.director === 'ai' ? 'AI 導演分鏡' : '自動分鏡（規則產生）'),
      h('span', {}, `${board.panels.length} 格`)));
  const ctx: PanelCtx = {
    ep, art, lines: new Map(ep.lines.map(l => [l.r, l])), sides: speakerSide(),
    decorate: () => {},
    flavor: opts.unit ?? null,
  };
  if (opts.unit) {
    out.classList.add('has-unit');
    out.style.setProperty('--unit', opts.unit.accent);
  }
  let rows = 0;
  let afterTrans = false;
  let lastBg: string | null = ep.firstBg;
  let shot = 0;
  for (const p of board.panels) {
    if (p.t === 'trans') ctx.sides.reset();
    const sceneStart = p.t === 'est' && rows > 0 && !afterTrans;
    if (sceneStart) ctx.sides.reset();
    if (p.t === 'est') shot = 0;
    const bgId = panelBg(p, ep, lastBg);
    lastBg = bgId ?? lastBg;
    const url = bgId ? opts.bgUrl(bgId) : null;
    const cam = camFor(p, shot);
    ctx.decorate = (el, _p, part) => decorate(el, url, part === undefined ? cam : splitCam(part, p.cam), p, part !== undefined);
    const el = buildPanel(p, ctx);
    if (opts.unit && GLYPH_PANELS.has(p.t)) el.append(h('span', { class: 'glyph', 'aria-hidden': 'true' }, opts.unit.glyph));
    el.dataset.edge = String(p.edge ?? 0);
    if (sceneStart) el.classList.add('scene-start');
    out.append(el);
    rows++;
    shot++;
    afterTrans = p.t === 'trans';
  }
  applyEdges(out);
  watchBubbles(out, opts.unit ? { roundRadius: opts.unit.roundRadius } : {});
  return out;
}

// Bubble outlines need real layout sizes, which only exist once the comic is mounted; remember each
// comic's options so later refits (font load, width change, Aa size change) redraw the same way.
const fitOptions = new WeakMap<HTMLElement, FitOpts>();

function watchBubbles(root: HTMLElement, opts: FitOpts): void {
  fitOptions.set(root, opts);
  fitBubbles(root, opts);
  document.fonts?.ready.then(() => fitBubbles(root, opts)).catch(() => {});
  if (typeof ResizeObserver !== 'undefined') {
    let lastWidth = -1;
    new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w !== lastWidth) { lastWidth = w; fitBubbles(root, opts); }
    }).observe(root);
  }
}

/** Redraws bubble outlines of every rendered comic under `scope`, e.g. after the reader font size changes. */
export function refitComics(scope: ParentNode): void {
  for (const root of scope.querySelectorAll<HTMLElement>('.comic')) fitBubbles(root, fitOptions.get(root) ?? {});
}

const GLYPH_PANELS = new Set(['est', 'shout', 'impact']);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
// part 0/1 = left/right half of split and pair panels; part 2 = the small inset frame.
const splitCam = (part: number, cam?: Cam): Cam => part === 2
  ? { focus: cam?.focus ?? [0.75, 0.6], zoom: 2, blur: 2 }
  : cam
    ? { ...cam, focus: [clamp01(cam.focus[0] + (part ? 0.25 : -0.25)), cam.focus[1]] }
    : { focus: [part ? 0.78 : 0.22, 0.6], zoom: 1.6, blur: 2 };

// Full-panel effect layers per panel type (spec: 加重表現); they sit between the background and the content.
const FX_LAYER: Partial<Record<Panel['t'], string>> = {
  pop: 'fx-speed', impact: 'fx-focus', reveal: 'fx-flash', shout: 'fx-flash', mono: 'fx-wash',
};

/** Sub-frames (split/pair halves, the inset) get the background and tone, but not the panel-type effect layer. */
function decorate(el: HTMLElement, url: string | null, cam: Cam | null, p: Panel, sub: boolean): void {
  const layers: HTMLElement[] = [];
  if (url && cam) {
    el.classList.add('has-bg');
    const bgl = backgroundLayer(url, cam);
    if (p.t === 'impact' && !sub) bgl.classList.add('dark');
    layers.push(bgl);
    if (el.classList.contains('closeup') || el.classList.contains('pop')) layers.push(h('div', { class: 'tint', 'aria-hidden': 'true' }));
  } else if (p.t !== 'impact' || sub) {
    el.classList.add('paper');
  }
  const fx = !sub && FX_LAYER[p.t];
  if (fx) layers.push(h('div', { class: `fxl ${fx}`, 'aria-hidden': 'true' }));
  if (p.tone === 'serious') layers.push(h('div', { class: 'fxl fx-vignette', 'aria-hidden': 'true' }));
  el.prepend(...layers);
}
