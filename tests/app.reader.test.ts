import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startApp } from '../src/app/router';
import { loadEpisode, loadManifest } from '../src/app/load';
import { viewReader } from '../src/app/views/reader';
import { prefs } from '../src/app/storage';
import { parseScenario } from '../src/scenario/parse';
import type { RawScenario } from '../src/scenario/types';
import { loadStoryboard, resolveStoryboard } from '../src/storyboard';
import { syntheticBoard, syntheticEpisode } from './helpers';

const ep = syntheticEpisode();
const ctx = (bg: string[] = ['bg_test_a']) => ({
  title: '第 1 話 測試', sub: '測試活動', back: '#event-1', manifest: { bg, sd: [], episodes: [ep.sid] }, next: null,
});
const mount = (nodes: HTMLElement[]) => { document.body.replaceChildren(...nodes); return document.body; };

beforeEach(() => { window.scrollTo = (() => {}) as typeof window.scrollTo; localStorage.clear(); document.body.className = ''; history.replaceState(null, '', '/'); });
afterEach(() => vi.unstubAllGlobals());

test('頁面不含 sekai.best', () => {
  mount(viewReader(ep, syntheticBoard(), ctx()));
  expect(document.documentElement.outerHTML).not.toContain('sekai.best');
});
test('背景沒有縮圖的格子退回網點，有縮圖的帶背景層', () => {
  const root = mount(viewReader(ep, syntheticBoard(), ctx(['bg_test_a'])));
  const pnOf = (r: number) => root.querySelector(`[data-r="${r}"]`)!.closest('.pn')!;
  expect(pnOf(0).querySelector('.bgl')).not.toBeNull();
  expect(pnOf(10).querySelector('.bgl')).toBeNull();
  expect(pnOf(10).classList.contains('paper')).toBe(true);
});
test('閱讀設定只寫入允許的鍵', () => {
  expect(() => prefs.set('ep:x' as never, 1)).toThrow();
  prefs.set('pos:event_173_01', 0.5);
  expect(prefs.get('pos:event_173_01', 0)).toBe(0.5);
});
test('loadEpisode 404 回 null、loadManifest 失敗回空清單', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
  expect(await loadEpisode('event_x')).toBeNull();
  expect(await loadManifest()).toEqual({ bg: [], sd: [], episodes: [] });
});
test('loadEpisode 拒絕不合法的 sid', async () => {
  const f = vi.fn();
  vi.stubGlobal('fetch', f);
  expect(await loadEpisode('../x')).toBeNull();
  expect(f).not.toHaveBeenCalled();
});

describe('路由', () => {
  const stubFetch = () => vi.stubGlobal('fetch', vi.fn(async (u: string) =>
    u === '/manifest.json' ? Response.json({ bg: [], sd: [], episodes: [] }) : new Response('', { status: 404 })));

  test('空 hash 啟動後進入 173-1', async () => {
    stubFetch();
    const app = document.createElement('div');
    await startApp(app);
    expect(location.hash).toBe('#read-173-1');
  });
  test('沒有劇本檔的話數顯示尚未提供', async () => {
    stubFetch();
    const app = document.createElement('div');
    await startApp(app);
    expect(app.textContent).toContain('尚未提供');
  });
  test('目錄頁：只有可讀的話數有閱讀鈕', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) =>
      u === '/manifest.json' ? Response.json({ bg: [], sd: [], episodes: ['event_173_01'] }) : new Response('', { status: 404 })));
    history.replaceState(null, '', '#event-173');
    const app = document.createElement('div');
    await startApp(app);
    expect(app.querySelectorAll('a.read').length).toBe(1);
    expect(app.textContent).toContain('尚未提供');
    expect(app.innerHTML).not.toContain('sekai.best');
  });
  test('活動列表', async () => {
    stubFetch();
    history.replaceState(null, '', '#library');
    const app = document.createElement('div');
    await startApp(app);
    expect(app.querySelectorAll('.ev').length).toBeGreaterThan(100);
  });
});

const ASSET = 'assets/raw/event_173_01.asset';
describe.skipIf(!existsSync(ASSET))('173-1 打包的分鏡', () => {
  test('經 resolveStoryboard 取得 AI 分鏡', () => {
    const ep173 = parseScenario(JSON.parse(readFileSync(ASSET, 'utf8')) as RawScenario);
    expect(resolveStoryboard(loadStoryboard('event_173_01'), ep173).meta.director).toBe('ai');
  });
});
test('沒有分鏡的話數回 undefined', () => expect(loadStoryboard('event_1_01')).toBeUndefined());

