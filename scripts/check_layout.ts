// Usage: npm run check:layout  — builds, serves dist with `vite preview`, and checks the default page at phone width.
// Requires assets/public (npm run build:episode event_173_01) and a local Chromium (CHROME_PATH or the playwright cache).
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 4179;
const W = 390, H = 844;

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
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
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
    console.log('screenshots: scratch/layout-{top,scene2,full}.png');
    await browser.close();
  } finally {
    try { process.kill(-server.pid!); } catch { /* already gone */ }
  }
  return fail.length ? 1 : 0;
}

main().then(c => process.exit(c), e => { console.error(e); process.exit(1); });
