import { h } from '../../render/dom';
import { unitOf } from '../catalog';

export const go = (hash: string) => { location.hash = hash; };

let pageCtrl = new AbortController();
/** Aborted when the router replaces the page; pass it to document/window listeners a view adds. */
export const pageSignal = (): AbortSignal => pageCtrl.signal;
export function leavePage(): void {
  pageCtrl.abort();
  pageCtrl = new AbortController();
}

export interface HeaderOpts {
  /** Shown in the header bar and at the top of the drawer. */
  title?: string;
  sub?: string;
  /** Page-specific navigation entries, listed above the always-present 活動目錄 entry. */
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
    o.items ?? [],
    h('button', { class: 'drawer-item', 'data-go': 'library', onclick: () => { close(); go('library'); } }, '活動目錄'),
    o.settings?.length ? [h('hr', { class: 'drawer-sep' }), o.settings] : null);
  const setOpen = (open: boolean) => {
    drawer.hidden = scrim.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
  };
  menu.addEventListener('click', () => setOpen(drawer.hidden));
  scrim.addEventListener('click', close);
  drawer.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-go]')) close(); });
  document.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }, { signal: pageSignal() });
  const header = h('header', { class: 'site-header' },
    h('div', { class: 'site-header-in' },
      h('a', { class: 'brand', href: '#library' }, 'SEKAI 劇情閱讀器'),
      h('span', { class: 'page-title' }, o.title ?? ''),
      menu),
    o.progress ? h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i')) : null);
  return [header, scrim, drawer];
}

export function unitChip(u: string): HTMLElement {
  const [name, color] = unitOf(u);
  return h('span', { class: 'chip small' }, h('i', { class: 'dot', style: `background:${color}` }), name);
}

export function viewMissing(message: string, back?: string): HTMLElement[] {
  const items = back ? [h('button', { class: 'drawer-item', 'data-go': 'event', onclick: () => go(back) }, '這期的話數列表')] : [];
  return [...siteHeader({ items }), h('p', { class: 'empty' }, message)];
}
