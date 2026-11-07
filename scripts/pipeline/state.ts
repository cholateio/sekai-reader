import fs from 'node:fs';

/** missing = the mirror has no script for it yet (404); rechecked daily like jp. */
export type AssetStatus = 'pending' | 'jp' | 'missing' | 'done' | 'error';
/** none = waiting to be sent (new event, authorized old event, or retry). */
export type EpStatus = 'none' | 'manual' | 'batch' | 'done' | 'fallback';
/** err: why the director's last output was rejected (validator messages: codes and numbers, never dialogue). */
export interface EpState { s: EpStatus; tries: number; err?: string }
export interface EventState {
  kind: 'old' | 'new'; assets: AssetStatus; assetsAt?: string; failures: number; lastError?: string;
  /** Last daily recheck of a jp or missing event. */
  jpCheckedAt?: string;
  /** Set when a fetch ran out of budget; the queue resumes it next hour whatever BACKFILL says. */
  partialAt?: string;
  /** All scripts fetched by the scripts-first lane (images may still be missing); enough for storyboards. */
  scriptsAt?: string;
  /** Home banner (spec 2026-11-07): done = fetched; missing = 404, never asked again. Unset = not tried yet. */
  banner?: 'done' | 'missing';
  eps: Record<string, EpState>;
}
/** adopted = found by reconcile on the Anthropic account; sids stay empty until its results are readable. */
/** promptVersion: what the batch was built with; results are labelled with it, and an exhausted stale one requeues. */
export interface BatchState { id: string; day: string; eventId?: number; sids: string[]; estUsd: number; adopted?: boolean; promptVersion?: string }
export interface PipelineState {
  version: 1; seededAt: string; spend: Record<string, number>; events: Record<string, EventState>;
  batches: BatchState[];
  /** batch id -> creation day, kept 35 days so reconcile never adopts a batch twice. */
  knownBatches: Record<string, string>;
  pendingDeploy: boolean;
  /** Director prompt version the fallback episodes were last tried with; a change requeues them. */
  promptVersion?: string;
}
export interface IndexEvent { id: number; name: string; date: string; bundle: string; eps: [number, string, string][] }
export interface IndexFile { events: IndexEvent[]; built: string }
export type FetchStatus = 'done' | 'partial' | 'jp' | 'missing' | 'error';

export const MAX_FAILURES = 3;
export const KEEP_BATCH_DAYS = 35;

export const dayOf = (d: Date) => d.toISOString().slice(0, 10);

export function loadState(path: string): PipelineState | null {
  if (!fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path, 'utf8')) as PipelineState;
}

