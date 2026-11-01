import type { Episode } from '../scenario/types';
import { autoBoard } from './auto';
import type { Storyboard } from './types';
import { validateStoryboard } from './validate';

export function resolveStoryboard(input: unknown, ep: Episode): Storyboard {
  if (input === null || input === undefined) return autoBoard(ep);
  const res = validateStoryboard(input, ep);
  if (res.ok) return res.board;
  console.warn(`storyboard for ${ep.sid} rejected, using rules`, res.errors);
  return autoBoard(ep);
}

// Storyboards are committed to git and bundled at build time; dialogue never is.
const BOARDS = import.meta.glob('../../storyboards/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export function loadStoryboard(sid: string): unknown {
  return BOARDS[`../../storyboards/${sid}.json`];
}
