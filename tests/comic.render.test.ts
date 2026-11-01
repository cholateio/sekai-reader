import { expect, test } from 'vitest';
import { StaticChibiArt } from '../src/art/StaticChibiArt';
import { renderComic } from '../src/render/comic';
import { speakerSide } from '../src/render/comic/bubbles';
import { autoBoard } from '../src/storyboard/auto';
import { syntheticBoard, syntheticEpisode } from './helpers';

const ep = syntheticEpisode();
const art = new StaticChibiArt('/sd');
const opts = { bgUrl: () => null };
const render = (b = syntheticBoard()) => renderComic(ep, b, art, opts);
const rsOf = (root: HTMLElement) => [...root.querySelectorAll('[data-r]')].map(e => Number(e.getAttribute('data-r')));

test('每句台詞剛好出現一次', () => expect(rsOf(render())).toEqual(ep.lines.map(l => l.r)));
test('台詞文字原文呈現', () => {
  const root = render();
  for (const l of ep.lines)
    expect(root.querySelector(`[data-r="${l.r}"]`)!.textContent).toContain(l.body.replace(/^（|）$/g, '').slice(0, 6));
});
test('沒有名字下標與表情標籤', () => {
  const root = render();
  expect(root.querySelector('.cc > span, .md-mood, .mood, .who-note')).toBeNull();
  expect(root.textContent).not.toContain('微笑');
});
test('主角是小人圖、配角是圓圈', () => {
  const root = render();
  expect(root.querySelector('img.sd[src="/sd/chr_sd_01_01.webp"]')).not.toBeNull();
  expect([...root.querySelectorAll('.circle')].map(e => e.textContent)).toContain('真堂');
});
test('根元素與格子數', () => {
  const root = render();
  expect(root.classList.contains('comic')).toBe(true);
  expect(root.querySelectorAll('.pn').length).toBeGreaterThanOrEqual(13);
});
test('split 單句退化為 talk', () => {
  const b = syntheticBoard();
  b.panels[11] = { t: 'split', l: [8], edge: 1 };
  b.panels.splice(12, 0, { t: 'talk', l: [9] });
  const root = render(b);
  expect(root.querySelector('.split')).toBeNull();
  expect(rsOf(root)).toEqual(ep.lines.map(l => l.r));
});
test('split 兩句並排', () => expect(render().querySelector('.split')!.querySelectorAll('.pn').length).toBe(2));
test('impact 無 l 不丟例外', () => {
  const root = render();
  expect(root.querySelector('.pn.impact')).not.toBeNull();
});
test('沒有 l 的各種格子都不丟例外', () => {
  const b = syntheticBoard();
  for (const t of ['close', 'pop', 'beat', 'insert', 'reveal', 'shout', 'mono', 'talk', 'split'] as const) b.panels.push({ t });
  expect(() => render(b)).not.toThrow();
});
test('規則分鏡也能渲染', () => {
  const root = renderComic(ep, autoBoard(ep), art, opts);
  expect(rsOf(root)).toEqual(ep.lines.map(l => l.r));
});
test('心聲格去掉括號、思考框點線', () => {
  const el = render().querySelector('[data-r="4"]')!;
  expect(el.textContent).toBe('說不定今天能把副歌寫完……');
});
test('insert 標示唸出的人', () => expect(render().querySelector('.insert small')!.textContent).toBe('一歌 唸出的內容'));
test('說話者左右交替、換場重置', () => {
  const s = speakerSide();
  expect([s.side('一歌'), s.side('咲希'), s.side('一歌'), s.side('')]).toEqual(['l', 'r', 'l', 'c']);
  s.reset();
  expect(s.side('咲希')).toBe('l');
});
test('姓＋名與名同一側', () => {
  const s = speakerSide();
  expect(s.side('一歌')).toBe('l');
  expect(s.side('咲希')).toBe('r');
  expect(s.side('星乃一歌')).toBe('l');
});
test('特寫格對白框尾巴指向左側的角色', () => {
  const b = syntheticBoard();
  b.panels[2] = { t: 'talk', l: [1] };
  b.panels[3] = { t: 'close', l: [2] };  // 咲希 is the second speaker in the scene, so her side is 'r'
  const bb = render(b).querySelector('.closeup [data-r="2"]')!;
  expect(bb.classList.contains('l')).toBe(true);
  expect(bb.classList.contains('r')).toBe(false);
});

test('每句的形狀來自規則', () => {
  const root = render();
  expect(root.querySelector('[data-r="4"]')!.classList.contains('bb-cloud')).toBe(true);
  expect(root.querySelector('[data-r="9"]')!.classList.contains('bb-box')).toBe(true);
  expect(root.querySelector('[data-r="6"]')!.classList.contains('bb-wobble')).toBe(true);
  expect(root.querySelector('[data-r="12"]')!.classList.contains('bb-whisper')).toBe(true);
});
test('分鏡 shape 覆寫生效（規則會給 round／phone，覆寫成 cloud／box）', () => {
  const root = render();
  expect(root.querySelector('[data-r="1"]')!.classList.contains('bb-cloud')).toBe(true);
  expect(root.querySelector('[data-r="2"]')!.classList.contains('bb-box')).toBe(true);
});
test('沒有 shape 覆寫時手機訊息是 phone 框', () => {
  const b = syntheticBoard(); delete b.panels.find(x => x.t === 'inset')!.shape;
  expect(render(b).querySelector('[data-r="2"]')!.classList.contains('bb-phone')).toBe(true);
});
test('沒有舊式 class', () => expect(render().querySelector('.bb.thought, .bb.phone, .mcap')).toBeNull());
test('shout 格的台詞是尖刺對白框，不再是固定星形', () => {
  const b = syntheticBoard();
  b.panels.find(p => p.t === 'reveal')!.l = [];
  b.panels.find(p => p.t === 'shout')!.l = [11];
  const root = render(b);
  const bb = root.querySelector('.pn.shout-pn .bb')!;
  expect(bb.classList.contains('bb-shout')).toBe(true);
  expect(bb.classList.contains('huge')).toBe(true);
  expect(bb.querySelector('svg.bo')).not.toBeNull();
  expect(root.querySelector('.shout')).toBeNull();
});
test('reveal 的台詞也是對白框', () => {
  const bb = render().querySelector('.pn.reveal .bb')!;
  expect(bb.querySelector('svg.bo')).not.toBeNull();
  expect(bb.classList.contains('small')).toBe(true);
});
test('每個 .bb 都有 svg.bo，每句台詞都在 .bb 或剪貼格裡', () => {
  const root = render();
  for (const bb of root.querySelectorAll('.bb')) expect(bb.querySelector('svg.bo')).not.toBeNull();
  for (const el of root.querySelectorAll('[data-r]')) expect(el.classList.contains('bb') || el.classList.contains('itext')).toBe(true);
});
