/** Per-unit easter-egg styling; null means no decoration (mixed events, VIRTUAL SINGER, unknown). */
export interface UnitFlavor {
  accent: string;
  glyph: string;
  roundRadius: number;
  monoShape: 'cloud' | 'whisper';
}
