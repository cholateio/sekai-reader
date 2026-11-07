import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test, vi } from 'vitest';
import * as manifest from '../scripts/manifest';
import { buildBanners } from '../scripts/build_banners';

const webp = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#88aacc' } }).webp().toBuffer();

test('buildBanners：轉成 720 與 200 寬兩種尺寸，寫進 manifest，已轉過的不重做，壞檔不列入', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banner-'));
  const raw = path.join(dir, 'raw'), pub = path.join(dir, 'public');
  fs.mkdirSync(path.join(raw, 'banner'), { recursive: true });
  fs.mkdirSync(path.join(pub, 'episodes'), { recursive: true });
  fs.writeFileSync(path.join(pub, 'episodes', 'event_1_01.json'), '{}');
  fs.writeFileSync(path.join(raw, 'banner', 'event_a.webp'), await webp(1200, 500));
  fs.writeFileSync(path.join(raw, 'banner', 'event_b.webp'), 'not an image');
  const logs: string[] = [];
  expect(await buildBanners(raw, pub, l => logs.push(l))).toEqual({ built: 1, changed: true, failed: ['event_b'] });
  expect((await sharp(path.join(pub, 'banner', 'event_a.webp')).metadata()).width).toBe(720);
  expect((await sharp(path.join(pub, 'banner', 's', 'event_a.webp')).metadata()).width).toBe(200);
  expect(logs.join('\n')).toContain('event_b.webp');
  // An undecodable download (even with a valid header) is deleted so the pipeline fetches it again.
  expect(fs.existsSync(path.join(raw, 'banner', 'event_b.webp'))).toBe(false);
  expect(fs.existsSync(path.join(pub, 'banner', 'event_b.webp'))).toBe(false);
  const m = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.json'), 'utf8'));
  expect(m).toEqual({ episodes: ['event_1_01'], bg: [], sd: [], banners: ['event_a'] });
  expect(await buildBanners(raw, pub, () => {})).toEqual({ built: 0, changed: false, failed: [] });
});

test('buildBanners：圖已轉好但 manifest 過期時回報 changed，讓流水線部署', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banner-'));
  const raw = path.join(dir, 'raw'), pub = path.join(dir, 'public');
  fs.mkdirSync(path.join(raw, 'banner'), { recursive: true });
  fs.writeFileSync(path.join(raw, 'banner', 'event_a.webp'), await webp(1200, 500));
  await buildBanners(raw, pub, () => {});
  fs.writeFileSync(path.join(pub, 'manifest.json'), JSON.stringify({ episodes: [], bg: [], sd: [] }));
  expect(await buildBanners(raw, pub, () => {})).toEqual({ built: 0, changed: true, failed: [] });
  expect(JSON.parse(fs.readFileSync(path.join(pub, 'manifest.json'), 'utf8')).banners).toEqual(['event_a']);
});

test('buildBanners：manifest 寫入失敗時不刪壞檔，下一輪仍會回報 failed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banner-'));
  const raw = path.join(dir, 'raw'), pub = path.join(dir, 'public');
  fs.mkdirSync(path.join(raw, 'banner'), { recursive: true });
  fs.writeFileSync(path.join(raw, 'banner', 'event_b.webp'), Buffer.concat([Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 '), Buffer.alloc(8)]));
  const spy = vi.spyOn(manifest, 'writeManifest').mockImplementationOnce(() => { throw new Error('disk full'); });
  await expect(buildBanners(raw, pub, () => {})).rejects.toThrow('disk full');
  expect(fs.existsSync(path.join(raw, 'banner', 'event_b.webp'))).toBe(true);
  spy.mockRestore();
  expect((await buildBanners(raw, pub, () => {})).failed).toEqual(['event_b']);
  expect(fs.existsSync(path.join(raw, 'banner', 'event_b.webp'))).toBe(false);
});
