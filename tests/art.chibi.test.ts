import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { artRequest, type ArtRequest, type ArtSize, type CharacterArt } from '../src/art/CharacterArt';
import { emotionOf, episodeKinds, kindOf, mirrored, pickAnimations, POSE_DEFAULT, startPose } from '../src/art/chibiPose';
import { SpineChibiArt, type ChibiPlayer, type ChibiTarget } from '../src/art/SpineChibiArt';
import { StaticChibiArt } from '../src/art/StaticChibiArt';
import { renderComic } from '../src/render/comic';
import type { Line } from '../src/scenario/types';
import type { Storyboard } from '../src/storyboard/types';
import { chibiDevIndex } from '../scripts/chibi_dev';
import { syntheticEpisode } from './helpers';

const line = (o: Partial<Line>): Line => ({ r: 0, who: '一歌', phone: false, group: false, body: 'x', face: '', motion: '', bg: null, flash: false, shake: false, ...o });
const ANIMS = ['v2_w_cute_talk01_f', 'v2_w_cute_joy02_f', 'v2_w_cute_joy01_f', 'v2_w_cute_idle01_f', 'v2_w_normal_idle01_f', 'v2_w_normal_sad01_f',
  'v2_w_normal_talk01_f', 'v2_m_cool_idle01_f', 'v2_m_cool_talk01_f', 'v2_w_adult_talk01_f2', POSE_DEFAULT];

test('kindOf 從劇本動作名取性別與個性；s-common 與空字串沒有', () => {
  expect(kindOf('w-cute11-tilthead')).toEqual({ g: 'w', kind: 'cute' });
  expect(kindOf('m-cool03-nod')).toEqual({ g: 'm', kind: 'cool' });
  expect(kindOf('s-common-nod01')).toBeNull();
  expect(kindOf('')).toBeNull();
});

test('episodeKinds 取每個小人在這一話最常出現的個性', () => {
  const k = episodeKinds([
    line({ chibi: 'a', motion: 'w-cute01-nod' }), line({ chibi: 'a', motion: 'w-adult01-nod' }), line({ chibi: 'a', motion: 'w-adult02-nod' }),
    line({ chibi: 'a', motion: 's-common-nod01' }), line({ chibi: 'b', motion: 'w-cute01-nod' }), line({ motion: 'w-pure01-nod' }),
  ]);
  expect([...k]).toEqual([['a', { g: 'w', kind: 'adult' }], ['b', { g: 'w', kind: 'cute' }]]);
});

test('情緒對照：開心大笑、微笑 joy、低落 sad、沒有表情就說話', () => {
  expect([emotionOf('開心'), emotionOf('微笑'), emotionOf('低落'), emotionOf('驚訝'), emotionOf(null), emotionOf('認真')])
    .toEqual(['laugh', 'joy', 'sad', 'surprise', 'talk', 'talk']);
});

test('pickAnimations：先播情緒一次，再回同個性的待機；找不到依序退', () => {
  const none = new Map();
  expect(pickAnimations(ANIMS, 'v2_sd_01ichika_school', 'w-cute11-tilthead', '微笑', none)).toEqual({ once: 'v2_w_cute_joy01_f', idle: 'v2_w_cute_idle01_f' });
  // cute has no sad: falls to cute talk before normal sad.
  expect(pickAnimations(ANIMS, 'v2_sd_01ichika_school', 'w-cute11-tilthead', '低落', none).once).toBe('v2_w_cute_talk01_f');
  // pure is missing entirely: normal's emotion, idle from normal.
  expect(pickAnimations(ANIMS, 'v2_sd_01ichika_school', 'w-pure01-nod', '低落', none)).toEqual({ once: 'v2_w_normal_sad01_f', idle: 'v2_w_normal_idle01_f' });
  // `_f2` variants are not picked.
  expect(pickAnimations(ANIMS, 'v2_sd_07airi_school', 'w-adult01-nod', null, none).once).toBe('v2_w_normal_talk01_f');
  // No motion: the episode's kind, else the character's gender with normal.
  expect(pickAnimations(ANIMS, 'x', 's-common-nod01', null, new Map([['x', { g: 'w' as const, kind: 'cute' }]])).once).toBe('v2_w_cute_talk01_f');
  expect(pickAnimations(ANIMS, 'v2_sd_13tsukasa_school', '', null, none)).toEqual({ once: POSE_DEFAULT, idle: POSE_DEFAULT });
  expect(pickAnimations([POSE_DEFAULT], 'v2_sd_01ichika_school', 'w-cute01-nod', '開心', none)).toEqual({ once: POSE_DEFAULT, idle: POSE_DEFAULT });
});

test('startPose：情緒播一次再接循環的待機；兩個相同（只有待機或預設姿勢）就直接循環，不會停住', () => {
  const calls: unknown[][] = [];
  const track = { setAnimation: (...a: unknown[]) => calls.push(['set', ...a]), addAnimation: (...a: unknown[]) => calls.push(['add', ...a]) };
  startPose(track, { once: 'joy', idle: 'idle' });
  expect(calls).toEqual([['set', 0, 'joy', false], ['add', 0, 'idle', true, 0]]);
  calls.length = 0;
  startPose(track, { once: POSE_DEFAULT, idle: POSE_DEFAULT });
  expect(calls).toEqual([['set', 0, POSE_DEFAULT, true]]);
});

