// Hourly trigger for the pipeline workflow. GitHub's own `schedule` event fired 2 of ~14 hourly slots on
// 2026-11-05, so a Cloudflare cron calls the workflow_dispatch API instead. No HTTP entry point.
export interface Env { GH_DISPATCH_TOKEN: string; REPO: string }

export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    const r = await fetch(`https://api.github.com/repos/${env.REPO}/actions/workflows/pipeline.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sekai-reader-cron (https://github.com/cholateio/sekai-reader)',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (r.status !== 204) throw new Error(`dispatch failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
  },
  async fetch(): Promise<Response> {
    return new Response('not found', { status: 404 });
  },
};
