import { expect, test } from 'vitest';
import { StaticChibiArt } from '../src/art/StaticChibiArt';
import { renderComic } from '../src/render/comic';
import { backgroundLayer, camFor, panelBg } from '../src/render/comic/background';
import { syntheticBoard, syntheticEpisode } from './helpers';

const ep = syntheticEpisode();
const art = new StaticChibiArt('/sd');
const withBg = () => renderComic(ep, syntheticBoard(), art, { bgUrl: id => `/bg/${id}.webp` });
const noBg = () => renderComic(ep, syntheticBoard(), art, { bgUrl: () => null });

test('camFor 依類型給預設取景', () => {
  expect(camFor({ t: 'close' }, 0)).toEqual({ focus: [0.32, 0.62], zoom: 1.9, blur: 3 });
  expect(camFor({ t: 'est' }, 4)).toEqual({ focus: [0.5, 0.5], zoom: 1 });
  expect(camFor({ t: 'reveal' }, 2)).toEqual({ focus: [0.5, 0.4], zoom: 1.15, blur: 2 });
  expect(camFor({ t: 'talk' }, 7)).toEqual({ focus: [0.7, 0.58], zoom: 1.32 });
  expect(camFor({ t: 'impact' }, 0)).toBeNull();
});
test('分鏡指定的 cam 優先', () => {
  const cam = { focus: [0.1, 0.9] as [number, number], zoom: 2 };
  expect(camFor({ t: 'close', cam }, 0)).toBe(cam);
});
test('backgroundLayer 樣式', () => {
  const el = backgroundLayer('/bg/x.webp', { focus: [0.25, 0.5], zoom: 1.5, blur: 2 });
  expect(el.className).toBe('bgl');
  expect(el.style.backgroundImage).toContain('/bg/x.webp');
  expect(el.style.backgroundPosition).toBe('25% 50%');
  expect(el.style.transform).toBe('scale(1.5)');
  expect(el.style.filter).toContain('blur(2px)');
});
test('panelBg 的後備順序', () => {
  expect(panelBg({ t: 'talk', bg: 'bg_x', l: [0] }, ep, null)).toBe('bg_x');
  expect(panelBg({ t: 'talk', l: [8] }, ep, null)).toBe('bg_test_b');
  expect(panelBg({ t: 'est', caps: [2] }, ep, null)).toBe('bg_test_b');
  expect(panelBg({ t: 'impact' }, ep, 'bg_last')).toBe('bg_last');
});
test('有背景的格子帶 .bgl，背景依場景切換', () => {
  const root = withBg();
  const urlOf = (r: number) => (root.querySelector(`[data-r="${r}"]`)!.closest('.pn')!.querySelector('.bgl') as HTMLElement).style.backgroundImage;
  expect(urlOf(0)).toContain('bg_test_a');
  expect(urlOf(10)).toContain('bg_test_b');
  expect(root.querySelector('.pn.impact .bgl')).toBeNull();
});
test('split 每半格各有背景', () => expect(withBg().querySelectorAll('.split .pn .bgl').length).toBe(2));
test('沒有背景圖時退回網點、不出現 .bgl', () => {
  const root = noBg();
  expect(root.querySelector('.bgl')).toBeNull();
  for (const pn of root.querySelectorAll('.pn:not(.impact)')) expect(pn.classList.contains('tone-bg')).toBe(true);
});
test('格子都包進 .pw，est 為滿版', () => {
  const root = withBg();
  for (const pn of root.querySelectorAll('.pn')) expect(pn.parentElement!.classList.contains('pw')).toBe(true);
  expect(root.querySelector('.pn.est')!.parentElement!.classList.contains('bleed')).toBe(true);
});
test('斜切依 edge 設定 clip-path 與內距', () => {
  const root = withBg();
  const talk0 = root.querySelector('[data-r="0"]')!.closest('.pn') as HTMLElement;  // edge 1, below est (flat top)
  expect(talk0.style.getPropertyValue('clip-path')).toBe('polygon(0 0px, 100% 0px, 100% calc(100% - 0px), 0 calc(100% - 22px))');
  expect(talk0.style.getPropertyValue('--sb')).toBe('22px');
  const close1 = root.querySelector('[data-r="1"]')!.closest('.pn') as HTMLElement;  // top follows edge 1, bottom edge -1
  expect(close1.style.getPropertyValue('clip-path')).toBe('polygon(0 0px, 100% 22px, 100% calc(100% - 22px), 0 calc(100% - 0px))');
});
test('trans 前後不斜切', () => {
  const root = withBg();
  const sfx = root.querySelector('.pn.sfx-pn') as HTMLElement;
  expect(sfx.style.getPropertyValue('--sb')).toBe('0px');
});
test('split 有 cam 時兩半格以它為中心左右錯開', () => {
  const b = syntheticBoard();
  b.panels[11].cam = { focus: [0.5, 0.3], zoom: 1.4 };
  const root = renderComic(ep, b, art, { bgUrl: id => `/bg/${id}.webp` });
  const pos = [...root.querySelectorAll('.split .bgl')].map(e => (e as HTMLElement).style.backgroundPosition);
  expect(pos).toEqual(['25% 30%', '75% 30%']);
});
test('心聲框左右交錯不受背景層影響', () => {
  const b = syntheticBoard();
  b.panels.splice(11, 2, { t: 'talk', l: [8] }, { t: 'mono', l: [9, 10] });
  const root = renderComic(ep, b, art, { bgUrl: id => `/bg/${id}.webp` });
  const sides = [...root.querySelectorAll('[data-r="9"], [data-r="10"]')].map(c => ['l', 'r'].find(s => c.classList.contains(s)));
  expect(sides).toEqual(['l', 'r']);
});
