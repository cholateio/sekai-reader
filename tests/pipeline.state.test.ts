import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import {
  addSpend, authorizeDirect, bannerLane, dayOf, dueEpisodes, loadState, pickEvent, recordBanner, recordFetch, recordScripts, rememberBatch, saveState, scriptsLane, seedState,
  spentToday, syncIndex, type IndexEvent, type IndexFile,
} from '../scripts/pipeline/state';

const ev = (id: number, date: string, n = 2): IndexEvent => ({
  id, name: `E${id}`, date, bundle: `b${id}`,
  eps: Array.from({ length: n }, (_, i) => [i + 1, `t${i + 1}`, `event_${id}_0${i + 1}`] as [number, string, string]),
});
const index = (...events: IndexEvent[]): IndexFile => ({ events, built: '2026-11-04' });
const NOW = new Date('2026-11-04T10:00:00Z');
const base = index(ev(173, '2026-10-01', 8), ev(172, '2026-09-20'), ev(171, '2026-09-10'));
const seeded = () => seedState(base, ['event_173_01'], NOW);

afterEach(() => vi.restoreAllMocks());

test('seedState 把目錄全部種成舊活動，既有分鏡的話標 done', () => {
  const s = seeded();
  expect(s.version).toBe(1);
  expect(Object.keys(s.events).sort()).toEqual(['171', '172', '173']);
  const e = s.events['173'];
  expect(e).toMatchObject({ kind: 'old', assets: 'pending', failures: 0 });
  expect(e.eps['event_173_01']).toEqual({ s: 'done', tries: 0 });
  expect(e.eps['event_173_02']).toEqual({ s: 'manual', tries: 0 });
  expect(s.pendingDeploy).toBe(false);
  expect(s.batches).toEqual([]);
});

test('syncIndex 只新增不存在的活動並標 new', () => {
  const s = seeded();
  const added = syncIndex(s, index(ev(174, '2026-10-20'), ...base.events), NOW);
  expect(added).toEqual([174]);
  expect(s.events['174']).toMatchObject({ kind: 'new', assets: 'pending', failures: 0 });
  expect(s.events['174'].eps['event_174_01'].s).toBe('manual');
  expect(s.events['173'].kind).toBe('old');
  expect(syncIndex(s, index(ev(174, '2026-10-20'), ...base.events), NOW)).toEqual([]);
});

test('pickEvent 順序：forced > new > jp-recheck > backfill', () => {
  const s = seeded();
  const idx = index(ev(175, '2026-10-25'), ev(174, '2026-10-20'), ...base.events);
  syncIndex(s, idx, NOW);
  s.events['171'].assets = 'jp';
  s.events['171'].jpCheckedAt = '2026-11-03T00:00:00Z';
  const o = { backfill: true, today: '2026-11-04' };
  expect(pickEvent(s, idx, { ...o, forced: 172 })).toEqual({ id: 172, reason: 'forced' });
  expect(pickEvent(s, idx, o)).toEqual({ id: 175, reason: 'new' });
  s.events['175'].assets = 'done';
  s.events['174'].assets = 'done';
  expect(pickEvent(s, idx, o)).toEqual({ id: 171, reason: 'jp-recheck' });
  s.events['171'].jpCheckedAt = '2026-11-04T01:00:00Z';
  expect(pickEvent(s, idx, o)).toEqual({ id: 173, reason: 'backfill' });
});

test('pickEvent forced 已 done 的期回 null', () => {
  const s = seeded();
  s.events['172'].assets = 'done';
  expect(pickEvent(s, base, { backfill: true, today: '2026-11-04', forced: 172 })).toBeNull();
});

test('pickEvent 在 backfill=false 時不挑舊活動', () => {
  expect(pickEvent(seeded(), base, { backfill: false, today: '2026-11-04' })).toBeNull();
});

test('pickEvent 跳過 failures>=3 與 assets=done', () => {
  const s = seeded();
  s.events['173'].assets = 'done';
  s.events['172'].failures = 3;
  expect(pickEvent(s, base, { backfill: true, today: '2026-11-04' })).toEqual({ id: 171, reason: 'backfill' });
  const idx = index(ev(174, '2026-10-20'), ...base.events);
  syncIndex(s, idx, NOW);
  s.events['174'].failures = 3;
  expect(pickEvent(s, idx, { backfill: false, today: '2026-11-04' })).toBeNull();
});

