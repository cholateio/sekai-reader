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

const SID = /^[a-z0-9_]+$/;

/**
 * Fetches the committed storyboard for one episode (served at /storyboards/{sid}.json by the Vite plugin in
 * vite.config.ts); undefined when there is none, so the caller falls back to the rule-based board. Dialogue
 * is never in a storyboard, only line numbers.
 */
export async function loadStoryboard(sid: string): Promise<unknown> {
  if (!SID.test(sid)) return undefined;
  try {
    const res = await fetch(`/storyboards/${sid}.json`);
    // Pages answers unknown paths with the SPA's index.html (200), so a body that is not JSON also means none.
    return res.ok ? ((await res.json()) as unknown) : undefined;
  } catch { return undefined; }
}
