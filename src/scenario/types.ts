export interface RawMotion { MotionName?: string; FacialName?: string }
export interface RawTalk { WindowDisplayName?: string; Body?: string; Motions?: RawMotion[]; TalkCharacters?: { Character2dId?: number }[] }
/** AppearCharacters entries and LayoutData rows (snippet actions 2 and 4 index LayoutData). */
export interface RawCostume { Character2dId?: number; CostumeType?: string }
export interface RawEffect { EffectType: number; StringVal?: string }
export interface RawSnippet { Action: number; ReferenceIndex: number }
export interface RawScenario {
  m_Name?: string;
  ScenarioId?: string;
  FirstBackground?: string;
  Snippets: RawSnippet[];
  TalkData: RawTalk[];
  SpecialEffectData?: RawEffect[];
  AppearCharacters?: RawCostume[];
  LayoutData?: RawCostume[];
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
  /** Spine chibi of the single speaker in the costume worn at this line (data/chibi-index.json); absent when none. */
  chibi?: string;
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
