import { chibiOf, type ChibiCatalogue } from './chibi';
import type { Episode, Line, RawScenario, Scene } from './types';

const ACTION_TALK = 1;
const ACTION_LAYOUT = 2;
const ACTION_MOTION = 4;
const ACTION_EFFECT = 6;
const PHONE_SUFFIX = '的訊息';

/** With a chibi catalogue, each single-speaker line also names that speaker's chibi in the costume worn at that point. */
export function parseScenario(raw: RawScenario, chibis?: ChibiCatalogue | null): Episode {
  if (!raw || !Array.isArray(raw.TalkData) || !Array.isArray(raw.Snippets)) throw new Error('not a scenario file');
  const fx = raw.SpecialEffectData ?? [];
  const lines: Line[] = [];
  const scenes: Scene[] = [];
  const firstBg = raw.FirstBackground || null;
  let bg = firstBg;
  let flash = false;
  let shake = false;
  let lastScene: Scene | null = null;
  const layouts = raw.LayoutData ?? [];
  const costume = new Map<number, string>();
  const wear = (c: { Character2dId?: number; CostumeType?: string } | undefined) => {
    if (c && typeof c.Character2dId === 'number' && c.CostumeType) costume.set(c.Character2dId, c.CostumeType);
  };
  for (const c of raw.AppearCharacters ?? []) wear(c);

  for (const s of raw.Snippets) {
    if (s.Action === ACTION_TALK) {
      const t = raw.TalkData[s.ReferenceIndex];
      if (!t) continue;
      const body = (t.Body ?? '').trim();
      if (!body) continue;
      let who = (t.WindowDisplayName ?? '').trim();
      const phone = who.endsWith(PHONE_SUFFIX) && who.length > PHONE_SUFFIX.length;
      if (phone) who = who.slice(0, -PHONE_SUFFIX.length);
      const m = (t.Motions ?? []).find(x => x.FacialName) ?? {};
      const group = who === '眾人';
      const line: Line = {
        r: s.ReferenceIndex, who, phone, group, body,
        face: m.FacialName ?? '', motion: m.MotionName ?? '', bg, flash, shake,
      };
      const speakers = (t.TalkCharacters ?? []).map(c => c.Character2dId).filter((id): id is number => typeof id === 'number');
      if (chibis && !group && speakers.length === 1) {
        const chibi = chibiOf(chibis, speakers[0], costume.get(speakers[0]));
        if (chibi) line.chibi = chibi;
      }
      lines.push(line);
      shake = false;
    } else if (s.Action === ACTION_LAYOUT || s.Action === ACTION_MOTION) {
      wear(layouts[s.ReferenceIndex]);
    } else if (s.Action === ACTION_EFFECT) {
      const e = fx[s.ReferenceIndex];
      if (!e) continue;
      const v = (e.StringVal ?? '').trim();
      switch (e.EffectType) {
        case 8: case 18:
          if (v) { lastScene = { text: v, time: null, bg, sekai: false, before: lines.length }; scenes.push(lastScene); }
          break;
        case 13: if (lastScene) lastScene.time = '傍晚'; break;
        case 14: if (lastScene) lastScene.time = '夜晚'; break;
        case 9: flash = true; break;
        case 10: flash = false; break;
        case 5: case 6: shake = true; break;
        case 20:
          lastScene = { text: '「世界」', time: null, bg, sekai: true, before: lines.length };
          scenes.push(lastScene);
          break;
        case 7: if (v) bg = v; break;
      }
    }
  }
  // m_Name is the file's own identity; ScenarioId is stale in some files (event_173_01 says event_172_01).
  const sid = raw.m_Name || raw.ScenarioId || 'unknown';
  return { sid, firstBg, lines, scenes };
}
