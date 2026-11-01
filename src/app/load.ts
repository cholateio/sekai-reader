import type { Episode } from '../scenario/types';

export interface Manifest { bg: string[]; sd: number[]; episodes: string[] }

const SID = /^[a-z0-9_]+$/;

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
  const empty: Manifest = { bg: [], sd: [], episodes: [] };
  try {
    const res = await fetch('/manifest.json');
    if (!res.ok) return empty;
    const m = (await res.json()) as Partial<Manifest>;
    return {
      bg: Array.isArray(m.bg) ? m.bg : [],
      sd: Array.isArray(m.sd) ? m.sd : [],
      episodes: Array.isArray(m.episodes) ? m.episodes : [],
    };
  } catch { return empty; }
}
