// Usage: tsx scripts/pipeline/run.ts <plan|fetch|direct|mark-deployed> [--event N] [--direct N]
// env: BACKFILL (on|off), DIRECT_DAILY_USD (default 20), ANTHROPIC_API_KEY (absent: no storyboard API calls).
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { parseScenario } from '../../src/scenario/parse';
import type { RawScenario } from '../../src/scenario/types';
import { collectBatches, PROMPT_VERSION, reconcile, requeueForPrompt, submitDue, type DirectorDeps } from './director';
import {
  authorizeDirect, bannerLane, dayOf, dueEpisodes, loadState, pickEvent, recordBanner, recordFetch, saveState, seedState, spentToday, syncIndex,
  type FetchStatus, type IndexFile, type PipelineState,
} from './state';

export interface BannersResult {
  status: 'done' | 'error'; requests: number; error?: string;
  events: { id: number; status: 'done' | 'missing' | 'error' }[];
}
export interface FetchResult { status: FetchStatus; requests: number; sids: string[]; error?: string; removed?: string[] }
export interface RunDeps {
  statePath: string; indexPath: string; boardsDir: string;
  /** Bucket-relative paths the workflow's sync-up step deletes from R2 (rclone copy never deletes). */
  r2DeletePath?: string;
  fetchEvent(id: number): Promise<FetchResult>;
  buildEpisode(sid: string): Promise<boolean>;
  /** Banner lane (spec 2026-11-07): home banners of at most 4 events, one request each. */
  fetchBanners(ids: number[]): Promise<BannersResult>;
  /** Converts raw banners that have no public copy yet and rewrites the manifest; failed = undecodable bundles. */
  buildBanners(): Promise<{ ok: boolean; built: number; changed: boolean; failed: string[] }>;
  /** siteFingerprint of the working tree; compared with the state's deployedSite. */
  siteHash(): string;
  /** null without ANTHROPIC_API_KEY: the direct phase makes no API calls. runOnce supplies persist. */
  director: Omit<DirectorDeps, 'persist'> | null;
  env: { backfill: boolean; dailyCapUsd: number };
  now(): Date; log(line: string): void;
  sleep(ms: number): Promise<void>;
}
export type Phase = 'plan' | 'fetch' | 'direct' | 'mark-deployed';
export interface RunOptions { phase: Phase; event?: number; direct?: number }
export interface RunSummary {
  phase: Phase; picked?: { id: number; reason: string }; fetch?: FetchResult; built: string[]; authorized: number[];
  reconciled?: { adopted: string[] }; collected?: { done: string[]; retry: string[]; fallback: string[]; pending: string[] };
  submitted: string[]; skipped: string[]; deploy: boolean; spentToday?: number; failed?: string;
  /** plan phase: why this run needs the R2 assets; empty = idle. */
  work?: string[];
  banners?: { requests: number; done: number[]; missing: number[]; built: number };
}

const BANNER_GAP_MS = 5_000;
const EXIT_STATUS: Record<number, FetchStatus> = { 0: 'done', 3: 'jp', 4: 'partial', 5: 'missing' };

export function fetchResultFromChild(code: number, lastLine: string): FetchResult {
  const status = EXIT_STATUS[code];
  if (!status) {
    try {
      const r = JSON.parse(lastLine) as { requests?: number; error?: string; removed?: unknown };
      const removed = Array.isArray(r.removed) ? r.removed.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_]+\.asset$/.test(x)) : [];
      return { status: 'error', requests: Number(r.requests) || 0, sids: [], error: String(r.error ?? `exit ${code}`), ...(removed.length ? { removed } : {}) };
    } catch {
      return { status: 'error', requests: 0, sids: [], error: `exit ${code} without a result line` };
    }
  }
  try {
    const r = JSON.parse(lastLine) as FetchResult;
    if (r.status !== status || !Array.isArray(r.sids)) throw new Error('mismatch');
    const removed = Array.isArray(r.removed) ? r.removed.filter((x): x is string => typeof x === 'string') : [];
    return { status, requests: Number(r.requests) || 0, sids: r.sids, ...(removed.length ? { removed } : {}) };
  } catch {
    return { status: 'error', requests: 0, sids: [], error: `exit ${code} without a result line` };
  }
}

