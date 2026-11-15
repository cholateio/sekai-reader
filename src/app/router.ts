import { h } from '../render/dom';
import { loadStoryboard, resolveStoryboard } from '../storyboard';
import { eventById, eventLabel, eventShort } from './catalog';
import { parseQuery } from './filter';
import { loadEpisode, loadManifest, type Manifest } from './load';
import { pushRecent, type RecentItem } from './recent';
import { prefs } from './storage';
import { unitFlavor } from './units';
import { leavePage, viewMissing } from './views/common';
import { viewEvent } from './views/event';
import { viewLibrary } from './views/library';
import { viewReader } from './views/reader';

export const DEFAULT_ROUTE = '#library';

let posKey: string | null = null;
let scrollTick = 0;
let listTimer: ReturnType<typeof setTimeout> | undefined;
// Scroll events right after a render come from our own restore scrollTo, not the reader; saving them
// would overwrite a finished episode's position with 0 (final review 2026-11-01).
const RESTORE_QUIET_MS = 800;
let quietUntil = 0;

/** Saves the list position of a non-reader page into its own history entry, so Back returns to it. */
function saveListY(force = false): void {
  if (posKey || (!force && Date.now() < quietUntil)) return;
  const st: unknown = history.state;
  // Safari throttles replaceState (about 100 calls per 10 s); a dropped save only costs a slightly older position.
  try { history.replaceState({ ...(st && typeof st === 'object' ? st : {}), y: scrollY }, ''); } catch { /* throttled */ }
}

function onScroll(): void {
  const el = document.documentElement;
  const max = el.scrollHeight - innerHeight;
  const p = max > 0 ? Math.min(1, scrollY / max) : 1;
  const bar = document.querySelector<HTMLElement>('.progress i');
  if (bar) bar.style.width = `${p * 100}%`;
  const top = document.querySelector<HTMLElement>('.to-top');
  if (top) top.hidden = Boolean(posKey) || scrollY < innerHeight * 1.5;
  const now = Date.now();
  if (posKey) {
    if (now >= quietUntil && now - scrollTick > 400) { scrollTick = now; prefs.set(`pos:${posKey}`, p); }
  } else {
    // One history write per scroll gesture (trailing), well under WebKit's replaceState rate limit.
    clearTimeout(listTimer);
    listTimer = setTimeout(saveListY, 250);
  }
}

function toTopButton(): HTMLElement {
  return h('button', {
    class: 'to-top', type: 'button', 'aria-label': '回到頂端', hidden: true,
    onclick: () => scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }),
  }, '↑');
}

const savedY = (): number | null => {
  const st: unknown = history.state;
  const y = st && typeof st === 'object' ? (st as { y?: unknown }).y : undefined;
  return typeof y === 'number' && y > 0 ? y : null;
};

const SITE = 'SEKAI 劇情閱讀器';

interface Page {
  nodes: HTMLElement[]; restore: number;
  /** Page part of document.title (before the site name); omitted for the library. */ title?: string;
  /** Recorded only when this render is still the latest (see startApp). */ recent?: RecentItem;
  /** Episode sid whose reading position this page saves; applied only when the render is accepted. */ key?: string;
}

