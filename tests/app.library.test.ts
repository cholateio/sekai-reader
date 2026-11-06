import { afterEach, beforeEach, expect, test } from 'vitest';
import { EVENTS } from '../src/app/catalog';
import { EMPTY_QUERY } from '../src/app/filter';
import { prefs } from '../src/app/storage';
import { viewLibrary } from '../src/app/views/library';

const emptyManifest = { bg: [], sd: [], episodes: [] };
const mount = (nodes: HTMLElement[]) => { document.body.replaceChildren(...nodes); return document.body; };

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '#library'); });
afterEach(() => { document.body.replaceChildren(); });

test('列是連結且帶標籤、類型、話數與登場角色', () => {
  const root = mount(viewLibrary(emptyManifest, EMPTY_QUERY));
  const row = root.querySelector('a.ev[href="#event-184"]')!;
  const meta = row.querySelector('.meta')!.textContent!;
  expect(meta).toMatch(/25時 第\d+箱/);
  expect(meta).toContain('馬拉松');
  expect(meta).toContain('8 話');
  expect(row.querySelector('.cast')!.textContent).toContain('奏');
  const wl = root.querySelector('a.ev[href="#event-180"] .meta')!.textContent!;
  expect(wl).toContain('World Link');
  expect(wl.match(/World Link/g)!.length).toBe(1);
});
test('缺 chars 的列不畫角色行；超過 8 人顯示「等 N 人」', () => {
  const e0 = EVENTS[0];
  const saved = e0.chars;
  try {
    delete e0.chars;
    let root = mount(viewLibrary(emptyManifest, EMPTY_QUERY));
    expect(root.querySelector(`a.ev[href="#event-${e0.id}"] .cast`)).toBeNull();
    e0.chars = Array.from({ length: 26 }, (_, i) => i + 1);
    root = mount(viewLibrary(emptyManifest, EMPTY_QUERY));
    const cast = root.querySelector(`a.ev[href="#event-${e0.id}"] .cast`)!;
    expect(cast.querySelectorAll('span.c').length).toBe(8);
    expect(cast.textContent).toContain('等 26 人');
  } finally { e0.chars = saved; }
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
test('進度：讀到第 k 話、可讀 n/N、讀完', () => {
  prefs.set('pos:event_173_02', 0.4);
  const m = { bg: [], sd: [], episodes: ['event_173_01', 'event_173_02'] };
  let meta = mount(viewLibrary(m, EMPTY_QUERY)).querySelector('a.ev[href="#event-173"] .meta')!.textContent!;
  expect(meta).toContain('可讀 2/8');
  expect(meta).toContain('讀到第 2 話');
  for (let i = 1; i <= 8; i++) prefs.set(`pos:event_173_0${i}`, 0.99);
  meta = mount(viewLibrary(m, EMPTY_QUERY)).querySelector('a.ev[href="#event-173"] .meta')!.textContent!;
  expect(meta).toContain('讀完');
  expect(meta).not.toContain('讀到第');
});
test('面板：選角色套用並關閉、Esc 關閉且焦點回晶片', () => {
  mount(viewLibrary(emptyManifest, EMPTY_QUERY));
  const more = document.querySelector('.chip.more') as HTMLButtonElement;
  more.click();
  const sheet = document.querySelector('.sheet')!;
  expect(sheet.getAttribute('role')).toBe('dialog');
  expect(sheet.getAttribute('aria-modal')).toBe('true');
  expect(sheet.querySelectorAll('.cbtn').length).toBe(26);
  expect(sheet.querySelectorAll('.chip[data-type]').length).toBe(4);
  (sheet.querySelector('.cbtn[data-char="17"]') as HTMLElement).click();
  expect(document.querySelector('.sheet')).toBeNull();
  expect(location.hash).toBe('#library?char=17');
  expect(document.querySelector('.chip.more')!.textContent).toContain('奏');
  expect(document.activeElement).toBe(document.querySelector('.chip.more'));
  expect(document.querySelectorAll('a.ev').length).toBe(EVENTS.filter(e => e.chars?.includes(17)).length);
  (document.querySelector('.chip.more') as HTMLElement).click();
  expect(document.querySelector('.sheet .cbtn[data-char="17"]')!.getAttribute('aria-pressed')).toBe('true');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(document.querySelector('.sheet')).toBeNull();
  expect(document.activeElement).toBe(document.querySelector('.chip.more'));
});
test('面板：選類型不關閉、點遮罩關閉、清除', () => {
  mount(viewLibrary(emptyManifest, EMPTY_QUERY));
  (document.querySelector('.chip.more') as HTMLElement).click();
  (document.querySelector('.sheet .chip[data-type="world_bloom"]') as HTMLElement).click();
  expect(document.querySelector('.sheet')).not.toBeNull();
  expect(location.hash).toBe('#library?type=world_bloom');
  expect(document.querySelector('.sheet .chip[data-type="world_bloom"]')!.getAttribute('aria-pressed')).toBe('true');
  (document.querySelector('.sheet-scrim') as HTMLElement).click();
  expect(document.querySelector('.sheet')).toBeNull();
  expect(document.querySelector('.chip.more')!.textContent).toContain('World Link');
  expect(document.activeElement).toBe(document.querySelector('.chip.more'));
  (document.querySelector('.chip.more') as HTMLElement).click();
  (document.querySelector('.sheet .ghost') as HTMLElement).click();
  expect(document.querySelector('.sheet')).toBeNull();
  expect(location.hash).toBe('#library');
  expect(document.activeElement).toBe(document.querySelector('.chip.more'));
});
test('× 清除角色與類型', () => {
  mount(viewLibrary(emptyManifest, { ...EMPTY_QUERY, char: 17, type: 'marathon' }));
  expect(document.querySelector('.chip.more')!.textContent).toContain('奏 · 馬拉松');
  (document.querySelector('.chip.more .clear') as HTMLElement).click();
  expect(location.hash).toBe('#library');
  expect(document.querySelector('.chip.more .clear')).toBeNull();
});
test('頁面不含 sekai.best，常駐操作只有一個搜尋框與一列晶片', () => {
  mount(viewLibrary(emptyManifest, EMPTY_QUERY));
  expect(document.body.innerHTML).not.toContain('sekai.best');
  expect(document.querySelectorAll('input').length).toBe(1);
  expect(document.querySelectorAll('.chips').length).toBe(1);
  expect(document.querySelectorAll('.chips .chip').length).toBe(8);
});
