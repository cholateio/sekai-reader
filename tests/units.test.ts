import { expect, test } from 'vitest';
import { unitFlavor } from '../src/app/units';
import { UNITS } from '../src/app/catalog';

test('五個團體有點綴，其餘沒有', () => {
  expect(unitFlavor('light_sound')).toMatchObject({ accent: '#4455dd', glyph: '✦' });
  expect(unitFlavor('street')!.roundRadius).toBe(6);
  expect(unitFlavor('school_refusal')!.monoShape).toBe('whisper');
  for (const u of ['none', 'piapro', undefined, 'x']) expect(unitFlavor(u)).toBeNull();
});
test('團體色與目錄的 UNITS 一致', () => {
  for (const u of ['light_sound', 'idol', 'street', 'theme_park', 'school_refusal']) expect(unitFlavor(u)!.accent).toBe(UNITS[u][1]);
});
