import { expect, test } from 'vitest';
import { bubble, fitBubbles, speakerKey } from '../src/render/comic/bubbles';
import { h } from '../src/render/dom';
import { syntheticEpisode } from './helpers';

const line = syntheticEpisode().lines[0];
const sized = (root: HTMLElement, rect: { width: number; height: number }) => {
  (root.querySelector('.bb') as HTMLElement).getBoundingClientRect =
    () => ({ ...rect, x: 0, y: 0, top: 0, left: 0, right: rect.width, bottom: rect.height, toJSON() {} }) as DOMRect;
};

test('bubble 結構', () => {
  const el = bubble(line, 'l', 'round');
  expect(el.className).toBe('bb bb-round l');
  expect(el.getAttribute('data-r')).toBe(String(line.r));
  expect(el.getAttribute('data-seed')).toBe(String(line.r));
  expect(el.querySelector('svg.bo')!.getAttribute('aria-hidden')).toBe('true');
  expect(el.querySelector('.bt')!.textContent).toBe(line.body);
  expect(el.textContent).toBe(line.body);
});
test('bubble 可指定文字與額外 class', () => {
  const el = bubble(line, 'c', 'shout', ' huge', '改寫');
  expect(el.className).toBe('bb bb-shout c huge');
  expect(el.querySelector('.bt')!.textContent).toBe('改寫');
});
test('box、cut、shout 沒有尾巴，其餘依側邊', () => {
  expect(bubble(line, 'l', 'box').getAttribute('data-tail')).toBe('none');
  expect(bubble(line, 'r', 'cut').getAttribute('data-tail')).toBe('none');
  expect(bubble(line, 'l', 'shout').getAttribute('data-tail')).toBe('none');  // spiky body has no edge for a tail to attach to
  expect(bubble(line, 'r', 'round').getAttribute('data-tail')).toBe('r');
  expect(bubble(line, 'c', 'cloud').getAttribute('data-tail')).toBe('c');
});
test('fitBubbles 依尺寸畫框並在尺寸改變後重畫', () => {
  const root = h('div', {}, bubble(line, 'l', 'shout'));
  let rect = { width: 200, height: 60 };
  sized(root, rect);
  fitBubbles(root);
  const svg = root.querySelector('svg.bo')!;
  expect(svg.getAttribute('viewBox')).toBe('0 0 232 92');
  expect((svg as SVGElement).style.left).toBe('-16px');
  const d1 = svg.querySelector('[data-role="body"]')!.getAttribute('d');
  rect = { width: 300, height: 90 };
  sized(root, rect);
  fitBubbles(root);
  expect(svg.getAttribute('viewBox')).toBe('0 0 332 122');
  expect(svg.querySelector('[data-role="body"]')!.getAttribute('d')).not.toBe(d1);
});
test('尺寸為 0 時不畫（jsdom 預設）', () => {
  const root = h('div', {}, bubble(line, 'l', 'round'));
  fitBubbles(root);
  expect(root.querySelector('svg.bo path')).toBeNull();
});
test('同一句的吶喊框每次一樣', () => {
  const draw = () => { const root = h('div', {}, bubble(line, 'c', 'shout')); sized(root, { width: 200, height: 60 }); fitBubbles(root); return root.querySelector('[data-role="body"]')!.getAttribute('d'); };
  expect(draw()).toBe(draw());
});
test('huge 會畫雙描邊、roundRadius 選項生效', () => {
  const root = h('div', {}, bubble(line, 'c', 'shout', ' huge'));
  sized(root, { width: 200, height: 60 });
  fitBubbles(root);
  expect(root.querySelector('path')!.getAttribute('stroke')).toBe('#fff');
  const r2 = h('div', {}, bubble(line, 'l', 'round'));
  sized(r2, { width: 200, height: 60 });
  fitBubbles(r2, { roundRadius: 6 });
  expect(r2.querySelector('[data-role="body"]')!.getAttribute('d')).toContain('A6,6');
});
test('量測用不受 transform 影響的版面尺寸（impact 進場動畫會先縮放）', () => {
  const root = h('div', {}, bubble(line, 'c', 'shout'));
  const bb = root.querySelector('.bb') as HTMLElement;
  bb.getBoundingClientRect = () => ({ width: 140, height: 42, x: 0, y: 0, top: 0, left: 0, right: 140, bottom: 42, toJSON() {} }) as DOMRect;
  Object.defineProperty(bb, 'offsetWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(bb, 'offsetHeight', { configurable: true, get: () => 60 });
  fitBubbles(root);
  expect(root.querySelector('svg.bo')!.getAttribute('viewBox')).toBe('0 0 232 92');
});

const at = (el: Element, left: number, top: number, width: number, height: number) => {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ width, height, x: left, y: top, left, top, right: left + width, bottom: top + height, toJSON() {} }) as DOMRect;
};
const fig = (who: string) => h('span', { class: 'cc', 'data-who': who });
const tip = (root: Element) => {
  const d = root.querySelector('svg.bo path')!.getAttribute('d')!;
  return [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])])[1];
};
test('bubble 帶說話者 data-who（與 speakerSide 同一把鍵）', () => {
  expect(bubble(line, 'l', 'round').getAttribute('data-who')).toBe(speakerKey(line.who));
  expect(bubble({ ...line, who: '' }, 'l', 'round').hasAttribute('data-who')).toBe(false);
});
test('fitBubbles：尾巴指向同一格裡說話的角色，不管別格或 inset 裡的同名角色', () => {
  const who = speakerKey(line.who);
  const bb = bubble(line, 'l', 'round');
  const mine = fig(who), other = fig('someone'), elsewhere = fig(who);
  const pn = h('div', { class: 'pn' }, bb, other, mine);
  const root = h('div', {}, pn, h('div', { class: 'pn' }, elsewhere));
  at(bb, 0, 0, 200, 60);
  at(other, 10, 120, 120, 100);
  at(mine, 260, 120, 120, 100);
  at(elsewhere, 0, 900, 120, 100);
  fitBubbles(root);
  // Bubble canvas starts 16px left of the bubble; the figure centre is at x=320, i.e. right of the bubble.
  expect(tip(root)[0]).toBeGreaterThan(16 + 200 - 26);
  const inset = h('div', { class: 'inset' }, bb);
  pn.append(inset);
  fitBubbles(root);
  // In the inset no figure of the speaker: back to the fixed left corner tail.
  expect(tip(root)[0]).toBeLessThan(40);
});
test('fitBubbles：特寫格與拍點格的小人在旁邊，尾巴維持固定方向；疊框時尾巴不伸進下一個框', () => {
  const who = speakerKey(line.who);
  for (const cls of ['pn closeup', 'pn beat']) {
    const bb = bubble(line, 'l', 'round'), f = fig(who);
    const root = h('div', { class: cls }, f, bb);
    at(bb, 150, 0, 200, 60);
    at(f, 0, 100, 160, 136);
    fitBubbles(root);
    expect(tip(root)[0]).toBeLessThan(40);
  }
  const a = bubble(line, 'l', 'round'), b = bubble(line, 'l', 'round'), f = fig(who);
  const root = h('div', { class: 'pn' }, h('div', { class: 'bubbles' }, a, b), f);
  at(a, 0, 0, 200, 60);
  at(b, 0, 82, 200, 60);
  at(f, 0, 300, 120, 100);
  fitBubbles(root);
  // In a's canvas, b's frame starts at 82 - 3 + 16 = 95; the tip keeps 2px off it.
  expect(tip(root)[1]).toBeLessThanOrEqual(95 - 2 + 0.01);
  // A stacked cloud: its lowest dot's painted edge (cy + r + stroke) stays above b's frame too.
  const c = bubble(line, 'l', 'cloud'), d = bubble(line, 'l', 'round'), f2 = fig(who);
  const r2 = h('div', { class: 'pn' }, h('div', { class: 'bubbles' }, c, d), f2);
  at(c, 0, 0, 200, 60);
  at(d, 0, 82, 200, 60);
  at(f2, 0, 300, 120, 100);
  fitBubbles(r2);
  const low = (el: Element) => Math.max(...[...el.querySelectorAll('circle')].slice(-2).map(e => Number(e.getAttribute('cy')) + Number(e.getAttribute('r')) + 1));
  expect(low(c)).toBeLessThanOrEqual(95);
  // Speaker far to the side (shallow angle): the cloud dots and a round tail still stop above b's frame.
  at(f2, 600, 120, 120, 100);
  fitBubbles(r2);
  expect(low(c)).toBeLessThanOrEqual(95);
  const e = bubble(line, 'l', 'round'), r3 = h('div', { class: 'pn' }, h('div', { class: 'bubbles' }, e, bubble(line, 'l', 'round')), fig(who));
  at(e, 0, 0, 200, 60);
  at(r3.querySelectorAll('.bb')[1], 0, 82, 200, 60);
  at(r3.querySelector('.cc')!, 600, 120, 120, 100);
  fitBubbles(r3);
  expect(tip(r3)[1]).toBeLessThanOrEqual(95 - 2 + 0.01);
});