test('重開已讀完的話數不會把進度覆寫成 0', async () => {
  vi.stubGlobal('fetch', vi.fn(async (u: string) =>
    u === '/manifest.json' ? Response.json({ bg: [], sd: [], episodes: ['event_173_01'] })
      : u === '/episodes/event_173_01.json' ? Response.json(syntheticEpisode()) : new Response('', { status: 404 })));
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => 5000 });
  prefs.set('pos:event_173_01', 0.9999);
  history.replaceState(null, '', '#read-173-1');
  await startApp(document.createElement('div'));
  await new Promise(r => requestAnimationFrame(() => r(null)));
  window.dispatchEvent(new Event('scroll'));
  expect(prefs.get('pos:event_173_01', 0)).toBe(0.9999);
  delete (document.documentElement as any).scrollHeight;
});

test('prefs 接受 bw 鍵', () => { prefs.set('bw', true); expect(prefs.get('bw', false)).toBe(true); });
test('重新載入時依偏好套上 bw', () => {
  prefs.set('bw', true);
  mount(viewReader(ep, syntheticBoard(), ctx()));
  expect(document.body.classList.contains('bw')).toBe(true);
  expect((document.querySelector('[aria-label="黑白"]') as HTMLElement).getAttribute('aria-pressed')).toBe('true');
});
test('離開閱讀頁時拿掉 bw', async () => {
  prefs.set('bw', true);
  vi.stubGlobal('fetch', vi.fn(async (u: string) => u === '/manifest.json' ? Response.json({ bg: [], sd: [], episodes: [] }) : new Response('', { status: 404 })));
  document.body.classList.add('bw');
  history.replaceState(null, '', '#library');
  await startApp(document.createElement('div'));
  expect(document.body.classList.contains('bw')).toBe(false);
});
test('閱讀頁把活動團體傳給漫畫', () => {
  mount(viewReader(ep, syntheticBoard(), { ...ctx(), unit: { accent: '#4455dd', glyph: '✦', roundRadius: 18, monoShape: 'cloud' } }));
  expect(document.querySelector('.comic.has-unit')).not.toBeNull();
});

const menu = () => document.querySelector('[aria-label="選單"]') as HTMLButtonElement;
const drawer = () => document.querySelector('.drawer') as HTMLElement;

test('閱讀頁一律是漫畫，body 有 paper', () => {
  mount(viewReader(ep, syntheticBoard(), ctx()));
  expect(document.body.classList.contains('paper')).toBe(true);
  expect(document.querySelector('.comic')).not.toBeNull();
  expect(document.querySelector('.story')).toBeNull();
});
test('頁面上方只有一個漢堡按鈕', () => {
  mount(viewReader(ep, syntheticBoard(), ctx()));
  const bar = document.querySelector('.site-header')!;
  expect([...bar.querySelectorAll('button')]).toEqual([menu()]);
  for (const label of ['漫畫', '對話', 'Aa', 'A−', 'A＋']) expect(bar.textContent).not.toContain(label);
  expect(document.querySelector('[aria-label="閱讀設定"], [aria-label="放大字級"], [aria-label="縮小字級"]')).toBeNull();
});
test('漢堡按鈕開關側邊欄，側邊欄有標題、返回與黑白', () => {
  mount(viewReader(ep, syntheticBoard(), ctx()));
  expect(drawer().hidden).toBe(true);
  menu().click();
  expect(drawer().hidden).toBe(false);
  expect(menu().getAttribute('aria-expanded')).toBe('true');
  expect(drawer().textContent).toContain('第 1 話 測試');
  expect(drawer().textContent).toContain('測試活動');
  expect(drawer().querySelector('[aria-label="黑白"]')).not.toBeNull();
  const back = drawer().querySelector('a[href="#event-1"]') as HTMLAnchorElement;
  expect(back.textContent).toContain('這期的話數列表');
  back.click();
  expect(drawer().hidden).toBe(true);
  menu().click();
  const lib = drawer().querySelector('[data-go="library"]') as HTMLAnchorElement;
  expect(lib.getAttribute('href')).toBe('#library');
  lib.click();
  expect(drawer().hidden).toBe(true);
});
test('點遮罩或按 Esc 關閉側邊欄', () => {
  mount(viewReader(ep, syntheticBoard(), ctx()));
  menu().click();
  (document.querySelector('.scrim') as HTMLElement).click();
  expect(drawer().hidden).toBe(true);
  menu().click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(drawer().hidden).toBe(true);
  expect(menu().getAttribute('aria-expanded')).toBe('false');
});
test('側邊欄的黑白開關切換後記住', () => {
  mount(viewReader(ep, syntheticBoard(), ctx()));
  menu().click();
  const btn = drawer().querySelector('[aria-label="黑白"]') as HTMLButtonElement;
  btn.click();
  expect(document.body.classList.contains('bw')).toBe(true);
  expect(prefs.get('bw', false)).toBe(true);
  expect(btn.getAttribute('aria-pressed')).toBe('true');
});
test('字級固定 14px，舊的字級設定不再生效', () => {
  localStorage.setItem('sekai-reader:size', '22');
  mount(viewReader(ep, syntheticBoard(), ctx()));
  expect(document.documentElement.style.getPropertyValue('--reader-size')).toBe('14px');
});
test('偏好設定不再接受對話模式相關的鍵', () => {
  for (const k of ['mode', 'mood', 'size']) expect(() => prefs.set(k as never, 1)).toThrow();
});
test('離開閱讀頁時移除側邊欄的鍵盤監聽器（不必等下一次按鍵）', async () => {
  vi.stubGlobal('fetch', vi.fn(async (u: string) =>
    u === '/manifest.json' ? Response.json({ bg: [], sd: [], episodes: ['event_173_01'] })
      : u === '/episodes/event_173_01.json' ? Response.json(syntheticEpisode()) : new Response('', { status: 404 })));
  const signals: AbortSignal[] = [];
  const orig = document.addEventListener.bind(document);
  const spy = vi.spyOn(document, 'addEventListener').mockImplementation((type: string, fn: any, opts?: any) => {
    if (type === 'keydown') signals.push(opts?.signal);
    return orig(type, fn, opts);
  });
  history.replaceState(null, '', '#read-173-1');
  await startApp(document.createElement('div'));
  const readerSignals = [...signals];
  expect(readerSignals.length).toBeGreaterThan(0);
  history.replaceState(null, '', '#library');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await new Promise(r => setTimeout(r, 0));
  expect(readerSignals.every(s => s?.aborted)).toBe(true);  // the library page registers its own, still-live listener
  spy.mockRestore();
});

