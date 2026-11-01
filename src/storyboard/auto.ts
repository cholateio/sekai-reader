import type { Episode } from '../scenario/types';
import { isThought } from '../scenario/text';
import type { Panel, Storyboard } from './types';

const EDGE_CYCLE: readonly (-1 | 0 | 1)[] = [1, -1, 1, 0, -1, 1, -1, 0];

export function assignEdges(panels: Panel[]): void {
  panels.forEach((p, i) => { p.edge = EDGE_CYCLE[i % EDGE_CYCLE.length]; });
  panels.forEach((p, i) => {
    if (p.t === 'est' || p.t === 'trans') {
      p.edge = 0;
      if (i > 0) panels[i - 1].edge = 0;
    }
  });
}

export function autoBoard(ep: Episode): Storyboard {
  const panels: Panel[] = [];
  let caps: number[] = [];
  let buf: number[] = [];
  let si = 0;
  const flush = () => { while (buf.length) panels.push({ t: 'talk', l: buf.splice(0, 2) }); };
  const takeScenes = (upTo: number) => {
    while (si < ep.scenes.length && ep.scenes[si].before <= upTo) { flush(); caps.push(si++); }
  };

  ep.lines.forEach((line, idx) => {
    takeScenes(idx);
    if (caps.length) { panels.push({ t: 'est', caps, tone: 'day' }); caps = []; }
    if (!line.who || isThought(line.body)) { flush(); panels.push({ t: 'mono', l: [line.r] }); return; }
    if (line.body.length <= 8 && /[！!…]$/.test(line.body)) { flush(); panels.push({ t: 'beat', l: [line.r] }); return; }
    buf.push(line.r);
    if (buf.length === 2) flush();
  });
  takeScenes(Infinity);
  flush();
  if (caps.length) panels.push({ t: 'est', caps });
  assignEdges(panels);
  return {
    meta: { director: 'auto', promptVersion: 'rules-1', generatedAt: new Date().toISOString().slice(0, 10) },
    panels,
  };
}
