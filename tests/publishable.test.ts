import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { publishableGate, unpublishable } from '../scripts/check_publishable';
import type { IndexFile } from '../scripts/pipeline/state';

const index: IndexFile = {
  built: '2026-11-17',
  events: [
    { id: 185, name: 'running', date: '2026-11-10', bundle: 'b185', eps: [[1, 't', 'event_185_01']], closed: '2026-11-20T06:59:00Z' },
    { id: 184, name: 'no close', date: '2026-10-31', bundle: 'b184', eps: [[1, 't', 'event_184_01']], closed: null },
    { id: 173, name: 'closed', date: '2026-10-01', bundle: 'b173', eps: [[1, 't', 'event_173_01'], [2, 't', 'event_173_02']], closed: '2026-10-10T06:59:00Z' },
  ],
};
const put = (root: string, rel: string, body = '') => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
};
const ep = (sid: string) => JSON.stringify({ sid, lines: [], scenes: [] });

test('部署前檢查：進行中、沒有結束時間、不在目錄裡的劇情檔都擋下；已結束的放行', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  for (const sid of ['event_173_01', 'event_185_01', 'event_184_01', 'event_999_01']) put(dir, `episodes/${sid}.json`, ep(sid));
  for (const f of ['manifest.json', 'bg/bg_a002201.webp', 'sd/chr_sd_01_01.webp', 'banner/event_x.webp', 'banner/s/event_x.webp']) put(dir, f);
  expect(unpublishable(dir, index, new Date('2026-11-20T06:58:59Z'))).toEqual(['episodes/event_184_01.json', 'episodes/event_185_01.json', 'episodes/event_999_01.json']);
  expect(unpublishable(dir, index, new Date('2026-11-20T06:59:00Z'))).toEqual(['episodes/event_184_01.json', 'episodes/event_999_01.json']);
  expect(unpublishable(path.join(dir, 'none'), index, new Date())).toEqual([]);
});

test('部署前檢查：publicDir 整包複製，所以版面外的路徑（子資料夾、根目錄、其他資料夾）一律擋下', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  put(dir, 'episodes/event_173_01.json', ep('event_173_01'));
  for (const f of ['episodes/archive/event_173_01.json', 'episodes/notes.txt', 'episodes/Event_173_01.json', 'event_185_01.json', 'archive/event_185_01.json', 'bg/x.png', 'banner/s/t/x.webp'])
    put(dir, f, ep('event_173_01'));
  expect(unpublishable(dir, index, new Date('2026-12-01T00:00:00Z'))).toEqual([
    'archive/event_185_01.json', 'banner/s/t/x.webp', 'bg/x.png', 'episodes/Event_173_01.json', 'episodes/archive/event_173_01.json', 'episodes/notes.txt', 'event_185_01.json',
  ]);
});

test('部署前檢查：檔名是已結束活動、內容 sid 卻不同（或壞掉）也擋下', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  put(dir, 'episodes/event_173_01.json', ep('event_185_01'));
  put(dir, 'episodes/event_173_02.json', '{oops');
  expect(unpublishable(dir, index, new Date('2026-12-01T00:00:00Z'))).toEqual(['episodes/event_173_01.json', 'episodes/event_173_02.json']);
});

test('Vite 建置關卡：只在 build 套用；有不能公開的檔案就在 buildStart 報錯，乾淨時不報錯', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  const idx = path.join(dir, 'index.json');
  fs.writeFileSync(idx, JSON.stringify(index));
  put(dir, 'public/episodes/event_173_01.json', ep('event_173_01'));
  const gate = publishableGate(path.join(dir, 'public'), idx);
  expect(gate.apply).toBe('build');
  const errors: string[] = [];
  const ctx = { error: (m: string) => { errors.push(m); throw new Error(m); } };
  (gate.buildStart as (this: typeof ctx) => void).call(ctx);
  expect(errors).toEqual([]);
  put(dir, 'public/episodes/event_185_01.json', ep('event_185_01'));
  expect(() => (gate.buildStart as (this: typeof ctx) => void).call(ctx)).toThrow(/event_185_01/);
});
