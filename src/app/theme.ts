import { h } from '../render/dom';
import { prefs } from './storage';

// Mirrored by the inline script in index.html (runs before first paint): same key, same default.
const THEME_COLOR = { light: '#fcfcfa', dark: '#14181e' };

// The choice made this session, so the switch still works when storage is blocked (writes are best-effort).
let chosen: boolean | null = null;

/** This session's choice, then the stored one, then the system setting. */
export function isDark(): boolean {
  if (chosen !== null) return chosen;
  const v = prefs.get<unknown>('dark', null);
  if (typeof v === 'boolean') return v;
  try { return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches); } catch { return false; }
}

export function applyTheme(): void {
  const theme = isDark() ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

/** Drawer switch shown on every page (below 黑白 in the reader). */
export function darkToggle(): HTMLElement {
  const btn = h('button', {
    class: 'drawer-item toggle', 'aria-pressed': String(isDark()), 'aria-label': '深色模式',
    onclick: () => {
      const v = !isDark();
      chosen = v;
      prefs.set('dark', v);
      btn.setAttribute('aria-pressed', String(v));
      applyTheme();
    },
  }, h('span', {}, '深色模式'), h('i', { class: 'switch', 'aria-hidden': 'true' }));
  return btn;
}

/** Tests only: forget this session's choice. */
export function resetThemeChoice(): void { chosen = null; }
