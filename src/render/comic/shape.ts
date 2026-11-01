import type { Line } from '../../scenario/types';
import { isThought } from '../../scenario/text';
import type { BubbleShape, Panel } from '../../storyboard/types';
import type { UnitFlavor } from './flavor';

const SHOUT_PANELS = new Set(['shout', 'impact', 'pop']);
const SHAKY_FACE = /surprise|cry|shock/;
const QUIET_FACE = /sad|down|shy|trouble/;
const TRAILING_ELLIPSIS = /(……|…)$/;
const QUIET_MAX_CHARS = 12;

/** Rule order is a spec decision (manga-style design, 對白框); the first match wins. */
export function shapeFor(line: Line, panel: Panel, index: number, flavor?: UnitFlavor | null): BubbleShape {
  const override = panel.shape?.[index];
  if (override) return override;
  if (!line.who) return 'box';
  if (line.phone) return 'phone';
  if (isThought(line.body)) return flavor?.monoShape === 'whisper' && panel.t === 'mono' ? 'whisper' : 'cloud';
  if (panel.cut?.includes(line.r)) return 'cut';
  if (SHOUT_PANELS.has(panel.t)) return 'shout';
  const face = line.face.toLowerCase();
  if (line.shake || SHAKY_FACE.test(face)) return 'wobble';
  if ((TRAILING_ELLIPSIS.test(line.body) && [...line.body].length <= QUIET_MAX_CHARS) || QUIET_FACE.test(face)) return 'whisper';
  return 'round';
}
