import { beforeEach, expect, test } from 'vitest';
import { pushRecent, recentList, type RecentItem } from '../src/app/recent';
import { prefs } from '../src/app/storage';
import { navLink, siteHeader } from '../src/app/views/common';

const mount = (nodes: HTMLElement[]) => { document.body.replaceChildren(...nodes); return document.body; };
const drawer = () => document.querySelector('.drawer') as HTMLElement;
const open = () => (document.querySelector('.menu') as HTMLElement).click();

beforeEach(() => { localStorage.clear(); document.body.className = ''; });

test('pushRecent 去重置頂最多 5；recentList 跳過索引沒有的話', () => {
  for (const n of [1, 2, 3, 4, 5, 6]) pushRecent({ sid: `event_173_0${n}`, id: 173, no: n, title: `t${n}` });
  pushRecent({ sid: 'event_173_02', id: 173, no: 2, title: 't2' });
  pushRecent({ sid: 'event_1_09', id: 1, no: 9, title: 'gone' });
  expect(prefs.get('recent', [] as RecentItem[]).length).toBe(5);
  expect(recentList().map(r => r.sid)).toEqual(['event_173_02', 'event_173_06', 'event_173_05']);
});
test('recentList 容忍壞掉的儲存值', () => {
  localStorage.setItem('sekai-reader:recent', '{"x":1}');
  expect(recentList()).toEqual([]);
  pushRecent({ sid: 'event_173_01', id: 173, no: 1, title: 'a' });
  expect(recentList().length).toBe(1);
});
test('側邊欄：最近閱讀與團體捷徑是連結，無紀錄時不顯示最近閱讀', () => {
  mount(siteHeader({ title: 'x' }));
  expect(drawer().textContent).not.toContain('最近閱讀');
  expect(drawer().querySelectorAll('a.chip[href^="#library?unit="]').length).toBe(5);
  pushRecent({ sid: 'event_173_01', id: 173, no: 1, title: '令人開心的消息' });
  prefs.set('pos:event_173_01', 0.4);
  mount(siteHeader({ title: 'x' }));
  open();
  expect(drawer().hidden).toBe(false);
  const a = drawer().querySelector('a[href="#read-173-1"]')!;
  expect(a.textContent).toContain('第 173 期 第 1 話');
  expect(a.textContent).toContain('40%');
  a.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(drawer().hidden).toBe(true);
});
test('側邊欄段落順序：本頁導覽 → 活動目錄 → 最近閱讀 → 團體 → 設定', () => {
  pushRecent({ sid: 'event_173_01', id: 173, no: 1, title: 'a' });
  mount(siteHeader({ title: 'x', items: [navLink('#event-173', '這期的話數列表')], settings: [document.createElement('button')] }));
  const kids = [...drawer().children];
  const at = (sel: string) => kids.findIndex(k => k.matches(sel) || !!k.querySelector(sel));
  expect(at('a[href="#event-173"]')).toBeLessThan(at('a[href="#library"]'));
  expect(at('a[href="#library"]')).toBeLessThan(at('a[href="#read-173-1"]'));
  expect(at('a[href="#read-173-1"]')).toBeLessThan(at('a.chip[href^="#library?unit="]'));
  expect(at('a.chip[href^="#library?unit="]')).toBeLessThan(at('hr.drawer-sep'));
});
