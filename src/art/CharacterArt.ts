import type { Line } from '../scenario/types';
import { moodOf } from '../scenario/mood';

export type ArtSize = 'sm' | 'md' | 'lg';

/** face/motion are unused by StaticChibiArt; SpineSpriteArt will pick a pose from them. */
export interface ArtRequest { name: string; face: string; motion: string; mood: string | null }

/** The only seam between rendering and character imagery; swapping to Spine touches one implementation. */
export interface CharacterArt { render(req: ArtRequest, size: ArtSize): HTMLElement }

export function artRequest(line: Line): ArtRequest {
  return { name: line.who, face: line.face, motion: line.motion, mood: moodOf(line.face) };
}
