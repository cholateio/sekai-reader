import type { Line } from '../scenario/types';
import { moodOf } from '../scenario/mood';

export type ArtSize = 'sm' | 'md' | 'lg';

/** face/motion/chibi/side are unused by StaticChibiArt; SpineChibiArt picks the animation and facing from them.
 *  side: where the figure stands in its panel (l = left half, faces right; r and c face left). */
export interface ArtRequest { name: string; face: string; motion: string; mood: string | null; chibi?: string; side?: 'l' | 'r' | 'c' }

/** The only seam between rendering and character imagery; swapping to Spine touches one implementation. */
export interface CharacterArt { render(req: ArtRequest, size: ArtSize): HTMLElement }

export function artRequest(line: Line, side?: ArtRequest['side']): ArtRequest {
  const r: ArtRequest = { name: line.who, face: line.face, motion: line.motion, mood: moodOf(line.face) };
  if (line.chibi) r.chibi = line.chibi;
  if (side) r.side = side;
  return r;
}
