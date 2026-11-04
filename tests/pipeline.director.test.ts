import { expect, test } from 'vitest';
import {
  BATCH_USD_PER_MTOK, MAX_TOKENS, MODEL, actualUsd, buildRequest, collectBatches, normalizePanels, parseBoardText, reconcile, reserveUsd, submitDue,
  wrapBoard, type DirectorDeps,
} from '../scripts/pipeline/director';
import { seedState, recordFetch, authorizeDirect, type IndexEvent, type IndexFile, type PipelineState } from '../scripts/pipeline/state';
import { validateStoryboard } from '../src/storyboard/validate';
import { syntheticBoard, syntheticEpisode } from './helpers';

const ev = (id: number, date: string, n: number): IndexEvent => ({
  id, name: `E${id}`, date, bundle: `b${id}`,
  eps: Array.from({ length: n }, (_, i) => [i + 1, `t${i + 1}`, `event_${id}_0${i + 1}`] as [number, string, string]),
});
const INDEX: IndexFile = { events: [ev(174, '2026-10-20', 2), ev(173, '2026-10-01', 3)], built: '2026-11-04' };
const DAY1 = new Date('2026-11-04T10:00:00Z');
const DAY2 = new Date('2026-11-05T10:00:00Z');
const RESERVE = 4000 * 2e-6 + 16000 * 10e-6;

type Result = { custom_id: string; result: Record<string, unknown> };
const ok = (sid: string, panels: unknown = syntheticBoard().panels, usage = { input_tokens: 4000, output_tokens: 3000 }): Result => ({
  custom_id: sid,
  result: { type: 'succeeded', message: { stop_reason: 'end_turn', usage, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ panels }) }] } },
});
const failure = (sid: string, kind: string): Result => {
  if (kind === 'errored') return { custom_id: sid, result: { type: 'errored', error: { type: 'error', error: { type: 'api_error', message: 'x' } } } };
  if (kind === 'expired') return { custom_id: sid, result: { type: 'expired' } };
  const msg = (stop: string, text: string) => ({ custom_id: sid, result: { type: 'succeeded', message: { stop_reason: stop, usage: { input_tokens: 4000, output_tokens: 100 }, content: [{ type: 'text', text }] } } });
  if (kind === 'refusal') return msg('refusal', '');
  if (kind === 'max_tokens') return msg('max_tokens', '{"panels":[');
  if (kind === 'bad-json') return msg('end_turn', 'not json');
  return msg('end_turn', JSON.stringify({ panels: [{ t: 'talk', l: [0], bg: '教室' }] }));
};

function fakeClient(clock: { now: Date }) {
  const store = new Map<string, { id: string; created_at: string; processing_status: string; requests: { custom_id: string }[]; results?: Result[] }>();
  let n = 0;
  const created: { custom_id: string; params: Record<string, unknown> }[][] = [];
  const failNext = { results: 0 };
  const client = {
    messages: {
      countTokens: async () => ({ input_tokens: 4000 }),
      batches: {
        create: async ({ requests }: { requests: { custom_id: string; params: Record<string, unknown> }[] }) => {
          created.push(requests);
          const b = { id: `msgbatch_${++n}`, created_at: clock.now.toISOString(), processing_status: 'in_progress', requests };
          store.set(b.id, b);
          return { ...b };
        },
        retrieve: async (id: string) => ({ ...store.get(id)! }),
        list: (_p?: unknown) => ({
          async *[Symbol.asyncIterator]() { for (const b of [...store.values()].reverse()) yield { ...b }; },
        }),
        results: async (id: string) => {
          const b = store.get(id)!;
          return {
            async *[Symbol.asyncIterator]() {
              let i = 0;
              for (const r of b.results!) {
                if (failNext.results && ++i === failNext.results) { failNext.results = 0; throw new Error('stream broke'); }
                yield r;
              }
            },
          };
        },
      },
    },
  };
  const finish = (id: string, results: Result[]) => Object.assign(store.get(id)!, { processing_status: 'ended', results });
  const addForeign = (id: string, createdAt: string) => store.set(id, { id, created_at: createdAt, processing_status: 'in_progress', requests: [] });
  return { client, created, finish, addForeign, failNext, store };
}

