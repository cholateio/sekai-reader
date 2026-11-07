import { expect, test } from 'vitest';
import { boxNo, charById, charsOf, EVENTS, eventLabel, eventShort, neighbours } from '../src/app/catalog';

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
test('早期箱活（主資料 unit 為 none）也算箱：第 1 期是咲希1箱', () => {
  const e1 = EVENTS.find(e => e.id === 1)!;
  expect(e1.unit).toBe('light_sound');
  expect(boxNo(e1)).toBe(1);
  expect(eventLabel(e1)).toBe('咲希1箱');
  expect(EVENTS.find(e => e.id === 4)!.unit).toBe('none'); // five units: still mixed
});
test('eventShort：箱活只給「繪名5箱」，其他帶期數', () => {
  expect(eventShort(e184)).toBe(eventLabel(e184));
  expect(eventShort({ ...e184, unit: 'none' })).toBe('混活 #184');
  expect(eventShort(EVENTS.find(e => e.id === 172)!)).toBe('WxS #172');
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
test('neighbours：箱活接同團的上一場／下一場箱活，依日期', () => {
  expect(neighbours(2).prev).toBeNull();          // 真冬1箱: first 25時 box
  expect(neighbours(2).next!.id).toBe(14);        // 繪名1箱
  expect(neighbours(14).prev!.id).toBe(2);
  expect(neighbours(165).next!.id).toBe(177);     // skips mixed / other units / World Link in between
  expect(neighbours(165).prev!.id).toBe(161);
  const last = EVENTS.filter(e => e.unit === 'school_refusal' && boxNo(e) != null)[0];
  expect(neighbours(last.id).next).toBeNull();
});
test('neighbours：混活、World Link 等非箱活依索引位置，id 不連續也正確', () => {
  const j = EVENTS.findIndex(e => e.id === 167);
  expect(boxNo(EVENTS[j])).toBeNull();
  expect(neighbours(167)).toEqual({ prev: EVENTS[j + 1], next: EVENTS[j - 1] });
  expect(neighbours(167).prev!.id).toBe(165);
  expect(neighbours(EVENTS[0].id).next).toBeNull();
  expect(neighbours(99999)).toEqual({ prev: null, next: null });
});
