import type { UnitFlavor } from '../render/comic/flavor';
import { UNITS } from './catalog';

// Easter-egg styling per unit (spec: 團體彩蛋). Mixed events and VIRTUAL SINGER get none.
const FLAVORS: Record<string, Omit<UnitFlavor, 'accent'>> = {
  light_sound: { glyph: '✦', roundRadius: 18, monoShape: 'cloud' },
  idol: { glyph: '♡', roundRadius: 18, monoShape: 'cloud' },
  street: { glyph: '▲', roundRadius: 6, monoShape: 'cloud' },
  theme_park: { glyph: '★', roundRadius: 18, monoShape: 'cloud' },
  school_refusal: { glyph: '☾', roundRadius: 18, monoShape: 'whisper' },
};

export function unitFlavor(unit: string | undefined): UnitFlavor | null {
  const f = unit ? FLAVORS[unit] : undefined;
  return f && UNITS[unit!] ? { accent: UNITS[unit!][1], ...f } : null;
}
