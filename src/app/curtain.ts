// Opening curtain, ported from cholate-blog (same author): two panels part from the centre on the first load
// of a browsing session only. The markup lives in index.html and stays display:none unless data-play is set,
// so a session that already saw it never flashes the curtain.
export const CURTAIN_KEY = 'sekai-reader:curtain-shown';
// window.name survives reloads within a tab, unlike window globals: the fallback when storage is blocked.
const NAME_MARK = '[sekai-curtain]';

declare global { interface Window { __curtainShown?: boolean } }

export function playCurtainOnce(doc: Document, storage: Storage): void {
  const el = doc.querySelector<HTMLElement>('[data-curtain]');
  if (!el) return;
  // Flags: sessionStorage (normal case), plus window global and window.name when storage is blocked.
  let seen = window.__curtainShown === true || window.name.includes(NAME_MARK);
  if (!seen) {
    try { seen = storage.getItem(CURTAIN_KEY) !== null; } catch { /* storage blocked */ }
  }
  if (seen) { el.remove(); return; }
  window.__curtainShown = true;
  try { storage.setItem(CURTAIN_KEY, '1'); } catch { window.name += NAME_MARK; }
  el.addEventListener('animationend', () => el.remove(), { once: true });
  el.dataset.play = '';
}
