// Usage: npx tsx scripts/build_share_images.ts  — renders static/og.png (1200×630 share preview) and
// static/apple-touch-icon.png (180×180) from HTML in headless Chromium, so the site fonts (Google Fonts) apply.
// Original artwork only: no game assets. Needs CHROME_PATH or a Chromium in ~/.cache/ms-playwright.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const INK = '#2e3a48', PAPER = '#fcfcfa', MUTED = '#78828d';
const UNIT_COLORS = ['#4455dd', '#88dd44', '#ee1166', '#ff9900', '#884499'];
const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=LXGW+WenKai+TC:wght@400;700&display=block';

function chrome(): string {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  for (const d of existsSync(cache) ? readdirSync(cache).filter(d => d.startsWith('chromium-')).sort().reverse() : []) {
    const p = join(cache, d, 'chrome-linux64', 'chrome');
    if (existsSync(p)) return p;
  }
  throw new Error('Chromium not found: set CHROME_PATH');
}

// A bubble: rounded box with a tail and grey bars standing in for text (no dialogue on purpose).
const bubble = (x: number, y: number, w: number, h: number, bars: number[], tailLeft = true) => `
  <g transform="translate(${x} ${y})">
    <path d="M${tailLeft ? 28 : w - 52} ${h - 2} l${tailLeft ? -14 : 30} 26 l${tailLeft ? 34 : 6} -26" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2.6}" fill="#fff" stroke="${INK}" stroke-width="4"/>
    <rect x="${tailLeft ? 16 : w - 50}" y="${h - 6}" width="36" height="8" fill="#fff"/>
    ${bars.map((b, i) => `<rect x="24" y="${22 + i * 22}" width="${b}" height="9" rx="4.5" fill="#c9ced4"/>`).join('')}
  </g>`;

const OG = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: ${PAPER}; color: ${INK}; font-family: "LXGW WenKai TC", serif; position: relative; overflow: hidden; }
  .copy { position: absolute; left: 80px; top: 92px; width: 560px; }
  .kicker { font-family: "IBM Plex Mono", monospace; font-weight: 500; font-size: 22px; letter-spacing: .14em; color: ${MUTED}; }
  h1 { margin-top: 26px; font-weight: 700; font-size: 78px; line-height: 1.15; letter-spacing: .01em; }
  h1 .en { font-family: "IBM Plex Mono", monospace; font-weight: 700; letter-spacing: .02em; display: block; font-size: 84px; }
  .sub { margin-top: 30px; font-size: 31px; line-height: 1.55; color: #46525f; }
  .dots { position: absolute; left: 80px; bottom: 74px; display: flex; gap: 12px; align-items: center; }
  .dots i { width: 16px; height: 16px; border-radius: 50%; display: block; }
  .dots span { margin-left: 14px; font-family: "IBM Plex Mono", monospace; font-size: 20px; color: ${MUTED}; letter-spacing: .04em; }
  svg { position: absolute; right: 0; top: 0; }
</style></head><body>
  <div class="copy">
    <p class="kicker">TC EVENT STORIES</p>
    <h1><span class="en">SEKAI</span>劇情閱讀器</h1>
    <p class="sub">《世界計畫》台服活動劇情，<br>改編成手機直讀的條漫。</p>
  </div>
  <div class="dots">${UNIT_COLORS.map(c => `<i style="background:${c}"></i>`).join('')}<span>非官方粉絲專案</span></div>
  <svg width="520" height="630" viewBox="0 0 520 630">
    <g transform="rotate(4 300 315)">
      <rect x="60" y="-40" width="420" height="720" fill="#fff" stroke="${INK}" stroke-width="5"/>
      <polygon points="84,-10 456,-10 456,170 84,198" fill="#e8edf3" stroke="${INK}" stroke-width="5"/>
      <polygon points="84,218 262,204 262,420 84,420" fill="#f4ecdc" stroke="${INK}" stroke-width="5"/>
      <polygon points="282,202 456,190 456,420 282,420" fill="#eef1f4" stroke="${INK}" stroke-width="5"/>
      <polygon points="84,440 456,440 456,660 84,660" fill="#e8edf3" stroke="${INK}" stroke-width="5"/>
      ${bubble(118, 26, 250, 88, [190, 140])}
      ${bubble(104, 252, 140, 76, [96, 64])}
      ${bubble(298, 262, 140, 76, [90, 70], false)}
      ${bubble(150, 478, 270, 92, [210, 150])}
    </g>
  </svg>
</body></html>`;

const ICON = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}">
<style>* { margin: 0; } body { width: 180px; height: 180px; background: ${PAPER}; display: grid; place-items: center; }
  .ring { width: 132px; height: 132px; border-radius: 50%; border: 12px solid ${INK}; box-sizing: border-box; display: grid; place-items: center;
    font-family: "IBM Plex Mono", monospace; font-weight: 700; font-size: 78px; color: ${INK}; line-height: 1; padding-bottom: 6px; }</style>
</head><body><div class="ring">S</div></body></html>`;

const browser = await chromium.launch({ executablePath: chrome() });
for (const [html, w, h, out] of [[OG, 1200, 630, 'static/og.png'], [ICON, 180, 180, 'static/apple-touch-icon.png']] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: 'png' });
  console.log(out);
}
await browser.close();
