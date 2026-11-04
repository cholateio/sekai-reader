import type Anthropic from '@anthropic-ai/sdk';
import type { Episode } from '../../src/scenario/types';
import { validateStoryboard } from '../../src/storyboard/validate';
import {
  addSpend, dayOf, dueEpisodes, rememberBatch, spentToday, KEEP_BATCH_DAYS,
  type BatchState, type EpState, type IndexFile, type PipelineState,
} from './state';

export const MODEL = 'claude-opus-5-5';
export const PROMPT_VERSION = 'v3-manga';
export const MAX_TOKENS = 16000;
export const BATCH_USD_PER_MTOK = { input: 2, output: 10 };
export const MAX_TRIES = 2;

export interface DirectorDeps {
  client: { messages: Pick<Anthropic['messages'], 'countTokens' | 'batches'> };
  compact(sid: string): Promise<string>;
  readEpisode(sid: string): Episode;
  writeBoard(sid: string, board: unknown): void;
  /** Writes the state file now; the checkpoint for batch ids (reconcile covers a runner lost before it). */
  persist(): void;
  prompt: string;
  now(): Date;
  log(line: string): void;
}

type BatchRequest = Anthropic.Messages.BatchCreateParams['requests'][number];

/**
 * No output_config.format: measured 2026-11-05, the grammar made Opus close the panels array after one
 * panel (and took 4x longer); plain JSON in a fence came back complete. validateStoryboard is the gate.
 */
export function buildRequest(sid: string, compactText: string, prompt: string): BatchRequest {
  return {
    custom_id: sid,
    params: {
      model: MODEL, max_tokens: MAX_TOKENS, system: prompt,
      messages: [{ role: 'user', content: compactText }],
      output_config: { effort: 'medium' },
    },
  };
}

/** Takes the JSON object out of the model's text, tolerating ```json fences and prose around it. */
export function parseBoardText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let body = fenced ? fenced[1] : text;
  const a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object');
  body = body.slice(a, b + 1);
  const parsed = JSON.parse(body) as { panels?: unknown };
  if (!parsed || typeof parsed !== 'object' || !('panels' in parsed)) throw new Error('no panels');
  return parsed.panels;
}

export const reserveUsd = (inputTokens: number) =>
  (inputTokens * BATCH_USD_PER_MTOK.input + MAX_TOKENS * BATCH_USD_PER_MTOK.output) / 1e6;
export const actualUsd = (u: { input_tokens: number; output_tokens: number }) =>
  (u.input_tokens * BATCH_USD_PER_MTOK.input + u.output_tokens * BATCH_USD_PER_MTOK.output) / 1e6;

const OPTIONAL_LISTS = ['shape', 'cast', 'caps', 'cut'];
const INT_LISTS = ['l', 'caps', 'cut'];
/** Structured output tends to fill optional fields with [] or undefined; an empty override list means none. */
export function normalizePanels(panels: unknown): unknown {
  if (!Array.isArray(panels)) return panels;
  return panels.map(p => {
    if (typeof p !== 'object' || p === null || Array.isArray(p)) return p;
    const out: Record<string, unknown> = {};
    const rec = { ...(p as Record<string, unknown>) };
    // Seen in practice: `cut: 63` for a single line; the same slip is plausible for l and caps.
    for (const k of INT_LISTS) if (Number.isInteger(rec[k])) rec[k] = [rec[k]];
    const lines = Array.isArray(rec.l) ? rec.l : [];
    for (const [k, v] of Object.entries(rec)) {
      let val = v;
      if (k === 'cut' && Array.isArray(val)) val = val.filter(r => lines.includes(r));
      if (val === undefined || val === null) continue;
      if (OPTIONAL_LISTS.includes(k) && Array.isArray(val) && val.length === 0) continue;
      out[k] = val;
    }
    return out;
  });
}

export function wrapBoard(panels: unknown, now: Date): unknown {
  return { meta: { director: 'ai', promptVersion: PROMPT_VERSION, model: MODEL, generatedAt: dayOf(now) }, panels };
}

function findEp(s: PipelineState, sid: string): EpState | undefined {
  for (const e of Object.values(s.events)) if (e.eps[sid]) return e.eps[sid];
  return undefined;
}

/** The Anthropic account is the source of truth: any recent batch the state file does not know is adopted. */
export async function reconcile(d: DirectorDeps, s: PipelineState): Promise<{ adopted: string[] }> {
  const cutoff = d.now().getTime() - KEEP_BATCH_DAYS * 86400e3;
  const tracked = new Set(s.batches.map(b => b.id));
  const adopted: string[] = [];
  for await (const b of d.client.messages.batches.list({ limit: 100 })) {
    const created = Date.parse(b.created_at);
    if (created < cutoff) break;
    if (tracked.has(b.id) || s.knownBatches[b.id]) continue;
    const day = dayOf(new Date(created));
    s.batches.push({ id: b.id, day, sids: [], estUsd: 0, adopted: true });
    rememberBatch(s, b.id, day);
    adopted.push(b.id);
    d.log(`adopted batch ${b.id} (${day})`);
  }
  if (adopted.length) d.persist();
  return { adopted };
}