export function saveState(path: string, s: PipelineState): void {
  const tmp = `${path}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 1) + '\n');
  fs.renameSync(tmp, path);
}

const newEvent = (e: IndexEvent, kind: 'old' | 'new', boards: Set<string>): EventState => ({
  kind, assets: 'pending', failures: 0,
  eps: Object.fromEntries(e.eps.map(([, , sid]) => [sid, { s: boards.has(sid) ? 'done' : 'manual', tries: 0 } as EpState])),
});

export function seedState(index: IndexFile, existingBoards: string[], now: Date): PipelineState {
  const boards = new Set(existingBoards);
  return {
    version: 1, seededAt: now.toISOString(), spend: {},
    events: Object.fromEntries(index.events.map(e => [String(e.id), newEvent(e, 'old', boards)])),
    batches: [], knownBatches: {}, pendingDeploy: false,
  };
}

export function syncIndex(s: PipelineState, index: IndexFile, _now: Date): number[] {
  const added: number[] = [];
  for (const e of index.events) {
    if (s.events[String(e.id)]) continue;
    s.events[String(e.id)] = newEvent(e, 'new', new Set());
    added.push(e.id);
  }
  return added;
}

/** Index events newest first (date, then id). */
const byNewest = (index: IndexFile) =>
  [...index.events].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));

export function pickEvent(
  s: PipelineState, index: IndexFile, o: { backfill: boolean; today: string; forced?: number },
): { id: number; reason: 'forced' | 'new' | 'resume' | 'jp-recheck' | 'backfill' } | null {
  if (o.forced !== undefined) {
    const e = s.events[String(o.forced)];
    return e && e.assets !== 'done' ? { id: o.forced, reason: 'forced' } : null;
  }
  const ordered = byNewest(index).map(e => ({ id: e.id, st: s.events[String(e.id)] })).filter(x => x.st);
  const fresh = (st: EventState) => st.assets === 'pending' && st.failures < MAX_FAILURES;
  const pick = ordered.find(x => x.st.kind === 'new' && fresh(x.st));
  if (pick) return { id: pick.id, reason: 'new' };
  const resume = ordered.find(x => x.st.partialAt && fresh(x.st));
  if (resume) return { id: resume.id, reason: 'resume' };
  const jp = ordered.find(x => (x.st.assets === 'jp' || x.st.assets === 'missing') && (x.st.jpCheckedAt ?? '').slice(0, 10) !== o.today);
  if (jp) return { id: jp.id, reason: 'jp-recheck' };
  if (!o.backfill) return null;
  const old = ordered.find(x => x.st.kind === 'old' && fresh(x.st));
  return old ? { id: old.id, reason: 'backfill' } : null;
}

/** Callers pass done/partial only after every fetched episode built; a build failure is passed as error. */
export function recordFetch(s: PipelineState, id: number, r: { status: FetchStatus; error?: string }, now: Date): void {
  const e = s.events[String(id)];
  if (!e) throw new Error(`unknown event ${id}`);
  switch (r.status) {
    case 'done':
      e.assets = 'done';
      e.assetsAt = now.toISOString();
      e.failures = 0;
      delete e.lastError;
      delete e.partialAt;
      if (e.kind === 'new') for (const ep of Object.values(e.eps)) if (ep.s === 'manual') ep.s = 'none';
      s.pendingDeploy = true;
      break;
    case 'partial':
      if (e.assets === 'jp' || e.assets === 'missing') e.assets = 'pending';
      e.partialAt = now.toISOString();
      s.pendingDeploy = true;
      break;
    case 'jp':
      e.assets = 'jp';
      e.jpCheckedAt = now.toISOString();
      e.failures = 0;
      break;
    case 'missing':
      e.assets = 'missing';
      e.jpCheckedAt = now.toISOString();
      e.failures = 0;
      s.pendingDeploy = true;
      break;
    case 'error':
      e.failures += 1;
      e.lastError = r.error ?? 'error';
      if (e.failures >= MAX_FAILURES) e.assets = 'error';
      break;
  }
}

/**
 * Named events are authorized whatever their asset state, and their fallback episodes are re-queued with a
 * fresh try count (naming an event by hand is the way to redo it after a fix); newest only takes old events
 * whose assets are done and never touches fallbacks.
 */
export function authorizeDirect(s: PipelineState, index: IndexFile, o: { eventIds?: number[]; newest?: number }): number[] {
  const hasManual = (e: EventState) => Object.values(e.eps).some(ep => ep.s === 'manual');
  const targets = new Set<number>();
  for (const id of o.eventIds ?? []) {
    const e = s.events[String(id)];
    if (!e) continue;
    let touched = false;
    for (const ep of Object.values(e.eps)) if (ep.s === 'fallback') { ep.s = 'none'; ep.tries = 0; touched = true; }
    if (touched || hasManual(e)) targets.add(id);
  }
  if (o.newest && o.newest > 0) {
    const old = byNewest(index).filter(e => {
      const st = s.events[String(e.id)];
      return st && st.kind === 'old' && hasScripts(st) && hasManual(st) && !targets.has(e.id);
    });
    for (const e of old.slice(0, o.newest)) targets.add(e.id);
  }
  for (const id of targets) for (const ep of Object.values(s.events[String(id)].eps)) if (ep.s === 'manual') ep.s = 'none';
  return [...targets];
}

const hasScripts = (st: EventState) => st.assets === 'done' || Boolean(st.scriptsAt);

export function dueEpisodes(s: PipelineState, index: IndexFile): { eventId: number; sid: string }[] {
  const out: { eventId: number; sid: string }[] = [];
  for (const e of byNewest(index)) {
    const st = s.events[String(e.id)];
    if (!st || !hasScripts(st)) continue;
    for (const [, , sid] of [...e.eps].sort((a, b) => a[0] - b[0])) if (st.eps[sid]?.s === 'none') out.push({ eventId: e.id, sid });
  }
  return out;
}

/** Old events whose scripts the scripts-first lane still has to fetch, newest first. */
export function scriptsLane(s: PipelineState, index: IndexFile): number[] {
  return byNewest(index).filter(e => {
    const st = s.events[String(e.id)];
    return st && st.kind === 'old' && st.assets === 'pending' && !st.scriptsAt && st.failures < MAX_FAILURES;
  }).map(e => e.id);
}

export function recordScripts(s: PipelineState, id: number, status: 'done' | 'partial' | 'jp' | 'missing', now: Date): void {
  const e = s.events[String(id)];
  if (!e) throw new Error(`unknown event ${id}`);
  if (status === 'done') e.scriptsAt = now.toISOString();
  else if (status === 'jp' || status === 'missing') recordFetch(s, id, { status }, now);
}

/** Banner lane (owner-approved 2026-11-07): at most 4 per run, events whose images are fetched, newest first. */
export const BANNER_MAX = 4;
export function bannerLane(s: PipelineState, index: IndexFile): number[] {
  return byNewest(index).filter(e => {
    const st = s.events[String(e.id)];
    return st && st.assets === 'done' && !st.banner;
  }).slice(0, BANNER_MAX).map(e => e.id);
}

export function recordBanner(s: PipelineState, id: number, status: 'done' | 'missing' | 'error'): void {
  const e = s.events[String(id)];
  if (!e) throw new Error(`unknown event ${id}`);
  if (status === 'error') return;
  e.banner = status;
  if (status === 'done') s.pendingDeploy = true;
}

export function addSpend(s: PipelineState, day: string, usd: number): void {
  s.spend[day] = Math.max(0, Math.round(((s.spend[day] ?? 0) + usd) * 1e6) / 1e6);
}

export function spentToday(s: PipelineState, day: string): number {
  return s.spend[day] ?? 0;
}

export function rememberBatch(s: PipelineState, id: string, day: string): void {
  s.knownBatches[id] = day;
  const latest = Object.values(s.knownBatches).reduce((a, b) => (a > b ? a : b));
  const cutoff = dayOf(new Date(Date.parse(latest) - KEEP_BATCH_DAYS * 86400e3));
  for (const [k, d] of Object.entries(s.knownBatches)) if (d < cutoff) delete s.knownBatches[k];
}
