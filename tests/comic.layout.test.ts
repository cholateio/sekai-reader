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
  expect(camFor({ t: 'impact' }, 0)).toEqual({ focus: [0.5, 0.5], zoom: 1.2 });
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
  expect(el.style.getPropertyValue('--blur')).toBe('2px');
  expect(el.style.filter).toBe('');
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
  expect(root.querySelector('.pn.impact .bgl.dark')).not.toBeNull();
});
test('split 每半格各有背景', () => expect(withBg().querySelectorAll('.split .pn .bgl').length).toBe(2));
test('沒有背景圖時退回素紙色、不出現 .bgl、不鋪整面網點', () => {
  const root = noBg();
  expect(root.querySelector('.bgl')).toBeNull();
  expect(root.querySelector('.tone-bg')).toBeNull();
  for (const pn of root.querySelectorAll('.pn:not(.impact)')) expect(pn.classList.contains('paper')).toBe(true);
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

const render = (b = syntheticBoard()) => renderComic(ep, b, art, { bgUrl: () => null });
const clipOf = (pn: Element) => {
  const m = /polygon\(0 ([\d.]+)px, 100% ([\d.]+)px, 100% calc\(100% - ([\d.]+)px\), 0 calc\(100% - ([\d.]+)px\)\)/
    .exec((pn as HTMLElement).style.getPropertyValue('clip-path'))!;
  return { tl: +m[1], tr: +m[2], br: +m[3], bl: +m[4] };
};

test('斜接縫的下一列往上疊 S，平接縫不疊', () => {
  const root = withBg();
  const rows = [...root.children].filter(r => !r.classList.contains('credit')) as HTMLElement[];
  const talk0 = root.querySelector('[data-r="0"]')!.closest('.pw') as HTMLElement;   // above is est (bleed, no ink) → flat, one ink line less
  expect(talk0.style.marginTop).toBe('-2.5px');
  expect(rows[rows.indexOf(talk0) + 1].style.marginTop).toBe('-22px');                 // talk0 edge 1 → slanted, ink on both sides
  const split = root.querySelector('.split') as HTMLElement;                            // impact edge 0 above → flat, ink on both sides
  expect(split.style.marginTop).toBe('');
  expect(root.style.gap).toBe('15px');
});
test('split 列（容器）在斜接縫下方整列往上疊', () => {
  const b = syntheticBoard(); b.panels.find(p => p.t === 'impact')!.edge = 1;
  expect((render(b).querySelector('.split') as HTMLElement).style.marginTop).toBe('-22px');
});
test('斜接縫兩邊平行：上格底邊位移與下格頂邊位移互補', () => {
  const root = withBg();
  const rows = [...root.children].filter(r => r.classList.contains('pw')) as HTMLElement[];
  let slanted = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1].nextElementSibling !== rows[i]) continue;
    const up = clipOf(rows[i - 1].querySelector(':scope > .pn')!), dn = clipOf(rows[i].querySelector(':scope > .pn')!);
    if (up.bl + up.br === 0) { expect([dn.tl, dn.tr]).toEqual([0, 0]); continue; }
    slanted++;
    expect(up.bl + dn.tl).toBe(22);
    expect(up.br + dn.tr).toBe(22);
  }
  expect(slanted).toBeGreaterThan(0);
});
test('框列接 est 的接縫一律平接、少留一條墨線', () => {
  const b = syntheticBoard();
  const trans = b.panels.find(p => p.t === 'trans')!;
  trans.t = 'talk'; delete trans.caps; trans.l = [];
  b.panels.splice(b.panels.indexOf(trans) + 1, 0, { t: 'est', caps: [2], edge: 0 });
  trans.edge = 1;
  const ests = render(b).querySelectorAll('.pn.est');
  expect(ests.length).toBe(2);
  const estRow = ests[1].closest('.pw') as HTMLElement;
  // Scene change without a trans card keeps its 20px pacing gap; the est side has no ink, so 20 - 2.5.
  expect(estRow.style.marginTop).toBe('17.5px');
  expect(clipOf(ests[1])).toMatchObject({ tl: 0, tr: 0 });
});
test('inset 小格不被包進 .pw', () => expect(withBg().querySelector('.inset')!.parentElement!.classList.contains('inset-pn')).toBe(true));
test('pair 兩半各有背景與斜切', () => {
  const root = withBg();
  expect(root.querySelectorAll('.pair .pn .bgl').length).toBe(2);
  for (const pn of root.querySelectorAll('.pair .pn')) expect((pn as HTMLElement).style.getPropertyValue('clip-path')).toContain('polygon(');
});
test('inset 小格有自己的背景層', () => expect(withBg().querySelector('.inset .bgl')).not.toBeNull());
test('pair 列（容器）在斜接縫下方整列往上疊', () => {
  const b = syntheticBoard(); b.panels.find(p => p.t === 'reveal')!.edge = 1;
  expect((render(b).querySelector('.pair') as HTMLElement).style.marginTop).toBe('-22px');
});

