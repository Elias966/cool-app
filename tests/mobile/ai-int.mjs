// Integrated AI test of the Android build: braille "Braille Quest" on an emulated phone.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(process.env.PW_MODULES || '/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const WWW = decodeURIComponent(new URL('../../android version/app/src/main/assets/www', import.meta.url).pathname);
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let u = decodeURIComponent(new URL(q.url, 'http://x').pathname); fs.readFile(path.join(WWW, u), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(u)] || 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' }); r.end(d); }); }).listen(0);
const ctx = await chromium.launchPersistentContext(decodeURIComponent(new URL('./ai-profile', import.meta.url).pathname), { executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, args: ['--disable-gpu'] });
await ctx.addInitScript(() => { window.AndroidBridge = { insets: () => '{"top":24,"right":0,"bottom":20,"left":0}', copyText: () => true, shareFile: () => true, haptic: () => {}, openUrl: () => {}, appVersion: () => 't' }; });
const page = ctx.pages()[0] || await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
page.on('console', (m) => (m.type() === 'error' || m.text().includes('[ai]')) && console.log('CONSOLE', m.text().slice(0, 300)));
await page.goto(`http://localhost:${srv.address().port}/index.html#/braille`);
await page.waitForTimeout(5000);
console.log('isolated:', await page.evaluate(() => crossOriginIsolated), 'spec label:', await page.evaluate(async () => (await import('/modules/braille/ai-modes.js')).AI_LABEL));
await page.tap('.br-mode [data-mode="quest"]');
const t0 = Date.now();
let last = '';
for (let i = 0; i < 400; i++) {
  await page.waitForTimeout(3000);
  const st = await page.evaluate(() => ({ s: document.querySelector('.br-ai-status')?.dataset.state, l: document.querySelector('.br-ai-label')?.textContent }));
  const line = `${st.s} | ${st.l}`;
  if (line !== last) { console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`, line); last = line; }
  if (st.s === 'ready' || st.s === 'error') break;
}
await page.tap('.br-input');
await page.fill('.br-input', 'dragon');
const t1 = Date.now();
await page.tap('.br-send');
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(2000);
  const done = await page.evaluate(() => !document.querySelector('.br-generating') && document.querySelector('.br-card-ai .br-ai-text')?.textContent.length > 0);
  if (done) break;
}
console.log(`generated in ${((Date.now() - t1) / 1000).toFixed(1)}s:`, await page.evaluate(() => document.querySelector('.br-card-ai .br-ai-text')?.textContent));
await page.screenshot({ path: decodeURIComponent(new URL('./out/ai-phone.png', import.meta.url).pathname) });
await ctx.close(); srv.close();
