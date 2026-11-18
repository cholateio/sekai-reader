import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { rebuildEpisodes } from '../scripts/rebuild_episodes';
import { chibiOf, parseChibiCatalogue, type ChibiCatalogue } from '../src/scenario/chibi';
import { parseScenario } from '../src/scenario/parse';
import type { RawScenario } from '../src/scenario/types';

// Characters 3-26 get placeholder chibis: a catalogue must name a default for every game character.
const OTHERS = Array.from({ length: 24 }, (_, i) => [String(i + 3), `v2_sd_${String(i + 3).padStart(2, '0')}c_school`] as const);
const CAT: ChibiCatalogue = {
  chibis: ['v2_sd_01ichika_casual', 'v2_sd_01ichika_school', 'v2_sd_02saki_school', ...OTHERS.map(([, n]) => n)],
  costumes: { v2_01ichika_school01: 'v2_sd_01ichika_school', v2_01ichika_casual: 'v2_sd_01ichika_casual' },
  default: { 1: 'v2_sd_01ichika_school', 2: 'v2_sd_02saki_school', ...Object.fromEntries(OTHERS) },
  chars: { 278: 1, 279: 2 },
};
// Internally consistent but truncated to one character (what truncated master data would produce).
const ONE = { chibis: ['v2_sd_01ichika_school'], costumes: { v2_01ichika_school01: 'v2_sd_01ichika_school' }, default: { 1: 'v2_sd_01ichika_school' }, chars: { 278: 1 } };
const talk = (who: string, ids: number[]) => ({ WindowDisplayName: who, Body: `${who}說`, TalkCharacters: ids.map(Character2dId => ({ Character2dId })) });
const raw = (): RawScenario => ({
  m_Name: 'synthetic_chibi',
  AppearCharacters: [{ Character2dId: 278, CostumeType: 'v2_01ichika_school01' }, { Character2dId: 279, CostumeType: 'v2_02saki_unknown' }, { Character2dId: 900, CostumeType: 'sub_x' }],
  LayoutData: [{ Character2dId: 278, CostumeType: '' }, { Character2dId: 278, CostumeType: 'v2_01ichika_casual' }],
  TalkData: [talk('一歌', [278]), talk('咲希', [279]), talk('路人', [900]), talk('眾人', [278, 279]), talk('兩人', [278, 279]), talk('一歌', [278]), talk('？', [])],
  Snippets: [
    { Action: 1, ReferenceIndex: 0 }, { Action: 2, ReferenceIndex: 0 }, { Action: 1, ReferenceIndex: 1 }, { Action: 1, ReferenceIndex: 2 },
    { Action: 1, ReferenceIndex: 3 }, { Action: 1, ReferenceIndex: 4 }, { Action: 4, ReferenceIndex: 1 }, { Action: 1, ReferenceIndex: 5 },
    { Action: 1, ReferenceIndex: 6 },
  ],
});

test('每句帶說話角色當下服裝的小人；換裝後跟著換；對照不到用預設；配角、眾人、多人、無說話者不帶', () => {
  const lines = parseScenario(raw(), CAT).lines;
  expect(lines.map(l => [l.who, l.chibi])).toEqual([
    ['一歌', 'v2_sd_01ichika_school'], ['咲希', 'v2_sd_02saki_school'], ['路人', undefined], ['眾人', undefined],
    ['兩人', undefined], ['一歌', 'v2_sd_01ichika_casual'], ['？', undefined],
  ]);
  expect(lines.filter(l => !l.chibi).every(l => !('chibi' in l))).toBe(true);
});

test('沒有目錄時不帶 chibi 欄位，其他輸出不變', () => {
  const plain = parseScenario(raw());
  expect(plain.lines.some(l => 'chibi' in l)).toBe(false);
  expect(parseScenario(raw(), CAT).lines.map(({ chibi: _c, ...l }) => l)).toEqual(plain.lines);
});

test('chibiOf 不吃原型鏈上的鍵', () => {
  expect(chibiOf(CAT, 278, '__proto__')).toBe('v2_sd_01ichika_school');
  expect(chibiOf(CAT, 278, 'constructor')).toBe('v2_sd_01ichika_school');
  expect(chibiOf({ ...CAT, chars: {} }, 278, 'toString')).toBeUndefined();
});

test('parseChibiCatalogue 只收完整格式，損壞就是 null', () => {
  expect(parseChibiCatalogue(JSON.stringify(CAT))).toEqual(CAT);
  for (const bad of ['nope', 'null', '[]', JSON.stringify({ ...CAT, chars: undefined }), JSON.stringify({ ...CAT, chars: { 1: '1' } }),
    JSON.stringify({ ...CAT, costumes: { a: 1 } }), JSON.stringify({ ...CAT, default: [] }), JSON.stringify({ ...CAT, chibis: {} }),
    // Well-formed but useless or inconsistent: each would strip or misroute chibis.
    JSON.stringify({ ...CAT, chibis: [] }), JSON.stringify({ ...CAT, costumes: {} }), JSON.stringify({ ...CAT, default: {} }), JSON.stringify({ ...CAT, chars: {} }),
    JSON.stringify({ ...CAT, chibis: ['placeholder'] }), JSON.stringify({ ...CAT, chibis: [...CAT.chibis, 7] }), JSON.stringify({ ...CAT, chibis: [...CAT.chibis, ''] }),
    JSON.stringify({ ...CAT, costumes: { x: 'v2_sd_99nobody_x' } }), JSON.stringify({ ...CAT, chars: { 278: 1, 300: 99 } }),
    JSON.stringify(ONE), JSON.stringify({ ...CAT, chibis: [...CAT.chibis, 'v2_sd_01ichika_../x'] }),
    JSON.stringify({ ...CAT, default: Object.fromEntries(Object.entries(CAT.default).filter(([k]) => k !== '17')) })]) {
    expect(parseChibiCatalogue(bad), bad).toBeNull();
  }
});

