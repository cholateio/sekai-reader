import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { fetchResultFromChild, runOnce, spawnFetch, spawnScripts, type FetchResult, type RunDeps, type ScriptsResult } from '../scripts/pipeline/run';
import { loadState, type IndexEvent, type IndexFile, type PipelineState } from '../scripts/pipeline/state';
import { syntheticEpisode } from './helpers';

const ev = (id: number, date: string, n = 2): IndexEvent => ({
  id, name: `E${id}`, date, bundle: `b${id}`,
  eps: Array.from({ length: n }, (_, i) => [i + 1, `t${i + 1}`, `event_${id}_0${i + 1}`] as [number, string, string]),
});
const NOW = new Date('2026-11-04T10:00:00Z');

function setup(o: { fetch?: (id: number) => FetchResult; build?: (sid: string) => boolean; withDirector?: boolean; backfill?: boolean; cap?: number; scriptsFirst?: boolean; scripts?: (ids: number[]) => ScriptsResult } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-'));
  const index: IndexFile = { events: [ev(173, '2026-10-01', 3), ev(172, '2026-09-20'), ev(171, '2026-09-10')], built: '2026-11-04' };
  const indexPath = path.join(dir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index));
  const boardsDir = path.join(dir, 'boards');
  fs.mkdirSync(boardsDir);
  fs.writeFileSync(path.join(boardsDir, 'event_173_01.json'), '{}');
  const calls: string[] = [];
  const fetched: number[] = [];
  const scriptCalls: number[][] = [];
  const sleeps: number[] = [];
  const built: string[] = [];
  let n = 0;
  const ended = new Set<string>();
  const client = {
    messages: {
      countTokens: async () => { calls.push('countTokens'); return { input_tokens: 4000 }; },
      batches: {
        list: () => { calls.push('list'); return { async *[Symbol.asyncIterator]() {} }; },
        create: async ({ requests }: { requests: { custom_id: string }[] }) => { calls.push(`create:${requests.map(r => r.custom_id).join(',')}`); return { id: `msgbatch_${++n}` }; },
        retrieve: async (id: string) => { calls.push(`retrieve:${id}`); return { id, processing_status: ended.has(id) ? 'ended' : 'in_progress' }; },
        results: async () => ({ async *[Symbol.asyncIterator]() {} }),
      },
    },
  };
  const deps: RunDeps = {
    statePath: path.join(dir, 'pipeline-state.json'), indexPath, boardsDir, r2DeletePath: path.join(dir, 'r2-delete.txt'),
    fetchEvent: async id => { fetched.push(id); return o.fetch ? o.fetch(id) : { status: 'done', requests: 5, sids: (JSON.parse(fs.readFileSync(indexPath, 'utf8')) as IndexFile).events.find(e => e.id === id)!.eps.map(e => e[2]) }; },
    buildEpisode: async sid => { built.push(sid); return o.build ? o.build(sid) : true; },
    fetchScripts: async ids => {
      scriptCalls.push(ids);
      if (o.scripts) return o.scripts(ids);
      const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as IndexFile;
      return { status: 'done', requests: 9, events: ids.map(id => ({ id, status: 'done' as const, sids: idx.events.find(e => e.id === id)!.eps.map(e => e[2]) })) };
    },
    director: o.withDirector ? {
      client: client as never, compact: async () => 'BG:x', readEpisode: () => syntheticEpisode(),
      writeBoard: () => {}, prompt: 'P', now: () => NOW, log: () => {},
    } : null,
    env: { backfill: o.backfill ?? false, dailyCapUsd: o.cap ?? 20, scriptsFirst: o.scriptsFirst ?? false },
    now: () => NOW, log: () => {},
    sleep: async ms => { sleeps.push(ms); },
  };
  const addNew = () => {
    const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as IndexFile;
    idx.events.unshift(ev(174, '2026-10-20'));
    fs.writeFileSync(indexPath, JSON.stringify(idx));
  };
  const state = () => loadState(deps.statePath) as PipelineState;
  return { deps, calls, fetched, built, addNew, state, ended, index, scriptCalls, sleeps };
}
const epStates = (s: PipelineState, id: number) => Object.values(s.events[String(id)].eps).map(e => e.s);

