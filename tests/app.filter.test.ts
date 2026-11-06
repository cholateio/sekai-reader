import { expect, test } from 'vitest';
import type { EventInfo } from '../src/app/catalog';
import { EMPTY_QUERY, filterEvents, isFiltered, parseQuery, toHash } from '../src/app/filter';

test('parseQuery 不認得的值回預設', () => {
  expect(parseQuery('unit=piapro&char=abc&type=x&q=')).toEqual(EMPTY_QUERY);
  expect(parseQuery('char=999')).toEqual(EMPTY_QUERY);
  expect(parseQuery('char=17').char).toBe(17);
  expect(parseQuery('')).toEqual(EMPTY_QUERY);
});
test('toHash 只帶非預設鍵，來回不變', () => {
  const qy = { q: 'a&b %', unit: 'street', char: 12, type: 'marathon' };
  expect(toHash(qy)).toBe('library?unit=street&char=12&type=marathon&q=a%26b%20%25');
  expect(parseQuery(toHash(qy).slice('library?'.length))).toEqual(qy);
  expect(toHash(EMPTY_QUERY)).toBe('library');
  expect(isFiltered(EMPTY_QUERY)).toBe(false);
  expect(isFiltered({ ...EMPTY_QUERY, q: ' ' })).toBe(false);
  expect(isFiltered({ ...EMPTY_QUERY, type: 'marathon' })).toBe(true);
});
test('filterEvents：角色 AND 團體 AND 類型；搜尋角色名與團體短名', () => {
  const evs: EventInfo[] = [
    { id: 1, name: 'A', unit: 'light_sound', type: 'marathon', date: '2024-01-01', bundle: 'a', eps: [[1, 'x', 'e1']], chars: [1, 2] },
    { id: 2, name: 'B', unit: 'none', type: 'world_bloom', date: '2024-02-01', bundle: 'b', eps: [[1, 'y', 'e2']], chars: [1] },
    { id: 3, name: 'C', unit: 'street', type: 'marathon', date: '2024-03-01', bundle: 'c', eps: [[1, 'Zed', 'e3']] },
  ];
  const ids = (qy: Partial<typeof EMPTY_QUERY>) => filterEvents(evs, { ...EMPTY_QUERY, ...qy }).map(e => e.id);
  expect(ids({ char: 1 })).toEqual([1, 2]);
  expect(ids({ char: 1, unit: 'none' })).toEqual([2]);
  expect(ids({ type: 'marathon' })).toEqual([1, 3]);
  expect(ids({ q: '咲希' })).toEqual([1]);
  expect(ids({ q: '天馬咲希' })).toEqual([1]);
  expect(ids({ q: 'vbs' })).toEqual([3]);
  expect(ids({ q: 'zed' })).toEqual([3]);
  expect(ids({ q: '2' })).toEqual([2]);
  expect(ids({ q: '  ' })).toEqual([1, 2, 3]);
});
