import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { startApp } from '../src/app/router';
import { pushRecent, recentList, type RecentItem } from '../src/app/recent';
import { prefs } from '../src/app/storage';
import { navLink, siteHeader } from '../src/app/views/common';
import { applyTheme, resetThemeChoice } from '../src/app/theme';

const mount = (nodes: HTMLElement[]) => { document.body.replaceChildren(...nodes); return document.body; };
const drawer = () => document.querySelector('.drawer') as HTMLElement;
const open = () => (document.querySelector('.menu') as HTMLElement).click();

beforeEach(() => { localStorage.clear(); resetThemeChoice(); document.body.className = ''; history.replaceState(null, '', '/'); });
afterEach(() => vi.unstubAllGlobals());

test('pushRecent 去重置頂最多 5；recentList 全部列出並跳過索引沒有的話', () => {
  const sids = [...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `event_173_0${n}`), 'event_172_01', 'event_172_02', 'event_172_03'];
  for (const sid of sids) pushRecent({ sid, id: Number(sid.split('_')[1]), no: Number(sid.split('_')[2]), title: 't' });
  pushRecent({ sid: 'event_173_02', id: 173, no: 2, title: 't2' });
  pushRecent({ sid: 'event_1_09', id: 1, no: 9, title: 'gone' });
  expect(prefs.get('recent', [] as RecentItem[]).length).toBe(5);
  expect(recentList().map(r => r.sid)).toEqual(['event_173_02', 'event_172_03', 'event_172_02', 'event_172_01']);
});
test('續讀位置只留給最近閱讀裡的話：被擠出清單的話連同位置一起刪掉', () => {
  // As in the app: an episode is pushed when opened, then scrolling writes its position.
  const read = (sid: string, id: number, no: number) => { pushRecent({ sid, id, no, title: 't' }); prefs.set(`pos:${sid}`, 0.5); };
  for (let n = 1; n <= 8; n++) read(`event_173_0${n}`, 173, n);
  prefs.set('pos:event_99_01', 0.3); // left over from before the cap
  for (const n of [1, 2, 3]) read(`event_172_0${n}`, 172, n);
  const kept = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter(k => k.startsWith('sekai-reader:pos:')).sort();
  expect(kept).toEqual([...[1, 2, 3].map(n => `sekai-reader:pos:event_172_0${n}`), ...[7, 8].map(n => `sekai-reader:pos:event_173_0${n}`)]);
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
test('閱讀頁：側邊欄沒有上一話／下一話；結尾區塊是下一話的整條連結與回話數列表', () => {
  const ep = syntheticEpisode();
  const ctx = { title: '第 4 話 天秤', sub: '測試活動', back: '#event-1', manifest: { bg: [], sd: [], episodes: [ep.sid] } };
  mount(viewReader(ep, syntheticBoard(), { ...ctx, prev: { no: 3, title: 'p', href: '#read-1-3' }, next: { no: 5, title: '為了不要後悔', href: '#read-1-5' } }));
  expect(drawer().textContent).not.toMatch(/上一話|下一話/);
  expect(drawer().querySelector('a[href="#event-1"]')!.textContent).toContain('這期的話數列表');
  const next = document.querySelector('.end a.end-next[href="#read-1-5"]')!;
  expect(next.textContent).toContain('下一話');
  expect(next.textContent).toContain('第 5 話');
  expect(next.textContent).toContain('為了不要後悔');
  expect(document.querySelector('.end .end-mark')!.textContent).toContain('第 4 話 完');
  expect(document.querySelector('.end a.end-back[href="#event-1"]')).not.toBeNull();
  mount(viewReader(ep, syntheticBoard(), { ...ctx, next: { no: 5, title: '為了不要後悔', href: null } }));
  expect(document.querySelector('.end a.end-next')).toBeNull();
  expect(document.querySelector('.end .end-next.na')!.textContent).toContain('尚未提供');
  mount(viewReader(ep, syntheticBoard(), { ...ctx, next: null }));
  expect(document.querySelector('.end')!.textContent).toContain('這期活動讀完了');
  expect(document.querySelector('.end a.end-back[href="#event-1"]')).not.toBeNull();
});

test('閱讀頁上方沒有「AI 導演分鏡／N 格」', () => {
  const ep = syntheticEpisode();
  mount(viewReader(ep, syntheticBoard(), { title: 't', sub: 's', back: '#event-1', manifest: { bg: [], sd: [], episodes: [ep.sid] }, next: null }));
  expect(document.querySelector('.comic .credit')).toBeNull();
  expect(document.body.textContent).not.toMatch(/導演分鏡|\d+ 格/);
});

test('深色模式：每頁側邊欄都有開關（閱讀頁在黑白下面），切換寫入偏好並套到 html', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  mount(siteHeader({ title: 'x' }));
  const dark = () => drawer().querySelector('button[aria-label="深色模式"]') as HTMLButtonElement;
  expect(dark().getAttribute('aria-pressed')).toBe('false');
  dark().click();
  expect(prefs.get('dark', false)).toBe(true);
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(dark().getAttribute('aria-pressed')).toBe('true');
  dark().click();
  expect(document.documentElement.dataset.theme).toBe('light');
  const ep = syntheticEpisode();
  mount(viewReader(ep, syntheticBoard(), { title: 't', sub: 's', back: '#event-1', manifest: { bg: [], sd: [], episodes: [ep.sid] }, next: null }));
  const labels = [...drawer().querySelectorAll('button.toggle')].map(b => b.getAttribute('aria-label'));
  expect(labels).toEqual(['黑白', '深色模式']);
});

test('深色模式：沒設定時跟系統，設定過就以設定為準', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  applyTheme();
  expect(document.documentElement.dataset.theme).toBe('dark');
  prefs.set('dark', false);
  applyTheme();
  expect(document.documentElement.dataset.theme).toBe('light');
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

test('深色模式：index.html 的預先套用腳本與 theme.ts 在各種儲存狀態下結論一致', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync('index.html', 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
  const cases: [string | null, boolean][] = [
    [null, false], [null, true], ['true', false], ['false', true], ['null', true], ['"dark"', false], ['{bad', true], ['1', true],
  ];
  for (const [stored, system] of cases) {
    localStorage.clear();
    if (stored !== null) localStorage.setItem('sekai-reader:dark', stored);
    vi.stubGlobal('matchMedia', () => ({ matches: system }));
    delete document.documentElement.dataset.theme;
    new Function(script)();
    const early = document.documentElement.dataset.theme;
    applyTheme();
    expect([stored, system, early]).toEqual([stored, system, document.documentElement.dataset.theme]);
  }
  vi.stubGlobal('matchMedia', undefined);
  localStorage.clear();
  new Function(script)();
  expect(document.documentElement.dataset.theme).toBe('light');
});

test('深色模式：儲存被封鎖時開關仍然有效，狀態與畫面一致', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  mount(siteHeader({ title: 'x' }));
  const btn = drawer().querySelector('button[aria-label="深色模式"]') as HTMLButtonElement;
  btn.click();
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(btn.getAttribute('aria-pressed')).toBe('true');
  btn.click();
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(btn.getAttribute('aria-pressed')).toBe('false');
  setItem.mockRestore();
});

test('最近閱讀：舊版留下的 10 筆清單裡夾著已下架的話，也保留 5 筆有效的與它們的續讀位置', () => {
  const valid = [1, 2, 3, 4, 5, 6].map(n => `event_173_0${n}`);
  const legacy = ['event_1_09', valid[0], 'event_2_09', valid[1], 'event_3_09', valid[2], valid[3], valid[4], valid[5], 'event_4_09']
    .map(sid => ({ sid, id: Number(sid.split('_')[1]), no: Number(sid.split('_')[2]), title: 't' }));
  localStorage.setItem('sekai-reader:recent', JSON.stringify(legacy));
  for (const sid of valid) prefs.set(`pos:${sid}`, 0.5);
  pushRecent({ sid: 'event_172_01', id: 172, no: 1, title: 'n' });
  expect(recentList().map(r => r.sid)).toEqual(['event_172_01', ...valid.slice(0, 4)]);
  for (const sid of valid.slice(0, 4)) expect(prefs.get(`pos:${sid}`, 0)).toBe(0.5);
});

test('最近閱讀：清單寫入失敗時不刪任何續讀位置（舊清單與新清單一樣長也一樣）', () => {
  const old = [1, 2, 3, 4, 5].map(n => ({ sid: `event_173_0${n}`, id: 173, no: n, title: 't' }));
  localStorage.setItem('sekai-reader:recent', JSON.stringify(old));
  for (const r of old) prefs.set(`pos:${r.sid}`, 0.5);
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  pushRecent({ sid: 'event_172_01', id: 172, no: 1, title: 'n' });
  setItem.mockRestore();
  for (const r of old) expect(prefs.get(`pos:${r.sid}`, 0)).toBe(0.5);
});

test('最近閱讀：清理途中另一個分頁寫入新清單，新清單裡的續讀位置不被刪', () => {
  pushRecent({ sid: 'event_173_01', id: 173, no: 1, title: 't' });
  prefs.set('pos:event_172_02', 0.4); // belongs to a list another tab is about to write
  const remove = vi.spyOn(Storage.prototype, 'removeItem');
  const keys = vi.spyOn(prefs, 'keys').mockImplementation(() => {
    localStorage.setItem('sekai-reader:recent', JSON.stringify([{ sid: 'event_172_02', id: 172, no: 2, title: 'b' }]));
    return ['pos:event_172_02'];
  });
  pushRecent({ sid: 'event_173_02', id: 173, no: 2, title: 't' });
  keys.mockRestore(); remove.mockRestore();
  expect(prefs.get('pos:event_172_02', 0)).toBe(0.4);
});