function setup(o: { cap?: number } = {}) {
  const clock = { now: DAY1 };
  const fake = fakeClient(clock);
  const state: { s: PipelineState } = { s: seedState(INDEX, [], DAY1) };
  state.s.events['174'].kind = 'new';
  recordFetch(state.s, 174, { status: 'done' }, DAY1);
  const boards = new Map<string, unknown>();
  const snaps: PipelineState[] = [];
  const fails = { writeAt: 0, persist: false };
  let writes = 0;
  const deps: DirectorDeps = {
    client: fake.client as unknown as DirectorDeps['client'],
    compact: async sid => `BG:bg_a\n0|一歌|||${sid}`,
    readEpisode: () => syntheticEpisode(),
    writeBoard: (sid, b) => { writes++; if (fails.writeAt && writes === fails.writeAt) throw new Error('disk'); boards.set(sid, b); },
    persist: () => { if (fails.persist) throw new Error('persist'); snaps.push(structuredClone(state.s)); },
    prompt: 'PROMPT',
    now: () => clock.now,
    log: () => {},
  };
  return { clock, fake, state, boards, snaps, fails, deps, cap: o.cap ?? 20 };
}
const eps = (s: PipelineState, id: number) => Object.fromEntries(Object.entries(s.events[String(id)].eps).map(([k, v]) => [k, v.s]));

test('buildRequest 固定模型、max_tokens 16000、effort medium，不帶結構化輸出文法', () => {
  // Measured 2026-11-05 on event_173_01: with output_config.format the model closed the array after one
  // panel (147 s); without it the full board came back in 35 s inside a ```json fence.
  const r = buildRequest('event_173_02', 'BG:x', 'SYS');
  expect(r.custom_id).toBe('event_173_02');
  expect(r.params).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16000, system: 'SYS', messages: [{ role: 'user', content: 'BG:x' }] });
  expect(r.params.output_config).toEqual({ effort: 'medium' });
  expect(MODEL).toBe('claude-opus-5-5');
  expect(MAX_TOKENS).toBe(16000);
});

test('parseBoardText 剝掉 Markdown 圍欄與前後文字，取出 panels', () => {
  const panels = [{ t: 'talk', l: [0] }];
  const json = JSON.stringify({ panels });
  expect(parseBoardText(json)).toEqual(panels);
  expect(parseBoardText('```json\n' + json + '\n```')).toEqual(panels);
  expect(parseBoardText('以下是分鏡：\n```\n' + json + '\n```\n完成。')).toEqual(panels);
  expect(() => parseBoardText('not json')).toThrow();
  expect(() => parseBoardText('{"nope":1}')).toThrow();
});

test('collectBatches 接受包在 ```json 圍欄裡的輸出', async () => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  const fenced = (sid: string): Result => ({ custom_id: sid, result: { type: 'succeeded', message: { stop_reason: 'end_turn', usage: { input_tokens: 4000, output_tokens: 3000 }, content: [{ type: 'text', text: '```json\n' + JSON.stringify({ panels: syntheticBoard().panels }) + '\n```' }] } } });
  t.fake.finish('msgbatch_1', [fenced('event_174_01'), fenced('event_174_02')]);
  const c = await collectBatches(t.deps, t.state.s);
  expect(c.done.length).toBe(2);
});

test('reserveUsd 用最壞輸出、actualUsd 用實際用量', () => {
  expect(BATCH_USD_PER_MTOK).toEqual({ input: 2, output: 10 });
  expect(reserveUsd(4000)).toBeCloseTo(RESERVE);
  expect(actualUsd({ input_tokens: 4000, output_tokens: 3000 })).toBeCloseTo(4000 * 2e-6 + 3000 * 10e-6);
});

test('submitDue 在 create 之後立刻 persist 了 id', async () => {
  const t = setup();
  const r = await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  expect(r.submitted).toEqual(['event_174_01', 'event_174_02']);
  expect(r.batchIds).toEqual(['msgbatch_1']);
  const snap = t.snaps.at(-1)!;
  expect(snap.batches).toEqual([{ id: 'msgbatch_1', day: '2026-11-04', eventId: 174, sids: ['event_174_01', 'event_174_02'], estUsd: expect.closeTo(2 * RESERVE) }]);
  expect(snap.knownBatches['msgbatch_1']).toBe('2026-11-04');
  expect(snap.events['174'].eps['event_174_01']).toEqual({ s: 'batch', tries: 1 });
  expect(snap.spend['2026-11-04']).toBeCloseTo(2 * RESERVE);
  expect(t.fake.created[0].map(x => x.custom_id)).toEqual(['event_174_01', 'event_174_02']);
});

