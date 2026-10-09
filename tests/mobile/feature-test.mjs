import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const WWW = decodeURIComponent(new URL('../../android version/app/src/main/assets/www', import.meta.url).pathname), SRC = decodeURIComponent(new URL('../../src', import.meta.url).pathname);
const fileFor = (u) => (u === '/index.html' || u === '/modules.json' || u.startsWith('/android/') ? path.join(WWW, u) : path.join(SRC, u));
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let u = decodeURIComponent(new URL(q.url, 'http://x').pathname); fs.readFile(fileFor(u), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(u)] || 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }); r.end(d); }); }).listen(0);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  window.__h = []; window.__shared = []; window.__prismSoundLog = [];
  window.AndroidBridge = { insets: () => '{"top":24,"right":0,"bottom":20,"left":0}', copyText: (t) => { window.__copied = t; return true; }, shareFile: (n, m, b) => { window.__shared.push([n, m, b.length]); return true; }, haptic: (k) => window.__h.push(k), openUrl: (u) => (window.__opened = u), appVersion: () => 't' };
});
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const port = srv.address().port;
await page.goto(`http://localhost:${port}/index.html#/home`);
await page.waitForTimeout(2500);
const ev = (f) => page.evaluate(f);
console.log('platform/body:', await ev(() => [window.prism.platform, document.body.className, getComputedStyle(document.documentElement).getPropertyValue('--safe-top')]));
console.log('home cards:', await ev(() => document.querySelectorAll('.mcard').length), 'add card:', await ev(() => !!document.querySelector('.mcard-add')), 'dock btns:', await ev(() => document.querySelectorAll('.dock-btn').length));
console.log('back on home ->', await ev(() => window.prismBack()));
await page.tap('.mcard >> nth=1'); await page.waitForTimeout(3500);
console.log('hash after tap:', await ev(() => location.hash), 'haptics:', await ev(() => window.__h.join(',')));
console.log('focused after intro:', await ev(() => document.activeElement.tagName));
await page.tap('.b64-input'); await page.keyboard.type('hello phone');
console.log('focused after tap:', await ev(() => document.activeElement.className));
await page.tap('.b64-send'); await page.waitForTimeout(2500);
console.log('sounds:', await ev(() => [...new Set(window.__prismSoundLog)].join(',')));
const copyBtn = await page.$('[data-act="copy"], .b64-card [data-act*="copy"]');
if (copyBtn) { await copyBtn.tap(); await page.waitForTimeout(400); console.log('copied via bridge:', await ev(() => window.__copied)); } else console.log('no copy btn');
// sound panel + back
await page.tap('#sound-btn'); await page.waitForTimeout(300);
console.log('haptics chip visible:', await ev(() => !document.querySelector('[data-sound="haptics"]').hidden), 'typing default:', await ev(() => document.querySelector('[data-sound="typing"]').getAttribute('aria-pressed')));
console.log('back closes panel ->', await ev(() => window.prismBack()), await ev(() => document.getElementById('sound-pop').hidden));
console.log('back goes home ->', await ev(() => window.prismBack())); await page.waitForTimeout(1200);
console.log('hash:', await ev(() => location.hash));
// cipher key card share
await page.evaluate(() => (location.hash = '#/cipher')); await page.waitForTimeout(7000);
console.log('save btn present:', await ev(() => !!document.querySelector('[data-card="save"]')));
const card = await page.$('[data-card="copy"]');
if (card) { await card.click({ force: true }); await page.waitForTimeout(1500); console.log('shared:', JSON.stringify(await ev(() => window.__shared))); }
console.log('errors:', errs);
await browser.close(); srv.close();