/**
 * Repo files the site build reads besides assets/ (which the fetch phase already flags for deploy): code, page,
 * static files, storyboards, build config and the event index (its `built` date is shown in the library).
 */
export const SITE_PATHS = ['index.html', 'src', 'static', 'storyboards', 'data/tc-event-index.json', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json'];

export function siteFingerprint(root: string, paths = SITE_PATHS): string {
  const files: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) for (const f of fs.readdirSync(abs)) walk(path.posix.join(rel, f));
    else files.push(rel);
  };
  for (const p of paths) walk(p);
  const h = createHash('sha256');
  for (const f of files.sort()) h.update(f).update('\0').update(fs.readFileSync(path.join(root, f))).update('\0');
  return h.digest('hex');
}

const boardSids = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)) : [];

export async function runOnce(d: RunDeps, o: RunOptions): Promise<RunSummary> {
  const sum: RunSummary = { phase: o.phase, built: [], authorized: [], submitted: [], skipped: [], deploy: false };
  const index = JSON.parse(fs.readFileSync(d.indexPath, 'utf8')) as IndexFile;
  const now = d.now();
  const s: PipelineState = loadState(d.statePath) ?? seedState(index, boardSids(d.boardsDir), now);
  try {
    if (o.phase === 'plan') planPhase(d, o, s, index, sum);
    else if (o.phase === 'fetch') await fetchPhase(d, o, s, index, sum);
    else if (o.phase === 'direct') await directPhase(d, s, index, sum);
    else { s.pendingDeploy = false; s.deployedSite = d.siteHash(); }
  } catch (e) {
    sum.failed = e instanceof Error ? e.message : String(e);
    sum.deploy = s.pendingDeploy;
    saveState(d.statePath, s);
    throw Object.assign(e instanceof Error ? e : new Error(sum.failed), { summary: sum });
  }
  saveState(d.statePath, s);
  sum.deploy = s.pendingDeploy;
  sum.spentToday = spentToday(s, dayOf(now));
  return sum;
}

/**
 * Reasons this run has work for the fetch, direct or deploy steps; each mirrors a condition those phases act on.
 * An idle run (no reasons) skips both R2 syncs, both phases and the deploy, so whatever they would do must show up
 * here. Not covered: reconcile adopting a batch lost by a crashed runner waits for the next run with work.
 */
export function workReasons(s: PipelineState, index: IndexFile, o: RunOptions, env: RunDeps['env'], now: Date): string[] {
  const why: string[] = [];
  if (o.event !== undefined || (o.direct ?? 0) > 0) why.push('manual inputs');
  const picked = pickEvent(s, index, { backfill: env.backfill, now, forced: o.event });
  if (picked) why.push(`event ${picked.id} (${picked.reason})`);
  if (bannerLane(s, index).length) why.push('banners due');
  if (s.pendingDeploy) why.push('deploy pending');
  if (s.batches.length) why.push('batches in flight');
  if (s.promptVersion !== PROMPT_VERSION) why.push('prompt version changed');
  if (s.bannerBuildFailed) why.push('banner build retry');
  if (dueEpisodes(s, index).length) why.push('storyboards due');
  return why;
}

function planPhase(d: RunDeps, o: RunOptions, s: PipelineState, index: IndexFile, sum: RunSummary) {
  const added = syncIndex(s, index, d.now());
  if (added.length) d.log(`new events: ${added.join(', ')}`);
  if (d.siteHash() !== s.deployedSite && !s.pendingDeploy) {
    s.pendingDeploy = true;
    d.log('site sources changed since the last deploy');
  }
  sum.work = workReasons(s, index, o, d.env, d.now());
  d.log(sum.work.length ? `work: ${sum.work.join('; ')}` : 'idle: nothing to fetch, direct or deploy');
}