test('submitDue 每期一個 batch', async () => {
  const t = setup();
  authorizeDirect(t.state.s, INDEX, { eventIds: [173] });
  recordFetch(t.state.s, 173, { status: 'done' }, DAY1);
  const r = await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  expect(r.batchIds).toEqual(['msgbatch_1', 'msgbatch_2']);
  expect(t.state.s.batches.map(b => b.eventId)).toEqual([174, 173]);
});

test('submitDue 超過每日上限時停止，剩餘的話仍是 none 且 skipped', async () => {
  const t = setup({ cap: 0.3 });
  const r = await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  expect(r.submitted).toEqual(['event_174_01']);
  expect(r.skipped).toEqual(['event_174_02']);
  expect(eps(t.state.s, 174)).toEqual({ event_174_01: 'batch', event_174_02: 'none' });
  expect(t.state.s.events['174'].eps['event_174_02'].tries).toBe(0);
});

test('submitDue 隔天再跑會把昨天 skipped 的話送出', async () => {
  const t = setup({ cap: 0.3 });
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  expect((await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap })).submitted).toEqual([]);
  t.clock.now = DAY2;
  const r = await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  expect(r.submitted).toEqual(['event_174_02']);
  expect(t.state.s.batches.at(-1)!.day).toBe('2026-11-05');
});

test('submitDue 在有未結束的認領 batch 時不送任何東西', async () => {
  const t = setup();
  t.state.s.batches.push({ id: 'msgbatch_x', day: '2026-11-04', sids: [], estUsd: 0, adopted: true });
  const r = await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  expect(r.submitted).toEqual([]);
  expect(r.skipped).toEqual(['event_174_01', 'event_174_02']);
  expect(t.fake.created).toEqual([]);
});

test('reconcile 認領狀態檔沒有的 batch，略過 knownBatches 裡的與 35 天前的', async () => {
  const t = setup();
  t.fake.addForeign('msgbatch_old', '2026-09-01T00:00:00Z');
  t.fake.addForeign('msgbatch_known', '2026-11-01T00:00:00Z');
  t.fake.addForeign('msgbatch_lost', '2026-11-03T00:00:00Z');
  t.state.s.knownBatches['msgbatch_known'] = '2026-11-01';
  const r = await reconcile(t.deps, t.state.s);
  expect(r.adopted).toEqual(['msgbatch_lost']);
  expect(t.state.s.batches).toEqual([{ id: 'msgbatch_lost', day: '2026-11-03', sids: [], estUsd: 0, adopted: true }]);
  expect(t.state.s.knownBatches['msgbatch_lost']).toBe('2026-11-03');
  expect(t.snaps.length).toBe(1);
  expect((await reconcile(t.deps, t.state.s)).adopted).toEqual([]);
});

test('runner 消失模擬：create 後丟棄狀態 → 下次 reconcile 認領 → 結束後由 custom_id 回填、不重送', async () => {
  const t = setup();
  const before = structuredClone(t.state.s);
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.state.s = before;
  expect((await reconcile(t.deps, t.state.s)).adopted).toEqual(['msgbatch_1']);
  expect((await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap })).submitted).toEqual([]);
  t.fake.finish('msgbatch_1', [ok('event_174_01'), failure('event_174_02', 'bad-json')]);
  const c = await collectBatches(t.deps, t.state.s);
  expect(c.done).toEqual(['event_174_01']);
  expect(c.retry).toEqual(['event_174_02']);
  expect(t.state.s.events['174'].eps['event_174_01']).toEqual({ s: 'done', tries: 1 });
  expect(t.state.s.events['174'].eps['event_174_02']).toEqual({ s: 'none', tries: 1 });
  expect(t.state.s.batches).toEqual([]);
  expect(t.state.s.spend['2026-11-04']).toBeCloseTo(actualUsd({ input_tokens: 4000, output_tokens: 3000 }) + actualUsd({ input_tokens: 4000, output_tokens: 100 }));
  const again = await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  expect(again.submitted).toEqual(['event_174_02']);
  expect(t.fake.created.length).toBe(2);
});

test('collectBatches 未結束的 batch 留在 pending', async () => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  const c = await collectBatches(t.deps, t.state.s);
  expect(c.pending).toEqual(['event_174_01', 'event_174_02']);
  expect(t.state.s.batches.length).toBe(1);
});

