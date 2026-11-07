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
  light_sound: 'L/n', idol: 'MMJ', street: 'VBS', theme_park: 'WxS', school_refusal: '25時', piapro: 'VS', none: '混活',
};
export const TYPE_SHORT: Record<string, string> = { marathon: '馬拉松', cheerful_carnival: '嘉年華', world_bloom: 'World Link' };

// Box number = how many times the banner character (first event card, `chars[0]`) has headlined
// an event of their own unit, oldest first (fan term 「繪名5箱」). Mixed events, World Link and
// cross-unit guest events (banner from another unit, e.g. #172) are not boxes and do not count.
const BOX = new Map<number, number>();
{
  const count = new Map<number, number>();
  for (const e of [...EVENTS].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    const banner = e.chars?.[0];
    if (e.unit === 'none' || e.type === 'world_bloom' || banner == null || charById.get(banner)?.unit !== e.unit) continue;
    const n = (count.get(banner) ?? 0) + 1;
    count.set(banner, n);
    BOX.set(e.id, n);
  }
}
export function boxNo(e: EventInfo): number | null {
  // Re-check the fields so a modified copy of an event (tests, future overrides) does not inherit the id's box.
  return e.unit === 'none' || e.type === 'world_bloom' || e.chars?.[0] == null ? null : (BOX.get(e.id) ?? null);
}
export function eventLabel(e: EventInfo): string {
  if (e.type === 'world_bloom') return 'World Link';
  if (e.unit === 'none') return '混活';
  const n = boxNo(e);
  const c = e.chars?.[0] != null ? charById.get(e.chars[0]) : undefined;
  return n == null || !c ? (UNIT_SHORT[e.unit] ?? e.unit) : `${c.given}${n}箱`;
}
/** What readers call the event: `繪名5箱`, or `混活 #63` / `World Link #180` when there is no box. */
export function eventShort(e: EventInfo): string {
  return boxNo(e) == null ? `${eventLabel(e)} #${e.id}` : eventLabel(e);
}
export function charsOf(e: EventInfo): CharacterInfo[] {
  return (e.chars ?? []).map(id => charById.get(id)).filter((c): c is CharacterInfo => !!c);
}
// Box events of each unit, oldest first; a box event's 上一期／下一期 is the unit's previous/next box (owner,
// 2026-11-07: 真冬1箱 → 繪名1箱), not the event before/after it in the index.
const UNIT_BOXES = new Map<string, EventInfo[]>();
for (const e of [...EVENTS].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
  if (BOX.has(e.id)) UNIT_BOXES.set(e.unit, [...(UNIT_BOXES.get(e.unit) ?? []), e]);
}
/** `prev` is older, `next` is newer. Box events step through their unit's boxes; other events use index order. */
export function neighbours(id: number): { prev: EventInfo | null; next: EventInfo | null } {
  const e = eventById.get(id);
  if (e && BOX.has(id)) {
    const chain = UNIT_BOXES.get(e.unit)!;
    const k = chain.indexOf(e);
    return { prev: chain[k - 1] ?? null, next: chain[k + 1] ?? null };
  }
  const i = EVENTS.findIndex(x => x.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: EVENTS[i + 1] ?? null, next: EVENTS[i - 1] ?? null };
}