test('fetch：首次執行種子狀態檔：全部舊活動、不抓、不送', async () => {
  const t = setup();
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(r.picked).toBeUndefined();
  expect(t.fetched).toEqual([]);
  const s = t.state();
  expect(Object.values(s.events).every(e => e.kind === 'old' && e.assets === 'pending')).toBe(true);
  expect(s.events['173'].eps['event_173_01'].s).toBe('done');
  expect(r.deploy).toBe(false);
});

test('fetch：新活動 → 抓 → 逐話 build → 各話 none → deploy=true', async () => {
  const t = setup();
  await runOnce(t.deps, { phase: 'fetch' });
  t.addNew();
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(r.picked).toEqual({ id: 174, reason: 'new' });
  expect(t.built).toEqual(['event_174_01', 'event_174_02']);
  expect(r.built).toEqual(['event_174_01', 'event_174_02']);
  expect(epStates(t.state(), 174)).toEqual(['none', 'none']);
  expect(r.deploy).toBe(true);
});

test('fetch：build 失敗一話 → recordFetch error、assets 仍 pending', async () => {
  const t = setup({ build: sid => sid !== 'event_174_02' });
  await runOnce(t.deps, { phase: 'fetch' });
  t.addNew();
  await runOnce(t.deps, { phase: 'fetch' });
  const e = t.state().events['174'];
  expect(e).toMatchObject({ assets: 'pending', failures: 1, lastError: 'build event_174_02' });
});

test('fetch：jp 活動：記 jp、不 build', async () => {
  const t = setup({ fetch: () => ({ status: 'jp', requests: 1, sids: [] }) });
  await runOnce(t.deps, { phase: 'fetch' });
  t.addNew();
  await runOnce(t.deps, { phase: 'fetch' });
  expect(t.state().events['174'].assets).toBe('jp');
  expect(t.built).toEqual([]);
});

test('fetch：partial：build 已抓到的話、不計失敗、deploy=true', async () => {
  const t = setup({ fetch: () => ({ status: 'partial', requests: 40, sids: ['event_174_01'] }) });
  await runOnce(t.deps, { phase: 'fetch' });
  t.addNew();
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(t.built).toEqual(['event_174_01']);
  expect(t.state().events['174']).toMatchObject({ assets: 'pending', failures: 0 });
  expect(r.deploy).toBe(true);
});

test('fetch：--event 指名舊活動 → 抓完並授權其分鏡（manual → none）', async () => {
  const t = setup();
  const r = await runOnce(t.deps, { phase: 'fetch', event: 173 });
  expect(r.picked).toEqual({ id: 173, reason: 'forced' });
  expect(r.authorized).toEqual([173]);
  expect(epStates(t.state(), 173)).toEqual(['done', 'none', 'none']);
  expect(t.state().events['173'].assets).toBe('done');
});

test('fetch：--direct 2 只授權兩期最新且 assets done 的舊活動', async () => {
  const t = setup({ backfill: true });
  for (let i = 0; i < 3; i++) await runOnce(t.deps, { phase: 'fetch' });
  expect(t.fetched).toEqual([173, 172, 171]);
  const r = await runOnce(t.deps, { phase: 'fetch', direct: 2 });
  expect(r.authorized).toEqual([173, 172]);
  expect(epStates(t.state(), 171)).toEqual(['manual', 'manual']);
});

test('direct：reconcile → collect → submitDue 順序，由 dueEpisodes 決定送什麼', async () => {
  const t = setup({ withDirector: true });
  await runOnce(t.deps, { phase: 'fetch', event: 173 });
  const r = await runOnce(t.deps, { phase: 'direct' });
  expect(t.calls).toEqual(['list', 'countTokens', 'countTokens', 'create:event_173_02,event_173_03']);
  expect(r.submitted).toEqual(['event_173_02', 'event_173_03']);
  expect(t.state().batches.map(b => b.id)).toEqual(['msgbatch_1']);
  t.calls.length = 0;
  await runOnce(t.deps, { phase: 'direct' });
  expect(t.calls).toEqual(['list', 'retrieve:msgbatch_1']);
});

test('direct：director 為 null 時不呼叫任何 API', async () => {
  const t = setup();
  await runOnce(t.deps, { phase: 'fetch', event: 173 });
  const r = await runOnce(t.deps, { phase: 'direct' });
  expect(t.calls).toEqual([]);
  expect(r.submitted).toEqual([]);
  expect(epStates(t.state(), 173)).toEqual(['done', 'none', 'none']);
});

