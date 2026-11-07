import { afterEach, beforeEach, expect, test } from 'vitest';
import { EVENTS } from '../src/app/catalog';
import { EMPTY_QUERY } from '../src/app/filter';
import { prefs } from '../src/app/storage';
import { viewLibrary } from '../src/app/views/library';

const emptyManifest = { bg: [], sd: [], episodes: [] };
const mount = (nodes: HTMLElement[]) => { document.body.replaceChildren(...nodes); return document.body; };

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '#library'); });
afterEach(() => { document.body.replaceChildren(); });

test('列是連結，第二行只有日期與箱；不列話數、角色、類型', () => {
  const root = mount(viewLibrary(emptyManifest, EMPTY_QUERY));
  const row = root.querySelector('a.ev[href="#event-184"]')!;
  const meta = row.querySelector('.meta')!.textContent!;
  expect(meta).toMatch(/繪名\d+箱/);
  expect(meta).not.toMatch(/\d+ 話/);
  expect(meta).not.toContain('馬拉松');
  expect(row.querySelector('.cast')).toBeNull();
  expect(root.querySelector('.list .cast')).toBeNull();
  const wl = root.querySelector('a.ev[href="#event-180"] .meta')!.textContent!;
  expect(wl.match(/World Link/g)!.length).toBe(1);
  const mixed = EVENTS.find(e => e.unit === 'none' && e.type !== 'world_bloom')!;
  expect(root.querySelector(`a.ev[href="#event-${mixed.id}"] .meta`)!.textContent).toContain('混活');
});
test('依查詢篩選並顯示數量與清除連結', () => {
  const root = mount(viewLibrary(emptyManifest, { ...EMPTY_QUERY, unit: 'street' }));
  const n = EVENTS.filter(e => e.unit === 'street').length;
  expect(root.querySelectorAll('a.ev').length).toBe(n);
  expect(root.querySelector('.lib-count')!.textContent).toContain(`符合 ${n} 期`);
  expect(root.querySelector('.lib-count a.clear-all[href="#library"]')!.textContent).toBe('清除篩選');
  expect((mount(viewLibrary(emptyManifest, EMPTY_QUERY)).querySelector('.lib-count') as HTMLElement).hidden).toBe(true);
});
test('改晶片會 replaceState 到 #library?unit=，搜尋會帶 q', () => {
  mount(viewLibrary(emptyManifest, EMPTY_QUERY));
  const len = history.length;
  (document.querySelector('.chip[data-unit="idol"]') as HTMLElement).click();
  expect(location.hash).toBe('#library?unit=idol');
  expect(document.querySelector('.chip[data-unit="idol"]')!.getAttribute('aria-pressed')).toBe('true');
  const search = document.querySelector('input.search') as HTMLInputElement;
  search.value = '雪';
  search.dispatchEvent(new Event('input'));
  expect(location.hash).toBe('#library?unit=idol&q=%E9%9B%AA');
  expect(history.length).toBe(len);
});
test('搜尋角色名找得到該角色登場的期', () => {
  mount(viewLibrary(emptyManifest, { ...EMPTY_QUERY, q: '宵崎奏' }));
  const hit = [...document.querySelectorAll('a.ev')].map(a => Number(a.getAttribute('href')!.slice('#event-'.length)));
  for (const e of EVENTS.filter(e => e.chars?.includes(17))) expect(hit).toContain(e.id);
});
test('清除篩選不新增歷史紀錄', () => {
  mount(viewLibrary(emptyManifest, { ...EMPTY_QUERY, unit: 'street' }));
  const len = history.length;
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  (document.querySelector('a.clear-all') as HTMLElement).dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(location.hash).toBe('#library');
  expect(history.length).toBe(len);
  expect(document.querySelectorAll('a.ev').length).toBe(EVENTS.length);
});
test('空結果有清除連結', () => {
  mount(viewLibrary(emptyManifest, { ...EMPTY_QUERY, q: 'zzzz-nothing' }));
  expect(document.querySelector('.empty a.clear-all')).not.toBeNull();
});
test('進度：讀到第 k 話、讀完；不顯示可讀數或話數', () => {
  prefs.set('pos:event_173_02', 0.4);
  const m = { bg: [], sd: [], episodes: ['event_173_01', 'event_173_02'] };
  let meta = mount(viewLibrary(m, EMPTY_QUERY)).querySelector('a.ev[href="#event-173"] .meta')!.textContent!;
  expect(meta).toContain('讀到第 2 話');
  expect(meta).not.toContain('可讀');
  expect(meta.replace('讀到第 2 話', '')).not.toContain('話');
  for (let i = 1; i <= 8; i++) prefs.set(`pos:event_173_0${i}`, 0.99);
  meta = mount(viewLibrary(m, EMPTY_QUERY)).querySelector('a.ev[href="#event-173"] .meta')!.textContent!;
  expect(meta).toContain('讀完');
  expect(meta).not.toContain('話');
});
test('頁面不含 sekai.best，常駐操作只有一個搜尋框與六顆團體晶片，沒有「全部」也沒有面板', () => {
  mount(viewLibrary(emptyManifest, EMPTY_QUERY));
  expect(document.body.innerHTML).not.toContain('sekai.best');
  expect(document.querySelectorAll('input').length).toBe(1);
  expect(document.querySelectorAll('.chips').length).toBe(1);
  expect([...document.querySelectorAll('.chips .chip')].map(c => c.textContent)).toEqual(['L/n', 'MMJ', 'VBS', 'WxS', '25時', '混活']);
  expect(document.querySelector('.chip[data-unit="all"]')).toBeNull();
  expect(document.querySelectorAll('.chip[aria-pressed="true"]').length).toBe(0);
  expect(document.querySelector('.chip.more')).toBeNull();
  expect(document.querySelector('[aria-haspopup]')).toBeNull();
});
test('再點一次已選的團體晶片會清除篩選，搜尋保留', () => {
  mount(viewLibrary(emptyManifest, { ...EMPTY_QUERY, q: '雪' }));
  (document.querySelector('.chip[data-unit="light_sound"]') as HTMLElement).click();
  expect(location.hash).toBe('#library?unit=light_sound&q=%E9%9B%AA');
  (document.querySelector('.chip[data-unit="light_sound"]') as HTMLElement).click();
  expect(location.hash).toBe('#library?q=%E9%9B%AA');
  expect(document.querySelectorAll('.chip[aria-pressed="true"]').length).toBe(0);
});

test('有橫幅的期在列上放延遲載入的縮圖；沒有的放同尺寸的色塊', () => {
  const [a, b] = EVENTS;
  const root = mount(viewLibrary({ ...emptyManifest, banners: [a.bundle] }, EMPTY_QUERY));
  const img = root.querySelector(`a.ev[href="#event-${a.id}"] .thumb img`) as HTMLImageElement;
  expect(img.getAttribute('src')).toBe(`/banner/s/${a.bundle}.webp`);
  expect(img.getAttribute('loading')).toBe('lazy');
  expect(img.getAttribute('alt')).toBe('');
  expect(root.querySelector(`a.ev[href="#event-${b.id}"] .thumb`)).not.toBeNull();
  expect(root.querySelector(`a.ev[href="#event-${b.id}"] .thumb img`)).toBeNull();
});