export async function submitDue(
  d: DirectorDeps, s: PipelineState, index: IndexFile, o: { dailyCapUsd: number },
): Promise<{ submitted: string[]; skipped: string[]; batchIds: string[] }> {
  const due = dueEpisodes(s, index);
  const out = { submitted: [] as string[], skipped: [] as string[], batchIds: [] as string[] };
  if (s.batches.some(b => b.adopted && b.sids.length === 0)) {
    d.log('an adopted batch has not ended yet; not submitting');
    out.skipped = due.map(x => x.sid);
    return out;
  }
  const today = dayOf(d.now());
  const byEvent = new Map<number, string[]>();
  for (const x of due) byEvent.set(x.eventId, [...(byEvent.get(x.eventId) ?? []), x.sid]);
  let reserved = 0;
  let capped = false;
  for (const [eventId, sids] of byEvent) {
    const requests: BatchRequest[] = [];
    let est = 0;
    for (const sid of sids) {
      if (capped) { out.skipped.push(sid); continue; }
      const req = buildRequest(sid, await d.compact(sid), d.prompt);
      const { model, system, messages, output_config } = req.params;
      const { input_tokens } = await d.client.messages.countTokens({ model, system, messages, output_config: output_config ?? undefined });
      const r = reserveUsd(input_tokens);
      if (spentToday(s, today) + reserved + r > o.dailyCapUsd) {
        capped = true;
        out.skipped.push(sid);
        continue;
      }
      reserved += r;
      est += r;
      requests.push(req);
    }
    if (!requests.length) continue;
    const batch = await d.client.messages.batches.create({ requests });
    const sent = requests.map(r => r.custom_id);
    s.batches.push({ id: batch.id, day: today, eventId, sids: sent, estUsd: est });
    rememberBatch(s, batch.id, today);
    for (const sid of sent) { const ep = findEp(s, sid)!; ep.s = 'batch'; ep.tries += 1; }
    addSpend(s, today, est);
    d.persist();
    d.log(`submitted ${batch.id}: event ${eventId}, ${sent.length} episodes, reserved US$${est.toFixed(3)}`);
    out.submitted.push(...sent);
    out.batchIds.push(batch.id);
  }
  if (capped) d.log(`daily cap US$${o.dailyCapUsd} reached; ${out.skipped.length} episodes wait`);
  return out;
}

type Verdict = { sid: string; verdict: 'done' | 'retry' | 'fallback'; tries: number; board?: unknown };

function judge(s: PipelineState, b: BatchState, r: Anthropic.Messages.MessageBatchIndividualResponse, d: DirectorDeps): Verdict | null {
  const sid = r.custom_id;
  const ep = findEp(s, sid);
  if (!ep) return null;
  // An adopted batch was created by a run whose state never reached disk, so its try was not counted yet.
  const tries = ep.tries + (b.adopted && ep.s === 'none' ? 1 : 0);
  const failed = (why: string): Verdict => {
    d.log(`${sid}: ${why}`);
    return { sid, verdict: tries < MAX_TRIES ? 'retry' : 'fallback', tries };
  };
  if (r.result.type !== 'succeeded') return failed(r.result.type);
  const m = r.result.message;
  if (m.stop_reason !== 'end_turn') return failed(`stop_reason ${m.stop_reason}`);
  const text = m.content.find(c => c.type === 'text');
  if (!text || text.type !== 'text') return failed('no text block');
  let raw: unknown;
  try { raw = parseBoardText(text.text); } catch { return failed('bad json'); }
  const panels = normalizePanels(raw);
  const board = wrapBoard(panels, d.now());
  const v = validateStoryboard(board, d.readEpisode(sid));
  if (!v.ok) {
    d.log(`rejected ${sid}: ${JSON.stringify({ panels })}`);
    return failed(`invalid board: ${v.errors.slice(0, 5).join('; ')}`);
  }
  return { sid, verdict: 'done', tries, board };
}

/**
 * Settles each ended batch in three replayable stages: judge (pure), write boards (idempotent),
 * apply to state (memory only) then persist once. A throw before persist leaves the batch in place
 * so the next run replays it from the start; nothing is half-applied on disk.
 */
export async function collectBatches(
  d: DirectorDeps, s: PipelineState,
): Promise<{ done: string[]; retry: string[]; fallback: string[]; pending: string[] }> {
  const out = { done: [] as string[], retry: [] as string[], fallback: [] as string[], pending: [] as string[] };
  for (const b of [...s.batches]) {
    const info = await d.client.messages.batches.retrieve(b.id);
    if (info.processing_status !== 'ended') {
      out.pending.push(...(b.sids.length ? b.sids : [b.id]));
      continue;
    }
    const verdicts: Verdict[] = [];
    let usageUsd = 0;
    for await (const r of await d.client.messages.batches.results(b.id)) {
      if (r.result.type === 'succeeded') usageUsd += actualUsd(r.result.message.usage);
      const v = judge(s, b, r, d);
      if (v) verdicts.push(v);
    }
    for (const v of verdicts) if (v.verdict === 'done') d.writeBoard(v.sid, v.board);
    for (const v of verdicts) {
      const ep = findEp(s, v.sid)!;
      ep.tries = v.tries;
      ep.s = v.verdict === 'done' ? 'done' : v.verdict === 'retry' ? 'none' : 'fallback';
      out[v.verdict].push(v.sid);
    }
    addSpend(s, b.day, usageUsd - b.estUsd);
    if (verdicts.some(v => v.verdict === 'done')) s.pendingDeploy = true;
    s.batches = s.batches.filter(x => x.id !== b.id);
    rememberBatch(s, b.id, b.day);
    d.persist();
    d.log(`collected ${b.id}: ${verdicts.filter(v => v.verdict === 'done').length}/${verdicts.length} done, US$${usageUsd.toFixed(3)}`);
  }
  return out;
}
