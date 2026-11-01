export interface RawMotion { MotionName?: string; FacialName?: string }
export interface RawTalk { WindowDisplayName?: string; Body?: string; Motions?: RawMotion[] }
export interface RawEffect { EffectType: number; StringVal?: string }
export interface RawSnippet { Action: number; ReferenceIndex: number }
export interface RawScenario {
  m_Name?: string;
  ScenarioId?: string;
  FirstBackground?: string;
  Snippets: RawSnippet[];
  TalkData: RawTalk[];
  SpecialEffectData?: RawEffect[];
}

export interface Line {
  r: number;
  who: string;
  phone: boolean;
  group: boolean;
  body: string;
  face: string;
  motion: string;
  bg: string | null;
  flash: boolean;
  shake: boolean;
}

export interface Scene {
  text: string;
  time: '傍晚' | '夜晚' | null;
  bg: string | null;
  sekai: boolean;
  /** Number of lines that precede this caption in reading order. */
  before: number;
}

export interface Episode { sid: string; firstBg: string | null; lines: Line[]; scenes: Scene[] }
