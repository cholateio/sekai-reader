// Dev server only (spec 2026-11-18 phase 3): the chibi list comes from the sekai-chibis-dev middleware in
// vite.config.ts, which serves the raw store. Phase 4 replaces this with the manifest and deployed files.
import type { Kind } from '../chibiPose';
import type { ChibiPlayer } from '../SpineChibiArt';

export async function loadDevPlayer(kinds: Map<string, Kind>): Promise<ChibiPlayer> {
  const r = await fetch('/chibi/index.json');
  if (!r.ok) throw new Error(`chibi index: HTTP ${r.status}`);
  const idx = await r.json() as { names?: string[]; noflip?: string[] };
  if (!idx.names?.length) throw new Error('no chibi sets on this machine (assets/raw/chibi)');
  const { createPlayer, UPPER, HEADROOM } = await import('./player');
  // Framing knobs for the phone check: ?upper=0.75&headroom=0.05 before the #route.
  const q = new URLSearchParams(location.search);
  const num = (k: string, d: number) => { const v = Number(q.get(k)); return q.has(k) && Number.isFinite(v) && v > 0 && v <= 1 ? v : d; };
  return createPlayer({ base: '/chibi', available: new Set(idx.names), noflip: new Set(idx.noflip ?? []) }, kinds,
    { upper: num('upper', UPPER), headroom: num('headroom', HEADROOM) });
}