test('rebuild_episodes 只改已發布的話數；沒有原檔的略過；sid 不符或壞檔不動；內容相同不重寫', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-'));
  const rawDir = path.join(dir, 'raw'), pub = path.join(dir, 'public'), eps = path.join(pub, 'episodes');
  fs.mkdirSync(rawDir); fs.mkdirSync(eps, { recursive: true });
  const cat = path.join(dir, 'chibi-index.json');
  fs.writeFileSync(cat, JSON.stringify(CAT));
  const write = (sid: string, r: unknown) => fs.writeFileSync(path.join(rawDir, `${sid}.asset`), JSON.stringify(r));
  write('ep_a', { ...raw(), m_Name: 'ep_a' });
  write('ep_b', { ...raw(), m_Name: 'ep_b' });
  write('ep_c', { ...raw(), m_Name: 'other' });
  fs.writeFileSync(path.join(rawDir, 'ep_d.asset'), '{broken');
  write('ep_new', { ...raw(), m_Name: 'ep_new' });           // raw only: never published, must not appear
  const same = JSON.stringify(parseScenario({ ...raw(), m_Name: 'ep_b' }, CAT));
  for (const sid of ['ep_a', 'ep_c', 'ep_d', 'ep_gone']) fs.writeFileSync(path.join(eps, `${sid}.json`), '{"old":true}');
  fs.writeFileSync(path.join(eps, 'ep_b.json'), same);
  const bTime = fs.statSync(path.join(eps, 'ep_b.json')).mtimeMs;

  const r = rebuildEpisodes(rawDir, pub, cat);
  expect(r).toEqual({ checked: 5, changed: ['ep_a'], skipped: ['ep_gone'], failed: ['ep_c', 'ep_d'] });
  expect(fs.readdirSync(eps).sort()).toEqual(['ep_a.json', 'ep_b.json', 'ep_c.json', 'ep_d.json', 'ep_gone.json']);
  expect(JSON.parse(fs.readFileSync(path.join(eps, 'ep_a.json'), 'utf8')).lines[0].chibi).toBe('v2_sd_01ichika_school');
  for (const sid of ['ep_c', 'ep_d', 'ep_gone']) expect(fs.readFileSync(path.join(eps, `${sid}.json`), 'utf8')).toBe('{"old":true}');
  expect(fs.statSync(path.join(eps, 'ep_b.json')).mtimeMs).toBe(bTime);
  expect(rebuildEpisodes(rawDir, pub, cat).changed).toEqual([]);
  expect(rebuildEpisodes(rawDir, path.join(dir, 'none'), cat)).toEqual({ checked: 0, changed: [], skipped: [], failed: [] });
  // Temp files never land in the published tree, and the staging folder is gone afterwards.
  expect(fs.readdirSync(eps).some(f => f.endsWith('.tmp'))).toBe(false);
  expect(fs.existsSync(path.join(dir, '.rebuild'))).toBe(false);
});

test('rebuild_episodes：目錄不見、壞掉或是空的就整輪不做，一個檔都不動', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-'));
  const rawDir = path.join(dir, 'raw'), pub = path.join(dir, 'public'), eps = path.join(pub, 'episodes');
  fs.mkdirSync(rawDir); fs.mkdirSync(eps, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'ep_a.asset'), JSON.stringify({ ...raw(), m_Name: 'ep_a' }));
  fs.writeFileSync(path.join(eps, 'ep_a.json'), '{"old":true}');
  const cat = path.join(dir, 'chibi-index.json');
  for (const text of [null, '{broken', JSON.stringify({ ...CAT, chibis: [] }), JSON.stringify({ ...CAT, chars: {} }),
    JSON.stringify({ chibis: ['placeholder'], costumes: {}, default: {}, chars: { 278: 1 } }), JSON.stringify(ONE)]) {
    if (text === null) fs.rmSync(cat, { force: true }); else fs.writeFileSync(cat, text);
    expect(() => rebuildEpisodes(rawDir, pub, cat), String(text)).toThrow(/chibi catalogue/);
    expect(fs.readFileSync(path.join(eps, 'ep_a.json'), 'utf8')).toBe('{"old":true}');
  }
});

test('rebuild_episodes：上一輪中斷留下的暫存資料夾會先清掉', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-'));
  const rawDir = path.join(dir, 'raw'), pub = path.join(dir, 'public');
  fs.mkdirSync(rawDir); fs.mkdirSync(path.join(pub, 'episodes'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.rebuild'));
  fs.writeFileSync(path.join(dir, '.rebuild', 'ep_x.json'), 'partial');
  const cat = path.join(dir, 'chibi-index.json');
  fs.writeFileSync(cat, JSON.stringify(CAT));
  rebuildEpisodes(rawDir, pub, cat);
  expect(fs.existsSync(path.join(dir, '.rebuild'))).toBe(false);
});
