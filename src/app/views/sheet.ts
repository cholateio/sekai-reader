import { h } from '../../render/dom';
import { inkFor } from '../../data/characters';
import { CHARS, TYPES, TYPE_SHORT, UNITS, unitOf } from '../catalog';
import type { LibraryQuery } from '../filter';
import { pageSignal } from './common';

const GROUPS = ['light_sound', 'idol', 'street', 'theme_park', 'school_refusal', 'piapro'];

/**
 * Bottom sheet with the activity-type and character filters. Type taps apply without closing; a character tap
 * applies and closes; Esc / scrim / 清除 close and return focus to `returnTo`.
 */
export function openFilterSheet(initial: LibraryQuery, onChange: (next: LibraryQuery) => void, returnTo: HTMLElement): void {
  document.querySelector('.sheet-scrim')?.remove();
  document.querySelector('.sheet')?.remove();
  let qy = initial;
  const ctrl = new AbortController();
  const close = () => {
    ctrl.abort();
    scrim.remove();
    sheet.remove();
    returnTo.focus();
  };
  const typeRow = h('div', { class: 'chips' });
  const drawTypes = () => typeRow.replaceChildren(...[['all', '全部'], ...Object.keys(TYPES).map(k => [k, TYPE_SHORT[k] ?? k])].map(([k, n]) =>
    h('button', {
      class: 'chip', 'data-type': k, 'aria-pressed': String(qy.type === k),
      onclick: () => { qy = { ...qy, type: k }; onChange(qy); drawTypes(); },
    }, n)));
  drawTypes();
  const groups = GROUPS.map(u => h('div', { class: 'cgroup' },
    h('span', { class: 'cgroup-name' }, h('i', { class: 'dot', style: `background:${unitOf(u)[1]}` }), UNITS[u]?.[0] ?? u),
    h('div', { class: 'cbtns' }, CHARS.filter(c => c.unit === u).map(c => h('button', {
      class: 'cbtn', 'data-char': c.id, 'aria-pressed': String(qy.char === c.id),
      style: `background:${c.color};color:${inkFor(c.color)}`,
      onclick: () => { onChange({ ...qy, char: c.id }); close(); },
    }, c.given)))));
  const scrim = h('div', { class: 'sheet-scrim', onclick: close });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': '篩選', tabindex: '-1' },
    h('div', { class: 'sheet-head' }, h('b', {}, '篩選'), h('button', { class: 'ghost', onclick: () => { onChange({ ...qy, char: null, type: 'all' }); close(); } }, '清除')),
    h('p', { class: 'drawer-label' }, '活動類型'), typeRow,
    h('p', { class: 'drawer-label' }, '角色（含該角色登場的混活）'), groups);
  document.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }, { signal: ctrl.signal });
  // The router aborts pageSignal when the page changes; the sheet must not outlive its page.
  pageSignal().addEventListener('abort', close, { once: true, signal: ctrl.signal });
  document.body.append(scrim, sheet);
  sheet.focus();
}
