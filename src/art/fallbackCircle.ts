import { inkFor } from '../data/characters';
import { h } from '../render/dom';
import type { ArtSize } from './CharacterArt';

export function fallbackCircle(name: string, color: string, size: ArtSize): HTMLElement {
  const len = [...name].length;
  const cls = 'circle' + (len >= 5 ? ' long xlong' : len >= 3 ? ' long' : '');
  return h('span', { class: `cc cc-${size}` },
    h('i', { class: cls, style: `background:${color};color:${inkFor(color)}` }, name));
}