test('direct：上一次 skipped 的話這次送出', async () => {
  const t = setup({ withDirector: true, cap: 0 });
  await runOnce(t.deps, { phase: 'fetch', event: 173 });
  const r1 = await runOnce(t.deps, { phase: 'direct' });
  expect(r1.skipped).toEqual(['event_173_02', 'event_173_03']);
  t.deps.env.dailyCapUsd = 20;
  const r2 = await runOnce(t.deps, { phase: 'direct' });
  expect(r2.submitted).toEqual(['event_173_02', 'event_173_03']);
});

test('direct：花費寫回狀態檔（每日上限跨執行累計）', async () => {
  const t = setup({ withDirector: true });
  await runOnce(t.deps, { phase: 'fetch', event: 173 });
  await runOnce(t.deps, { phase: 'direct' });
  expect(t.state().spend['2026-11-04']).toBeGreaterThan(0.3);
});

test('mark-deployed 只清 pendingDeploy', async () => {
  const t = setup();
  await runOnce(t.deps, { phase: 'fetch', event: 173 });
  const before = t.state();
  expect(before.pendingDeploy).toBe(true);
  const r = await runOnce(t.deps, { phase: 'mark-deployed' });
  expect(r.deploy).toBe(false);
  expect(t.state()).toEqual({ ...before, pendingDeploy: false });
});

test('deps 例外時狀態檔仍被寫入並帶 failed', async () => {
  const t = setup({ build: () => { throw new Error('spawn failed'); } });
  const err = await runOnce(t.deps, { phase: 'fetch', event: 173 }).then(() => null, (e: unknown) => e as Error & { summary?: { failed?: string } });
  expect(err).toBeInstanceOf(Error);
  expect(err!.summary?.failed).toContain('spawn failed');
  expect(fs.existsSync(t.deps.statePath)).toBe(true);
  expect(t.state().events['173'].assets).toBe('pending');
});

test.each([[0, 'done'], [3, 'jp'], [4, 'partial'], [1, 'error']] as const)('fetchResultFromChild 對 exit %i 回 %s', (code, status) => {
  const line = JSON.stringify({ status: code === 1 ? 'error' : status, requests: 2, sids: ['a'] });
  const r = fetchResultFromChild(code, line);
  expect(r.status).toBe(status);
  if (code !== 1) expect(r.sids).toEqual(['a']);
  else expect(r.error).toBe('exit 1');
});

test('fetchResultFromChild 對 exit 1 保留腳本回報的錯誤訊息', () => {
  const r = fetchResultFromChild(1, JSON.stringify({ status: 'error', requests: 1, sids: [], error: 'HTTPError: HTTP Error 404: Not Found' }));
  expect(r).toMatchObject({ status: 'error', requests: 1, error: 'HTTPError: HTTP Error 404: Not Found' });
  expect(fetchResultFromChild(5, JSON.stringify({ status: 'missing', requests: 3, sids: ['a'] }))).toEqual({ status: 'missing', requests: 3, sids: ['a'] });
});

test('fetchResultFromChild 對 exit 1 保留合法的 removed，丟掉可疑路徑', () => {
  const r = fetchResultFromChild(1, JSON.stringify({ status: 'error', requests: 0, sids: [], error: 'invalid script', removed: ['event_7_01.asset', '../x', 3] }));
  expect(r).toMatchObject({ status: 'error', removed: ['event_7_01.asset'] });
});

test('fetch：整期抓到壞劇本 → 記錯誤並把 removed 排進 R2 刪除清單', async () => {
  const t = setup({ fetch: () => ({ status: 'error', requests: 0, sids: [], error: 'invalid script', removed: ['event_173_02.asset'] }) });
  await runOnce(t.deps, { phase: 'fetch', event: 173 });
  expect(t.state().events['173']).toMatchObject({ failures: 1, lastError: 'invalid script' });
  expect(fs.readFileSync(t.deps.r2DeletePath!, 'utf8')).toBe('raw/event_173_02.asset\n');
});

