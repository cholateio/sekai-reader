import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { PROMPT_VERSION } from '../scripts/pipeline/director';
import { fetchResultFromChild, runOnce, siteFingerprint, spawnBanners, spawnFetch, type BannersResult, type FetchResult, type RunDeps } from '../scripts/pipeline/run';
import { loadState, type IndexEvent, type IndexFile, type PipelineState } from '../scripts/pipeline/state';
import { syntheticEpisode } from './helpers';

const ev = (id: number, date: string, n = 2): IndexEvent => ({
  id, name: `E${id}`, date, bundle: `b${id}`, closed: '2026-10-31T00:00:00Z',
  eps: Array.from({ length: n }, (_, i) => [i + 1, `t${i + 1}`, `event_${id}_0${i + 1}`] as [number, string, string]),
});
const NOW = new Date('2026-11-04T10:00:00Z');

function setup(o: { fetch?: (id: number) => FetchResult; build?: (sid: string) => boolean; withDirector?: boolean; backfill?: boolean; cap?: number; banners?: (ids: number[]) => BannersResult; bannersBuilt?: () => { ok: boolean; built: number; changed: boolean; failed: string[] } } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-'));
  const index: IndexFile = { events: [ev(173, '2026-10-01', 3), ev(172, '2026-09-20'), ev(171, '2026-09-10')], built: '2026-11-04' };
  const indexPath = path.join(dir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index));
  const boardsDir = path.join(dir, 'boards');
  fs.mkdirSync(boardsDir);
  fs.writeFileSync(path.join(boardsDir, 'event_173_01.json'), '{}');
  const calls: string[] = [];
  const fetched: number[] = [];
  const bannerCalls: number[][] = [];
  let bannerBuilds = 0;
  let site = 'site-v1';
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
    siteHash: () => site,
    buildEpisode: async sid => { built.push(sid); return o.build ? o.build(sid) : true; },
    fetchBanners: async ids => {
      bannerCalls.push(ids);
      return o.banners ? o.banners(ids) : { status: 'done', requests: ids.length, events: ids.map(id => ({ id, status: 'done' as const })) };
    },
    buildBanners: async () => { bannerBuilds++; return o.bannersBuilt ? o.bannersBuilt() : { ok: true, built: 0, changed: false, failed: [] }; },
    director: o.withDirector ? {
      client: client as never, compact: async () => 'BG:x', readEpisode: () => syntheticEpisode(),
      writeBoard: () => {}, prompt: 'P', now: () => NOW, log: () => {},
    } : null,
    env: { backfill: o.backfill ?? false, dailyCapUsd: o.cap ?? 20 },
    now: () => NOW, log: () => {},
    sleep: async ms => { sleeps.push(ms); },
  };
  const addNew = () => {
    const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as IndexFile;
    idx.events.unshift(ev(174, '2026-10-20'));
    fs.writeFileSync(indexPath, JSON.stringify(idx));
  };
  const state = () => loadState(deps.statePath) as PipelineState;
  return { deps, calls, fetched, built, addNew, state, ended, index, sleeps, bannerCalls, builds: () => bannerBuilds, setSite: (v: string) => { site = v; } };
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