test('collectBatches 成功結果通過驗證就寫檔並標 done', async () => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.state.s.pendingDeploy = false;
  t.fake.finish('msgbatch_1', [ok('event_174_02'), ok('event_174_01')]);
  const c = await collectBatches(t.deps, t.state.s);
  expect(c.done.sort()).toEqual(['event_174_01', 'event_174_02']);
  expect(eps(t.state.s, 174)).toEqual({ event_174_01: 'done', event_174_02: 'done' });
  expect(t.state.s.pendingDeploy).toBe(true);
  const b = t.boards.get('event_174_01') as { meta: Record<string, unknown> };
  expect(b.meta).toEqual({ director: 'ai', promptVersion: 'v3-manga', model: 'claude-opus-5-5', generatedAt: '2026-11-04' });
  expect(t.state.s.knownBatches['msgbatch_1']).toBe('2026-11-04');
});

test.each(['errored', 'expired', 'refusal', 'max_tokens', 'bad-json', 'invalid-board'])('collectBatches %s → 第一次退回 none', async kind => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.fake.finish('msgbatch_1', [ok('event_174_01'), failure('event_174_02', kind)]);
  const c = await collectBatches(t.deps, t.state.s);
  expect(c.retry).toEqual(['event_174_02']);
  expect(t.state.s.events['174'].eps['event_174_02']).toEqual({ s: 'none', tries: 1 });
  expect(t.boards.has('event_174_02')).toBe(false);
});

test('collectBatches 第二次失敗 → fallback', async () => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.fake.finish('msgbatch_1', [ok('event_174_01'), failure('event_174_02', 'errored')]);
  await collectBatches(t.deps, t.state.s);
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.fake.finish('msgbatch_2', [failure('event_174_02', 'refusal')]);
  const c = await collectBatches(t.deps, t.state.s);
  expect(c.fallback).toEqual(['event_174_02']);
  expect(t.state.s.events['174'].eps['event_174_02']).toEqual({ s: 'fallback', tries: 2 });
  expect((await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap })).submitted).toEqual([]);
});

test('collectBatches 的校正記回送出那天：昨天預留、今天收取，今天額度不變', async () => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.clock.now = DAY2;
  t.fake.finish('msgbatch_1', [ok('event_174_01'), ok('event_174_02')]);
  await collectBatches(t.deps, t.state.s);
  expect(t.state.s.spend['2026-11-04']).toBeCloseTo(2 * actualUsd({ input_tokens: 4000, output_tokens: 3000 }));
  expect(t.state.s.spend['2026-11-05'] ?? 0).toBe(0);
});

test('collectBatches 判定階段第二話拋錯 → 狀態、花費、分鏡檔全部未變，batch 仍在；重跑後每話與費用只套用一次', async () => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.fake.finish('msgbatch_1', [ok('event_174_01'), ok('event_174_02')]);
  const before = structuredClone(t.state.s);
  t.fake.failNext.results = 2;
  await expect(collectBatches(t.deps, t.state.s)).rejects.toThrow('stream broke');
  expect(t.state.s).toEqual(before);
  expect(t.boards.size).toBe(0);
  const c = await collectBatches(t.deps, t.state.s);
  expect(c.done.length).toBe(2);
  expect(t.state.s.spend['2026-11-04']).toBeCloseTo(2 * actualUsd({ input_tokens: 4000, output_tokens: 3000 }));
});

test('collectBatches 第 2 個 writeBoard 拋錯 → 狀態與花費未變，batch 仍在；重跑後兩個檔案都在、費用只記一次', async () => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.fake.finish('msgbatch_1', [ok('event_174_01'), ok('event_174_02')]);
  const before = structuredClone(t.state.s);
  t.fails.writeAt = 2;
  await expect(collectBatches(t.deps, t.state.s)).rejects.toThrow('disk');
  expect(t.state.s).toEqual(before);
  t.fails.writeAt = 0;
  await collectBatches(t.deps, t.state.s);
  expect([...t.boards.keys()].sort()).toEqual(['event_174_01', 'event_174_02']);
  expect(t.state.s.batches).toEqual([]);
  expect(t.state.s.spend['2026-11-04']).toBeCloseTo(2 * actualUsd({ input_tokens: 4000, output_tokens: 3000 }));
});

