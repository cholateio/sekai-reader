import { expect, test } from 'vitest';
import { parseScenario } from '../src/scenario/parse';
import type { RawScenario } from '../src/scenario/types';
import rawJson from './fixtures/synthetic.asset.json';

const raw = rawJson as RawScenario;

test('sid 以 m_Name 為準', () => expect(parseScenario(raw).sid).toBe('synthetic_01'));
test('firstBg 取 FirstBackground', () => expect(parseScenario(raw).firstBg).toBe('bg_test_a'));
test('空白台詞不進 lines，越界索引被略過', () =>
  expect(parseScenario(raw).lines.map(l => l.r)).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13]));
test('姓名與訊息後綴', () => {
  const L = parseScenario(raw).lines;
  expect(L[1]).toMatchObject({ who: '星乃一歌', phone: false });
  expect(L[2]).toMatchObject({ who: '咲希', phone: true });
  expect(L[3]).toMatchObject({ who: '眾人', group: true });
});
test('表情與動作取第一個有 FacialName 的 Motion', () =>
  expect(parseScenario(raw).lines[1]).toMatchObject({ face: 'face_smile_01', motion: 'w-adult12-tilthead' }));
test('回憶與震動旗標', () => {
  const L = parseScenario(raw).lines;
  expect(L[5].flash).toBe(true);
  expect(L[6].shake).toBe(true);
  expect(L[6].flash).toBe(false);
  expect(L[7].shake).toBe(false);
});
test('背景隨 FX7 切換', () => {
  const L = parseScenario(raw).lines;
  expect(L[0].bg).toBe('bg_test_a');
  expect(L.at(-1)!.bg).toBe('bg_test_b');
});
test('scenes 順序、時段、before', () =>
  expect(parseScenario(raw).scenes).toEqual([
    { text: '放學後', time: null, bg: 'bg_test_a', sekai: false, before: 0 },
    { text: '頂樓', time: null, bg: 'bg_test_a', sekai: false, before: 0 },
    { text: '幾天後', time: '夜晚', bg: 'bg_test_b', sekai: false, before: 7 },
  ]));
test('不是劇本檔時丟錯', () => expect(() => parseScenario({} as RawScenario)).toThrow());
