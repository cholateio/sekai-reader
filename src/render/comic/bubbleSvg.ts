import type { BubbleShape } from '../../storyboard/types';

export type Tail = 'l' | 'r' | 'c' | 'none';
/** w/h = text box size; pad = how far the SVG canvas extends past the text box on every side. */
export interface BubbleGeom { w: number; h: number; pad: number }
export interface DrawOpts { seed: number; stroke: string; radius: number; double?: boolean }

const NS = 'http://www.w3.org/2000/svg';
const INK_W = 2.5;
const TAIL_DROP = 12;
const PHONE_FILL = '#eef1f6';

// Paths use absolute coordinates only so every "x,y" pair in `d` is a real canvas point.
const n1 = (v: number) => Math.round(v * 10) / 10;
const pt = (x: number, y: number) => `${n1(x)},${n1(y)}`;

function frame(g: BubbleGeom) {
  const x0 = g.pad - 3, y0 = g.pad - 3, x1 = g.w + g.pad + 3, y1 = g.h + g.pad + 3;
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

export function seeded(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export function roundPath(g: BubbleGeom, radius: number): string {
  const { x0, y0, x1, y1 } = frame(g);
  const r = Math.min(radius, (y1 - y0) / 2, (x1 - x0) / 2);
  const A = (x: number, y: number) => `A${n1(r)},${n1(r)} 0 0 1 ${pt(x, y)}`;
  return `M${pt(x0 + r, y0)}L${pt(x1 - r, y0)}${A(x1, y0 + r)}L${pt(x1, y1 - r)}${A(x1 - r, y1)}`
    + `L${pt(x0 + r, y1)}${A(x0, y1 - r)}L${pt(x0, y0 + r)}${A(x0 + r, y0)}Z`;
}

export function cutPath(g: BubbleGeom): string {
  const { x0, y0, x1, y1 } = frame(g);
  const r = Math.min(18, (y1 - y0) / 2), teeth = 6, th = (y1 - y0) / teeth;
  let d = `M${pt(x0 + r, y0)}L${pt(x1 - 8, y0)}`;
  for (let k = 1; k <= teeth; k++) d += `L${pt(k % 2 ? x1 : x1 - 8, y0 + th * k)}`;
  d += `L${pt(x0 + r, y1)}A${n1(r)},${n1(r)} 0 0 1 ${pt(x0, y1 - r)}L${pt(x0, y0 + r)}A${n1(r)},${n1(r)} 0 0 1 ${pt(x0 + r, y0)}Z`;
  return d;
}

export function wobblePath(g: BubbleGeom, rnd: () => number): string {
  const { x0, y0, x1, y1 } = frame(g);
  const w = x1 - x0, h = y1 - y0, per = 2 * (w + h), n = 44, pts: string[] = [];
  for (let k = 0; k < n; k++) {
    const s = (per * k) / n;
    let x: number, y: number;
    if (s < w) { x = x0 + s; y = y0; } else if (s < w + h) { x = x1; y = y0 + s - w; }
    else if (s < 2 * w + h) { x = x1 - (s - w - h); y = y1; } else { x = x0; y = y1 - (s - 2 * w - h); }
    pts.push(pt(x + (rnd() - 0.5) * 5, y + (rnd() - 0.5) * 5));
  }
  return `M${pts.join('L')}Z`;
}

export function shoutPath(g: BubbleGeom, rnd: () => number): string {
  const { cx, cy, x0, y0, x1, y1 } = frame(g);
  const rx = (x1 - x0) / 2 + 2, ry = (y1 - y0) / 2 + 2;
  const n = Math.max(18, Math.round((rx + ry) / 9));
  const pts: string[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.12;
    const f = k % 2 ? 0.8 + rnd() * 0.06 : 1 + rnd() * 0.1;
    pts.push(pt(cx + rx * f * Math.cos(a), cy + ry * f * Math.sin(a)));
  }
  return `M${pts.join('L')}Z`;
}

export function cloudCircles(g: BubbleGeom, rnd: () => number): { cx: number; cy: number; r: number }[] {
  const { cx, cy, x0, y0, x1, y1 } = frame(g);
  // Centres sit 6px inside the frame so the outer puffs stay within the canvas padding.
  const rx = (x1 - x0) / 2 - 6, ry = (y1 - y0) / 2 - 6;
  const n = Math.max(10, Math.round((g.w / 2 + g.h / 2) / 7));
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    return { cx: n1(cx + rx * Math.cos(a)), cy: n1(cy + ry * Math.sin(a)), r: n1(11 + rnd() * 6) };
  });
}

