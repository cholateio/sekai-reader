import { expect, test } from 'vitest';
import { inkFor, resolveCharacter, SIDE_COLOR } from '../src/data/characters';
import { moodOf } from '../src/scenario/mood';

test('名或姓＋名解析成同一角色', () => {
  expect(resolveCharacter('一歌')?.id).toBe(1);
  expect(resolveCharacter('星乃一歌')?.id).toBe(1);
  expect(resolveCharacter('星乃一歌')).toBe(resolveCharacter('一歌'));
});
test('配角與旁白回傳 null', () => {
  expect(resolveCharacter('真堂')).toBeNull();
  expect(resolveCharacter('')).toBeNull();
});
test('配角代表色', () => expect(SIDE_COLOR).toBe('#7b8496'));
test('表情標籤', () => {
  expect(moodOf('face_smile_01')).toBe('微笑');
  expect(moodOf('face_surprise_01')).toBe('驚訝');
  expect(moodOf('')).toBeNull();
  expect(moodOf('face_normal_01')).toBeNull();
});
test('淺色底用深色字、深色底用白字', () => {
  expect(inkFor('#ffdd44')).toBe('#1b2130');
  expect(inkFor('#3366cc')).toBe('#ffffff');
});
