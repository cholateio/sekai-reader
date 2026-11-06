import { expect, test } from 'vitest';
import { boxNo, charById, charsOf, EVENTS, eventLabel, neighbours } from '../src/app/catalog';

const e184 = EVENTS.find(e => e.id === 184)!;
const banner = e184.chars![0];
const sameBanner = EVENTS.filter(e => e.unit === charById.get(banner)!.unit && e.type !== 'world_bloom' && e.chars?.[0] === banner)
  .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

test('boxNo：看板角色在同團活動裡的第幾次；混活、World Link、缺 chars 為 null', () => {
  expect(boxNo(sameBanner[0])).toBe(1);
  expect(boxNo(e184)).toBe(sameBanner.findIndex(e => e.id === 184) + 1);
  expect(boxNo(EVENTS.find(e => e.unit === 'none')!)).toBeNull();
  expect(boxNo(EVENTS.find(e => e.type === 'world_bloom')!)).toBeNull();
  expect(boxNo({ ...e184, chars: undefined })).toBeNull();
  expect(boxNo(EVENTS.find(e => e.id === 172)!)).toBeNull(); // 繪名 headlining a WxS event: guest, not a box
});
test('eventLabel：繪名N箱、混活、World Link、缺 chars 退回團體短名', () => {
  expect(eventLabel(e184)).toBe(`繪名${boxNo(e184)}箱`);
  expect(eventLabel({ ...e184, unit: 'none' })).toBe('混活');
  expect(eventLabel({ ...e184, type: 'world_bloom' })).toBe('World Link');
  expect(eventLabel({ ...e184, chars: undefined })).toBe('25時');
  expect(eventLabel(EVENTS.find(e => e.id === 172)!)).toBe('WxS');
});
test('charsOf 缺欄回空、未知 id 略過', () => {
  expect(charsOf({ ...e184, chars: undefined })).toEqual([]);
  expect(charsOf({ ...e184, chars: [1, 999] }).map(c => c.given)).toEqual(['一歌']);
});
test('neighbours 依索引位置，id 不連續也正確', () => {
  const j = EVENTS.findIndex(e => e.id === 165);
  expect(neighbours(165)).toEqual({ prev: EVENTS[j + 1], next: EVENTS[j - 1] });
  expect(neighbours(165).next!.id).toBe(167);
  expect(neighbours(EVENTS[0].id).next).toBeNull();
  expect(neighbours(99999)).toEqual({ prev: null, next: null });
});
