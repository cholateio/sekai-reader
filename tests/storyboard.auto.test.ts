import { afterEach, expect, test, vi } from 'vitest';
import { autoBoard } from '../src/storyboard/auto';
import { resolveStoryboard } from '../src/storyboard';
import { validateStoryboard } from '../src/storyboard/validate';
import { syntheticBoard, syntheticEpisode } from './helpers';

const ep = syntheticEpisode();
afterEach(() => vi.restoreAllMocks());

test('規則分鏡通過驗證', () => expect(validateStoryboard(autoBoard(ep), ep).ok).toBe(true));
test('meta 標示 auto', () => expect(autoBoard(ep).meta).toMatchObject({ director: 'auto', promptVersion: 'rules-1' }));
test('心聲與旁白落在 mono 格', () => {
  const panels = autoBoard(ep).panels;
  for (const r of [4, 9]) expect(panels.find(p => p.l?.includes(r))?.t).toBe('mono');
});
test('短句驚嘆落在 beat 格', () => expect(autoBoard(ep).panels.find(p => p.l?.includes(6))?.t).toBe('beat'));
test('場景字幕累積成 est，est 前後 edge 為 0', () => {
  const panels = autoBoard(ep).panels;
  expect(panels[0]).toMatchObject({ t: 'est', caps: [0, 1], edge: 0 });
  const i = panels.findIndex(p => p.caps?.includes(2));
  expect(panels[i]).toMatchObject({ t: 'est', edge: 0 });
  expect(panels[i - 1].edge).toBe(0);
  expect(panels.every(p => p.edge !== undefined)).toBe(true);
});
test('合格的 AI 分鏡原樣採用', () => expect(resolveStoryboard(syntheticBoard(), ep).meta.director).toBe('ai'));
test('壞掉的分鏡退回規則分鏡', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const bad = syntheticBoard(); delete bad.panels[1].l;
  expect(resolveStoryboard(bad, ep).meta.director).toBe('auto');
  expect(warn).toHaveBeenCalled();
});
test('沒有分鏡時用規則分鏡', () => {
  expect(resolveStoryboard(null, ep).meta.director).toBe('auto');
  expect(resolveStoryboard(undefined, ep).meta.director).toBe('auto');
});