async function fetchPhase(d: RunDeps, o: RunOptions, s: PipelineState, index: IndexFile, sum: RunSummary) {
  const now = d.now();
  const added = syncIndex(s, index, now);
  if (added.length) d.log(`new events: ${added.join(', ')}`);
  const picked = pickEvent(s, index, { backfill: d.env.backfill, now, forced: o.event });
  if (picked) {
    sum.picked = picked;
    d.log(`event ${picked.id} (${picked.reason})`);
    const r = await d.fetchEvent(picked.id);
    sum.fetch = r;
    d.log(`fetch ${picked.id}: ${r.status}, ${r.requests} requests`);
    let result: { status: FetchStatus; error?: string } = r;
    if (r.status === 'done' || r.status === 'partial' || r.status === 'missing') {
      for (const sid of r.sids) {
        if (!(await d.buildEpisode(sid))) { result = { status: 'error', error: `build ${sid}` }; break; }
        sum.built.push(sid);
      }
    }
    recordFetch(s, picked.id, result, now);
    const gone = (r.removed ?? []).filter(f => /^[a-z0-9_]+\.asset$/.test(f)).map(f => `raw/${f}`);
    if (gone.length && d.r2DeletePath) {
      fs.appendFileSync(d.r2DeletePath, gone.map(g => `${g}\n`).join(''));
      d.log(`Japanese scripts to remove from R2: ${gone.join(', ')}`);
    }
  }
  await bannerPhase(d, s, index, sum);
  if (o.event !== undefined) sum.authorized.push(...authorizeDirect(s, index, { eventIds: [o.event] }));
  if (o.direct && o.direct > 0) sum.authorized.push(...authorizeDirect(s, index, { newest: o.direct }));
  if (sum.authorized.length) d.log(`storyboards authorized: ${sum.authorized.join(', ')}`);
}

// After the queue, so an event whose images were fetched this hour gets its banner now.
async function bannerPhase(d: RunDeps, s: PipelineState, index: IndexFile, sum: RunSummary) {
  const b: NonNullable<RunSummary['banners']> = { requests: 0, done: [], missing: [], built: 0 };
  sum.banners = b;
  const lane = bannerLane(s, index);
  if (lane.length) {
    if (sum.picked) await d.sleep(BANNER_GAP_MS);
    // fetch_episode --banners checks eligibility against the state file, so this run's results must be on disk.
    saveState(d.statePath, s);
    const r = await d.fetchBanners(lane);
    b.requests = r.requests;
    d.log(`banners: ${r.status}, ${r.requests} requests`);
    if (r.status === 'error') d.log(`banners error: ${r.error ?? ''}`);
    else for (const e of r.events) {
      if (!lane.includes(e.id)) continue;
      recordBanner(s, e.id, e.status);
      if (e.status === 'done') b.done.push(e.id);
      else if (e.status === 'missing') b.missing.push(e.id);
    }
  }
  const built = await d.buildBanners();
  if (built.ok) delete s.bannerBuildFailed;
  else { s.bannerBuildFailed = true; d.log('build banners failed'); }
  b.built = built.built;
  if (built.built > 0 || built.changed) s.pendingDeploy = true;
  // build_banners deleted these raw files; forget the record so the lane fetches them again.
  for (const bundle of built.failed) {
    const ev = index.events.find(e => e.bundle === bundle);
    const st = ev && s.events[String(ev.id)];
    if (st?.banner === 'done') delete st.banner;
    d.log(`banner ${bundle} could not be decoded; refetching`);
  }
}

async function directPhase(d: RunDeps, s: PipelineState, index: IndexFile, sum: RunSummary) {
  if (!d.director) { d.log('no ANTHROPIC_API_KEY; storyboards not requested'); return; }
  const dd: DirectorDeps = { ...d.director, persist: () => saveState(d.statePath, s) };
  const requeued = requeueForPrompt(s);
  if (requeued.length) d.log(`prompt changed; ${requeued.length} fallback episodes requeued`);
  sum.reconciled = await reconcile(dd, s);
  sum.collected = await collectBatches(dd, s);
  const r = await submitDue(dd, s, index, { dailyCapUsd: d.env.dailyCapUsd });
  sum.submitted = r.submitted;
  sum.skipped = r.skipped;
}

