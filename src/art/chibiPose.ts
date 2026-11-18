// Pure rules for the Spine chibis (spec 2026-11-18 「動作選擇」「朝向」); no WebGL here, so they are unit-tested.
import type { Line } from '../scenario/types';

export type Gender = 'w' | 'm';
export interface Kind { g: Gender; kind: string }

/** Script MotionName `w-cute11-tilthead` -> gender and personality; `s-common-*` and empty names say nothing. */
export function kindOf(motion: string): Kind | null {
  const m = /^([wm])-([a-z]+)\d+-/.exec(motion);
  return m ? { g: m[1] as Gender, kind: m[2] } : null;
}

// Characters 11 Akito, 12 Touya, 13 Tsukasa, 16 Rui, 23 Len, 26 KAITO use the m_ animation set.
const MALE = new Set([11, 12, 13, 16, 23, 26]);
const genderOf = (chibi: string): Gender => (MALE.has(Number(/^v2_sd_(\d{2})/.exec(chibi)?.[1])) ? 'm' : 'w');

/** Each chibi's most frequent gender+personality in the episode, for lines whose motion says nothing. */
export function episodeKinds(lines: Line[]): Map<string, Kind> {
  const counts = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const k = l.chibi ? kindOf(l.motion) : null;
    if (!k || !l.chibi) continue;
    const c = counts.get(l.chibi) ?? new Map<string, number>();
    const key = `${k.g}-${k.kind}`;
    c.set(key, (c.get(key) ?? 0) + 1);
    counts.set(l.chibi, c);
  }
  const out = new Map<string, Kind>();
  for (const [chibi, c] of counts) {
    // Ties go to the first seen: Map keeps insertion order and sort is stable.
    const [best] = [...c].sort((a, b) => b[1] - a[1])[0];
    const [g, kind] = best.split('-');
    out.set(chibi, { g: g as Gender, kind });
  }
  return out;
}

/** moodOf label -> chibi emotion; anything else (or no face) talks. */
const EMOTION: Record<string, string> = {
  開心: 'laugh', 微笑: 'joy', 得意: 'joy', 害羞: 'joy', 哭: 'sad', 低落: 'sad', 生氣: 'angry',
  驚訝: 'surprise', 困擾: 'doubt', 思考: 'doubt',
};
export const emotionOf = (mood: string | null): string => (mood && EMOTION[mood]) || 'talk';

export const POSE_DEFAULT = 'v2_pose_default';

/** Lowest-numbered `v2_{g}_{kind}_{emotion}NN_f` the skeleton has. */
function find(anims: readonly string[], g: Gender, kind: string, emotion: string): string | undefined {
  const re = new RegExp(`^v2_${g}_${kind}_${emotion}(\\d+)_f$`);
  return anims.filter(a => re.test(a)).sort()[0];
}

/**
 * The emotion played once when the panel comes into view, then the idle it loops in (owner 2026-11-18: play once,
 * then idle). Falls back: same personality talk -> its idle -> normal with the emotion -> normal talk/idle -> pose.
 */
export function pickAnimations(anims: readonly string[], chibi: string, motion: string, mood: string | null, kinds: Map<string, Kind>): { once: string; idle: string } {
  const k = kindOf(motion) ?? kinds.get(chibi) ?? { g: genderOf(chibi), kind: 'normal' };
  const emotion = emotionOf(mood);
  const idle = find(anims, k.g, k.kind, 'idle') ?? find(anims, k.g, 'normal', 'idle') ?? POSE_DEFAULT;
  const once = find(anims, k.g, k.kind, emotion) ?? find(anims, k.g, k.kind, 'talk') ?? find(anims, k.g, k.kind, 'idle')
    ?? find(anims, k.g, 'normal', emotion) ?? find(anims, k.g, 'normal', 'talk') ?? idle;
  return { once, idle };
}

/** The part of spine's AnimationState startPose drives. */
export interface Track {
  setAnimation(track: number, name: string, loop: boolean): unknown;
  addAnimation(track: number, name: string, loop: boolean, delay: number): unknown;
}

/** Emotion once, then the idle looping; when they are the same animation (only an idle or the default pose
 *  exists) it simply loops, so the figure never freezes after one play. */
export function startPose(state: Track, p: { once: string; idle: string }): void {
  if (p.once === p.idle) { state.setAnimation(0, p.idle, true); return; }
  state.setAnimation(0, p.once, false);
  state.addAnimation(0, p.idle, true, 0);
}

export type Facing = 'l' | 'r' | 'c';

/** The chibi faces viewer-left by default; left-side figures are mirrored to face the centre line, except
 *  chibis the game itself never mirrors (catalogue `noflip`). */
export const mirrored = (side: Facing | undefined, chibi: string, noflip: ReadonlySet<string>): boolean =>
  side === 'l' && !noflip.has(chibi);