test('真實 fetchEvent：exit 1 時最後一行也進 log，missing 走 exit 5', async () => {
  const lines: string[] = [];
  const f = spawnFetch('tests/fixtures/fake_fetch.py', l => lines.push(l));
  expect(await f(1)).toMatchObject({ status: 'error', error: 'HTTPError: HTTP Error 500: boom' });
  expect(lines.some(l => l.includes('HTTP Error 500'))).toBe(true);
  expect(await f(2)).toMatchObject({ status: 'error', error: 'exit 1 without a result line' });
  expect(lines.some(l => l.includes('Traceback: boom'))).toBe(true);
  expect(await f(5)).toEqual({ status: 'missing', requests: 7, sids: [] });
});

test('fetch：missing 的新活動：記 missing、不計失敗、已抓到的話照 build', async () => {
  const t = setup({ fetch: () => ({ status: 'missing', requests: 3, sids: ['event_174_01'] }) });
  await runOnce(t.deps, { phase: 'fetch' });
  t.addNew();
  await runOnce(t.deps, { phase: 'fetch' });
  expect(t.built).toEqual(['event_174_01']);
  expect(t.state().events['174']).toMatchObject({ assets: 'missing', failures: 0 });
  expect(t.state().events['174'].jpCheckedAt).toBe(NOW.toISOString());
});

test('fetchResultFromChild 對亂碼的最後一行回 error', () => {
  expect(fetchResultFromChild(0, 'Traceback').status).toBe('error');
  expect(fetchResultFromChild(0, JSON.stringify({ status: 'jp', requests: 1, sids: [] })).status).toBe('error');
});

test('真實 fetchEvent 介面：spawn fake_fetch.py 取得 jp 與 partial 而非 error', async () => {
  const f = spawnFetch('tests/fixtures/fake_fetch.py', () => {});
  expect((await f(3)).status).toBe('jp');
  const p = await f(4);
  expect(p).toEqual({ status: 'partial', requests: 7, sids: ['event_4_01'] });
  expect((await f(9)).status).toBe('done');
  expect(await f(1)).toMatchObject({ status: 'error', error: 'HTTPError: HTTP Error 500: boom' });
});

test('direct 失敗時 summary 仍帶 deploy，讓已抓好的素材照常部署', async () => {
  const t = setup({ withDirector: true });
  await runOnce(t.deps, { phase: 'fetch', event: 173 });
  (t.deps.director!.client.messages.batches as unknown as { list: () => never }).list = () => { throw new Error('api down'); };
  const err = await runOnce(t.deps, { phase: 'direct' }).then(() => null, (e: unknown) => e as Error & { summary?: { deploy: boolean } });
  expect(err!.summary?.deploy).toBe(true);
});

test('jp 且刪掉了既有劇本 → 寫入 R2 刪除清單，只收合法路徑', async () => {
  const t = setup({ fetch: () => ({ status: 'jp', requests: 0, sids: [], removed: ['event_174_01.asset', '../x'] }) });
  await runOnce(t.deps, { phase: 'fetch' });
  t.addNew();
  await runOnce(t.deps, { phase: 'fetch' });
  expect(fs.readFileSync(t.deps.r2DeletePath!, 'utf8')).toBe('raw/event_174_01.asset\n');
});

test('fetchResultFromChild 帶出 removed', () => {
  const r = fetchResultFromChild(3, JSON.stringify({ status: 'jp', requests: 0, sids: [], removed: ['event_9_01.asset'] }));
  expect(r.removed).toEqual(['event_9_01.asset']);
});

test('scripts-first：不做圖片補舊，改抓全部舊活動的劇本並授權分鏡；不 build、不部署', async () => {
  const t = setup({ backfill: true, scriptsFirst: true });
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(t.fetched).toEqual([]);
  expect(t.scriptCalls).toEqual([[173, 172, 171]]);
  expect(t.built).toEqual([]);
  const s = t.state();
  expect(s.events['172'].scriptsAt).toBe(NOW.toISOString());
  expect(s.events['172'].assets).toBe('pending');
  expect(Object.values(s.events['172'].eps).map(e => e.s)).toEqual(['none', 'none']);
  expect(r.authorized.sort()).toEqual([171, 172, 173]);
  expect(r.deploy).toBe(false);
  expect(r.scripts?.requests).toBe(9);
});

