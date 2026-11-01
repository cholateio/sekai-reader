import { expect, test } from 'vitest';
import { cloudCircles, cutPath, drawBubble, roundPath, seeded, shoutPath, tailPath, wobblePath } from '../src/render/comic/bubbleSvg';

const g = { w: 200, h: 60, pad: 16 };
const W = g.w + 2 * g.pad, H = g.h + 2 * g.pad;
const opts = { seed: 1, stroke: '#14161b', radius: 18 };
const svgEl = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
const pairs = (d: string) => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
const inCanvas = (d: string) => { for (const [x, y] of pairs(d)) { expect(x).toBeGreaterThanOrEqual(-1); expect(x).toBeLessThanOrEqual(W + 1); expect(y).toBeGreaterThanOrEqual(-1); expect(y).toBeLessThanOrEqual(H + 1); } };

test('seeded 同種子同序列、不同種子不同、落在 [0,1)', () => {
  const a = seeded(7), b = seeded(7), c = seeded(8);
  const xs = [a(), a(), a()];
  expect([b(), b(), b()]).toEqual(xs);
  expect([c(), c(), c()]).not.toEqual(xs);
  for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
});
test('shoutPath 可重現且點都在畫布內', () => {
  const p1 = shoutPath(g, seeded(3));
  expect(shoutPath(g, seeded(3))).toBe(p1);
  inCanvas(p1);
  expect(pairs(p1).length).toBe(Math.max(18, Math.round((103 + 33) / 9)));
});
test('shoutPath 不同種子形狀不同', () => expect(shoutPath(g, seeded(1))).not.toBe(shoutPath(g, seeded(2))));
test('wobblePath 44 點且在畫布內', () => { const d = wobblePath(g, seeded(1)); expect(pairs(d).length).toBe(44); inCanvas(d); });
test('roundPath 與 cutPath 在畫布內', () => { inCanvas(roundPath(g, 18)); inCanvas(cutPath(g)); });
test('cloudCircles 數量與半徑範圍', () => {
  const cs = cloudCircles(g, seeded(1));
  expect(cs.length).toBe(Math.max(10, Math.round((100 + 30) / 7)));
  for (const c of cs) { expect(c.r).toBeGreaterThanOrEqual(11); expect(c.r).toBeLessThanOrEqual(17); }
});
test('tailPath 方向與位置', () => {
  expect(tailPath('none', g)).toBeNull();
  const tip = (t: 'l' | 'r' | 'c') => pairs(tailPath(t, g)!)[1];
  expect(tip('l')[0]).toBeLessThan(W / 2);
  expect(tip('r')[0]).toBeGreaterThan(W / 2);
  expect(tip('c')[0]).toBeCloseTo(W / 2);
  for (const t of ['l', 'r', 'c'] as const) { inCanvas(tailPath(t, g)!); expect(tip(t)[1]).toBe(g.h + g.pad + 3 + 12); }
});
test('drawBubble 在 jsdom 產生對應子元素', () => {
  const svg = svgEl();
  drawBubble(svg, 'round', 'l', g, opts);
  expect(svg.querySelectorAll('path').length).toBe(3);
  drawBubble(svg, 'cloud', 'l', g, opts);
  const n = cloudCircles(g, seeded(1)).length;
  expect(svg.querySelectorAll('circle').length).toBe(2 * n + 2);
  expect(svg.querySelectorAll('path').length).toBe(0);
});
test('cloud 無尾巴時沒有尾巴圓', () => {
  const svg = svgEl();
  drawBubble(svg, 'cloud', 'none', g, opts);
  expect(svg.querySelectorAll('circle').length).toBe(2 * cloudCircles(g, seeded(1)).length);
});
test('shout 雙描邊', () => {
  const svg = svgEl();
  drawBubble(svg, 'shout', 'none', g, { ...opts, double: true });
  const ps = svg.querySelectorAll('path');
  expect(ps.length).toBe(2);
  expect(ps[0].getAttribute('stroke')).toBe('#fff');
  expect(ps[0].getAttribute('stroke-width')).toBe('7');
  expect(ps[0].getAttribute('fill')).toBe('none');
  expect(ps[1].getAttribute('d')).toBe(ps[0].getAttribute('d'));
});
test('drawBubble 先清空再畫', () => {
  const svg = svgEl();
  drawBubble(svg, 'round', 'l', g, opts);
  drawBubble(svg, 'round', 'l', g, opts);
  expect(svg.querySelectorAll('path').length).toBe(3);
});
test('框體帶 data-role=body，尾巴與外描邊不帶', () => {
  const svg = svgEl();
  drawBubble(svg, 'shout', 'c', g, { ...opts, double: true });
  const body = svg.querySelectorAll('[data-role="body"]');
  expect(body.length).toBe(1);
  expect(body[0].getAttribute('stroke-width')).toBe('3');
  expect(body[0].getAttribute('fill')).toBe('#fff');
  drawBubble(svg, 'cloud', 'l', g, opts);
  expect(svg.querySelectorAll('[data-role="body"]').length).toBe(1);
  expect(svg.querySelector('[data-role="body"]')!.tagName).toBe('rect');
  for (const s of ['round', 'box', 'phone', 'whisper', 'cut', 'wobble'] as const) {
    drawBubble(svg, s, 'l', g, opts);
    expect(svg.querySelectorAll('[data-role="body"]').length).toBe(1);
  }
});
test('whisper 是虛線、shout 描邊 3、phone 淺灰底加訊號塊、cut 與 box 無尾巴', () => {
  const svg = svgEl();
  drawBubble(svg, 'whisper', 'l', g, opts);
  expect(svg.querySelector('[data-role="body"]')!.getAttribute('stroke-dasharray')).toBe('7 5');
  drawBubble(svg, 'shout', 'none', g, opts);
  expect(svg.querySelector('[data-role="body"]')!.getAttribute('stroke-width')).toBe('3');
  drawBubble(svg, 'phone', 'r', g, opts);
  expect(svg.querySelector('[data-role="body"]')!.getAttribute('fill')).toBe('#eef1f6');
  expect(svg.querySelector('rect')).not.toBeNull();
  drawBubble(svg, 'cut', 'l', g, opts);
  expect(svg.querySelectorAll('path').length).toBe(1);
  drawBubble(svg, 'box', 'l', g, opts);
  expect(svg.querySelectorAll('path').length).toBe(1);
});
test('box 用直角、round 用給定圓角', () => {
  expect(roundPath(g, 18)).toContain('A18,18');
  expect(roundPath(g, 2)).toContain('A2,2');
});

test('雲朵的填白主體蓋住整個文字方框（四角也蓋到）', () => {
  const svg = svgEl();
  drawBubble(svg, 'cloud', 'l', g, opts);
  const body = svg.querySelector('[data-role="body"]')!;
  const x = Number(body.getAttribute('x')), y = Number(body.getAttribute('y'));
  const w = Number(body.getAttribute('width')), hh = Number(body.getAttribute('height'));
  expect(x).toBeLessThanOrEqual(g.pad); expect(y).toBeLessThanOrEqual(g.pad);
  expect(x + w).toBeGreaterThanOrEqual(g.pad + g.w); expect(y + hh).toBeGreaterThanOrEqual(g.pad + g.h);
});
test('雲朵沿方框周邊排列，四邊都有', () => {
  const cs = cloudCircles(g, seeded(1));
  const { pad, w, h } = g;
  expect(cs.some(c => c.cy < pad + 8)).toBe(true);
  expect(cs.some(c => c.cy > pad + h - 8)).toBe(true);
  expect(cs.some(c => c.cx < pad + 8)).toBe(true);
  expect(cs.some(c => c.cx > pad + w - 8)).toBe(true);
});
