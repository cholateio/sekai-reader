import { expect, test } from 'vitest';
import { boxNo, charsOf, EVENTS, eventLabel, neighbours, UNIT_SHORT } from '../src/app/catalog';

const ln = EVENTS.filter(e => e.unit === 'light_sound').sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
const ln0 = ln[0];

test('boxNo 依同團日期升冪從 1 起、混活為 null', () => {
  expect(boxNo(ln0)).toBe(1);
  expect(boxNo(ln[ln.length - 1])).toBe(ln.length);
  expect(boxNo(EVENTS.find(e => e.unit === 'none')!)).toBeNull();
});
test('eventLabel：箱活、混活、World Link', () => {
  expect(eventLabel(ln0)).toBe('Leo/need 第1箱');
  expect(eventLabel({ ...ln0, unit: 'street', type: 'marathon' })).toMatch(/^VBS 第\d+箱$/);
  expect(eventLabel({ ...ln0, unit: 'none', type: 'marathon' })).toBe('混活');
  expect(eventLabel({ ...ln0, unit: 'none', type: 'world_bloom' })).toBe('World Link');
  expect(UNIT_SHORT.school_refusal).toBe('25時');
});
test('charsOf 缺欄回空、未知 id 略過', () => {
  expect(charsOf({ ...ln0, chars: undefined })).toEqual([]);
  expect(charsOf({ ...ln0, chars: [1, 999] }).map(c => c.given)).toEqual(['一歌']);
});
test('neighbours 依索引位置，id 不連續也正確', () => {
  const j = EVENTS.findIndex(e => e.id === 165);
  expect(neighbours(165)).toEqual({ prev: EVENTS[j + 1], next: EVENTS[j - 1] });
  expect(neighbours(165).next!.id).toBe(167);
  expect(neighbours(EVENTS[0].id).next).toBeNull();
  expect(neighbours(99999)).toEqual({ prev: null, next: null });
});
