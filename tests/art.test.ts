import { expect, test } from 'vitest';
import { h } from '../src/render/dom';
import { StaticChibiArt } from '../src/art/StaticChibiArt';
import { artRequest } from '../src/art/CharacterArt';
import { fallbackCircle } from '../src/art/fallbackCircle';
import { moodOf } from '../src/scenario/mood';
import { syntheticEpisode } from './helpers';

const art = new StaticChibiArt('/sd');
const req = (name: string) => ({ name, face: '', motion: '', mood: null });

test('h 略過 null/false 並攤平子節點', () =>
  expect(h('div', { class: 'a', hidden: false }, ['x', null, h('b', {}, 1)]).outerHTML).toBe('<div class="a">x<b>1</b></div>'));
test('h 綁定事件與布林屬性', () => {
  let n = 0;
  const el = h('button', { onclick: () => n++, disabled: true });
  el.dispatchEvent(new Event('click'));
  expect(n).toBe(1);
  expect(el.getAttribute('disabled')).toBe('');
});
test('主角用小人圖，姓＋名同一張', () => {
  const el = art.render({ name: '星乃一歌', face: 'face_smile_01', motion: 'w-adult12-tilthead', mood: '微笑' }, 'sm');
  expect(el.querySelector('img')?.getAttribute('src')).toBe('/sd/chr_sd_01_01.webp');
  expect(art.render(req('一歌'), 'md').querySelector('img')?.getAttribute('src')).toBe('/sd/chr_sd_01_01.webp');
});
test('主角不輸出名字文字', () => expect(art.render(req('一歌'), 'sm').textContent).toBe(''));
test('配角是名字在內的圓圈', () => {
  const el = art.render(req('真堂'), 'sm');
  expect(el.textContent).toBe('真堂');
  expect(el.querySelector('img')).toBeNull();
  expect((el.querySelector('.circle') as HTMLElement).style.background).toContain('123, 132, 150');
});
test('長名字縮字級', () => {
  expect(fallbackCircle('路人', '#7b8496', 'sm').querySelector('.circle')!.classList.contains('long')).toBe(false);
  expect(fallbackCircle('路過學生', '#7b8496', 'sm').querySelector('.circle')!.classList.contains('long')).toBe(true);
  expect(fallbackCircle('路過的女學生', '#7b8496', 'sm').querySelector('.circle')!.classList.contains('xlong')).toBe(true);
});
test('尺寸 class', () => expect(art.render(req('真堂'), 'lg').className).toBe('cc cc-lg'));
test('artRequest 帶上表情與動作', () => {
  const line = syntheticEpisode().lines[1];
  expect(artRequest(line)).toEqual({ name: line.who, face: line.face, motion: line.motion, mood: moodOf(line.face) });
});
test('主角但沒有小人圖時用代表色圓圈', () => {
  const limited = new StaticChibiArt('/sd', [1]);
  const el = limited.render(req('咲希'), 'sm');
  expect(el.querySelector('img')).toBeNull();
  expect(el.textContent).toBe('咲希');
  expect((el.querySelector('.circle') as HTMLElement).style.background).toContain('255, 221, 68');
});
test('圖片載入失敗換成圓圈', () => {
  const el = art.render(req('一歌'), 'sm');
  el.querySelector('img')!.dispatchEvent(new Event('error'));
  expect(el.querySelector('img')).toBeNull();
  expect(el.textContent).toBe('一歌');
});
test('小人圖預留尺寸，載入時版面不跳動', () => {
  const img = art.render(req('一歌'), 'sm').querySelector('img')!;
  expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['160', '136']);
});