const headerOf = (root: ParentNode) => root.querySelector('header.site-header') as HTMLElement;
test('閱讀頁頁首：站名、本話標題、唯一的漢堡按鈕、進度線', () => {
  mount(viewReader(ep, syntheticBoard(), ctx()));
  const hd = headerOf(document);
  expect(hd.querySelector('.brand')!.textContent).toBe('SEKAI 劇情閱讀器');
  expect(hd.querySelector('.page-title')!.textContent).toBe('第 1 話 測試');
  expect(hd.querySelectorAll('button').length).toBe(1);
  expect(hd.querySelector('button[aria-label="選單"]')).not.toBeNull();
  expect(hd.querySelector('.progress')).not.toBeNull();
  expect(document.querySelectorAll('header').length).toBe(1);
});
describe('其他頁面也用同一個頁首', () => {
  const routes: [string, string][] = [['#library', ''], ['#event-173', '第 173 期'], ['#nope', '']];
  test.each(routes)('%s', async (hash, title) => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => u === '/manifest.json' ? Response.json({ bg: [], sd: [], episodes: ['event_173_01'] }) : new Response('', { status: 404 })));
    history.replaceState(null, '', hash);
    const app = document.createElement('div');
    document.body.replaceChildren(app);
    await startApp(app);
    const hd = headerOf(app);
    expect(hd).not.toBeNull();
    expect(app.querySelectorAll('header').length).toBe(1);
    expect(hd.querySelectorAll('button').length).toBe(1);
    expect(hd.querySelector('.brand')!.textContent).toBe('SEKAI 劇情閱讀器');
    if (title) expect(hd.querySelector('.page-title')!.textContent).toContain(title);
    expect(app.querySelector('.iconbtn:not(.menu)')).toBeNull();
    (hd.querySelector('button') as HTMLElement).click();
    expect((app.querySelector('.drawer') as HTMLElement).hidden).toBe(false);
    expect(app.querySelector('.drawer [data-go="library"]')).not.toBeNull();
  });
});
test('側邊欄導覽在上、黑白在分隔線之後', () => {
  mount(viewReader(ep, syntheticBoard(), ctx()));
  const kids = [...drawer().children];
  const at = (sel: string) => kids.findIndex(k => k.matches(sel));
  expect(at('a[href="#event-1"]')).toBeLessThan(at('[data-go="library"]'));
  expect(at('[data-go="library"]')).toBeLessThan(at('hr.drawer-sep'));
  expect(at('hr.drawer-sep')).toBeLessThan(at('[aria-label="黑白"]'));
});
