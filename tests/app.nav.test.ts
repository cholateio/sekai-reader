import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { startApp } from '../src/app/router';
import { pushRecent, recentList, type RecentItem } from '../src/app/recent';
import { prefs } from '../src/app/storage';
import { navLink, siteHeader } from '../src/app/views/common';

const mount = (nodes: HTMLElement[]) => { document.body.replaceChildren(...nodes); return document.body; };
const drawer = () => document.querySelector('.drawer') as HTMLElement;
const open = () => (document.querySelector('.menu') as HTMLElement).click();

beforeEach(() => { localStorage.clear(); document.body.className = ''; history.replaceState(null, '', '/'); });
afterEach(() => vi.unstubAllGlobals());

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

import { EVENTS, neighbours } from '../src/app/catalog';
import { viewEvent } from '../src/app/views/event';
import { viewReader } from '../src/app/views/reader';
import { syntheticBoard, syntheticEpisode } from './helpers';

test('活動頁：繼續閱讀指向最後有進度且未讀完的話，上一期／下一期與話數都是連結', () => {
  prefs.set('pos:event_173_02', 0.4); prefs.set('pos:event_173_01', 0.99);
  const root = mount(viewEvent(173, { bg: [], sd: [], episodes: ['event_173_01', 'event_173_02'] }));
  expect(root.querySelector('a.continue')!.getAttribute('href')).toBe('#read-173-2');
  expect(root.querySelector('a.continue')!.textContent).toContain('繼續閱讀 第 2 話');
  const i = EVENTS.findIndex(e => e.id === 173);
  expect(root.querySelector(`.evnav a[href="#event-${EVENTS[i + 1].id}"]`)).not.toBeNull();
  expect(root.querySelector(`.evnav a[href="#event-${EVENTS[i - 1].id}"]`)).not.toBeNull();
  expect(root.querySelector('a.ep[href="#read-173-1"]')).not.toBeNull();
  expect(root.querySelector('a.ep[href="#read-173-1"] a')).toBeNull();
  expect(root.querySelector('a.ep[href="#read-173-3"]')).toBeNull();
  expect(root.querySelectorAll('.ep').length).toBe(8);
  expect(root.querySelector('.evhead .cast')).not.toBeNull();
  expect(root.querySelector('.evhead')!.textContent).toContain('可讀 2/8');
  expect(root.querySelector('.site-header .page-title')!.textContent).toMatch(/第 173 期 · .+ · 馬拉松|World Link/);
  expect(drawer().querySelector(`a[href="#event-${EVENTS[i + 1].id}"]`)!.textContent).toContain('上一期');
  expect(neighbours(165).next!.id).toBe(167);
});
test('活動頁：沒進度時從第 1 話開始；沒可讀話數就沒有按鈕', () => {
  let root = mount(viewEvent(173, { bg: [], sd: [], episodes: ['event_173_01'] }));
  expect(root.querySelector('a.continue')!.getAttribute('href')).toBe('#read-173-1');
  expect(root.querySelector('a.continue')!.textContent).toContain('從第 1 話開始');
  root = mount(viewEvent(173, { bg: [], sd: [], episodes: [] }));
  expect(root.querySelector('a.continue')).toBeNull();
});
test('閱讀頁側邊欄有上一話／下一話，結尾卡片是連結', () => {
  const ep = syntheticEpisode();
  const ctx = { title: '第 1 話 測試', sub: '測試活動', back: '#event-1', manifest: { bg: [], sd: [], episodes: [ep.sid] } };
  mount(viewReader(ep, syntheticBoard(), { ...ctx, prev: { title: 'p', href: '#read-1-1' }, next: { title: 'n', href: null } }));
  expect(drawer().querySelector('a[href="#read-1-1"]')!.textContent).toContain('上一話');
  expect(drawer().querySelector('.drawer-item.na')!.textContent).toContain('下一話');
  expect(drawer().querySelector('a[href="#event-1"]')!.textContent).toContain('這期的話數列表');
  expect(document.querySelector('.end a.ghost[href="#event-1"]')).not.toBeNull();
  mount(viewReader(ep, syntheticBoard(), { ...ctx, prev: null, next: { title: 'n', href: '#read-1-3' } }));
  expect(document.querySelector('.end a.primary[href="#read-1-3"]')).not.toBeNull();
  expect(drawer().textContent).not.toContain('上一話');
});

test('被取代的閱讀頁載入不寫入最近閱讀', async () => {
  let resolveEp!: (r: Response) => void;
  vi.stubGlobal('fetch', vi.fn((u: string) => u === '/manifest.json'
    ? Promise.resolve(Response.json({ bg: [], sd: [], episodes: ['event_173_01'] }))
    : new Promise<Response>(r => { resolveEp = r; })));
  history.replaceState(null, '', '#read-173-1');
  const app = document.createElement('div');
  const started = startApp(app);
  await new Promise(r => setTimeout(r, 0));
  history.replaceState(null, '', '#library');
  dispatchEvent(new HashChangeEvent('hashchange'));
  resolveEp(Response.json(syntheticEpisode()));
  await started;
  await new Promise(r => setTimeout(r, 0));
  expect(recentList()).toEqual([]);
  expect(app.querySelector('.list')).not.toBeNull();
});
