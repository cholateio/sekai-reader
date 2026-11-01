import { resolveCharacter } from '../../data/characters';
import type { Line } from '../../scenario/types';
import { isThought } from '../../scenario/text';
import { h } from '../dom';

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

export function bubble(line: Line, side: string, extra = ''): HTMLElement {
  return lineEl('div', `bb ${side}${isThought(line.body) ? ' thought' : ''}${line.phone ? ' phone' : ''}${extra}`, line);
}
