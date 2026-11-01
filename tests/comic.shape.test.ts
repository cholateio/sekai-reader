import { expect, test } from 'vitest';
import { shapeFor } from '../src/render/comic/shape';
import type { UnitFlavor } from '../src/render/comic/flavor';
import type { Line } from '../src/scenario/types';
import type { Panel } from '../src/storyboard/types';

const L = (o: Partial<Line>): Line => ({
  r: 0, who: '一歌', phone: false, group: false, body: '好。', face: '', motion: '', bg: null, flash: false, shake: false, ...o,
});
const NIGHT: UnitFlavor = { accent: '#884499', glyph: '☾', roundRadius: 18, monoShape: 'whisper' };

test.each([
  ['旁白', L({ who: '' }), { t: 'talk' }, 'box'],
  ['手機', L({ phone: true }), { t: 'talk' }, 'phone'],
  ['心聲', L({ body: '（嗯……）' }), { t: 'mono' }, 'cloud'],
  ['被打斷', L({ r: 5 }), { t: 'talk', cut: [5] }, 'cut'],
  ['impact 格', L({}), { t: 'impact' }, 'shout'],
  ['shout 格', L({}), { t: 'shout' }, 'shout'],
  ['pop 格', L({}), { t: 'pop' }, 'shout'],
  ['驚訝表情', L({ face: 'face_surprise_01' }), { t: 'talk' }, 'wobble'],
  ['大寫表情名', L({ face: 'Face_Cry_02' }), { t: 'talk' }, 'wobble'],
  ['震動', L({ shake: true }), { t: 'talk' }, 'wobble'],
  ['短句刪節號', L({ body: '哇…………' }), { t: 'talk' }, 'whisper'],
  ['單個刪節號', L({ body: '是嗎…' }), { t: 'talk' }, 'whisper'],
  ['長句刪節號', L({ body: '這句話很長很長很長很長很長……' }), { t: 'talk' }, 'round'],
  ['困擾表情', L({ face: 'face_trouble_01' }), { t: 'talk' }, 'whisper'],
  ['一般', L({}), { t: 'talk' }, 'round'],
] as [string, Line, Panel, string][])('規則：%s', (_n, line, panel, want) => expect(shapeFor(line, panel, 0)).toBe(want));

test('分鏡 shape 覆寫優先於規則', () => expect(shapeFor(L({ phone: true }), { t: 'talk', l: [0], shape: ['box'] }, 0)).toBe('box'));
test('覆寫依句子位置取', () =>
  expect(shapeFor(L({ r: 3 }), { t: 'talk', l: [2, 3], shape: ['round', 'cloud'] }, 1)).toBe('cloud'));
test('旁白優先於 cut', () => expect(shapeFor(L({ who: '', r: 1 }), { t: 'talk', cut: [1] }, 0)).toBe('box'));
test('心聲優先於 impact 格', () => expect(shapeFor(L({ body: '（不行）' }), { t: 'impact' }, 0)).toBe('cloud'));
test('25時 的 mono 心聲用 whisper', () => expect(shapeFor(L({ body: '（嗯）' }), { t: 'mono' }, 0, NIGHT)).toBe('whisper'));
test('25時 在非 mono 格的心聲仍是 cloud', () => expect(shapeFor(L({ body: '（嗯）' }), { t: 'talk' }, 0, NIGHT)).toBe('cloud'));
