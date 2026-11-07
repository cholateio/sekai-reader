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

test('pushRecent 去重置頂最多 10；recentList 全部列出並跳過索引沒有的話', () => {
  const sids = [...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `event_173_0${n}`), 'event_172_01', 'event_172_02', 'event_172_03'];
  for (const sid of sids) pushRecent({ sid, id: Number(sid.split('_')[1]), no: Number(sid.split('_')[2]), title: 't' });
  pushRecent({ sid: 'event_173_02', id: 173, no: 2, title: 't2' });
  pushRecent({ sid: 'event_1_09', id: 1, no: 9, title: 'gone' });
  expect(prefs.get('recent', [] as RecentItem[]).length).toBe(10);
  expect(recentList().map(r => r.sid)).toEqual(
    ['event_173_02', 'event_172_03', 'event_172_02', 'event_172_01', 'event_173_08', 'event_173_07', 'event_173_06', 'event_173_05', 'event_173_04']);
});
test('續讀位置只留給最近閱讀裡的話：被擠出清單的話連同位置一起刪掉', () => {
  // As in the app: an episode is pushed when opened, then scrolling writes its position.
  const read = (sid: string, id: number, no: number) => { pushRecent({ sid, id, no, title: 't' }); prefs.set(`pos:${sid}`, 0.5); };
  for (let n = 1; n <= 8; n++) read(`event_173_0${n}`, 173, n);
  prefs.set('pos:event_99_01', 0.3); // left over from before the cap
  for (const n of [1, 2, 3]) read(`event_172_0${n}`, 172, n);
  const kept = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter(k => k.startsWith('sekai-reader:pos:')).sort();
  expect(kept).toEqual([...[1, 2, 3].map(n => `sekai-reader:pos:event_172_0${n}`), ...[2, 3, 4, 5, 6, 7, 8].map(n => `sekai-reader:pos:event_173_0${n}`)]);
  expect(localStorage.getItem('sekai-reader:recent')).not.toBeNull();
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
  expect(a.textContent).not.toMatch(/%|讀完|讀到/); // no progress figures anywhere (owner, 2026-11-07)
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

test('活動頁：上一期／下一期與話數都是連結，標題區沒有繼續閱讀按鈕', () => {
  prefs.set('pos:event_173_02', 0.4); prefs.set('pos:event_173_01', 0.99);
  const root = mount(viewEvent(173, { bg: [], sd: [], episodes: ['event_173_01', 'event_173_02'] }));
  expect(root.querySelector('.continue')).toBeNull();
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
  // Title = event name; the meta line is only the start date and the box label (no type, no episode count).
  const e173 = EVENTS.find(e => e.id === 173)!;
  expect(root.querySelector('.evhead h1')!.textContent).toBe(e173.name);
  expect([...root.querySelectorAll('.evmeta span')].map(x => x.textContent)).toEqual([`${e173.date} 開始`, eventLabel(e173)]);
  expect(root.querySelector('.evhead')!.textContent).toContain('其餘尚未提供');
  expect(root.querySelector('.eps')!.textContent).not.toContain('尚未提供'); // said once in the head, not per row
  expect(root.querySelector('.eps')!.textContent).not.toMatch(/%|讀完|讀到|開始閱讀/);
  expect(root.querySelector('.eps .bar')).toBeNull();
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
test('活動頁：混活的資訊列顯示「混活」', () => {
  const mixed = EVENTS.find(e => e.unit === 'none' && e.type !== 'world_bloom')!;
  const root = mount(viewEvent(mixed.id, { bg: [], sd: [], episodes: [] }));
  expect(root.querySelector('.evmeta')!.textContent).toContain('混活');
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

test('活動頁：有橫幅時標題區以它為背景，沒有就維持原樣', () => {
  const e = EVENTS.find(x => x.id === 173)!;
  let root = mount(viewEvent(173, { bg: [], sd: [], episodes: [], banners: [e.bundle] }));
  const head = root.querySelector('.evhead') as HTMLElement;
  expect(head.classList.contains('has-banner')).toBe(true);
  expect(head.getAttribute('style')).toContain(`/banner/${e.bundle}.webp`);
  root = mount(viewEvent(173, { bg: [], sd: [], episodes: [] }));
  expect(root.querySelector('.evhead')!.classList.contains('has-banner')).toBe(false);
  expect(root.querySelector('.evhead')!.getAttribute('style')).not.toContain('/banner/');
});
