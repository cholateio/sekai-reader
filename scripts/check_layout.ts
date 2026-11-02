// Usage: npm run check:layout  — builds, serves dist with `vite preview`, and checks the default page at phone width.
// Requires assets/public (npm run build:episode event_173_01) and a local Chromium (CHROME_PATH or the playwright cache).
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import sharp from 'sharp';

const PORT = 4179;
const W = 390, H = 844, DPR = 2;
// Spec (manga-style design, 驗收 1): 10px paper margin each side, 10px visible seams, slant offset 22px.
const MARGIN = 10, G = 10, S = 22;
const PAPER: [number, number, number] = [0xfb, 0xfa, 0xf7];

function findChrome(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(cache)) return null;
  for (const d of readdirSync(cache).filter(d => d.startsWith('chromium-')).sort().reverse()) {
    const p = join(cache, d, 'chrome-linux64', 'chrome');
    if (existsSync(p)) return p;
  }
  return null;
}

async function waitFor(url: string, ms = 15000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if ((await fetch(url)).ok) return; } catch { /* server not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`server did not start: ${url}`);
}

async function main(): Promise<number> {
  const chrome = findChrome();
  if (!chrome) { console.error('Chromium not found: set CHROME_PATH or install into ~/.cache/ms-playwright'); return 2; }
  execSync('npx vite build', { stdio: 'inherit' });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  const fail: string[] = [];
  try {
    await waitFor(`http://localhost:${PORT}/`);
    const browser = await chromium.launch({ executablePath: chrome });
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.comic .pw');
    const m = await page.evaluate(() => ({
      hash: location.hash,
      scrollWidth: document.documentElement.scrollWidth,
      panels: document.querySelectorAll('.comic .pw').length,
      lines: document.querySelectorAll('.comic [data-r]').length,
      bgl: document.querySelectorAll('.comic .bgl').length,
      sd: document.querySelectorAll('.comic img.sd').length,
      brokenImg: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).length,
      sekai: document.body.textContent!.includes('sekai.best') || document.documentElement.outerHTML.includes('sekai.best'),
      paper: document.body.classList.contains('paper'),
      // Visible overflow only: content clipped by an ancestor with overflow != visible cannot cause scrolling.
      wideEls: [...document.querySelectorAll('body *')].filter(e => {
        if (e.getBoundingClientRect().right <= innerWidth + 0.5) return false;
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement)
          if (getComputedStyle(a).overflowX !== 'visible' && a.getBoundingClientRect().right <= innerWidth + 0.5) return false;
        return true;
      }).slice(0, 5).map(e => `${e.tagName}.${(e as HTMLElement).className}`),
    }));
    const check = (ok: boolean, msg: string) => { console.log(`${msg} ${ok ? 'OK' : 'FAIL'}`); if (!ok) fail.push(msg); };
    check(m.hash === '#read-173-1', `default route ${m.hash}`);
    check(m.scrollWidth === W, `scrollWidth ${m.scrollWidth}`);
    check(m.wideEls.length === 0, `no element past right edge ${m.wideEls.join(' ')}`);
    check(m.panels >= 30, `panels ${m.panels}`);
    check(m.lines === 49, `lines ${m.lines}`);
    check(m.bgl > 0, `background layers ${m.bgl}`);
    check(m.sd > 0 && m.brokenImg === 0, `chibi images ${m.sd}, broken ${m.brokenImg}`);
    check(!m.sekai, 'no sekai.best on page');
    check(m.paper, 'paper body in comic mode');
    check(errors.length === 0, `no page/network errors ${errors.join(' | ')}`);

    mkdirSync('scratch', { recursive: true });
    await page.screenshot({ path: 'scratch/layout-top.png' });
    const trans = await page.$('.comic .trans');
    if (trans) {
      await trans.scrollIntoViewIfNeeded();
      await page.evaluate(() => scrollBy(0, -200));
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'scratch/layout-scene2.png' });
    }
    await page.screenshot({ path: 'scratch/layout-full.png', fullPage: true });
    await mangaChecks(page, check);
    console.log('screenshots: scratch/layout-{top,scene2,full,bw}.png');
    await browser.close();
  } finally {
    try { process.kill(-server.pid!); } catch { /* already gone */ }
  }
  return fail.length ? 1 : 0;
}

type Check = (ok: boolean, msg: string) => void;