test('pickEvent 當天查過的 jp 活動不再挑', () => {
  const s = seeded();
  s.events['172'].assets = 'jp';
  s.events['172'].jpCheckedAt = '2026-11-04T00:30:00Z';
  expect(pickEvent(s, base, { backfill: false, today: '2026-11-04' })).toBeNull();
  expect(pickEvent(s, base, { backfill: false, today: '2026-11-05' })).toEqual({ id: 172, reason: 'jp-recheck' });
});

test('recordFetch done 清零 failures、新活動各話轉 none、舊活動維持 manual', () => {
  const s = seeded();
  const idx = index(ev(174, '2026-10-20'), ...base.events);
  syncIndex(s, idx, NOW);
  s.events['174'].failures = 2;
  recordFetch(s, 174, { status: 'done' }, NOW);
  expect(s.events['174']).toMatchObject({ assets: 'done', failures: 0, assetsAt: NOW.toISOString() });
  expect(Object.values(s.events['174'].eps).map(e => e.s)).toEqual(['none', 'none']);
  recordFetch(s, 173, { status: 'done' }, NOW);
  expect(s.events['173'].eps['event_173_02'].s).toBe('manual');
  expect(s.events['173'].eps['event_173_01'].s).toBe('done');
  expect(s.pendingDeploy).toBe(true);
});

test('recordFetch partial 不動 failures 但要求部署', () => {
  const s = seeded();
  s.events['173'].failures = 1;
  recordFetch(s, 173, { status: 'partial' }, NOW);
  expect(s.events['173']).toMatchObject({ assets: 'pending', failures: 1 });
  expect(s.pendingDeploy).toBe(true);
});

test('recordFetch partial 對已判 jp 的期改回 pending，下一小時續抓', () => {
  const s = seeded();
  s.events['173'].assets = 'jp';
  recordFetch(s, 173, { status: 'partial' }, NOW);
  expect(s.events['173'].assets).toBe('pending');
});

test('recordFetch jp 記錄查核時間', () => {
  const s = seeded();
  recordFetch(s, 172, { status: 'jp' }, NOW);
  expect(s.events['172']).toMatchObject({ assets: 'jp', jpCheckedAt: NOW.toISOString(), failures: 0 });
  expect(s.pendingDeploy).toBe(false);
});

test('recordFetch missing：assets missing、記查核時間、failures 歸零、要求部署', () => {
  const s = seeded();
  s.events['172'].failures = 2;
  recordFetch(s, 172, { status: 'missing' }, NOW);
  expect(s.events['172']).toMatchObject({ assets: 'missing', failures: 0, jpCheckedAt: NOW.toISOString() });
  expect(s.pendingDeploy).toBe(true);
});

test('pickEvent 把 missing 和 jp 一樣每天重查一次，失敗三次的期可用 forced 救回', () => {
  const s = seeded();
  recordFetch(s, 172, { status: 'missing' }, NOW);
  expect(pickEvent(s, base, { backfill: false, today: '2026-11-04' })).toBeNull();
  expect(pickEvent(s, base, { backfill: false, today: '2026-11-05' })).toEqual({ id: 172, reason: 'jp-recheck' });
  for (let i = 0; i < 3; i++) recordFetch(s, 171, { status: 'error', error: 'x' }, NOW);
  expect(s.events['171'].assets).toBe('error');
  expect(pickEvent(s, base, { backfill: true, today: '2026-11-05', forced: 171 })).toEqual({ id: 171, reason: 'forced' });
  recordFetch(s, 171, { status: 'jp' }, NOW);
  expect(s.events['171']).toMatchObject({ assets: 'jp', failures: 0 });
});

test('recordFetch error 三次後標 error', () => {
  const s = seeded();
  for (let i = 0; i < 2; i++) recordFetch(s, 172, { status: 'error', error: 'exit 1' }, NOW);
  expect(s.events['172']).toMatchObject({ assets: 'pending', failures: 2, lastError: 'exit 1' });
  recordFetch(s, 172, { status: 'error', error: 'build event_172_01' }, NOW);
  expect(s.events['172']).toMatchObject({ assets: 'error', failures: 3, lastError: 'build event_172_01' });
});

test('authorizeDirect newest 只碰 assets done 且仍有 manual 的舊活動', () => {
  const s = seeded();
  s.events['172'].assets = 'done';
  s.events['171'].assets = 'done';
  for (const e of Object.values(s.events['171'].eps)) e.s = 'done';
  expect(authorizeDirect(s, base, { newest: 2 })).toEqual([172]);
  expect(Object.values(s.events['172'].eps).map(e => e.s)).toEqual(['none', 'none']);
  expect(s.events['173'].eps['event_173_02'].s).toBe('manual');
});