test('scripts-first：jp / missing / partial 照實記錄，partial 的期下次再排', async () => {
  const t = setup({ backfill: true, scriptsFirst: true, scripts: () => ({ status: 'partial', requests: 80, events: [
    { id: 173, status: 'jp', sids: [] }, { id: 172, status: 'missing', sids: [] }, { id: 171, status: 'partial', sids: ['event_171_01'] }] }) });
  await runOnce(t.deps, { phase: 'fetch' });
  const s = t.state();
  expect([s.events['173'].assets, s.events['172'].assets, s.events['171'].assets]).toEqual(['jp', 'missing', 'pending']);
  expect(s.events['171'].scriptsAt).toBeUndefined();
  await runOnce(t.deps, { phase: 'fetch' });
  expect(t.scriptCalls.at(-1)).toEqual([171]);
});

test('scripts-first：新活動整期抓時這小時不跑劇本線（每小時請求量不疊加）', async () => {
  const t = setup({ backfill: true, scriptsFirst: false });
  t.deps.env.backfill = false;
  await runOnce(t.deps, { phase: 'fetch' });
  t.deps.env.backfill = true;
  t.deps.env.scriptsFirst = true;
  t.addNew();
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(r.picked).toEqual({ id: 174, reason: 'new' });
  expect(t.scriptCalls).toEqual([]);
  await runOnce(t.deps, { phase: 'fetch' });
  expect(t.scriptCalls).toEqual([[173, 172, 171]]);
});

test('scripts-first 關閉時不呼叫劇本線', async () => {
  const t = setup({ backfill: true });
  await runOnce(t.deps, { phase: 'fetch' });
  expect(t.scriptCalls).toEqual([]);
  expect(t.fetched).toEqual([173]);
});

test('真實 fetchScripts：spawn 帶 --scripts-for 與逗號分隔的 id', async () => {
  const f = spawnScripts('tests/fixtures/fake_fetch.py', () => {});
  expect(await f([9, 8])).toEqual({ status: 'done', requests: 2, events: [{ id: 9, status: 'done', sids: ['event_9_01'] }, { id: 8, status: 'done', sids: ['event_8_01'] }] });
});

test('scripts-first：recheck 只花 1 個請求且仍是 jp/missing 才接劇本線，並先等 20 秒', async () => {
  const t = setup({ backfill: true, scriptsFirst: true, fetch: () => ({ status: 'jp', requests: 1, sids: [] }) });
  await runOnce(t.deps, { phase: 'fetch' });
  const s0 = t.state();
  for (const id of ['173', '172', '171']) delete s0.events[id].scriptsAt;
  s0.events['173'].assets = 'jp';
  s0.events['173'].jpCheckedAt = '2026-11-03T00:00:00Z';
  fs.writeFileSync(t.deps.statePath, JSON.stringify(s0));
  t.scriptCalls.length = 0;
  t.sleeps.length = 0;
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(r.picked).toEqual({ id: 173, reason: 'jp-recheck' });
  expect(t.scriptCalls).toEqual([[172, 171]]);
  expect(t.sleeps).toEqual([20000]);
});

test('scripts-first：recheck 變成繁中並整期抓（多個請求）時，這小時不跑劇本線', async () => {
  const t = setup({ backfill: true, scriptsFirst: true });
  await runOnce(t.deps, { phase: 'fetch' });
  const s0 = t.state();
  for (const id of ['172', '171']) delete s0.events[id].scriptsAt;
  s0.events['173'].assets = 'jp';
  s0.events['173'].jpCheckedAt = '2026-11-03T00:00:00Z';
  fs.writeFileSync(t.deps.statePath, JSON.stringify(s0));
  t.scriptCalls.length = 0;
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(r.picked).toEqual({ id: 173, reason: 'jp-recheck' });
  expect(r.fetch?.status).toBe('done');
  expect(t.scriptCalls).toEqual([]);
});

test('scripts-first：壞掉的劇本記為錯誤並排進 R2 刪除清單', async () => {
  const t = setup({ backfill: true, scriptsFirst: true, scripts: () => ({ status: 'done', requests: 3, events: [
    { id: 173, status: 'error', sids: [], removed: ['event_173_01.asset'] }, { id: 172, status: 'done', sids: ['event_172_01', 'event_172_02'] }] }) });
  await runOnce(t.deps, { phase: 'fetch' });
  const s = t.state();
  expect(s.events['173']).toMatchObject({ failures: 1, assets: 'pending' });
  expect(s.events['173'].scriptsAt).toBeUndefined();
  expect(fs.readFileSync(t.deps.r2DeletePath!, 'utf8')).toBe('raw/event_173_01.asset\n');
});