const CHILD_ENV = () => ({ PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', PYTHONIOENCODING: 'utf-8' });

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    execFile(cmd, args, { env: CHILD_ENV(), timeout: timeoutMs, maxBuffer: 32 << 20 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export function spawnFetch(script: string, log: (line: string) => void): (id: number) => Promise<FetchResult> {
  return async id => {
    const r = await run('python3', [script, '--event', String(id)], 20 * 60e3);
    const lines = r.stdout.split('\n').map(l => l.trim()).filter(Boolean);
    for (const l of lines.slice(0, -1)) log(l);
    if (r.stderr.trim()) log(r.stderr.trim().split('\n').slice(-5).join('\n'));
    const res = fetchResultFromChild(r.code, lines.at(-1) ?? '');
    if (res.status === 'error') log(`fetch_episode exit ${r.code}: ${lines.at(-1) ?? ''}`);
    return res;
  };
}

export function spawnBanners(script: string, log: (line: string) => void): (ids: number[]) => Promise<BannersResult> {
  return async ids => {
    const r = await run('python3', [script, '--banners', ids.join(',')], 5 * 60e3);
    const lines = r.stdout.split('\n').map(l => l.trim()).filter(Boolean);
    for (const l of lines.slice(0, -1)) log(l);
    if (r.stderr.trim()) log(r.stderr.trim().split('\n').slice(-5).join('\n'));
    try {
      const res = JSON.parse(lines.at(-1) ?? '') as BannersResult;
      if (!Array.isArray(res.events)) throw new Error('no events');
      return res;
    } catch {
      return { status: 'error', requests: 0, events: [], error: `exit ${r.code} without a result line` };
    }
  };
}

function realDeps(): RunDeps {
  const log = (line: string) => console.log(line);
  const key = process.env.ANTHROPIC_API_KEY;
  const prompt = fs.readFileSync('prompts/storyboard_director.md', 'utf8').split(/\n---\n/).slice(1).join('\n---\n').trim();
  const director: RunDeps['director'] = key ? {
    client: new Anthropic({ apiKey: key }),
    compact: async sid => {
      const r = await run('python3', ['scripts/compact_script.py', path.join('assets/raw', `${sid}.asset`)], 60e3);
      if (r.code !== 0) throw new Error(`compact ${sid}: exit ${r.code}`);
      return r.stdout;
    },
    readEpisode: sid => parseScenario(JSON.parse(fs.readFileSync(path.join('assets/raw', `${sid}.asset`), 'utf8')) as RawScenario),
    writeBoard: (sid, board) => fs.writeFileSync(path.join('storyboards', `${sid}.json`), JSON.stringify(board, null, 1) + '\n'),
    prompt, now: () => new Date(), log,
  } : null;
  const cap = Number(process.env.DIRECT_DAILY_USD);
  return {
    statePath: 'data/pipeline-state.json', indexPath: 'data/tc-event-index.json', boardsDir: 'storyboards',
    r2DeletePath: 'assets/r2-delete.txt',
    fetchEvent: spawnFetch('scripts/fetch_episode.py', log),
    fetchBanners: spawnBanners('scripts/fetch_episode.py', log),
    buildBanners: async () => {
      const r = await run('npx', ['tsx', 'scripts/build_banners.ts'], 5 * 60e3);
      if (r.stdout.trim()) log(r.stdout.trim());
      if (r.code !== 0) log(`build banners failed: exit ${r.code} ${r.stderr.trim().split('\n').slice(-3).join(' ')}`);
      try {
        const j = JSON.parse(r.stdout.trim().split('\n').at(-1) ?? '') as { built?: unknown; changed?: unknown; failed?: unknown };
        const failed = Array.isArray(j.failed) ? j.failed.filter((x): x is string => typeof x === 'string') : [];
        return { ok: r.code === 0, built: Number(j.built) || 0, changed: j.changed === true, failed };
      } catch {
        return { ok: false, built: 0, changed: false, failed: [] };
      }
    },
    buildEpisode: async sid => {
      const r = await run('npx', ['tsx', 'scripts/build_episode.ts', sid], 10 * 60e3);
      if (r.stdout.trim()) log(r.stdout.trim());
      if (r.code !== 0) log(`build ${sid} failed: exit ${r.code} ${r.stderr.trim().split('\n').slice(-3).join(' ')}`);
      return r.code === 0;
    },
    siteHash: () => siteFingerprint('.'),
    director,
    env: { backfill: process.env.BACKFILL === 'on', dailyCapUsd: process.env.DIRECT_DAILY_USD && Number.isFinite(cap) && cap >= 0 ? cap : 20 },
    now: () => new Date(), log,
    sleep: ms => new Promise(res => setTimeout(res, ms)),
  };
}

const HELP = `usage: tsx scripts/pipeline/run.ts <phase> [--event N] [--direct N]
phases:
  plan           add new index events, flag a deploy if site sources changed, report whether this run has work (work=)
  fetch          update the queue, fetch at most one event, build its episodes, then up to 4 home banners
  direct         reconcile and collect storyboard batches, submit due episodes (needs ANTHROPIC_API_KEY)
  mark-deployed  clear pendingDeploy and record the deployed site fingerprint after a successful deploy
options (fetch only):
  --event N      process event N first; naming an old event also authorizes its storyboards
  --direct N     authorize storyboards for the N newest old events whose assets are done
env: BACKFILL=on|off, DIRECT_DAILY_USD (default 20)`;

function writeGithub(sum: RunSummary) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, sum.phase === 'plan' ? `work=${Boolean(sum.work?.length)}\n` : `deploy=${sum.deploy}\n`);
  }
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const list = (xs?: string[]) => (xs && xs.length ? xs.join(', ') : '-');
  const lines = [`### pipeline ${sum.phase}`, ''];
  if (sum.phase === 'plan') {
    lines.push(`- work: ${sum.work?.length ? sum.work.join('; ') : 'none (idle: R2 sync, fetch, direct and deploy skipped)'}`);
  } else if (sum.phase === 'fetch') {
    lines.push(`- event: ${sum.picked ? `${sum.picked.id} (${sum.picked.reason})` : '-'}`);
    if (sum.fetch) lines.push(`- fetch: ${sum.fetch.status}, ${sum.fetch.requests} requests`);
    lines.push(`- built: ${list(sum.built)}`, `- authorized: ${sum.authorized.join(', ') || '-'}`);
    if (sum.banners) lines.push(`- banners: ${sum.banners.requests} requests, done ${sum.banners.done.join(', ') || '-'}, missing ${sum.banners.missing.join(', ') || '-'}, built ${sum.banners.built}`);
  } else if (sum.phase === 'direct') {
    lines.push(`- adopted: ${list(sum.reconciled?.adopted)}`, `- collected done: ${list(sum.collected?.done)}`,
      `- retry: ${list(sum.collected?.retry)}`, `- fallback: ${list(sum.collected?.fallback)}`,
      `- pending: ${list(sum.collected?.pending)}`, `- submitted: ${list(sum.submitted)}`, `- skipped: ${list(sum.skipped)}`);
  }
  lines.push(`- spent today: US$${(sum.spentToday ?? 0).toFixed(2)}`, `- deploy: ${sum.deploy}`);
  if (sum.failed) lines.push(`- failed: ${sum.failed}`);
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

function parseArgs(argv: string[]): RunOptions | null {
  const phase = argv[0] as Phase;
  if (!['plan', 'fetch', 'direct', 'mark-deployed'].includes(phase)) return null;
  const o: RunOptions = { phase };
  for (let i = 1; i < argv.length; i += 2) {
    const v = argv[i + 1];
    if (!v || !/^\d{1,5}$/.test(v)) return null;
    if (argv[i] === '--event') o.event = Number(v);
    else if (argv[i] === '--direct') o.direct = Number(v);
    else return null;
  }
  return o;
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(HELP); return 0; }
  const o = parseArgs(argv);
  if (!o) { console.error(HELP); return 2; }
  try {
    const sum = await runOnce(realDeps(), o);
    writeGithub(sum);
    return 0;
  } catch (e) {
    const sum = (e as { summary?: RunSummary }).summary;
    console.error(`pipeline ${o.phase} failed: ${e instanceof Error ? e.message : String(e)}`);
    if (sum) writeGithub(sum);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2)).then(code => process.exit(code));