const sel: Record<string, string> = { pop: 'pop', impact: 'impact', reveal: 'reveal', shout: 'shout-pn', mono: 'mono' };
test.each([['pop', 'fx-speed'], ['impact', 'fx-focus'], ['reveal', 'fx-flash'], ['shout', 'fx-flash'], ['mono', 'fx-wash']])(
  '%s 格有 %s', (t, cls) => expect(withBg().querySelector(`.pn.${sel[t]} .${cls}`)).not.toBeNull());
test('camFor 的新預設', () => {
  expect(camFor({ t: 'impact' }, 0)).toEqual({ focus: [0.5, 0.5], zoom: 1.2 });
  expect(camFor({ t: 'beat' }, 0)).toEqual({ focus: [0.32, 0.62], zoom: 1.3, blur: 2 });
  expect(camFor({ t: 'shout' }, 0)).toEqual({ focus: [0.5, 0.5], zoom: 1.3, blur: 1 });
});
test('impact 的對白框是 huge', () => {
  const b = syntheticBoard();
  b.panels.find(p => p.t === 'reveal')!.l = [];
  b.panels.find(p => p.t === 'impact')!.l = [11];
  expect(render(b).querySelector('.pn.impact .bb.huge.bb-shout')).not.toBeNull();
});
test('impact 背景缺檔仍有集中線、沒有紙色 class', () => {
  const pn = noBg().querySelector('.pn.impact') as HTMLElement;
  expect(pn.querySelector('.bgl')).toBeNull();
  expect(pn.querySelector('.fx-focus')).not.toBeNull();
  expect(pn.classList.contains('paper')).toBe(false);
});
test('serious 色調有暗角', () => {
  const b = syntheticBoard(); b.panels[1].tone = 'serious';
  expect(render(b).querySelector('[data-r="0"]')!.closest('.pn')!.querySelector('.fx-vignette')).not.toBeNull();
});
test('狀聲字：sfx 格反相、est 有 sfx 才出現、impact 有 sfx 才出現', () => {
  const root = render();
  expect(root.querySelector('.pn.est .sfx')).toBeNull();
  expect(root.querySelector('.pn.sfx-pn .sfx.ink')!.textContent).toBe('轟隆');
  expect(root.querySelector('.pn.impact .sfx')).toBeNull();
  const b = syntheticBoard(); b.panels[0].sfx = 'sasa'; b.panels.find(p => p.t === 'impact')!.sfx = 'don';
  const r2 = render(b);
  expect(r2.querySelector('.pn.est .sfx:not(.ink)')!.textContent).toBe('sasa');
  expect(r2.querySelector('.pn.impact .sfx')!.textContent).toBe('don');
});
test('沒有 blur 時 --blur 為空', () => expect(backgroundLayer('/bg/x.webp', { focus: [0.5, 0.5], zoom: 1 }).style.getPropertyValue('--blur')).toBe(''));
