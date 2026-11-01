import index from '../../data/tc-event-index.json';

export type EpRef = [no: number, title: string, sid: string];
export interface EventInfo {
  id: number; name: string; unit: string; type: string; date: string; bundle: string; color?: string; jp?: boolean; eps: EpRef[];
}

export const EVENTS = index.events as unknown as EventInfo[];
export const BUILT = index.built as string;
export const eventById = new Map(EVENTS.map(e => [e.id, e]));

export const UNITS: Record<string, [string, string]> = {
  light_sound: ['Leo/need', '#4455dd'], idol: ['MORE MORE JUMP！', '#88dd44'], street: ['Vivid BAD SQUAD', '#ee1166'],
  theme_park: ['Wonderlands×Showtime', '#ff9900'], school_refusal: ['25時、ナイトコードで。', '#884499'],
  piapro: ['VIRTUAL SINGER', '#33ccbb'], none: ['混合活動', '#8a93a6'],
};
export const TYPES: Record<string, string> = { marathon: '馬拉松', cheerful_carnival: '歡樂嘉年華', world_bloom: 'World Link' };
export const unitOf = (u: string) => UNITS[u] ?? UNITS.none;
