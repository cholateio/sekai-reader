import { h } from '../../render/dom';
import { unitOf } from '../catalog';

export const go = (hash: string) => { location.hash = hash; };
export const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export function backButton(hash: string, label: string): HTMLElement {
  return h('button', { class: 'iconbtn', onclick: () => go(hash), 'aria-label': label }, '←');
}

export function unitChip(u: string): HTMLElement {
  const [name, color] = unitOf(u);
  return h('span', { class: 'chip small' }, h('i', { class: 'dot', style: `background:${color}` }), name);
}

export function viewMissing(message: string, back = '#library'): HTMLElement[] {
  return [h('header', { class: 'bar' }, backButton(back, '返回'), h('div', { class: 'ttl sub' }, '')),
    h('p', { class: 'empty' }, message)];
}
