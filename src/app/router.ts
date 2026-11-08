import { h } from '../render/dom';
import { loadStoryboard, resolveStoryboard } from '../storyboard';
import { eventById, eventLabel } from './catalog';
import { parseQuery } from './filter';
import { loadEpisode, loadManifest, type Manifest } from './load';
import { pushRecent, type RecentItem } from './recent';
import { prefs } from './storage';
import { unitFlavor } from './units';
import { leavePage, viewMissing } from './views/common';
import { viewEvent } from './views/event';
import { viewLibrary } from './views/library';
import { viewReader } from './views/reader';

export const DEFAULT_ROUTE = '#read-173-1';

let posKey: string | null = null;
let scrollTick = 0;
// Scroll events right after a render come from our own restore scrollTo, not the reader; saving them
// would overwrite a finished episode's position with 0 (final review 2026-11-01).
const RESTORE_QUIET_MS = 800;
let quietUntil = 0;

function onScroll(): void {
  const el = document.documentElement;
  const max = el.scrollHeight - innerHeight;
  const p = max > 0 ? Math.min(1, scrollY / max) : 1;
  const bar = document.querySelector<HTMLElement>('.progress i');
  if (bar) bar.style.width = `${p * 100}%`;
  const now = Date.now();
  if (posKey && now >= quietUntil && now - scrollTick > 400) { scrollTick = now; prefs.set(`pos:${posKey}`, p); }
}

interface Page { nodes: HTMLElement[]; restore: number; /** Recorded only when this render is still the latest (see startApp). */ recent?: RecentItem }

async function route(r: string, manifest: Manifest): Promise<Page> {
  document.body.classList.remove('paper', 'bw');
  posKey = null;
  const [name, search = ''] = r.split('?', 2);
  if (name === 'library') return { nodes: viewLibrary(manifest, parseQuery(search)), restore: 0 };
  let m = /^event-(\d+)$/.exec(r);
  if (m) return { nodes: viewEvent(Number(m[1]), manifest), restore: 0 };
  m = /^read-(\d+)-(\d+)$/.exec(r);
  if (m) {
    const id = Number(m[1]), no = Number(m[2]);
    const ev = eventById.get(id);
    const i = ev ? ev.eps.findIndex(x => x[0] === no) : -1;
    if (!ev || i < 0) return { nodes: viewMissing('找不到這一話，回到活動列表重新選擇。'), restore: 0 };
    const [, title, sid] = ev.eps[i];
    const ep = manifest.episodes.includes(sid) || !manifest.episodes.length ? await loadEpisode(sid) : null;
    if (!ep) return { nodes: viewMissing(`第 ${no} 話「${title}」尚未提供。`, `#event-${id}`), restore: 0 };
    const link = (x: typeof ev.eps[number] | undefined) => x
      ? { no: x[0], title: x[1], href: manifest.episodes.includes(x[2]) ? `#read-${id}-${x[0]}` : null } : null;
    posKey = sid;
    return {
      recent: { sid, id, no, title },
      nodes: viewReader(ep, resolveStoryboard(loadStoryboard(sid), ep), {
        title: `第 ${no} 話 ${title}`, sub: `第 ${id} 期 · ${eventLabel(ev)}`, back: `#event-${id}`, manifest, unit: unitFlavor(ev.unit),
        prev: link(ev.eps[i - 1]), next: link(ev.eps[i + 1]),
      }),
      restore: prefs.get(`pos:${sid}`, 0),
    };
  }
  return { nodes: viewMissing('找不到這個頁面。'), restore: 0 };
}

/** Mounts the reader into `app`; resolves after the first render (tests await it). */
export async function startApp(app: HTMLElement): Promise<void> {
  const manifest = await loadManifest();
  let seq = 0;
  const render = async () => {
    if (!location.hash || location.hash === '#') history.replaceState(null, '', DEFAULT_ROUTE);
    const mine = ++seq;
    leavePage();
    const { nodes, restore, recent } = await route(location.hash.slice(1), manifest);
    if (mine !== seq) return;
    if (recent) pushRecent(recent);
    quietUntil = Date.now() + RESTORE_QUIET_MS;
    app.replaceChildren(h('div', { class: 'wrap' }, nodes));
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      scrollTo(0, restore > 0.02 && restore < 0.97 ? restore * max : 0);
      onScroll();
    });
  };
  addEventListener('hashchange', () => { void render(); });
  addEventListener('scroll', onScroll, { passive: true });
  await render();
}
