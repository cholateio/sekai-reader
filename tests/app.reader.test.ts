import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startApp } from '../src/app/router';
import { loadEpisode, loadManifest } from '../src/app/load';
import { viewReader } from '../src/app/views/reader';
import { prefs } from '../src/app/storage';
import { refitComics } from '../src/render/comic';
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

test('漫畫模式 body 有 paper，對話模式沒有', () => {
  prefs.set('mode', 'comic');
  mount(viewReader(ep, syntheticBoard(), ctx()));
  expect(document.body.classList.contains('paper')).toBe(true);
  expect(document.querySelector('.comic')).not.toBeNull();
  prefs.set('mode', 'chat');
  mount(viewReader(ep, syntheticBoard(), ctx()));
  expect(document.body.classList.contains('paper')).toBe(false);
  expect(document.querySelector('.story')).not.toBeNull();
});
test('頁面不含 sekai.best', () => {
  mount(viewReader(ep, syntheticBoard(), ctx()));
  expect(document.documentElement.outerHTML).not.toContain('sekai.best');
});
test('背景沒有縮圖的格子退回網點，有縮圖的帶背景層', () => {
  prefs.set('mode', 'comic');
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
    expect(app.querySelectorAll('button.read').length).toBe(1);
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

test('黑白開關只在漫畫模式，切換後記住', () => {
  prefs.set('mode', 'comic');
  mount(viewReader(ep, syntheticBoard(), ctx()));
  const btn = document.querySelector('[aria-label="黑白"]') as HTMLButtonElement;
  expect(btn).not.toBeNull();
  btn.click();
  expect(document.body.classList.contains('bw')).toBe(true);
  expect(prefs.get('bw', false)).toBe(true);
  expect(btn.getAttribute('aria-pressed')).toBe('true');
  prefs.set('mode', 'chat');
  mount(viewReader(ep, syntheticBoard(), ctx()));
  expect(document.querySelector('[aria-label="黑白"]')).toBeNull();
  expect(document.body.classList.contains('bw')).toBe(false);
});
test('prefs 接受 bw 鍵', () => { prefs.set('bw', true); expect(prefs.get('bw', false)).toBe(true); });
test('重新載入時依偏好套上 bw', () => {
  prefs.set('mode', 'comic'); prefs.set('bw', true);
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
test('Aa 改字級後對白框依新尺寸重畫（舊外框被換掉）', () => {
  prefs.set('mode', 'comic');
  mount(viewReader(ep, syntheticBoard(), ctx()));
  const bb = document.querySelector('.bb') as HTMLElement;
  let rect = { width: 200, height: 60 };
  bb.getBoundingClientRect = () => ({ ...rect, x: 0, y: 0, top: 0, left: 0, right: rect.width, bottom: rect.height, toJSON() {} }) as DOMRect;
  refitComics(document);
  const svg = bb.querySelector('svg.bo')!;
  expect(svg.getAttribute('viewBox')).toBe('0 0 232 92');
  const d1 = svg.querySelector('[data-role="body"]')!.getAttribute('d');
  rect = { width: 300, height: 90 };
  (document.querySelector('[aria-label="放大字級"]') as HTMLElement).click();
  expect(svg.getAttribute('viewBox')).toBe('0 0 332 122');
  expect(svg.querySelector('[data-role="body"]')!.getAttribute('d')).not.toBe(d1);
});
test('閱讀頁把活動團體傳給漫畫', () => {
  prefs.set('mode', 'comic');
  mount(viewReader(ep, syntheticBoard(), { ...ctx(), unit: { accent: '#4455dd', glyph: '✦', roundRadius: 18, monoShape: 'cloud' } }));
  expect(document.querySelector('.comic.has-unit')).not.toBeNull();
});
