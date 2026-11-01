import index from '../../data/tc-event-index.json';

export interface CharacterInfo { id: number; first: string; given: string; unit: string; color: string }

export const SIDE_COLOR = '#7b8496';

const byName = new Map<string, CharacterInfo>();
for (const c of index.chars as CharacterInfo[]) {
  byName.set(c.given, c);
  if (c.first) byName.set(c.first + c.given, c);
}

export function resolveCharacter(name: string): CharacterInfo | null {
  return byName.get(name.trim()) ?? null;
}

export function inkFor(hex: string): '#1b2130' | '#ffffff' {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#1b2130' : '#ffffff';
}
