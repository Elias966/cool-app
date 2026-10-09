// Serves the Android web build like MainActivity does and screenshots it on phone/tablet sizes.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
// Serves src/ live (so CSS edits need no rebuild); index.html, modules.json and
// android/* come from the last `node scripts/android.js` build.
const WWW = decodeURIComponent(new URL('../../android version/app/src/main/assets/www', import.meta.url).pathname);
const SRC = decodeURIComponent(new URL('../../src', import.meta.url).pathname);
const OUT = process.env.OUT || decodeURIComponent(new URL('./out/', import.meta.url).pathname);
fs.mkdirSync(OUT, { recursive: true });
const fileFor = (u) => (u === '/index.html' || u === '/modules.json' || u.startsWith('/android/') ? path.join(WWW, u) : path.join(SRC, u));
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (u === '/') u = '/index.html';
  fs.readFile(fileFor(u), (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': types[path.extname(u)] || 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' });
    r.end(d);
  });
}).listen(0);
const port = srv.address().port;
const devices = {
  phone: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 800, height: 1280 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true },
  tabletLand: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true },
};
const which = (process.argv[2] || 'phone').split(',');
const mods = (process.argv[3] || 'home,braille,base64,dingbats,ancient,esolang,layers,japanese,cipher').split(',');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const errors = [];
for (const d of which) {
  const ctx = await browser.newContext({ ...devices[d], userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Prism/test' });
  await ctx.addInitScript(() => {
    window.__haptics = []; window.__shared = [];
    window.AndroidBridge = {
      insets: () => JSON.stringify({ top: 24, right: 0, bottom: 20, left: 0 }),
      copyText: (t) => { window.__copied = t; return true; },
      shareFile: (n, m, b, t) => { window.__shared.push(n); return true; },
      haptic: (k) => window.__haptics.push(k),
      openUrl: (u) => { window.__opened = u; },
      appVersion: () => 'test',
    };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${d}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${d} console: ${m.text().slice(0, 200)}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${d} ${r.status()} ${r.url()}`));
  let first = true;
  for (const m of mods) {
    if (first) await page.goto(`http://localhost:${port}/index.html#/${m}`);
    else await page.evaluate((m) => (location.hash = `#/${m}`), m);
    first = false;
    await page.waitForTimeout(m === 'home' ? 2500 : 4500);
    const over = await page.evaluate(() => {
      const W = innerWidth; const bad = [];
      for (const el of document.querySelectorAll('.view *')) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > W + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed') {
          let p = el.parentElement, clipped = false;
          while (p && p !== document.body) { const s = getComputedStyle(p); if (/(hidden|auto|scroll|clip)/.test(s.overflowX) && !p.classList.contains('view')) { const pr = p.getBoundingClientRect(); if (pr.right <= W + 1 && pr.left >= -1) { clipped = true; break; } } p = p.parentElement; }
          if (!clipped) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(r.left)}..${Math.round(r.right)}`);
        }
      }
      const v = document.querySelector('.view');
      const small = [...document.querySelectorAll('.view button, .view [role=tab], .view [role=radio], .dock-btn, #sound-btn')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.height && (r.width < 32 || r.height < 32) && getComputedStyle(b).visibility !== 'hidden'; }).map((b) => `${[...b.classList].join('.')}(${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)})`);
      return { bad: bad.slice(0, 12), nBad: bad.length, docW: document.documentElement.scrollWidth, scrollH: v?.scrollHeight, small: [...new Set(small)].slice(0, 15) };
    });
    console.log(`[${d}/${m}] overflow:${over.nBad} docW:${over.docW} viewScrollH:${over.scrollH}`, over.bad.join(' | '), over.small.length ? `\n   small targets: ${over.small.join(' ')}` : '');
    await page.screenshot({ path: `${OUT}${d}-${m}.png` });
  }
  await ctx.close();
}
console.log('errors:', errors.slice(0, 20));
await browser.close(); srv.close();
