import { eventById } from './catalog';
import { prefs } from './storage';

export interface RecentItem { sid: string; id: number; no: number; title: string }

const KEEP = 5;
const SHOW = 3;

function stored(): RecentItem[] {
  const v = prefs.get<unknown>('recent', []);
  return Array.isArray(v) ? v.filter((x): x is RecentItem => !!x && typeof x === 'object' && typeof (x as RecentItem).sid === 'string') : [];
}

/** Moves `item` to the front (deduped by sid) and keeps the newest KEEP entries. */
export function pushRecent(item: RecentItem): void {
  prefs.set('recent', [item, ...stored().filter(r => r.sid !== item.sid)].slice(0, KEEP));
}

/** Newest first, skipping episodes the current index no longer lists. */
export function recentList(): RecentItem[] {
  return stored().filter(r => eventById.get(r.id)?.eps.some(x => x[2] === r.sid)).slice(0, SHOW);
}
