import { expect, test } from 'vitest';
import { bubble, fitBubbles } from '../src/render/comic/bubbles';
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
test('box 與 cut 沒有尾巴，其餘依側邊', () => {
  expect(bubble(line, 'l', 'box').getAttribute('data-tail')).toBe('none');
  expect(bubble(line, 'r', 'cut').getAttribute('data-tail')).toBe('none');
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
