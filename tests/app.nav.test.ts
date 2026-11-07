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
test('側邊欄：最近閱讀是連結、用「繪名5箱 第 N 話」不用標題，無紀錄時不顯示；沒有團體捷徑', () => {
  mount(siteHeader({ title: 'x' }));
  expect(drawer().textContent).not.toContain('最近閱讀');
  expect(drawer().textContent).not.toContain('團體');
  expect(drawer().querySelector('a[href^="#library?unit="]')).toBeNull();
  pushRecent({ sid: 'event_173_01', id: 173, no: 1, title: '令人開心的消息' });
  prefs.set('pos:event_173_01', 0.4);
  mount(siteHeader({ title: 'x' }));
  open();
  expect(drawer().hidden).toBe(false);
  const a = drawer().querySelector('a[href="#read-173-1"]')!;
  expect(a.textContent).toContain(`${eventShort(EVENTS.find(e => e.id === 173)!)} 第 1 話`);
  expect(a.textContent).toMatch(/\d箱 第 1 話/);
  expect(a.textContent).not.toContain('令人開心的消息');
  expect(a.textContent).not.toContain('第 173 期');
  expect(a.textContent).toContain('40%');
  a.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(drawer().hidden).toBe(true);
});
test('側邊欄段落順序：首頁 → 本頁導覽 → 最近閱讀 → 設定', () => {
  pushRecent({ sid: 'event_173_01', id: 173, no: 1, title: 'a' });
  mount(siteHeader({ title: 'x', items: [navLink('#event-173', '這期的話數列表')], settings: [document.createElement('button')] }));
  const kids = [...drawer().children];
  const at = (sel: string) => kids.findIndex(k => k.matches(sel) || !!k.querySelector(sel));
  expect(drawer().querySelector('a[href="#library"]')!.textContent).toBe('首頁');
  expect(drawer().textContent).not.toContain('活動目錄');
  expect(at('.drawer-head')).toBeLessThan(at('a[href="#library"]'));
  expect(at('a[href="#library"]')).toBeLessThan(at('a[href="#event-173"]'));
  expect(at('a[href="#event-173"]')).toBeLessThan(at('a[href="#read-173-1"]'));
  expect(at('a[href="#read-173-1"]')).toBeLessThan(at('hr.drawer-sep'));
});

import { EVENTS, eventLabel, eventShort, neighbours } from '../src/app/catalog';
import { viewEvent } from '../src/app/views/event';
import { viewReader } from '../src/app/views/reader';
import { syntheticBoard, syntheticEpisode } from './helpers';

test('活動頁：繼續閱讀指向最後有進度且未讀完的話，上一期／下一期與話數都是連結', () => {
  prefs.set('pos:event_173_02', 0.4); prefs.set('pos:event_173_01', 0.99);
  const root = mount(viewEvent(173, { bg: [], sd: [], episodes: ['event_173_01', 'event_173_02'] }));
  expect(root.querySelector('a.continue')!.getAttribute('href')).toBe('#read-173-2');
  expect(root.querySelector('a.continue')!.textContent).toContain('繼續閱讀 第 2 話');
  const { prev: p173, next: n173 } = neighbours(173);
  expect(root.querySelector(`.evnav a[href="#event-${p173!.id}"]`)).not.toBeNull();
  expect(root.querySelector(`.evnav a[href="#event-${n173!.id}"]`)).not.toBeNull();
  expect(root.querySelector('a.ep[href="#read-173-1"]')).not.toBeNull();
  expect(root.querySelector('a.ep[href="#read-173-1"] a')).toBeNull();
  expect(root.querySelector('a.ep[href="#read-173-3"]')).toBeNull();
  expect(root.querySelectorAll('.ep').length).toBe(8);
  expect(root.querySelector('.evhead .cast')).not.toBeNull();
  expect(root.querySelector('.evhead')!.textContent).toContain('可讀 2/8');
  expect(root.querySelector('.site-header .page-title')!.textContent).toBe('第 173 期');
  expect(root.querySelector('.evhead .evbox')!.textContent).toBe(eventLabel(EVENTS.find(e => e.id === 173)!));
  expect(root.querySelector('.evhead .evname')!.textContent).toBe(EVENTS.find(e => e.id === 173)!.name);
  expect(root.querySelector('.evhead')!.textContent).toContain('其餘尚未提供');
  expect(root.querySelector('.eps')!.textContent).not.toContain('尚未提供'); // said once in the head, not per row
  expect(root.querySelector('a.ep[href="#read-173-2"]')!.textContent).toContain('讀到 40%');
  expect(eventLabel(p173!)).toMatch(/^.+\d+箱$/); // previous Leo/need box, not the previous event id
  const prevLink = drawer().querySelector(`a[href="#event-${p173!.id}"]`)!;
  expect(prevLink.textContent).toContain('上一期');
  expect(prevLink.textContent).toContain(eventLabel(p173!));
  expect(prevLink.textContent).not.toContain(p173!.name);
  expect(root.querySelector(`.evnav a[href="#event-${p173!.id}"]`)!.textContent).not.toContain(p173!.name);
  expect(root.querySelector(`.evnav a[href="#event-${p173!.id}"]`)!.textContent).toContain(eventLabel(p173!));
});
test('活動頁：上一期／下一期列永遠兩格，缺的一邊留空', () => {
  const root = mount(viewEvent(2, { bg: [], sd: [], episodes: [] }));
  const cells = root.querySelector('.evnav')!.children;
  expect(cells.length).toBe(2);
  expect(cells[0].matches('.evnav-empty')).toBe(true);
  expect(cells[1].getAttribute('href')).toBe('#event-14');
  expect(root.querySelector('.evhead')!.textContent).toContain('這期的漫畫尚未提供');
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
  expect(drawer().querySelector('a[href="#read-1-1"]')!.textContent).toBe('上一話');
  expect(drawer().querySelector('.drawer-item.na')!.textContent).toContain('下一話');
  expect(drawer().textContent).not.toContain('p');
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
