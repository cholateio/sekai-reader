import { eventById } from './catalog';
import { prefs } from './storage';

export interface RecentItem { sid: string; id: number; no: number; title: string }

const KEEP = 5;

const listed = (r: RecentItem) => Boolean(eventById.get(r.id)?.eps.some(x => x[2] === r.sid));

function stored(): RecentItem[] {
  const v = prefs.get<unknown>('recent', []);
  return Array.isArray(v) ? v.filter((x): x is RecentItem => !!x && typeof x === 'object' && typeof (x as RecentItem).sid === 'string') : [];
}

/**
 * Moves `item` to the front (deduped by sid) and keeps the newest KEEP entries. Resume positions are kept
 * only for those entries (owner, 2026-11-07: no progress display, only the recent list), so storage stays
 * bounded at KEEP small keys however much is read.
 */
export function pushRecent(item: RecentItem): void {
  // Entries the index no longer lists are dropped before the cap, so they never cost a valid one its slot.
  const list = [item, ...stored().filter(r => r.sid !== item.sid && listed(r))].slice(0, KEEP);
  prefs.set('recent', list);
  // A failed write leaves the old list in place; prune only if the new one is what storage now holds.
  if (stored().map(r => r.sid).join() !== list.map(r => r.sid).join()) return;
  const keep = new Set(list.map(r => `pos:${r.sid}`));
  // Re-read before each removal: another tab may have written a newer list since (no cross-tab locking).
  for (const k of prefs.keys()) {
    if (!k.startsWith('pos:') || keep.has(k) || stored().some(r => `pos:${r.sid}` === k)) continue;
    prefs.remove(k as `pos:${string}`);
  }
}

/** Newest first, skipping episodes the current index no longer lists. */
export function recentList(): RecentItem[] {
  return stored().filter(listed).slice(0, KEEP);
}
