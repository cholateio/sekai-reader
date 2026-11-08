import { h } from '../../render/dom';
import { eventById, eventShort } from '../catalog';
import { recentList } from '../recent';
import { darkToggle } from '../theme';

export const go = (hash: string) => { location.hash = hash; };

let pageCtrl = new AbortController();
/** Aborted when the router replaces the page; pass it to document/window listeners a view adds. */
export const pageSignal = (): AbortSignal => pageCtrl.signal;
export function leavePage(): void {
  pageCtrl.abort();
  pageCtrl = new AbortController();
}

/** Drawer navigation row; `href` is a complete `#…` hash. */
export function navLink(href: string, label: string, extra?: HTMLElement | string | null): HTMLAnchorElement {
  return h('a', { class: 'drawer-item', href }, h('span', {}, label), extra ? h('small', {}, extra) : null) as HTMLAnchorElement;
}

function recentSection(): HTMLElement[] {
  const items = recentList();
  if (!items.length) return [];
  // Readers remember 「繪名5箱」, not event or episode titles; no progress figures (owner, 2026-11-07).
  return [h('p', { class: 'drawer-label' }, '最近閱讀'), ...items.map(r => {
    const ev = eventById.get(r.id);
    return navLink(`#read-${r.id}-${r.no}`, `${ev ? eventShort(ev) : `第 ${r.id} 期`} 第 ${r.no} 話`);
  })];
}

export interface HeaderOpts {
  /** Shown in the header bar and at the top of the drawer. */
  title?: string;
  sub?: string;
  /** Page-specific navigation entries (links from `navLink`), listed below the always-present 首頁 entry. */
  items?: HTMLElement[];
  /** Settings (toggles) shown below the navigation, after a divider. */
  settings?: HTMLElement[];
  /** Adds the reading-progress hairline along the header's bottom edge (reader only). */
  progress?: boolean;
}

/**
 * The one site-wide header (fixed at the top): brand, current page title, and the menu button that opens the
 * drawer. Every view starts with it so all pages share the same chrome.
 */
export function siteHeader(o: HeaderOpts = {}): HTMLElement[] {
  const scrim = h('div', { class: 'scrim', hidden: true });
  const menu = h('button', { class: 'iconbtn menu', 'aria-label': '選單', 'aria-expanded': 'false', 'aria-controls': 'site-drawer' }, '☰');
  const close = () => setOpen(false);
  const drawer = h('nav', { class: 'drawer', id: 'site-drawer', 'aria-label': '選單', hidden: true },
    o.title ? h('div', { class: 'drawer-head' }, h('b', {}, o.title), o.sub ? h('span', {}, o.sub) : null) : null,
    h('a', { class: 'drawer-item', 'data-go': 'library', href: '#library' }, '首頁'),
    o.items ?? [],
    recentSection(),
    [h('hr', { class: 'drawer-sep' }), ...(o.settings ?? []), darkToggle()]);
  const setOpen = (open: boolean) => {
    drawer.hidden = scrim.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
  };
  menu.addEventListener('click', () => setOpen(drawer.hidden));
  scrim.addEventListener('click', close);
  // Any navigation out of the drawer closes it; toggles (settings) stay open.
  drawer.addEventListener('click', e => { if ((e.target as HTMLElement).closest('a, [data-go]')) close(); });
  document.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }, { signal: pageSignal() });
  const header = h('header', { class: 'site-header' },
    h('div', { class: 'site-header-in' },
      h('a', { class: 'brand', href: '#library' }, 'SEKAI 劇情閱讀器'),
      h('span', { class: 'page-title' }, o.title ?? ''),
      menu),
    o.progress ? h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i')) : null);
  return [header, scrim, drawer];
}

/** Copyright notice (owner, 2026-11-04; contact sentence removed 2026-11-07): no e-mail, no takedown promise. */
export function siteFooter(): HTMLElement {
  return h('footer', { class: 'site-footer' }, '本站為非官方粉絲專案，遊戲內容著作權屬 SEGA、Colorful Palette、Crypton。');
}

export function viewMissing(message: string, back?: string): HTMLElement[] {
  const items = back ? [navLink(back, '這期的話數列表')] : [];
  return [...siteHeader({ items }), h('p', { class: 'empty' }, message)];
}