test('mark-deployed 只清 pendingDeploy 並記下部署時的網站指紋', async () => {
  const t = setup();
  await runOnce(t.deps, { phase: 'fetch', event: 173 });
  const before = t.state();
  expect(before.pendingDeploy).toBe(true);
  const r = await runOnce(t.deps, { phase: 'mark-deployed' });
  expect(r.deploy).toBe(false);
  expect(t.state()).toEqual({ ...before, pendingDeploy: false, deployedSite: 'site-v1' });
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

test('fetch：每日重查仍是第一話 404（什麼都沒建）→ 不部署；後面話數 404 但前面有建 → 部署', async () => {
  const none = setup({ fetch: () => ({ status: 'missing', requests: 1, sids: [] }) });
  await runOnce(none.deps, { phase: 'fetch' });
  none.addNew();
  const r0 = await runOnce(none.deps, { phase: 'fetch' });
  expect(r0.picked).toEqual({ id: 174, reason: 'new' });
  expect(none.built).toEqual([]);
  expect(r0.deploy).toBe(false);
  const some = setup({ fetch: () => ({ status: 'missing', requests: 3, sids: ['event_174_01'] }) });
  await runOnce(some.deps, { phase: 'fetch' });
  some.addNew();
  expect((await runOnce(some.deps, { phase: 'fetch' })).deploy).toBe(true);
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

test('橫幅通道：抓完圖的活動同一輪就抓橫幅，先等 5 秒，記 done 並部署；每輪都整理橫幅檔', async () => {
  const t = setup({ backfill: true });
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(t.fetched).toEqual([173]);
  expect(t.bannerCalls).toEqual([[173]]);
  expect(t.sleeps).toEqual([5000]);
  expect(t.state().events['173'].banner).toBe('done');
  expect(r.banners).toEqual({ requests: 1, done: [173], missing: [], built: 0 });
  expect(r.deploy).toBe(true);
  expect(t.builds()).toBe(1);
  await runOnce(t.deps, { phase: 'fetch' });
  expect(t.bannerCalls.flat().filter(id => id === 173)).toHaveLength(1); // never asked twice
});

test('橫幅通道：404 記 missing 不再要，其他錯誤不記、下輪再試；通道整體失敗不中斷流水線', async () => {
  const t = setup({ banners: ids => ({ status: 'done', requests: ids.length, events: ids.map(id => ({ id, status: id === 172 ? 'missing' as const : 'error' as const })) }) });
  await runOnce(t.deps, { phase: 'fetch' });
  const s0 = t.state();
  for (const id of ['173', '172', '171']) s0.events[id].assets = 'done';
  s0.pendingDeploy = false;
  fs.writeFileSync(t.deps.statePath, JSON.stringify(s0));
  t.sleeps.length = 0;
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(t.bannerCalls.at(-1)).toEqual([173, 172, 171]);
  expect(t.sleeps).toEqual([]); // nothing else was requested this hour
  const s = t.state();
  expect([s.events['173'].banner, s.events['172'].banner, s.events['171'].banner]).toEqual([undefined, 'missing', undefined]);
  expect(r.deploy).toBe(false);
  t.deps.fetchBanners = async () => ({ status: 'error', requests: 0, events: [], error: 'boom' });
  const r2 = await runOnce(t.deps, { phase: 'fetch' });
  expect(r2.failed).toBeUndefined();
  expect(t.state().events['173'].banner).toBeUndefined();
});

test('橫幅整理產生新檔時觸發部署（補上先前抓到但沒轉檔的橫幅）', async () => {
  const t = setup({ bannersBuilt: () => ({ ok: true, built: 2, changed: true, failed: [] }) });
  await runOnce(t.deps, { phase: 'fetch' });
  const s0 = t.state();
  s0.pendingDeploy = false;
  fs.writeFileSync(t.deps.statePath, JSON.stringify(s0));
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(r.deploy).toBe(true);
  expect(r.banners?.built).toBe(2);
});

test('真實 fetchBanners：spawn 帶 --banners 與逗號分隔的 id', async () => {
  const f = spawnBanners('tests/fixtures/fake_fetch.py', () => {});
  expect(await f([9, 8])).toEqual({ status: 'done', requests: 2, events: [{ id: 9, status: 'done' }, { id: 8, status: 'done' }] });
});

test('橫幅轉檔失敗（下載壞檔）時清掉 done 紀錄，下一輪重抓；只有 manifest 變動也會部署', async () => {
  let build = { ok: true, built: 0, changed: false, failed: [] as string[] };
  const t = setup({ backfill: true, bannersBuilt: () => build });
  build = { ok: true, built: 0, changed: false, failed: ['b173'] };
  await runOnce(t.deps, { phase: 'fetch' });
  expect(t.state().events['173'].banner).toBeUndefined();
  build = { ok: true, built: 0, changed: true, failed: [] };
  const s0 = t.state();
  s0.pendingDeploy = false;
  fs.writeFileSync(t.deps.statePath, JSON.stringify(s0));
  const r = await runOnce(t.deps, { phase: 'fetch' });
  expect(t.bannerCalls.at(-1)).toContain(173);
  expect(r.deploy).toBe(true);
});

test('橫幅通道呼叫前已把本輪狀態寫回檔案（fetch_episode 會用狀態檔核對資格）', async () => {
  const t = setup({ backfill: true });
  let onDisk: string | undefined;
  t.deps.fetchBanners = async ids => {
    onDisk = (loadState(t.deps.statePath) as PipelineState).events['173'].assets;
    return { status: 'done', requests: ids.length, events: ids.map(id => ({ id, status: 'done' as const })) };
  };
  await runOnce(t.deps, { phase: 'fetch' });
  expect(onDisk).toBe('done');
});

test('direct：提示詞版本變了就把 fallback 的話重新送出', async () => {
  const t = setup({ withDirector: true });
  await runOnce(t.deps, { phase: 'fetch' });
  const s0 = t.state();
  s0.events['173'].assets = 'done';
  s0.events['173'].eps['event_173_01'] = { s: 'fallback', tries: 2, err: 'missing caption 3' };
  s0.promptVersion = 'v3-manga';
  fs.writeFileSync(t.deps.statePath, JSON.stringify(s0));
  const r = await runOnce(t.deps, { phase: 'direct' });
  expect(r.submitted).toContain('event_173_01');
  expect(t.state().promptVersion).toBe('v4-caps');
  expect(t.calls.some(c => c.startsWith('create:') && c.includes('event_173_01'))).toBe(true);
});

// plan: an idle run skips the R2 syncs and every phase, so each condition those phases act on must count as work.
async function idleSetup() {
  const t = setup({ withDirector: true });
  await runOnce(t.deps, { phase: 'fetch' });
  const s = t.state();
  for (const e of Object.values(s.events)) {
    Object.assign(e, { assets: 'done', banner: 'done' });
    for (const ep of Object.values(e.eps)) ep.s = 'done';
  }
  Object.assign(s, { promptVersion: PROMPT_VERSION, pendingDeploy: false, batches: [], deployedSite: 'site-v1' });
  fs.writeFileSync(t.deps.statePath, JSON.stringify(s));
  t.fetched.length = 0;
  t.calls.length = 0;
  t.bannerCalls.length = 0;
  t.built.length = 0;
  return t;
}
const edit = (t: Awaited<ReturnType<typeof idleSetup>>, f: (s: PipelineState) => void) => {
  const s = t.state();
  f(s);
  fs.writeFileSync(t.deps.statePath, JSON.stringify(s));
};

test('plan：全部完成、沒有待辦時是 idle，且不呼叫任何抓檔、建置或 API', async () => {
  const t = await idleSetup();
  const builds = t.builds();
  const r = await runOnce(t.deps, { phase: 'plan' });
  expect(r.work).toEqual([]);
  expect(r.deploy).toBe(false);
  expect([t.fetched, t.built, t.bannerCalls, t.calls]).toEqual([[], [], [], []]);
  expect(t.builds()).toBe(builds);
});

test('plan：目錄出現新活動 → 寫進狀態並算有事做', async () => {
  const t = await idleSetup();
  t.addNew();
  const r = await runOnce(t.deps, { phase: 'plan' });
  expect(r.work).toContain('event 174 (new)');
  expect(t.state().events['174']).toMatchObject({ kind: 'new', assets: 'pending' });
  expect(t.fetched).toEqual([]);
});

test('plan：jp/missing 每天重查一次；今天查過就 idle', async () => {
  const t = await idleSetup();
  edit(t, s => Object.assign(s.events['171'], { assets: 'jp', jpCheckedAt: '2026-11-03T05:00:00Z' }));
  expect((await runOnce(t.deps, { phase: 'plan' })).work).toEqual(['event 171 (jp-recheck)']);
  edit(t, s => { s.events['171'].jpCheckedAt = NOW.toISOString(); });
  expect((await runOnce(t.deps, { phase: 'plan' })).work).toEqual([]);
});

test('plan：手動參數、待部署、批次未收、分鏡待送、橫幅待抓、prompt 版本變更都算有事做', async () => {
  const cases: [string, (s: PipelineState) => void, string][] = [
    ['deploy', s => { s.pendingDeploy = true; }, 'deploy pending'],
    ['batch', s => { s.batches.push({ id: 'msgbatch_x', day: '2026-11-04', sids: ['event_172_01'], estUsd: 0.1 }); }, 'batches in flight'],
    ['due', s => { s.events['172'].eps['event_172_01'].s = 'none'; }, 'storyboards due'],
    ['banner', s => { delete s.events['172'].banner; }, 'banners due'],
    ['prompt', s => { s.promptVersion = 'v0-old'; }, 'prompt version changed'],
  ];
  for (const [, f, why] of cases) {
    const t = await idleSetup();
    edit(t, f);
    expect((await runOnce(t.deps, { phase: 'plan' })).work).toEqual([why]);
  }
  const t = await idleSetup();
  expect((await runOnce(t.deps, { phase: 'plan', direct: 3 })).work).toEqual(['manual inputs']);
  expect((await runOnce(t.deps, { phase: 'plan', event: 172 })).work).toEqual(['manual inputs']);
});

test('plan：BACKFILL 開著且有舊活動待抓才算有事做', async () => {
  const t = await idleSetup();
  edit(t, s => { s.events['171'].assets = 'pending'; });
  expect((await runOnce(t.deps, { phase: 'plan' })).work).toEqual([]);
  t.deps.env.backfill = true;
  expect((await runOnce(t.deps, { phase: 'plan' })).work).toEqual(['event 171 (backfill)']);
});

test('plan：橫幅轉檔整批失敗後，即使已部署也要算有事做，直到下一次轉檔成功', async () => {
  const t = await idleSetup();
  edit(t, s => { delete s.events['172'].banner; });
  let ok = false;
  t.deps.buildBanners = async () => ({ ok, built: 0, changed: false, failed: [] });
  await runOnce(t.deps, { phase: 'fetch' });
  await runOnce(t.deps, { phase: 'mark-deployed' });
  expect(t.state().events['172'].banner).toBe('done');
  expect((await runOnce(t.deps, { phase: 'plan' })).work).toEqual(['banner build retry']);
  ok = true;
  await runOnce(t.deps, { phase: 'fetch' });
  expect(t.state().bannerBuildFailed).toBeUndefined();
  expect((await runOnce(t.deps, { phase: 'plan' })).work).toEqual([]);
});

test('plan：網站原始碼與上次部署不同 → 設待部署；部署完記下指紋後回到 idle', async () => {
  const t = await idleSetup();
  t.setSite('site-v2');
  const r = await runOnce(t.deps, { phase: 'plan' });
  expect(r.work).toEqual(['deploy pending']);
  expect(r.deploy).toBe(true);
  expect(t.state().pendingDeploy).toBe(true);
  await runOnce(t.deps, { phase: 'mark-deployed' });
  expect(t.state()).toMatchObject({ pendingDeploy: false, deployedSite: 'site-v2' });
  expect((await runOnce(t.deps, { phase: 'plan' })).work).toEqual([]);
});

test('plan：從沒記過指紋的狀態（本次改版後第一跑）會部署一次', async () => {
  const t = await idleSetup();
  edit(t, s => { delete s.deployedSite; });
  expect((await runOnce(t.deps, { phase: 'plan' })).work).toEqual(['deploy pending']);
});

test('siteFingerprint：檔案內容、新增檔與路徑都會改變指紋，清單外的檔案不會', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  fs.mkdirSync(path.join(dir, 'src', 'app'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>');
  fs.writeFileSync(path.join(dir, 'src', 'app', 'a.ts'), 'a');
  const f0 = siteFingerprint(dir);
  fs.writeFileSync(path.join(dir, 'README.md'), 'docs');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'x.webp'), 'x');
  expect(siteFingerprint(dir)).toBe(f0);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"scripts":{"build":"vite build"}}');
  const fPkg = siteFingerprint(dir);
  expect(fPkg).not.toBe(f0);
  fs.writeFileSync(path.join(dir, 'src', 'app', 'a.ts'), 'b');
  const f1 = siteFingerprint(dir);
  expect(f1).not.toBe(fPkg);
  expect(f1).not.toBe(f0);
  fs.writeFileSync(path.join(dir, 'src', 'app', 'b.ts'), '');
  expect(siteFingerprint(dir)).not.toBe(f1);
  fs.rmSync(path.join(dir, 'src', 'app', 'b.ts'));
  fs.renameSync(path.join(dir, 'src', 'app', 'a.ts'), path.join(dir, 'src', 'app', 'c.ts'));
  expect(siteFingerprint(dir)).not.toBe(f1);
});

test('plan：進行中的新活動會寫進狀態，但不算有事做（活動結束後才抓）', async () => {
  const t = await idleSetup();
  const idx = JSON.parse(fs.readFileSync(t.deps.indexPath, 'utf8')) as IndexFile;
  idx.events.unshift({ ...ev(174, '2026-11-01'), closed: '2026-11-09T06:59:00Z' });
  fs.writeFileSync(t.deps.indexPath, JSON.stringify(idx));
  const r = await runOnce(t.deps, { phase: 'plan' });
  expect(t.state().events['174']).toMatchObject({ kind: 'new', assets: 'pending' });
  expect(r.work).toEqual([]);
  const f = await runOnce(t.deps, { phase: 'fetch' });
  expect(f.picked).toBeUndefined();
  expect(t.fetched).toEqual([]);
});
