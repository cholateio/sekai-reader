import { h } from '../dom';

type Kind = 'bleed' | 'pn' | 'flat';
const kindOf = (r: Element): Kind =>
  r.classList.contains('pn') ? (r.classList.contains('est') ? 'bleed' : 'pn')
    : r.classList.contains('beatrow') || r.classList.contains('split') ? 'pn' : 'flat';

/**
 * Wraps every .pn in .pw and slants shared borders. Row k's data-edge is its bottom slant; the next row's top
 * uses the same direction so the gutter stays the same width. Slants only occur between two framed rows.
 */
export function applyEdges(root: HTMLElement, S = 22): void {
  const rows = [...root.children].filter(r => !r.classList.contains('credit')) as HTMLElement[];
  const dirs = rows.slice(0, -1).map((r, k) => {
    const d = Number(r.dataset.edge ?? 0);
    return kindOf(r) === 'pn' && kindOf(rows[k + 1]) === 'pn' && (d === 1 || d === -1) ? d : 0;
  });
  const yTop = (d: number, f: number) => (d === 1 ? S * f : d === -1 ? S * (1 - f) : 0);
  const yBot = (d: number, f: number) => (d === 1 ? S * (1 - f) : d === -1 ? S * f : 0);

  rows.forEach((row, k) => {
    const dt = k ? dirs[k - 1] : 0;
    const db = k < dirs.length ? dirs[k] : 0;
    let parts: [HTMLElement, number, number][];
    if (row.classList.contains('pn')) parts = [[row, 0, 1]];
    else if (row.classList.contains('beatrow')) {
      const right = row.classList.contains('r');
      parts = [[row.firstElementChild as HTMLElement, right ? 0.34 : 0, right ? 1 : 0.66]];
    } else if (row.classList.contains('split')) {
      const n = row.children.length;
      parts = [...row.children].map((c, i) => [c as HTMLElement, i / n, (i + 1) / n]);
    } else return;
    for (const [pn, a, b] of parts) {
      const wrap = h('div', { class: 'pw' + (kindOf(row) === 'bleed' ? ' bleed' : '') });
      if (pn.classList.contains('scene-start')) { pn.classList.remove('scene-start'); wrap.classList.add('scene-start'); }
      pn.replaceWith(wrap);
      wrap.append(pn);
      const tl = yTop(dt, a), tr = yTop(dt, b), bl = yBot(db, a), br = yBot(db, b);
      pn.style.setProperty('clip-path', `polygon(0 ${tl}px, 100% ${tr}px, 100% calc(100% - ${br}px), 0 calc(100% - ${bl}px))`);
      pn.style.setProperty('--st', `${Math.max(tl, tr)}px`);
      pn.style.setProperty('--sb', `${Math.max(bl, br)}px`);
    }
  });
}