async function route(r: string, manifest: Manifest): Promise<Page> {
  document.body.classList.remove('paper', 'bw');
  const [name, search = ''] = r.split('?', 2);
  if (name === 'library') return { nodes: viewLibrary(manifest, parseQuery(search)), restore: 0 };
  let m = /^event-(\d+)$/.exec(r);
  if (m) {
    const ev = eventById.get(Number(m[1]));
    return { nodes: viewEvent(Number(m[1]), manifest), restore: 0, title: ev ? `${eventShort(ev)} ${ev.name}` : '找不到這期活動' };
  }
  m = /^read-(\d+)-(\d+)$/.exec(r);
  if (m) {
    const id = Number(m[1]), no = Number(m[2]);
    const ev = eventById.get(id);
    const i = ev ? ev.eps.findIndex(x => x[0] === no) : -1;
    if (!ev || i < 0) return { nodes: viewMissing('找不到這一話，回到活動列表重新選擇。'), restore: 0, title: '找不到這一話' };
    const [, title, sid] = ev.eps[i];
    const listed = manifest.episodes.includes(sid) || !manifest.episodes.length;
    const [ep, board] = listed ? await Promise.all([loadEpisode(sid), loadStoryboard(sid)]) : [null, undefined];
    if (!ep) return { nodes: viewMissing(`第 ${no} 話「${title}」尚未提供。`, `#event-${id}`), restore: 0, title: `${eventShort(ev)} 第 ${no} 話 ${title}` };
    const link = (x: typeof ev.eps[number] | undefined) => x
      ? { no: x[0], title: x[1], href: manifest.episodes.includes(x[2]) ? `#read-${id}-${x[0]}` : null } : null;
    return {
      key: sid,
      title: `${eventShort(ev)} 第 ${no} 話 ${title}`,
      recent: { sid, id, no, title },
      nodes: viewReader(ep, resolveStoryboard(board, ep), {
        title: `第 ${no} 話 ${title}`, sub: `第 ${id} 期 · ${eventLabel(ev)}`, back: `#event-${id}`, manifest, unit: unitFlavor(ev.unit),
        prev: link(ev.eps[i - 1]), next: link(ev.eps[i + 1]),
      }),
      restore: prefs.get(`pos:${sid}`, 0),
    };
  }
  return { nodes: viewMissing('找不到這個頁面。'), restore: 0, title: '找不到這個頁面' };
}

let appCtrl: AbortController | null = null;

/** Mounts the reader into `app`; resolves after the first render (tests await it). One app per document:
 *  starting again removes the previous app's window listeners. */
export async function startApp(app: HTMLElement): Promise<void> {
  appCtrl?.abort();
  const ctrl = appCtrl = new AbortController();
  const signal = ctrl.signal;
  const manifest = await loadManifest();
  let seq = 0;
  let shown = '';
  const render = async () => {
    if (!location.hash || location.hash === '#') history.replaceState(null, '', DEFAULT_ROUTE);
    // A new entry has no state yet: record where it was opened from (kept on Back/Forward and reload).
    const st: unknown = history.state;
    if (!(st && typeof st === 'object' && 'from' in st)) {
      try { history.replaceState({ ...(st && typeof st === 'object' ? st : {}), from: shown }, ''); } catch { /* throttled */ }
    }
    shown = location.hash.slice(1);
    const mine = ++seq;
    // A pending list save must not land on the entry we are navigating to.
    clearTimeout(listTimer);
    leavePage();
    const { nodes, restore, recent, key, title } = await route(location.hash.slice(1), manifest);
    if (mine !== seq) return;
    document.title = title ? `${title}｜${SITE}` : SITE;
    posKey = key ?? null;
    if (recent) pushRecent(recent);
    quietUntil = Date.now() + RESTORE_QUIET_MS;
    app.replaceChildren(h('div', { class: 'wrap' }, nodes));
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      // Reader: stored fraction of the episode. Other pages: the pixel offset saved in this history entry
      // (null for a freshly opened entry, so following a link starts at the top).
      const y = posKey ? (restore > 0.02 && restore < 0.97 ? restore * max : 0) : Math.min(savedY() ?? 0, Math.max(0, max));
      scrollTo(0, y);
      onScroll();
    });
  };
  if (!document.querySelector('.to-top')) document.body.append(toTopButton());
  addEventListener('hashchange', () => { void render(); }, { signal });
  addEventListener('scroll', onScroll, { passive: true, signal });
  // The debounced scroll save can lag the last flick; save once more right before a link leaves the page.
  addEventListener('click', e => {
    if ((e.target as Element | null)?.closest?.('a[href^="#"]')) saveListY(true);
  }, { capture: true, signal });
  await render();
}