test('authorizeDirect 指名的期即使素材未完成也先授權，等素材 done 才進 dueEpisodes', () => {
  const s = seeded();
  expect(authorizeDirect(s, base, { eventIds: [173] })).toEqual([173]);
  expect(s.events['173'].eps['event_173_01'].s).toBe('done');
  expect(s.events['173'].eps['event_173_02'].s).toBe('none');
  expect(dueEpisodes(s, base)).toEqual([]);
  recordFetch(s, 173, { status: 'done' }, NOW);
  expect(dueEpisodes(s, base).length).toBe(7);
  expect(authorizeDirect(s, base, { eventIds: [999] })).toEqual([]);
});

test('dueEpisodes 列出所有 none 的話，新期在前、話序不變，略過 assets 未 done 的期', () => {
  const s = seeded();
  for (const id of ['171', '172', '173']) {
    s.events[id].assets = 'done';
    for (const e of Object.values(s.events[id].eps)) if (e.s === 'manual') e.s = 'none';
  }
  s.events['172'].assets = 'pending';
  s.events['173'].eps['event_173_03'].s = 'batch';
  const due = dueEpisodes(s, base);
  expect(due[0]).toEqual({ eventId: 173, sid: 'event_173_02' });
  expect(due.filter(d => d.eventId === 173).map(d => d.sid)).toEqual(['event_173_02', 'event_173_04', 'event_173_05', 'event_173_06', 'event_173_07', 'event_173_08']);
  expect(due.slice(-2)).toEqual([{ eventId: 171, sid: 'event_171_01' }, { eventId: 171, sid: 'event_171_02' }]);
  expect(due.some(d => d.eventId === 172)).toBe(false);
});

test('addSpend/spentToday 以日為鍵累加，負校正不低於 0', () => {
  const s = seeded();
  addSpend(s, '2026-11-04', 0.168);
  addSpend(s, '2026-11-04', 0.168);
  expect(spentToday(s, '2026-11-04')).toBeCloseTo(0.336);
  expect(spentToday(s, '2026-11-05')).toBe(0);
  addSpend(s, '2026-11-04', -1);
  expect(spentToday(s, '2026-11-04')).toBe(0);
});

test('rememberBatch 清掉 35 天前的 id', () => {
  const s = seeded();
  rememberBatch(s, 'msgbatch_old', '2026-09-01');
  rememberBatch(s, 'msgbatch_a', '2026-10-15');
  rememberBatch(s, 'msgbatch_b', '2026-11-04');
  expect(Object.keys(s.knownBatches).sort()).toEqual(['msgbatch_a', 'msgbatch_b']);
});

test('dayOf 取 UTC 日期', () => expect(dayOf(new Date('2026-11-04T23:59:59Z'))).toBe('2026-11-04'));

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'state-'));

test('saveState/loadState 來回一致、檔尾有換行', () => {
  const p = path.join(tmp(), 'pipeline-state.json');
  expect(loadState(p)).toBeNull();
  const s = seeded();
  saveState(p, s);
  expect(fs.readFileSync(p, 'utf8').endsWith('}\n')).toBe(true);
  expect(loadState(p)).toEqual(s);
  expect(fs.existsSync(p + '.tmp')).toBe(false);
});

test('saveState 寫暫存檔時失敗 → 原檔內容不變且仍可解析', () => {
  const p = path.join(tmp(), 'pipeline-state.json');
  const s = seeded();
  saveState(p, s);
  const before = fs.readFileSync(p, 'utf8');
  vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('disk full'); });
  s.pendingDeploy = true;
  expect(() => saveState(p, s)).toThrow('disk full');
  vi.restoreAllMocks();
  expect(fs.readFileSync(p, 'utf8')).toBe(before);
  expect(loadState(p)!.pendingDeploy).toBe(false);
});

test('partial 的舊活動在 backfill 關閉時下一小時仍續抓（resume 排在 new 之後）', () => {
  const s = seeded();
  recordFetch(s, 172, { status: 'partial' }, NOW);
  expect(s.events['172'].partialAt).toBe(NOW.toISOString());
  expect(pickEvent(s, base, { backfill: false, today: '2026-11-04' })).toEqual({ id: 172, reason: 'resume' });
  const idx = index(ev(174, '2026-10-20'), ...base.events);
  syncIndex(s, idx, NOW);
  expect(pickEvent(s, idx, { backfill: false, today: '2026-11-04' })).toEqual({ id: 174, reason: 'new' });
  recordFetch(s, 172, { status: 'done' }, NOW);
  expect(s.events['172'].partialAt).toBeUndefined();
  s.events['174'].assets = 'done';
  expect(pickEvent(s, idx, { backfill: false, today: '2026-11-04' })).toBeNull();
});

