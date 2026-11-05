import { afterEach, expect, test, vi } from 'vitest';
import worker from '../worker/index';

const env = { GH_DISPATCH_TOKEN: 'tok', REPO: 'cholateio/sekai-reader' };
afterEach(() => vi.unstubAllGlobals());

test('scheduled 對 pipeline.yml 發一次 workflow_dispatch（main 分支）', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status: 204 }); });
  await worker.scheduled({}, env);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://api.github.com/repos/cholateio/sekai-reader/actions/workflows/pipeline.yml/dispatches');
  expect(calls[0].init.method).toBe('POST');
  expect(JSON.parse(String(calls[0].init.body))).toEqual({ ref: 'main' });
  const h = calls[0].init.headers as Record<string, string>;
  expect(h.Authorization).toBe('Bearer tok');
  expect(h['User-Agent']).toMatch(/sekai-reader/);
  expect(h.Accept).toBe('application/vnd.github+json');
});

test('GitHub 回非 204 時拋錯（Cloudflare 會把這次 cron 記為失敗），錯誤訊息不含 token', async () => {
  vi.stubGlobal('fetch', async () => new Response('{"message":"Bad credentials"}', { status: 401 }));
  const err = await worker.scheduled({}, env).then(() => null, (e: Error) => e);
  expect(err?.message).toContain('401');
  expect(err?.message).toContain('Bad credentials');
  expect(err?.message).not.toContain('tok');
});

test('沒有 HTTP 入口：fetch 處理器一律 404', async () => {
  const r = await worker.fetch();
  expect(r.status).toBe(404);
});
