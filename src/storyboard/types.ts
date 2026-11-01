export type PanelType =
  | 'est' | 'talk' | 'close' | 'pop' | 'beat' | 'insert' | 'sfx'
  | 'trans' | 'impact' | 'split' | 'reveal' | 'shout' | 'mono';

export const PANEL_TYPES: readonly PanelType[] = [
  'est', 'talk', 'close', 'pop', 'beat', 'insert', 'sfx', 'trans', 'impact', 'split', 'reveal', 'shout', 'mono',
];

export interface Cam { focus: [number, number]; zoom: number; blur?: number }

export interface Panel {
  t: PanelType;
  l?: number[];
  caps?: number[];
  cut?: number[];
  fx?: 'blush' | 'sparkle';
  tone?: 'day' | 'office' | 'serious';
  big?: 'quote' | 'num';
  cast?: string[];
  sfx?: string;
  wide?: boolean;
  cam?: Cam;
  edge?: -1 | 0 | 1;
  bg?: string;
}

export interface Storyboard {
  meta: { director: 'ai' | 'auto'; promptVersion: string; model?: string; generatedAt: string };
  panels: Panel[];
}
