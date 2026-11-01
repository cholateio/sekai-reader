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
import type { Panel, Storyboard } from '../../src/storyboard/types';
import { StaticChibiArt } from '../../src/art/StaticChibiArt';
import { renderComic } from '../../src/render/comic';

describe('storyboards/event_173_01.json', () => {
  const panels = board173.panels as Panel[];
  test('至少 30 格、每格有 edge、只有一格 impact', () => {
    expect(panels.length).toBeGreaterThanOrEqual(30);
    expect(panels.every(p => p.edge !== undefined)).toBe(true);
    expect(panels.filter(p => p.t === 'impact').length).toBe(1);
  });
  test('非 trans 格都有 cam 與 edge', () =>
    expect(panels.filter(p => p.t !== 'trans').every(p => p.cam && p.edge !== undefined)).toBe(true));
  test('v3 分鏡用上新格子', () => {
    const t = panels.map(p => p.t);
    expect(t.filter(x => x === 'pair').length).toBeGreaterThanOrEqual(2);
    expect(t).toContain('inset');
    expect(t).toContain('insert');
    expect(t.filter(x => x === 'beat').length).toBeGreaterThanOrEqual(2);
  });
  test('沒有連續三格同類型', () => {
    for (let i = 2; i < panels.length; i++) expect(panels[i].t === panels[i - 1].t && panels[i].t === panels[i - 2].t).toBe(false);
  });
  test('est／trans 及其前一格 edge 為 0', () => panels.forEach((p, i) => {
    if (p.t === 'est' || p.t === 'trans') { expect(p.edge).toBe(0); if (i) expect(panels[i - 1].edge).toBe(0); }
  }));
  test('meta', () => expect(board173.meta).toMatchObject({ director: 'ai', promptVersion: 'v3-manga', generatedAt: '2026-11-01' }));
  test('meta 是英文（meta 也過中文檢查）', () => expect(board173.meta.model).toMatch(/^[\x20-\x7e]+$/));
});

describe.skipIf(!has)('event_173_01 分鏡驗證與渲染（需真實劇本）', () => {
  const ep173 = has ? parseScenario(JSON.parse(readFileSync(ASSET, 'utf8')) as RawScenario) : null!;
  const art = new StaticChibiArt('/sd');
  const root = has ? renderComic(ep173, board173 as Storyboard, art, { bgUrl: () => null }) : null!;
  test('通過驗證', () => expect(validateStoryboard(board173, ep173)).toMatchObject({ ok: true }));
  test('渲染 173-1 出現至少六種對白框、吶喊框兩個以上', () => {
    const shapes = new Set([...root.querySelectorAll('.bb')].flatMap(e => [...e.classList].filter(c => c.startsWith('bb-'))));
    expect(shapes.size).toBeGreaterThanOrEqual(6);
    expect(root.querySelectorAll('.bb-shout').length).toBeGreaterThanOrEqual(2);
  });
  test('49 句各出現一次', () =>
    expect([...root.querySelectorAll('[data-r]')].map(e => Number(e.getAttribute('data-r')))).toEqual(ep173.lines.map(l => l.r)));
});
