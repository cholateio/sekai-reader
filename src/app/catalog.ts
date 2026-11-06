import index from '../../data/tc-event-index.json';

export type EpRef = [no: number, title: string, sid: string];
export interface EventInfo {
  id: number; name: string; unit: string; type: string; date: string; bundle: string; color?: string; jp?: boolean;
  /** Featured (event-card) character ids; absent in indexes built before 2026-11-06. */
  chars?: number[];
  eps: EpRef[];
}
export interface CharacterInfo { id: number; first: string; given: string; unit: string; color: string }

export const EVENTS = index.events as unknown as EventInfo[];
export const BUILT = index.built as string;
export const eventById = new Map(EVENTS.map(e => [e.id, e]));
export const CHARS = index.chars as CharacterInfo[];
export const charById = new Map(CHARS.map(c => [c.id, c]));

export const UNITS: Record<string, [string, string]> = {
  light_sound: ['Leo/need', '#4455dd'], idol: ['MORE MORE JUMP！', '#88dd44'], street: ['Vivid BAD SQUAD', '#ee1166'],
  theme_park: ['Wonderlands×Showtime', '#ff9900'], school_refusal: ['25時、ナイトコードで。', '#884499'],
  piapro: ['VIRTUAL SINGER', '#33ccbb'], none: ['混合活動', '#8a93a6'],
};
export const TYPES: Record<string, string> = { marathon: '馬拉松', cheerful_carnival: '歡樂嘉年華', world_bloom: 'World Link' };
export const unitOf = (u: string) => UNITS[u] ?? UNITS.none;
export const UNIT_SHORT: Record<string, string> = {
  light_sound: 'Leo/need', idol: 'MMJ', street: 'VBS', theme_park: 'WxS', school_refusal: '25時', piapro: 'VS', none: '混活',
};
export const TYPE_SHORT: Record<string, string> = { marathon: '馬拉松', cheerful_carnival: '嘉年華', world_bloom: 'World Link' };

// Box number = position of the event among its unit's events, oldest first (fan term 「第N箱」).
const BOX = new Map<number, number>();
for (const unit of new Set(EVENTS.map(e => e.unit))) {
  if (unit === 'none') continue;
  EVENTS.filter(e => e.unit === unit).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .forEach((e, i) => BOX.set(e.id, i + 1));
}
export function boxNo(e: EventInfo): number | null {
  return e.unit === 'none' ? null : (BOX.get(e.id) ?? null);
}
export function eventLabel(e: EventInfo): string {
  if (e.type === 'world_bloom') return 'World Link';
  if (e.unit === 'none') return '混活';
  const n = boxNo(e);
  return n == null ? (UNIT_SHORT[e.unit] ?? e.unit) : `${UNIT_SHORT[e.unit] ?? e.unit} 第${n}箱`;
}
export function charsOf(e: EventInfo): CharacterInfo[] {
  return (e.chars ?? []).map(id => charById.get(id)).filter((c): c is CharacterInfo => !!c);
}
/** Adjacent rows in index order (newest first): `next` is newer, `prev` is older. */
export function neighbours(id: number): { prev: EventInfo | null; next: EventInfo | null } {
  const i = EVENTS.findIndex(e => e.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: EVENTS[i + 1] ?? null, next: EVENTS[i - 1] ?? null };
}