export function tailPath(tail: Tail, g: BubbleGeom): string | null {
  const { x0, x1, y1, cx } = frame(g);
  const tip = y1 + TAIL_DROP, base = y1 - 2;
  if (tail === 'l') return `M${pt(x0 + 22, base)}L${pt(x0 + 12, tip)}L${pt(x0 + 40, base)}`;
  if (tail === 'r') return `M${pt(x1 - 40, base)}L${pt(x1 - 12, tip)}L${pt(x1 - 22, base)}`;
  if (tail === 'c') return `M${pt(cx - 10, base)}L${pt(cx, tip)}L${pt(cx + 10, base)}`;
  return null;
}

/** Redraws the bubble outline into `svg`, replacing whatever was there. The body element carries data-role="body". */
export function drawBubble(svg: SVGSVGElement, shape: BubbleShape, tail: Tail, g: BubbleGeom, opts: DrawOpts): void {
  svg.replaceChildren();
  const add = (tag: string, attrs: Record<string, string | number>) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.appendChild(el);
    return el;
  };
  const rnd = seeded(opts.seed);
  const ink = { stroke: opts.stroke, 'stroke-width': INK_W, 'stroke-linejoin': 'round' };
  const t = shape === 'box' || shape === 'cut' ? null : tailPath(tail, g);

  if (shape === 'cloud') {
    const { cx, cy, x0, y0, x1, y1 } = frame(g);
    const cs = cloudCircles(g, rnd);
    for (const c of cs) add('circle', { cx: c.cx, cy: c.cy, r: c.r, fill: '#fff', ...ink });
    add('ellipse', { cx: n1(cx), cy: n1(cy), rx: n1((x1 - x0) / 2 - 6), ry: n1((y1 - y0) / 2 - 6), fill: '#fff', 'data-role': 'body' });
    for (const c of cs) add('circle', { cx: c.cx, cy: c.cy, r: n1(c.r - 1.3), fill: '#fff' });
    if (tail !== 'none') {
      const tx = tail === 'r' ? x1 - 30 : tail === 'c' ? cx : x0 + 30, dir = tail === 'r' ? 1 : tail === 'c' ? 0 : -1;
      add('circle', { cx: n1(tx), cy: n1(y1 + 4), r: 5, fill: '#fff', ...ink, 'stroke-width': 2 });
      add('circle', { cx: n1(tx + dir * 10), cy: n1(y1 + 12), r: 3, fill: '#fff', ...ink, 'stroke-width': 2 });
    }
    return;
  }

  let d: string;
  const body: Record<string, string | number> = { fill: '#fff', ...ink, 'data-role': 'body' };
  if (shape === 'shout') {
    d = shoutPath(g, rnd);
    Object.assign(body, { 'stroke-width': 3, 'stroke-linejoin': 'miter' });
    if (opts.double) add('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 7, 'stroke-linejoin': 'miter' });
  } else if (shape === 'wobble') {
    d = wobblePath(g, rnd);
    body['stroke-linejoin'] = 'miter';
  } else if (shape === 'cut') {
    d = cutPath(g);
  } else {
    d = roundPath(g, shape === 'box' ? 2 : shape === 'phone' ? 8 : opts.radius);
    if (shape === 'phone') body.fill = PHONE_FILL;
    if (shape === 'whisper') Object.assign(body, { 'stroke-width': 2, 'stroke-dasharray': '7 5' });
  }
  const tailInk: Record<string, string | number> = shape === 'whisper' ? { 'stroke-width': 2, 'stroke-dasharray': '7 5' } : {};
  if (t) add('path', { d: t, fill: body.fill, ...ink, ...tailInk });
  add('path', { d, ...body });
  if (t) add('path', { d: t, fill: body.fill, stroke: 'none' });
  if (shape === 'phone') {
    const { x1, y0 } = frame(g);
    add('rect', { x: n1(x1 - 22), y: n1(y0 - 6), width: 14, height: 10, rx: 2, fill: opts.stroke });
  }
}
