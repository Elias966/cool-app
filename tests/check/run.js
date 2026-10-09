// Prism module checker: everything about a module in one run.
//
//   npm run check -- <module id | all> [--devices desktop,phone,small,landscape,tablet,tabletLand | none]
//                    [--fuzz 300] [--ai] [--out <dir>]
//
// 1. Static rules: module.json, files, CSS class prefix, entrance animations
//    (backwards fill), the shared phone/tablet media queries.
// 2. Round trips: tests/check/specs/<id>.mjs (if there is one) encodes and
//    decodes its samples plus random text; every result must match exactly.
// 3. The module running for real: on desktop (electron/main.js in a hidden
//    window) and on emulated phones and tablets (the Android web build with a
//    fake native bridge). On each device: open it, wait for the intro, check
//    layout (sideways overflow, small touch targets), type into every text
//    box and press Enter, click every button, tab and switch, leave and come
//    back twice, and watch for errors, leaked timers, listeners and animation
//    loops, and stylesheets left behind. Screenshots go to the output folder.
//
// Everything runs in a throwaway user-data folder, so real history is never
// touched. The local AI is stubbed (it fails at once) unless --ai is given;
// then the models already downloaded in ~/.config/Prism/models are used.
'use strict';

// src/ modules are ES modules in .js files; Node's notice about that is noise here.
process.removeAllListeners('warning');

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const WWW = path.join(ROOT, 'android version', 'app', 'src', 'main', 'assets', 'www');

// ------------------------------------------------------------------ options
const argv = process.argv.slice(2).filter((a) => !a.startsWith('--inspect'));
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  argv.splice(i, v && !v.startsWith('--') ? 2 : 1);
  return v && !v.startsWith('--') ? v : true;
};
const DEVICE_LIST = String(flag('devices', 'desktop,phone,landscape,tablet')).split(',').filter((d) => d && d !== 'none');
const FUZZ = Number(flag('fuzz', 300));
const REAL_AI = Boolean(flag('ai', false));
const VERBOSE = Boolean(flag('verbose', false));
const step = (...a) => VERBOSE && console.log('   ·', ...a);
const OUT_ROOT = path.resolve(String(flag('out', path.join(os.tmpdir(), 'prism-check'))));
const target = argv[0] || 'all';

const DEVICES = {
  desktop: { width: 1320, height: 840 },
  phone: { width: 393, height: 852, mobile: true },
  small: { width: 360, height: 640, mobile: true },
  landscape: { width: 852, height: 393, mobile: true },
  tablet: { width: 800, height: 1280, mobile: true },
  tabletLand: { width: 1280, height: 800, mobile: true },
};
// The shared breakpoints every module's "phones and tablets" CSS uses.
const QUERIES = {
  phone: '(max-width: 599px), (max-width: 760px) and (orientation: portrait)',
  landscape: '(max-height: 520px) and (min-width: 600px)',
  keyboard: '(max-width: 760px) and (orientation: portrait) and (max-height: 560px)',
  touch: '(pointer: coarse)',
};
// Classes modules may style that aren't theirs (shell and body state).
const SHARED_CLASSES = new Set(['handheld', 'platform-android', 'platform-desktop', 'view', 'view-enter', 'view-leave', 'booted', 'maximized']);

// ------------------------------------------------------------------ report
const results = [];
let current = null;
const report = (level, check, detail = '') => current.items.push({ level, check, detail });
const pass = (c, d) => report('pass', c, d);
const warn = (c, d) => report('warn', c, d);
const fail = (c, d) => report('fail', c, d);

// ------------------------------------------------------------------ modules
function listModules() {
  const dir = path.join(SRC, 'modules');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'module.json')))
    .map((d) => ({ dir: d.name, path: path.join(dir, d.name), manifest: JSON.parse(fs.readFileSync(path.join(dir, d.name, 'module.json'), 'utf8')) }));
}

