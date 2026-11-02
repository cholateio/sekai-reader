// Opening curtain, ported from cholate-blog (same author): two panels part from the centre on the first load
// of a browsing session only. The markup lives in index.html and stays display:none unless data-play is set,
// so a session that already saw it never flashes the curtain.
export const CURTAIN_KEY = 'sekai-reader:curtain-shown';

declare global { interface Window { __curtainShown?: boolean } }

export function playCurtainOnce(doc: Document, storage: Storage): void {
  const el = doc.querySelector<HTMLElement>('[data-curtain]');
  if (!el) return;
  // Two flags: window survives when storage is blocked (private mode), storage survives reloads.
  let seen = window.__curtainShown === true;
  if (!seen) {
    try { seen = storage.getItem(CURTAIN_KEY) !== null; } catch { /* storage blocked */ }
  }
  if (seen) { el.remove(); return; }
  window.__curtainShown = true;
  try { storage.setItem(CURTAIN_KEY, '1'); } catch { /* storage blocked */ }
  el.addEventListener('animationend', () => el.remove(), { once: true });
  el.dataset.play = '';
}