test('朝向：站左邊的鏡像朝右；右邊、置中與遊戲不翻的小人不鏡像', () => {
  const noflip = new Set(['v2_sd_21miku_band']);
  expect(mirrored('l', 'v2_sd_01ichika_school', noflip)).toBe(true);
  expect(mirrored('r', 'v2_sd_01ichika_school', noflip)).toBe(false);
  expect(mirrored('c', 'v2_sd_01ichika_school', noflip)).toBe(false);
  expect(mirrored(undefined, 'v2_sd_01ichika_school', noflip)).toBe(false);
  expect(mirrored('l', 'v2_sd_21miku_band', noflip)).toBe(false);
});

test('artRequest 帶上小人名與站位；沒有就省略', () => {
  expect(artRequest(line({ chibi: 'v2_sd_01ichika_school' }), 'l')).toMatchObject({ chibi: 'v2_sd_01ichika_school', side: 'l' });
  const r = artRequest(line({}));
  expect('chibi' in r || 'side' in r).toBe(false);
});

class Recorder implements CharacterArt {
  calls: (ArtRequest & { size: ArtSize })[] = [];
  render(req: ArtRequest, size: ArtSize) { this.calls.push({ ...req, size }); const el = document.createElement('span'); return el; }
}

test('每種格子把站位傳給小人：特寫在左、pair 左右、一排多人左半朝右', () => {
  const ep = syntheticEpisode();
  const rs = ep.lines.filter(l => l.who && !l.group).map(l => l.r);
  const board: Storyboard = { sid: ep.sid, v: 1, panels: [
    { t: 'close', l: [rs[0]] }, { t: 'pair', l: [rs[1], rs[2]] }, { t: 'split', l: [rs[3], rs[4]] },
    { t: 'shout', l: [rs[5]], cast: ['一歌', '咲希', '穗波'] },
  ] } as unknown as Storyboard;
  const art = new Recorder();
  renderComic(ep, board, art, { bgUrl: () => null });
  expect(art.calls.map(c => [c.side, c.size])).toEqual([['l', 'lg'], ['l', 'sm'], ['r', 'sm'], ['c', 'md'], ['c', 'md'], ['l', 'sm'], ['c', 'sm'], ['r', 'sm']]);
});

afterEach(() => { vi.unstubAllGlobals(); });

const flush = () => new Promise(r => setTimeout(r, 60));
const still = new StaticChibiArt('/sd');
const req = (o: Partial<ArtRequest> = {}): ArtRequest => ({ name: '一歌', face: '', motion: '', mood: null, chibi: 'v2_sd_01ichika_school', ...o });

test('SpineChibiArt：先回靜態圖；播放器載好後才接手，之後的直接接', async () => {
  const attached: ChibiTarget[] = [];
  const player: ChibiPlayer = { attach: t => attached.push(t) };
  let loads = 0;
  const art = new SpineChibiArt(still, [], async () => { loads++; return player; });
  const el = art.render(req(), 'sm');
  expect(el.querySelector('img.sd')).not.toBeNull();
  art.render(req({ name: '咲希', chibi: 'v2_sd_02saki_school' }), 'md');
  expect(attached).toEqual([]);
  await flush();
  expect(loads).toBe(1);
  expect(attached.map(t => [t.req.chibi, t.size])).toEqual([['v2_sd_01ichika_school', 'sm'], ['v2_sd_02saki_school', 'md']]);
  art.render(req(), 'lg');
  expect(attached.length).toBe(3);
});

test('SpineChibiArt：沒有小人、配角圓圈、減少動態效果、載入失敗都維持靜態圖', async () => {
  const attached: ChibiTarget[] = [];
  const ok = new SpineChibiArt(still, [], async () => ({ attach: t => attached.push(t) }));
  ok.render(req({ chibi: undefined }), 'sm');
  ok.render(req({ name: '真堂' }), 'sm');                      // side character: a name circle, no image box to swap
  await flush();
  expect(attached).toEqual([]);

  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
  let loads = 0;
  new SpineChibiArt(still, [], async () => { loads++; return { attach: () => {} }; }).render(req(), 'sm');
  await flush();
  expect(loads).toBe(0);
  vi.unstubAllGlobals();

  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const bad = new SpineChibiArt(still, [], async () => { throw new Error('no webgl'); });
  const el = bad.render(req(), 'sm');
  await flush();
  expect(el.querySelector('img.sd')).not.toBeNull();
  let again = 0;
  const after = new SpineChibiArt(still, [], async () => { again++; throw new Error('x'); });
  after.render(req(), 'sm'); await flush(); after.render(req(), 'sm'); await flush();
  expect(again).toBe(1);                                         // a failed load is not retried per figure
  warn.mockRestore();
});

test('開發用小人清單：骨架在、兩個檔都在的才列；不合名稱的資料夾不列', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chibi-dev-'));
  const idx = path.join(dir, 'index.json');
  fs.writeFileSync(idx, JSON.stringify({ noflip: ['v2_sd_21miku_band'] }));
  const set = (n: string, files: string[]) => { fs.mkdirSync(path.join(dir, n)); for (const f of files) fs.writeFileSync(path.join(dir, n, f), 'x'); };
  set('v2_sd_01ichika_school', ['sekai_atlas.atlas.txt', 'sekai_atlas.png']);
  set('v2_sd_02saki_school', ['sekai_atlas.atlas.txt']);
  set('not_a_chibi', ['sekai_atlas.atlas.txt', 'sekai_atlas.png']);
  expect(chibiDevIndex(dir, idx)).toEqual({ names: [], noflip: [] });  // no skeleton yet
  fs.writeFileSync(path.join(dir, 'v2_sd_main.skel'), 'x');
  expect(chibiDevIndex(dir, idx)).toEqual({ names: ['v2_sd_01ichika_school'], noflip: ['v2_sd_21miku_band'] });
});