/** Logical rows: comic children minus .credit/.trans; split/pair containers count as one row. */
const ROWS_JS = `(() => {
  const kids = [...document.querySelector('.comic').children];
  return kids.map((el, i) => ({ el, i })).filter(({ el }) => !el.classList.contains('credit') && !el.classList.contains('trans'))
    .map(({ el, i }) => {
      const pns = el.classList.contains('pw') ? [el.querySelector(':scope > .pn')] : [...el.querySelectorAll(':scope > .pw > .pn')];
      const rs = pns.map(p => p.getBoundingClientRect());
      return { i, sceneStart: el.classList.contains('scene-start'), left: Math.min(...rs.map(r => r.left)), right: Math.max(...rs.map(r => r.right)),
        top: Math.min(...rs.map(r => r.top)) + scrollY, bottom: Math.max(...rs.map(r => r.bottom)) + scrollY,
        spans: rs.map(r => [r.left, r.right]) };
    });
})()`;

async function mangaChecks(page: Page, check: Check): Promise<void> {
  type Row = { i: number; sceneStart: boolean; left: number; right: number; top: number; bottom: number; spans: [number, number][] };
  const rows = await page.evaluate(ROWS_JS) as Row[];
  check(rows.every(r => Math.abs(r.left - MARGIN) <= 1 && Math.abs(r.right - (W - MARGIN)) <= 1), `side margins ${MARGIN}px on ${rows.length} rows`);
  const coverage = (spans: [number, number][]) => {
    const s = [...spans].sort((a, b) => a[0] - b[0]); let covered = 0, end = -Infinity;
    for (const [a, b] of s) { if (b > end) { covered += b - Math.max(a, end); end = b; } }
    return covered;
  };
  const sparse = rows.filter(r => coverage(r.spans) < (r.right - r.left) * 2 / 3 || (r.right - r.left) < (W - 2 * MARGIN) * 2 / 3);
  check(sparse.length === 0, `no row leaves more than a third empty (${sparse.length} sparse)`);

  const bub = await page.evaluate(() => {
    const bbs = [...document.querySelectorAll('.comic .bb')];
    const drawn = bbs.filter(b => b.querySelector('svg.bo')?.getAttribute('viewBox') && b.querySelector('svg.bo path, svg.bo circle, svg.bo rect')).length;
    const shoutD = [...document.querySelectorAll('.comic .bb-shout [data-role="body"]')].map(e => e.getAttribute('d'));
    const shapes = new Set(bbs.map(b => [...b.classList].find(c => c.startsWith('bb-'))));
    const outside: string[] = [];
    for (const bb of bbs) {
      const box = bb.closest('.pn, .inset') as HTMLElement; const br = box.getBoundingClientRect();
      const st = parseFloat(box.style.getPropertyValue('--st')) || 0, sb = parseFloat(box.style.getPropertyValue('--sb')) || 0;
      for (const g of bb.querySelectorAll('svg.bo path, svg.bo circle, svg.bo rect, svg.bo ellipse')) {
        const r = g.getBoundingClientRect(); const half = (parseFloat(g.getAttribute('stroke-width') || '0') || 0) / 2;
        if (r.left - half < br.left - 1 || r.right + half > br.right + 1 || r.top - half < br.top + st - 1 || r.bottom + half > br.bottom - sb + 1) {
          outside.push(bb.getAttribute('data-r')!); break;
        }
      }
    }
    return { total: bbs.length, drawn, shoutD, shapes: shapes.size, outside };
  });
  check(bub.total > 0 && bub.drawn === bub.total, `bubble outlines drawn ${bub.drawn}/${bub.total}`);
  check(bub.shapes >= 6, `bubble shapes ${bub.shapes} (>= 6)`);
  check(bub.shoutD.length >= 2 && new Set(bub.shoutD).size === bub.shoutD.length, `shout bubbles differ (${bub.shoutD.length})`);
  check(bub.outside.length === 0, `bubble outlines inside their frame (outside: ${bub.outside.join(',') || 'none'})`);

  // Seams: paint every panel a sentinel green with contents hidden, then read pixels between rows.
  await page.addStyleTag({ content: '.comic .pn { background: #00ff00 !important; background-image: none !important } .comic .pn > * { visibility: hidden !important } .comic .pn::before, .comic .pn::after { content: none !important }' });
  await page.waitForTimeout(100);
  const widths: { row: number; l: number; r: number }[] = [];
  for (let k = 1; k < rows.length; k++) {
    const up = rows[k - 1], dn = rows[k];
    if (dn.i !== up.i + 1 || dn.sceneStart) continue;
    const y0 = Math.floor(up.bottom - S - 6), y1 = Math.ceil(dn.top + S + 6);
    await page.evaluate(y => scrollTo(0, y), y0 - 100);
    const sy: number = await page.evaluate(() => window.scrollY);
    const png = await page.screenshot({ clip: { x: 0, y: y0 - sy, width: W, height: y1 - y0 } });
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number) => {
      const px = Math.round(x * DPR); let state = 'start', paper = 0;
      for (let y = 0; y < info.height; y++) {
        const o = (y * info.width + px) * info.channels, r = data[o], g = data[o + 1], b = data[o + 2];
        const green = g > 200 && r < 80 && b < 80;
        const isPaper = Math.abs(r - PAPER[0]) <= 3 && Math.abs(g - PAPER[1]) <= 3 && Math.abs(b - PAPER[2]) <= 3;
        if (state === 'start' && green) state = 'upper';
        else if (state === 'upper' && !green) state = 'gap';
        else if (state === 'gap') { if (green) return paper / DPR; if (isPaper) paper++; }
      }
      return NaN;
    };
    widths.push({ row: dn.i, l: at(MARGIN + 12), r: at(W - MARGIN - 12) });
  }
  const bad = widths.filter(w => !(Math.abs(w.l - w.r) <= 1 && Math.abs(w.l - G) <= 1 && Math.abs(w.r - G) <= 1));
  check(widths.length > 0 && bad.length === 0,
    `seams ${G}±1px at both ends (${widths.length} seams${bad.length ? '; bad: ' + bad.map(w => `#${w.row} ${w.l}/${w.r}`).join(' ') : ''})`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.comic .pw');

  const imp = await page.evaluate(() => {
    const pn = document.querySelector('.pn.impact') as HTMLElement | null;
    if (!pn) return null;
    pn.querySelector('.bgl')?.remove();
    const body = pn.querySelector('.bb [data-role="body"]');
    return { bg: getComputedStyle(pn).backgroundColor, fill: body ? getComputedStyle(body).fill : null, focus: !!pn.querySelector('.fx-focus') };
  });
  check(!!imp && imp.bg === 'rgb(11, 12, 16)' && imp.fill === 'rgb(255, 255, 255)' && imp.focus,
    `impact readable without background ${JSON.stringify(imp)}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.comic .pw');

  const chrome = await page.evaluate(() => ({
    headers: document.querySelectorAll('header').length,
    buttons: document.querySelectorAll('.site-header button').length,
    fixed: getComputedStyle(document.querySelector('.site-header')!).position,
    menuInside: (() => { const r = document.querySelector('.site-header .menu')!.getBoundingClientRect(); return r.right <= innerWidth && r.top >= 0; })(),
    // The first comic row must start below the fixed header, not under it.
    clear: (() => { scrollTo(0, 0); return document.querySelector('.comic .pw')!.getBoundingClientRect().top >= document.querySelector('.site-header')!.getBoundingClientRect().bottom; })(),
    stays: (() => { scrollTo(0, 3000); const t = document.querySelector('.site-header')!.getBoundingClientRect().top; scrollTo(0, 0); return t === 0; })(),
  }));
  check(chrome.headers === 1 && chrome.buttons === 1 && chrome.fixed === 'fixed' && chrome.menuInside && chrome.clear && chrome.stays,
    `one fixed site header with only the menu button ${JSON.stringify(chrome)}`);
  await page.click('button[aria-label="選單"]');
  await page.click('[aria-label="黑白"]');
  await page.waitForTimeout(200);
  const bw = await page.evaluate(() => {
    const bgl = [...document.querySelectorAll('.comic .bgl')].find(e => (e as HTMLElement).style.getPropertyValue('--blur')) as HTMLElement;
    const body = document.querySelector('.comic .bb [data-role="body"]');
    return { filter: bgl ? getComputedStyle(bgl).filter : '', fill: body ? getComputedStyle(body).fill : '', glyph: !!document.querySelector('.comic .glyph') };
  });
  check(bw.filter.includes('blur(') && bw.filter.includes('grayscale(') && bw.fill === 'rgb(255, 255, 255)' && bw.glyph,
    `black-and-white keeps blur and bubble colours ${JSON.stringify(bw)}`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'scratch/layout-bw.png' });
}

main().then(c => process.exit(c), e => { console.error(e); process.exit(1); });
