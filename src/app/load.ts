import type { Episode } from '../scenario/types';

/** banners: event bundles whose home banner is deployed (spec 2026-11-07); absent in older manifests. */
export interface Manifest { bg: string[]; sd: number[]; episodes: string[]; banners?: string[] }

/** Deployed banner of an event: `small` is the 200-wide list thumbnail, otherwise the 720-wide backdrop. */
export function bannerUrl(m: Manifest, bundle: string, small = false): string | null {
  return SID.test(bundle) && m.banners?.includes(bundle) ? `/banner/${small ? 's/' : ''}${bundle}.webp` : null;
}

const SID = /^[a-z0-9_]+$/;

const available = new WeakMap<Manifest, Set<string>>();
/**
 * Whether at least one episode of the event is deployed. An empty episode list means the manifest failed to
 * load; the router then still tries every episode, so everything counts as readable rather than hidden.
 */
export function isReadable(m: Manifest, e: { eps: [number, string, string][] }): boolean {
  if (!m.episodes.length) return true;
  let set = available.get(m);
  if (!set) available.set(m, set = new Set(m.episodes));
  return e.eps.some(x => set.has(x[2]));
}

export async function loadEpisode(sid: string): Promise<Episode | null> {
  if (!SID.test(sid)) return null;
  try {
    const res = await fetch(`/episodes/${sid}.json`);
    if (!res.ok) return null;
    const ep = (await res.json()) as Episode;
    return ep && Array.isArray(ep.lines) && Array.isArray(ep.scenes) ? ep : null;
  } catch { return null; }
}

export async function loadManifest(): Promise<Manifest> {
  const empty: Manifest = { bg: [], sd: [], episodes: [], banners: [] };
  try {
    const res = await fetch('/manifest.json');
    if (!res.ok) return empty;
    const m = (await res.json()) as Partial<Manifest>;
    return {
      bg: Array.isArray(m.bg) ? m.bg : [],
      sd: Array.isArray(m.sd) ? m.sd : [],
      episodes: Array.isArray(m.episodes) ? m.episodes : [],
      banners: Array.isArray(m.banners) ? m.banners.filter((b): b is string => typeof b === 'string') : [],
    };
  } catch { return empty; }
}