// ------------------------------------------------------------- 1. static rules
function staticChecks(mod) {
  const m = mod.manifest;
  const missing = ['id', 'name', 'description', 'icon', 'entry'].filter((k) => !m[k]);
  if (missing.length) fail('module.json', `missing ${missing.join(', ')}`);
  else pass('module.json', `${m.id} · ${m.name}`);
  if (m.id !== mod.dir) warn('module.json', `id "${m.id}" differs from the folder name "${mod.dir}"`);
  if (m.accent && !/^#[0-9a-f]{6}$/i.test(m.accent)) warn('module.json', `accent "${m.accent}" is not a #rrggbb colour`);
  const files = [m.entry, ...[].concat(m.style || []), /\.\w+$/.test(m.icon || '') ? m.icon : null].filter(Boolean);
  const absent = files.filter((f) => !fs.existsSync(path.join(mod.path, f)));
  if (absent.length) fail('files', `not found: ${absent.join(', ')}`);
  else pass('files', files.join(', '));

  const css = [].concat(m.style || []).map((f) => (fs.existsSync(path.join(mod.path, f)) ? fs.readFileSync(path.join(mod.path, f), 'utf8') : '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  if (!css.trim()) return warn('css', 'no stylesheet');
  // Class prefix: the module's own classes all start with one prefix (br-, cp-…).
  const classes = new Set();
  const scopes = []; // the classes of each selector (.br-cell .on → [br-cell, on])
  for (const [, list] of css.matchAll(/(?:^|[}{;])\s*([^{}@;]+)\{/g)) {
    for (const selector of list.split(',')) {
      const cls = [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((x) => x[1]);
      cls.forEach((c) => classes.add(c));
      if (cls.length) scopes.push(cls);
    }
  }
  const counts = {};
  for (const c of classes) counts[c.split('-')[0]] = (counts[c.split('-')[0]] || 0) + 1;
  const prefix = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  mod.prefix = prefix;
  // Other classes are fine inside a selector that has one of the module's own
  // (.dg-key.press, .br-cell .on); a selector with none of them could style anything.
  const own = (c) => c === prefix || c.startsWith(`${prefix}-`);
  const foreign = [...new Set(scopes.filter((cls) => !cls.some(own)).flat())].filter((c) => !SHARED_CLASSES.has(c));
  // A module's stylesheet is only on the page while it is open (checked live), so an
  // unscoped class can only clash with the shell's own classes.
  const shell = fs.readFileSync(path.join(SRC, 'core', 'styles.css'), 'utf8') + fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const clash = foreign.filter((c) => new RegExp(`[.\\s"']${c.replace(/[-]/g, '\\-')}\\b`).test(shell));
  if (clash.length) warn('css prefix', `selectors without a ${prefix}- class use the shell's classes too: ${clash.join(' ')}`);
  else pass('css prefix', `scoped to ${prefix}-${foreign.length ? ` (${foreign.length} unprefixed classes, none used by the shell: ${foreign.slice(0, 5).join(' ')}${foreign.length > 5 ? ' …' : ''})` : ''}`);
  // House rule: entrance animations use backwards fill (forwards/both lock transform and break hover tilt).
  // (exit animations, named …Out/Leave/Exit/Hide, rightly keep their last frame)
  const locked = [...css.matchAll(/animation(?:-fill-mode)?\s*:[^;{}]*\b(forwards|both)\b[^;{}]*/g)]
    .map((x) => x[0].trim())
    .filter((a) => !/(out|leave|exit|hide|gone)\b/i.test(a.split(/\s+/)[1] || ''))
    .map((a) => a.slice(0, 70));
  if (locked.length) warn('animation fill', `${locked.length} use forwards/both (house rule: backwards): ${locked.slice(0, 3).join(' | ')}`);
  else pass('animation fill', 'no forwards/both fills');
  const missingQ = Object.entries(QUERIES).filter(([, q]) => !css.includes(q)).map(([k]) => k);
  if (missingQ.length) warn('phone css', `no ${missingQ.join(', ')} media query (see README: Phones and tablets)`);
  else pass('phone css', 'phone, landscape, keyboard-open and touch queries present');
}

// ------------------------------------------------------------ 2. round trips
const POOL = ['Hello', 'world', 'I', 'love', 'Quick', 'brown', 'fox', 'café', 'naïve', 'ÉCOLE', '5pm', '42', '3.14', '!', '?', '.', ',', ':', ';', '"', "'", '(x)', '  ', '\n', '\t', '😀', '🍕', '❤️', '👍🏽', 'a/b', '#tag', '@me', '$9', '100%', '&', '日本', 'ありがとう', 'Ünïcödé', 'x', 'HI', 'hi'];
function randomText(rand) {
  const n = 1 + Math.floor(rand() * 9);
  return Array.from({ length: n }, () => POOL[Math.floor(rand() * POOL.length)]).join(rand() < 0.7 ? ' ' : '');
}
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
}
async function roundTrips(mod) {
  const file = path.join(__dirname, 'specs', `${mod.dir}.mjs`);
  if (!fs.existsSync(file)) return warn('round trip', `no spec (tests/check/specs/${mod.dir}.mjs): only the UI is checked`);
  const spec = (await import(pathToFileURL(file).href)).default;
  for (const [name, roundTrip] of Object.entries(spec.cases)) {
    const rand = seeded(name.length * 7919);
    const inputs = [...(spec.samples || []), ...Array.from({ length: spec.fuzz ?? FUZZ }, () => (spec.generate || randomText)(rand))];
    const bad = [];
    for (const text of inputs) {
      let got;
      try {
        got = await roundTrip(text, rand);
      } catch (err) {
        got = `✗ ${err.message}`;
      }
      if (got !== text) bad.push(`${JSON.stringify(text)} → ${JSON.stringify(got)}`);
    }
    if (bad.length) fail(`round trip: ${name}`, `${bad.length}/${inputs.length} differ, e.g. ${bad.slice(0, 3).join(' | ')}`);
    else pass(`round trip: ${name}`, `${inputs.length}/${inputs.length} exact`);
  }
}

// ---------------------------------------------------------- 3. live checks
// Injected into the page before the module opens: dialog stubs and leak counters.
const INSTRUMENT = `(() => {
  if (window.__check) return;
  window.alert = () => {}; window.confirm = () => true; window.prompt = () => '';
  // The real clipboard from a hidden window can crash Electron on X11: record copies instead.
  // (Phones go through the fake native bridge, which records them.)
  window.__copied = [];
  if (!window.AndroidBridge) try {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (t) => { window.__copied.push(String(t)); }, write: async () => { window.__copied.push('[image]'); },
      readText: async () => '', read: async () => [] } });
  } catch {}
  document.execCommand = () => true;
  const timers = new Map();
  const listeners = new Map();
  const C = window.__check = { tracking: false, timers, listeners, frames: 0 };
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function (...a) { const id = si.apply(this, a); if (C.tracking) timers.set(id, new Error().stack.split('\\n')[2] || ''); return id; };
  window.clearInterval = function (id) { timers.delete(id); return ci.call(this, id); };
  for (const target of [window, document]) {
    const add = target.addEventListener, rm = target.removeEventListener;
    const name = target === window ? 'window' : 'document';
    target.addEventListener = function (type, fn, opts) {
      if (C.tracking && fn) listeners.set(fn, name + ':' + type + ' @ ' + ((new Error().stack.split('\\n')[2] || '').trim().replace(/^at /, '').replace(/https?:\\/\\/[^/]+|app:\\/\\/prism/, '')));
      return add.call(this, type, fn, opts);
    };
    target.removeEventListener = function (type, fn, opts) { listeners.delete(fn); return rm.call(this, type, fn, opts); };
  }
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (fn) { C.frames++; return raf.call(this, fn); };
})()`;

// In-page helpers (run with executeJavaScript).
const LAYOUT = (touch) => `(() => {
  const W = innerWidth; const bad = [];
  for (const el of document.querySelectorAll('.view *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || getComputedStyle(el).position === 'fixed' || (r.right <= W + 1 && r.left >= -1)) continue;
    let p = el.parentElement, clipped = false;
    while (p && p !== document.body) {
      const s = getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(s.overflowX) && !p.classList.contains('view')) { const pr = p.getBoundingClientRect(); if (pr.right <= W + 1 && pr.left >= -1) { clipped = true; break; } }
      p = p.parentElement;
    }
    if (!clipped) bad.push(el.tagName.toLowerCase() + '.' + [...el.classList].join('.'));
  }
  const v = document.querySelector('.view');
  const scrolls = document.documentElement.scrollWidth > W + 1 || (v && v.scrollLeft !== 0) || (v && /(auto|scroll)/.test(getComputedStyle(v).overflowX) && v.scrollWidth > v.clientWidth + 1);
  const small = ${touch} ? [...new Set([...document.querySelectorAll('.view button, .view [role=tab], .view [role=radio]')].filter((b) => {
    const w = b.offsetWidth, h = b.offsetHeight; return w && h && (w < 32 || h < 32) && getComputedStyle(b).visibility !== 'hidden' && !b.closest('[class*="-out"], [class*="leave"]');
  }).map((b) => [...b.classList].join('.') || b.tagName.toLowerCase()))] : [];
  return { overflow: [...new Set(bad)], scrolls, docW: document.documentElement.scrollWidth, W, small };
})()`;
const CLICKABLES = `(() => [...document.querySelectorAll('.view button, .view [role=tab], .view [role=radio], .view summary, .view input[type=checkbox], .view [data-act]')]
  .filter((el, i, all) => all.indexOf(el) === i && !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]'))
  .map((el) => (el.dataset.act || el.dataset.mode || el.dataset.style || el.getAttribute('aria-label') || el.title || el.textContent || el.className).toString().trim().replace(/\\s+/g, ' ').slice(0, 28)))()`;
const CLICK = (i) => `(() => { const els = [...document.querySelectorAll('.view button, .view [role=tab], .view [role=radio], .view summary, .view input[type=checkbox], .view [data-act]')]
  .filter((el, k, all) => all.indexOf(el) === k && !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]'));
  const el = els[${i}]; if (!el) return false; el.scrollIntoView({ block: 'nearest' }); el.click(); return true; })()`;
const TYPE = (text) => `(() => { let n = 0; for (const el of document.querySelectorAll('.view textarea, .view input[type=text], .view input:not([type])')) {
  if (!el.getClientRects().length || el.disabled || el.readOnly || el.closest('[hidden]')) continue;
  el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })); n++; } return n; })()`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function screenshot(wc, file) {
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    const { data } = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  } catch {
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
  }
}

async function liveChecks(mod, device, wc, out) {
  const touch = Boolean(DEVICES[device].mobile);
  const errors = [];
  // (Electron passes one event object now; older versions passed level and message separately.)
  const onConsole = (e, oldLevel, oldMessage) => {
    const level = e.level ?? oldLevel;
    const msg = String(e.message ?? oldMessage ?? '');
    if ((level === 'error' || level === 3) && !/AI stubbed|Failed to fetch|ERR_BLOCKED|huggingface|Autofill/i.test(msg)) errors.push(msg.slice(0, 240));
  };
  wc.on('console-message', onConsole);
  const js = (code) => wc.executeJavaScript(code, true);
  const tag = `[${device}]`;
  try {
    step(`${device}: instrument`);
    await js(INSTRUMENT);
    // Leaving means going Home; for Home itself, to the first module.
    const away = mod.home ? listModules().sort((a, b) => (a.manifest.order ?? 100) - (b.manifest.order ?? 100))[0].manifest.id : 'home';
    await js(`location.hash = '#/${away}'`);
    await wait(1500);
    const baseFrames = await js(`(async () => { const a = __check.frames; await new Promise((r) => setTimeout(r, 1000)); return __check.frames - a; })()`);
    await js(`__check.tracking = true; location.hash = '#/${mod.manifest.id}'`);
    // Open: wait for the module and its intro (a "<prefix>-ready" class), at most 9 s.
    const t0 = Date.now();
    let ready = false;
    while (Date.now() - t0 < 9000) {
      ready = await js(`(() => { const v = document.querySelector('.view[data-view="${mod.manifest.id}"]'); return v ? (/\\b[a-z0-9]+-ready\\b/.test(v.className) ? 'ready' : 'open') : false; })()`);
      if (ready === 'ready' || (mod.home && ready === 'open')) break; // Home has no intro
      await wait(200);
    }
    if (!ready) fail(`${tag} open`, 'the module never appeared');
    else pass(`${tag} open`, `${ready === 'ready' ? 'intro done' : 'open (no -ready class)'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await wait(600);
    const failed = await js(`!!document.querySelector('.module-error')`);
    if (failed) fail(`${tag} mount`, await js(`document.querySelector('.module-error pre')?.textContent`));
    step(`${device}: screenshot`);
    await screenshot(wc, path.join(out, `${device}-1-open.png`));
    step(`${device}: layout`);

    const layout = async (when) => {
      const l = await js(LAYOUT(touch));
      if (l.scrolls) fail(`${tag} layout ${when}`, `the page scrolls sideways: ${l.overflow.slice(0, 6).join(' ')} (page ${l.docW}px wide, screen ${l.W}px)`);
      else if (l.overflow.length) warn(`${tag} layout ${when}`, `sticks out past the edge (clipped, no sideways scroll): ${l.overflow.slice(0, 6).join(' ')}`);
      else pass(`${tag} layout ${when}`, 'nothing sticks out sideways');
      if (l.small.length) warn(`${tag} touch targets ${when}`, `under 32px: ${l.small.slice(0, 8).join(' ')}`);
    };
    await layout('at open');

    // Use it: type and press Enter in every text box, click everything, type again.
    const typed = await js(TYPE('Hello World 123'));
    await wait(2500);
    const labels = await js(CLICKABLES);
    let clicked = 0;
    for (let i = 0; i < Math.min(labels.length, 80); i++) {
      const hash = await js('location.hash');
      if (!hash.includes(mod.manifest.id)) {
        await js(`location.hash = '#/${mod.manifest.id}'`);
        await wait(2500);
      }
      step(`${device}: click ${i} ${labels[i]}`);
      if (await js(CLICK(i))) clicked++;
      await wait(260);
    }
    await wait(800);
    const typed2 = await js(TYPE('Second try, ÉCOLE 😀'));
    await wait(2500);
    pass(`${tag} use`, `typed into ${typed + typed2} box(es), clicked ${clicked} of ${labels.length} controls`);
    await layout('after use');
    await screenshot(wc, path.join(out, `${device}-2-used.png`));

    // Leave and come back twice; then leave and look for leftovers.
    for (let k = 0; k < 2; k++) {
      await js(`location.hash = '#/${away}'`);
      await wait(1200);
      await js(`location.hash = '#/${mod.manifest.id}'`);
      await wait(3000);
    }
    await js(`location.hash = '#/${away}'`);
    await wait(2000);
    const left = await js(`(async () => {
      __check.tracking = false;
      const a = __check.frames; await new Promise((r) => setTimeout(r, 1000));
      return { timers: [...__check.timers.values()], listeners: [...__check.listeners.values()], frames: __check.frames - a,
        styles: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href')).filter((h) => h && h.includes('/modules/${mod.dir}/')) };
    })()`);
    if (left.timers.length) fail(`${tag} cleanup`, `${left.timers.length} setInterval still running after leaving: ${left.timers.slice(0, 2).join(' | ')}`);
    else pass(`${tag} cleanup`, 'no intervals left running');
    // Only the module's own listeners count (the shell keeps some on purpose, and home adds its own).
    const own = left.listeners.filter((l) => l.includes(mod.home ? '/core/home.js' : `/modules/${mod.dir}/`) || (mod.home && l.includes('/core/translate.js')));
    if (own.length) warn(`${tag} listeners`, `${own.length} window/document listeners left behind: ${[...new Set(own)].slice(0, 6).join(' ')}`);
    else pass(`${tag} listeners`, 'no window/document listeners left behind');
    if (left.frames > baseFrames + 40) warn(`${tag} animation`, `${left.frames - baseFrames} more animation frames per second after leaving (a loop still running?)`);
    if (left.styles.length) fail(`${tag} styles`, `stylesheet still on the page after leaving: ${left.styles.join(' ')}`);
    if (touch) {
      const log = await js('window.__checkBridgeLog ? window.__checkBridgeLog() : null');
      if (log) pass(`${tag} android bridge`, `${log.haptics.length} haptics, ${log.shared.length} shares, ${log.copied.length} copies`);
    }
  } catch (err) {
    fail(`${tag} run`, err.message);
  }
  wc.off('console-message', onConsole);
  if (errors.length) fail(`${tag} errors`, `${errors.length} console error(s): ${[...new Set(errors)].slice(0, 4).join(' | ')}`);
  else pass(`${tag} errors`, 'no console errors');
}

// ------------------------------------------------------------------ windows
let server = null;
function serveAndroid() {
  if (server) return server.address().port;
  const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.png': 'image/png' };
  // index.html, modules.json and android/ come from the Android web build; the rest from src/ live.
  const fileFor = (u) => (u === '/index.html' || u === '/modules.json' || u.startsWith('/android/') ? path.join(WWW, u) : path.join(SRC, u));
  server = http.createServer((q, r) => {
    let u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (u === '/') u = '/index.html';
    fs.readFile(fileFor(u), (e, d) => {
      if (e) return void (r.writeHead(404), r.end());
      r.writeHead(200, { 'content-type': types[path.extname(u)] || 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' });
      r.end(d);
    });
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res(server.address().port)));
}

async function deviceWindow(device) {
  const d = DEVICES[device];
  const win = new BrowserWindow({
    show: false, width: d.width, height: d.height, useContentSize: true, backgroundColor: '#05060a',
    webPreferences: { preload: path.join(__dirname, 'android-shim.js'), sandbox: true, contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  const wc = win.webContents;
  wc.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Prism/check');
  const port = await serveAndroid();
  await wc.loadURL(`http://127.0.0.1:${port}/index.html#/home`);
  // Touch and media emulation, then a reload so the app starts up as on a phone.
  // (The window's own size is the viewport: Emulation.setDeviceMetricsOverride
  // hangs on hidden windows on Linux, so it isn't used.)
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }, { name: 'any-hover', value: 'none' }, { name: 'any-pointer', value: 'coarse' }] });
  wc.reload();
  await new Promise((r) => wc.once('did-finish-load', r));
  await wait(2500);
  return win;
}

// --------------------------------------------------------------------- main
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-check-data-'));
app.setPath('userData', TMP);
if (REAL_AI) {
  const models = path.join(os.homedir(), '.config', 'Prism', 'models');
  if (fs.existsSync(models)) fs.symlinkSync(models, path.join(TMP, 'models'));
}
app.on('browser-window-created', (_e, w) => {
  w.show = () => {}; // everything stays hidden
  w.webContents.setBackgroundThrottling(false);
});
require(path.join(ROOT, 'electron', 'main.js'));
if (!REAL_AI) {
  ipcMain.removeAllListeners('ai');
  ipcMain.on('ai', (_e, msg) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('ai:event', { type: 'error', id: msg && msg.id, message: 'AI stubbed by the checker' });
  });
}

app.whenReady().then(async () => {
  const { session } = require('electron');
  // Phones would download their AI model from Hugging Face: blocked (stubbed) here.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*.huggingface.co/*', '*://huggingface.co/*', '*://*.hf.co/*'] }, (_d, cb) => cb({ cancel: !REAL_AI }));
  session.defaultSession.on('will-download', (_e, item) => item.setSavePath(path.join(OUT_ROOT, 'downloads', item.getFilename())));
  await wait(3500);
  const desktop = BrowserWindow.getAllWindows()[0];
  // "home" is the launcher with the universal translator; "all" includes it.
  const HOME = { dir: 'home', home: true, path: path.join(SRC, 'core'), manifest: { id: 'home', name: 'Home (universal translator)' } };
  const mods = [...listModules(), HOME].filter((m) => target === 'all' || m.dir === target || m.manifest.id === target);
  if (!mods.length) {
    console.error(`No module "${target}". Modules: ${listModules().map((m) => m.dir).join(', ')}`);
    app.exit(2);
    return;
  }
  const devices = {};
  for (const mod of mods) {
    current = { module: mod.dir, items: [] };
    results.push(current);
    const out = path.join(OUT_ROOT, mod.dir);
    fs.mkdirSync(out, { recursive: true });
    console.log(`\n■ ${mod.manifest.name} (${mod.dir}) …`);
    if (!mod.home) staticChecks(mod);
    step('static checks done');
    await roundTrips(mod);
    step('round trips done');
    for (const device of DEVICE_LIST) {
      if (!DEVICES[device]) {
        warn('devices', `unknown device "${device}" (${Object.keys(DEVICES).join(', ')})`);
        continue;
      }
      step(`${device}: window`);
      const win = device === 'desktop' ? desktop : (devices[device] ??= await deviceWindow(device));
      await liveChecks(mod, device, win.webContents, out);
    }
    for (const it of current.items) console.log(`  ${{ pass: '✓', warn: '!', fail: '✗' }[it.level]} ${it.check.padEnd(30)} ${it.detail}`);
    console.log(`  screenshots: ${out}`);
  }
  const all = results.flatMap((r) => r.items);
  const n = (l) => all.filter((i) => i.level === l).length;
  console.log(`\n${n('fail') ? '✗' : '✓'} ${results.length} module(s): ${n('pass')} passed, ${n('warn')} warnings, ${n('fail')} failed`);
  fs.writeFileSync(path.join(OUT_ROOT, 'report.json'), JSON.stringify(results, null, 1));
  console.log(`report: ${path.join(OUT_ROOT, 'report.json')}`);
  server?.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  app.exit(n('fail') ? 1 : 0);
});
