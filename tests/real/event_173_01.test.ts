import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseScenario } from '../../src/scenario/parse';
import type { RawScenario } from '../../src/scenario/types';

const ASSET = 'assets/raw/event_173_01.asset';
const has = existsSync(ASSET);

describe.skipIf(!has)('event_173_01（真實劇本，素材不在 repo 時跳過）', () => {
  const ep = has ? parseScenario(JSON.parse(readFileSync(ASSET, 'utf8')) as RawScenario) : null!;

  test('sid 以 m_Name 為準', () => expect(ep.sid).toBe('event_173_01'));
  test('49 句台詞', () => expect(ep.lines.length).toBe(49));
  test('場景字幕', () => expect(ep.scenes.map(s => s.text)).toEqual(['午休時間', '宮益坂女子學園　中庭', '幾小時後', 'Solis Record經紀公司']));
  test('開場背景', () => expect(ep.firstBg).toBe('bg_a002201'));
  test('第 29 句起換成經紀公司', () => {
    expect(ep.lines.find(l => l.r >= 29)!.bg).toBe('bg_f001201');
    expect(ep.lines.filter(l => l.r < 29).every(l => l.bg === 'bg_a002201')).toBe(true);
  });
});

import board173 from '../../storyboards/event_173_01.json';
import { validateStoryboard } from '../../src/storyboard/validate';
import type { Panel } from '../../src/storyboard/types';

describe('storyboards/event_173_01.json', () => {
  const panels = board173.panels as Panel[];
  test('36 格、每格有 edge、只有一格 impact', () => {
    expect(panels.length).toBe(36);
    expect(panels.every(p => p.edge !== undefined)).toBe(true);
    expect(panels.filter(p => p.t === 'impact').length).toBe(1);
  });
  test('非 impact／trans 格都有 cam', () =>
    expect(panels.filter(p => p.t !== 'impact' && p.t !== 'trans').every(p => p.cam)).toBe(true));
  test('est／trans 及其前一格 edge 為 0', () => panels.forEach((p, i) => {
    if (p.t === 'est' || p.t === 'trans') { expect(p.edge).toBe(0); if (i) expect(panels[i - 1].edge).toBe(0); }
  }));
  test('meta', () => expect(board173.meta).toMatchObject({ director: 'ai', promptVersion: 'v2-cam-edge', generatedAt: '2026-11-01' }));
});

describe.skipIf(!has)('event_173_01 分鏡驗證（需真實劇本）', () => {
  test('通過驗證', () => {
    const ep = parseScenario(JSON.parse(readFileSync(ASSET, 'utf8')) as RawScenario);
    expect(validateStoryboard(board173, ep)).toMatchObject({ ok: true });
  });
});
