export type PanelType =
  | 'est' | 'talk' | 'close' | 'pop' | 'beat' | 'insert' | 'sfx'
  | 'trans' | 'impact' | 'split' | 'reveal' | 'shout' | 'mono' | 'pair' | 'inset';

export const PANEL_TYPES: readonly PanelType[] = [
  'est', 'talk', 'close', 'pop', 'beat', 'insert', 'sfx', 'trans', 'impact', 'split', 'reveal', 'shout', 'mono', 'pair', 'inset',
];

export type BubbleShape = 'round' | 'shout' | 'cloud' | 'whisper' | 'wobble' | 'cut' | 'phone' | 'box';

export const BUBBLE_SHAPES: readonly BubbleShape[] = ['round', 'shout', 'cloud', 'whisper', 'wobble', 'cut', 'phone', 'box'];

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
  /** Per-line bubble shape override, same length as `l`; omitted lines follow the shape rules. */
  shape?: BubbleShape[];
}

export interface Storyboard {
  meta: { director: 'ai' | 'auto'; promptVersion: string; model?: string; generatedAt: string };
  panels: Panel[];
}
