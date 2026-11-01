import type { Episode } from '../../scenario/types';
import type { Cam, Panel } from '../../storyboard/types';
import { h } from '../dom';

const FOCI: [number, number][] = [[0.32, 0.62], [0.7, 0.58], [0.5, 0.48], [0.18, 0.7], [0.82, 0.66], [0.45, 0.75]];

/** shot = index of the panel since the last establishing shot; drives the default camera drift. */
export function camFor(p: Panel, shot: number): Cam | null {
  if (p.cam) return p.cam;
  const f = FOCI[shot % FOCI.length];
  switch (p.t) {
    case 'est': return { focus: [0.5, 0.5], zoom: 1 };
    case 'close': return { focus: f, zoom: 1.9, blur: 3 };
    case 'mono': return { focus: f, zoom: 1.6, blur: 4 };
    case 'pop': return { focus: f, zoom: 1.5, blur: 1.5 };
    case 'reveal': return { focus: [0.5, 0.4], zoom: 1.15, blur: 2 };
    case 'insert': return { focus: f, zoom: 1.4, blur: 5 };
    case 'impact': return { focus: [0.5, 0.5], zoom: 1.2 };
    case 'beat': return { focus: f, zoom: 1.3, blur: 2 };
    case 'shout': return { focus: [0.5, 0.5], zoom: 1.3, blur: 1 };
    default: return { focus: f, zoom: Math.round((1.2 + (shot % 3) * 0.12) * 100) / 100 };
  }
}

export function backgroundLayer(url: string, cam: Cam): HTMLElement {
  const pos = `${cam.focus[0] * 100}% ${cam.focus[1] * 100}%`;
  const el = h('div', { class: 'bgl', 'aria-hidden': 'true' });
  el.style.backgroundImage = `url("${url}")`;
  el.style.backgroundPosition = pos;
  el.style.transform = `scale(${cam.zoom})`;
  el.style.transformOrigin = pos;
  // Blur goes through a custom property so the stylesheet can compose it with grayscale (black-and-white mode).
  if (cam.blur) el.style.setProperty('--blur', `${cam.blur}px`);
  return el;
}

export function panelBg(p: Panel, ep: Episode, last: string | null): string | null {
  if (p.bg) return p.bg;
  const first = p.l?.length ? ep.lines.find(l => l.r === p.l![0]) : undefined;
  if (first?.bg) return first.bg;
  const cap = p.caps?.length ? ep.scenes[p.caps[0]] : undefined;
  if (cap?.bg) return cap.bg;
  return last;
}
