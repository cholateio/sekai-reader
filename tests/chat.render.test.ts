import { expect, test } from 'vitest';
import { renderChat } from '../src/render/chat';
import { syntheticEpisode } from './helpers';

const ep = syntheticEpisode();
const root = renderChat(ep);

test('根元素', () => expect(root.classList.contains('story')).toBe(true));
test('訊息數 = 有說話者的台詞數', () => expect(root.querySelectorAll('.msg').length).toBe(ep.lines.filter(l => l.who).length));
test('旁白是 narr', () => expect(root.querySelector('.narr')!.textContent).toBe('窗外的雨聲漸漸變小。'));
test('每句台詞剛好出現一次', () =>
  expect([...root.querySelectorAll('[data-r]')].map(e => Number(e.getAttribute('data-r')))).toEqual(ep.lines.map(l => l.r)));
test('場景卡位置', () => {
  const scenes = root.querySelectorAll('.scene');
  expect(scenes.length).toBe(3);
  expect(scenes[2].textContent).toContain('幾天後');
  expect(scenes[2].textContent).toContain('夜晚');
  const r8 = root.querySelector('[data-r="8"]')!;
  expect(scenes[2].compareDocumentPosition(r8) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const r6 = root.querySelector('[data-r="6"]')!;
  expect(scenes[2].compareDocumentPosition(r6) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
});
test('回憶框包住回憶句', () => {
  expect(root.querySelector('[data-r="5"]')!.closest('.flash')).not.toBeNull();
  expect(root.querySelector('[data-r="6"]')!.closest('.flash')).toBeNull();
});
test('手機訊息與震動', () => {
  expect(root.querySelector('[data-r="2"]')!.closest('.msg')!.classList.contains('phone')).toBe(true);
  expect(root.querySelector('[data-r="2"]')!.classList.contains('phone')).toBe(true);
  expect(root.querySelector('[data-r="6"]')!.closest('.msg')!.classList.contains('shake')).toBe(true);
});
test('對話模式保留表情標籤', () => expect(root.querySelector('[data-r="1"]')!.closest('.msg')!.querySelector('.mood')!.textContent).toBe('微笑'));
test('姓＋名用同一代表色', () => {
  const av = (r: number) => (root.querySelector(`[data-r="${r}"]`)!.closest('.msg')!.querySelector('.av') as HTMLElement).style.background;
  expect(av(1)).toBe(av(0));
});
