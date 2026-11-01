import { resolveCharacter, SIDE_COLOR } from '../data/characters';
import { h } from '../render/dom';
import type { ArtRequest, ArtSize, CharacterArt } from './CharacterArt';
import { fallbackCircle } from './fallbackCircle';

export class StaticChibiArt implements CharacterArt {
  private readonly available: Set<number> | null;

  /** available: character ids that have an image (from manifest.json); omitted = assume all main characters do. */
  constructor(private readonly sdBaseUrl: string, available?: number[]) {
    this.available = available ? new Set(available) : null;
  }

  render(req: ArtRequest, size: ArtSize): HTMLElement {
    const c = resolveCharacter(req.name);
    if (!c) return fallbackCircle(req.name, SIDE_COLOR, size);
    if (this.available && !this.available.has(c.id)) return fallbackCircle(req.name, c.color, size);
    const src = `${this.sdBaseUrl}/chr_sd_${String(c.id).padStart(2, '0')}_01.webp`;
    const wrap = h('span', { class: `cc cc-${size}` });
    // Intrinsic size of chr_sd_*_01.webp; reserves the box so panels do not grow when images arrive.
    const img = h('img', { class: 'sd', src, alt: req.name, decoding: 'async', width: 160, height: 136 });
    img.addEventListener('error', () => wrap.replaceChildren(...fallbackCircle(req.name, c.color, size).childNodes), { once: true });
    wrap.append(img);
    return wrap;
  }
}
