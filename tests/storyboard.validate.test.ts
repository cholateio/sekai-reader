import { expect, test } from 'vitest';
import { validateStoryboard } from '../src/storyboard/validate';
import { syntheticBoard, syntheticEpisode } from './helpers';

const ep = syntheticEpisode();
const fails = (b: unknown, needle: string) =>
  expect(validateStoryboard(b, ep)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining(needle)]) });

test('合成分鏡通過驗證並涵蓋 15 種格子', () => {
  const b = syntheticBoard();
  expect(validateStoryboard(b, ep)).toEqual({ ok: true, board: b });
  expect(new Set(b.panels.map(p => p.t)).size).toBe(15);
});
test('空白台詞 r 不算遺漏', () => {
  expect(ep.lines.some(l => l.r === 7)).toBe(false);
  expect(validateStoryboard(syntheticBoard(), ep).ok).toBe(true);
});
test('遺漏台詞', () => { const b = syntheticBoard(); b.panels[11].l!.pop(); fails(b, 'missing'); });
test('重複台詞', () => { const b = syntheticBoard(); b.panels[2].l = [0, 1]; fails(b, 'duplicate'); });
test('順序錯亂', () => { const b = syntheticBoard(); b.panels[1].l = [1]; b.panels[2].l = [0]; fails(b, 'order'); });
test('引用不存在的台詞', () => { const b = syntheticBoard(); b.panels[12].l = [10, 7]; fails(b, 'unknown'); });
test('caps 遺漏', () => { const b = syntheticBoard(); b.panels[0].caps = [0]; fails(b, 'caption'); });
test('兩格 impact', () => { const b = syntheticBoard(); b.panels.push({ t: 'impact', edge: 0 }); fails(b, 'impact'); });
test('cam 超出範圍', () => { const b = syntheticBoard(); b.panels[0].cam = { focus: [1.2, 0], zoom: 1 }; fails(b, 'cam'); });
test('cam zoom 小於 1', () => { const b = syntheticBoard(); b.panels[0].cam = { focus: [0.5, 0.5], zoom: 0.8 }; fails(b, 'cam'); });
test('edge 不合法', () => { const b = syntheticBoard(); (b.panels[1] as any).edge = 2; fails(b, 'edge'); });
test('sfx 以外的字串欄位含中文被拒', () => { const b = syntheticBoard(); (b.panels[0] as any).bg = '背景'; fails(b, 'CJK'); });
test('未知欄位被拒', () => { const b = syntheticBoard(); (b.panels[1] as any).text = 'hello'; fails(b, 'unknown field'); });
test('sfx 與 cast 可含中文', () => expect(validateStoryboard(syntheticBoard(), ep).ok).toBe(true));
test('未知格子類型被拒', () => { const b = syntheticBoard(); (b.panels[1] as any).t = 'dance'; fails(b, 'type'); });
test('缺 meta 被拒', () => { const b: any = syntheticBoard(); delete b.meta; fails(b, 'meta'); });
test('非物件輸入被拒', () => { expect(validateStoryboard(null, ep).ok).toBe(false); expect(validateStoryboard('x', ep).ok).toBe(false); });
test('trans 不得帶台詞（渲染層只畫字幕）', () => { const b = syntheticBoard(); b.panels[9].l = [6]; b.panels[7].l = []; fails(b, 'trans'); });
test('caps 只能出現在 est／trans', () => {
  const b = syntheticBoard(); b.panels[0].caps = [1]; b.panels[1].caps = [0]; fails(b, 'caps only');
});
test('split 最多兩句', () => { const b = syntheticBoard(); b.panels[11].l = [8, 9, 10]; delete b.panels[12].l; fails(b, 'split'); });

test('合成分鏡涵蓋 15 種格子且至少一格有 shape', () => {
  const b = syntheticBoard();
  expect(new Set(b.panels.map(p => p.t)).size).toBe(15);
  expect(b.panels.some(p => p.shape)).toBe(true);
});
test('pair 必須恰好兩句', () => {
  const b = syntheticBoard(); const p = b.panels.find(x => x.t === 'pair')!;
  const moved = p.l!.pop()!; b.panels.push({ t: 'talk', l: [moved] }); fails(b, 'pair');
});
test('inset 二到四句', () => {
  const b = syntheticBoard(); const p = b.panels.find(x => x.t === 'inset')!;
  const moved = p.l!.pop()!; delete p.shape; b.panels.find(x => x.t === 'close')!.l!.unshift(moved); fails(b, 'inset');
});
test('inset 五句被拒', () => {
  const b = syntheticBoard(); const p = b.panels.find(x => x.t === 'inset')!;
  p.l = [1, 2, 3, 4, 5]; delete p.shape;
  for (const t of ['close', 'mono', 'pop'] as const) delete b.panels.find(x => x.t === t)!.l;
  fails(b, 'inset');
});
test('shape 長度須等於 l', () => { const b = syntheticBoard(); b.panels[1].shape = ['round', 'round']; fails(b, 'shape length'); });
test('shape 值必須在列舉內', () => { const b = syntheticBoard(); (b.panels[1] as any).shape = ['star']; fails(b, 'invalid shape'); });
test('shape 不得含中文', () => { const b = syntheticBoard(); (b.panels[1] as any).shape = ['圓']; fails(b, 'CJK'); expect(validateStoryboard(b, ep)).not.toMatchObject({ errors: expect.arrayContaining([expect.stringContaining('unknown field')]) }); });
test('shape 必須是陣列', () => { const b = syntheticBoard(); (b.panels[1] as any).shape = 'round'; fails(b, 'shape must be an array'); });
