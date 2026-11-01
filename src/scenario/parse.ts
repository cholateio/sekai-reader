import type { Episode, Line, RawScenario, Scene } from './types';

const ACTION_TALK = 1;
const ACTION_EFFECT = 6;
const PHONE_SUFFIX = '的訊息';

export function parseScenario(raw: RawScenario): Episode {
  if (!raw || !Array.isArray(raw.TalkData) || !Array.isArray(raw.Snippets)) throw new Error('not a scenario file');
  const fx = raw.SpecialEffectData ?? [];
  const lines: Line[] = [];
  const scenes: Scene[] = [];
  const firstBg = raw.FirstBackground || null;
  let bg = firstBg;
  let flash = false;
  let shake = false;
  let lastScene: Scene | null = null;

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
      lines.push({
        r: s.ReferenceIndex, who, phone, group: who === '眾人', body,
        face: m.FacialName ?? '', motion: m.MotionName ?? '', bg, flash, shake,
      });
      shake = false;
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