test('resume 也跳過 failures>=3', () => {
  const s = seeded();
  recordFetch(s, 172, { status: 'partial' }, NOW);
  s.events['172'].failures = 3;
  expect(pickEvent(s, base, { backfill: false, today: '2026-11-04' })).toBeNull();
});

test('authorizeDirect 指名的期把 fallback 的話重新排隊並歸零 tries；newest 不碰 fallback', () => {
  const s = seeded();
  s.events['173'].assets = 'done';
  s.events['173'].eps['event_173_02'] = { s: 'fallback', tries: 2 };
  s.events['173'].eps['event_173_03'] = { s: 'done', tries: 1 };
  expect(authorizeDirect(s, base, { eventIds: [173] })).toEqual([173]);
  expect(s.events['173'].eps['event_173_02']).toEqual({ s: 'none', tries: 0 });
  expect(s.events['173'].eps['event_173_03']).toEqual({ s: 'done', tries: 1 });
  s.events['172'].assets = 'done';
  s.events['172'].eps['event_172_01'] = { s: 'fallback', tries: 2 };
  s.events['172'].eps['event_172_02'] = { s: 'done', tries: 1 };
  expect(authorizeDirect(s, base, { newest: 5 })).toEqual([]);
  expect(s.events['172'].eps['event_172_01'].s).toBe('fallback');
});

test('scriptsLane：舊活動、素材 pending、劇本未齊、失敗 <3，新到舊；jp/missing/done 與已有劇本的期不列', () => {
  const s = seeded();
  expect(scriptsLane(s, base)).toEqual([173, 172, 171]);
  s.events['173'].assets = 'done';
  s.events['172'].scriptsAt = NOW.toISOString();
  s.events['171'].failures = 3;
  expect(scriptsLane(s, base)).toEqual([]);
  s.events['171'].failures = 0;
  s.events['171'].assets = 'jp';
  expect(scriptsLane(s, base)).toEqual([]);
});

test('recordScripts done 標 scriptsAt；partial 不變；jp / missing 走 recordFetch', () => {
  const s = seeded();
  recordScripts(s, 172, 'done', NOW);
  expect(s.events['172'].scriptsAt).toBe(NOW.toISOString());
  expect(s.events['172'].assets).toBe('pending');
  recordScripts(s, 171, 'partial', NOW);
  expect(s.events['171'].scriptsAt).toBeUndefined();
  recordScripts(s, 171, 'jp', NOW);
  expect(s.events['171'].assets).toBe('jp');
  recordScripts(s, 173, 'missing', NOW);
  expect(s.events['173'].assets).toBe('missing');
});

test('dueEpisodes 把只有劇本的期也算進來；authorizeDirect newest 也包含它們', () => {
  const s = seeded();
  recordScripts(s, 172, 'done', NOW);
  expect(dueEpisodes(s, base)).toEqual([]);
  expect(authorizeDirect(s, base, { newest: 5 })).toEqual([172]);
  expect(dueEpisodes(s, base).map(d => d.sid)).toEqual(['event_172_01', 'event_172_02']);
});

test('橫幅通道：只取已抓完圖、還沒有橫幅紀錄的活動，新到舊，最多 4 期', () => {
  const idx = index(...[180, 179, 178, 177, 176, 175].map((id, i) => ev(id, `2026-09-${20 - i}`)));
  const s = seedState(idx, [], NOW);
  for (const id of [180, 179, 178, 177, 176, 175]) s.events[String(id)].assets = 'done';
  s.events['179'].assets = 'pending';
  s.events['178'].banner = 'missing';
  expect(bannerLane(s, idx)).toEqual([180, 177, 176, 175]);
  s.events['180'].banner = 'done';
  expect(bannerLane(s, idx)).toEqual([177, 176, 175]);
});

test('recordBanner：done 觸發部署，404 記 missing，其他錯誤不記狀態', () => {
  const s = seeded();
  s.pendingDeploy = false;
  recordBanner(s, 172, 'error');
  expect(s.events['172'].banner).toBeUndefined();
  expect(s.pendingDeploy).toBe(false);
  recordBanner(s, 172, 'missing');
  expect(s.events['172'].banner).toBe('missing');
  expect(s.pendingDeploy).toBe(false);
  recordBanner(s, 173, 'done');
  expect(s.events['173'].banner).toBe('done');
  expect(s.pendingDeploy).toBe(true);
  expect(() => recordBanner(s, 999, 'done')).toThrow();
});