test('collectBatches persist 拋錯 → 丟出；再呼叫 persist 成功後磁碟狀態與記憶體一致，batch 已移除、費用只記一次', async () => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.fake.finish('msgbatch_1', [ok('event_174_01'), ok('event_174_02')]);
  t.fails.persist = true;
  await expect(collectBatches(t.deps, t.state.s)).rejects.toThrow('persist');
  t.fails.persist = false;
  t.deps.persist();
  const disk = t.snaps.at(-1)!;
  expect(disk).toEqual(t.state.s);
  expect(disk.batches).toEqual([]);
  expect(disk.spend['2026-11-04']).toBeCloseTo(2 * actualUsd({ input_tokens: 4000, output_tokens: 3000 }));
  const c = await collectBatches(t.deps, t.state.s);
  expect(c).toEqual({ done: [], retry: [], fallback: [], pending: [] });
});

test('writeBoard 內容通過 validateStoryboard 的 CJK 規則', async () => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.fake.finish('msgbatch_1', [ok('event_174_01'), ok('event_174_02')]);
  await collectBatches(t.deps, t.state.s);
  for (const b of t.boards.values()) expect(validateStoryboard(b, syntheticEpisode()).ok).toBe(true);
  expect(validateStoryboard(wrapBoard([{ t: 'talk', l: [0], bg: '教室' }], DAY1), syntheticEpisode()).ok).toBe(false);
});

test('countTokens 收到與送出請求相同的 output_config（結構化輸出 schema 也算進預留）', async () => {
  const t = setup();
  const seen: Record<string, unknown>[] = [];
  const orig = t.fake.client.messages.countTokens;
  t.fake.client.messages.countTokens = (async (p: Record<string, unknown>) => { seen.push(p); return orig(); }) as typeof orig;
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  const sent = t.fake.created[0][0].params;
  expect(seen[0]).toEqual({ model: sent.model, system: sent.system, messages: sent.messages, output_config: sent.output_config });
});

test('normalizePanels 丟掉空的選填陣列與未定義欄位，保留有內容的', () => {
  expect(normalizePanels([{ t: 'talk', l: [0], shape: [], cast: [], caps: [], cut: [], bg: undefined }]))
    .toEqual([{ t: 'talk', l: [0] }]);
  expect(normalizePanels([{ t: 'talk', l: [0], shape: ['round'] }])).toEqual([{ t: 'talk', l: [0], shape: ['round'] }]);
  expect(normalizePanels('nope')).toBe('nope');
});

test('normalizePanels 把不在 l 裡的 cut 丟掉（裝飾記號不值得整話重送）', () => {
  expect(normalizePanels([{ t: 'talk', l: [3, 4], cut: [4, 9] }])).toEqual([{ t: 'talk', l: [3, 4], cut: [4] }]);
  expect(normalizePanels([{ t: 'talk', l: [3], cut: [9] }])).toEqual([{ t: 'talk', l: [3] }]);
  expect(normalizePanels([{ t: 'trans', cut: [1] }])).toEqual([{ t: 'trans' }]);
});

test('collectBatches 對 shape: [] 的輸出照常通過並寫檔', async () => {
  const t = setup();
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  const panels = syntheticBoard().panels.map(p => ({ ...p, shape: [], cast: [] }));
  t.fake.finish('msgbatch_1', [ok('event_174_01', panels), ok('event_174_02', panels)]);
  const c = await collectBatches(t.deps, t.state.s);
  expect(c.done.length).toBe(2);
  const b = t.boards.get('event_174_01') as { panels: Record<string, unknown>[] };
  expect(b.panels.every(p => !('shape' in p) && !('cast' in p))).toBe(true);
});

test('collectBatches 拒絕的分鏡整份印進 log（只含結構，便於診斷）', async () => {
  const t = setup();
  const lines: string[] = [];
  t.deps.log = l => lines.push(l);
  await submitDue(t.deps, t.state.s, INDEX, { dailyCapUsd: t.cap });
  t.fake.finish('msgbatch_1', [ok('event_174_01'), failure('event_174_02', 'invalid-board')]);
  await collectBatches(t.deps, t.state.s);
  const rejected = lines.find(l => l.startsWith('rejected event_174_02: '));
  expect(rejected).toBeDefined();
  expect(JSON.parse(rejected!.slice('rejected event_174_02: '.length))).toEqual({ panels: [{ t: 'talk', l: [0], bg: '教室' }] });
});
