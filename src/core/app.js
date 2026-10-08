import { createScene } from './scene.js';
import { fx } from './fx.js';
import { discoverModules, mountModule } from './modules.js';
import { renderHome } from './home.js';
import { createAI } from './ai.js';

const DEFAULT_ACCENT = '#7c5cff';
const stage = document.getElementById('stage');
const dock = document.getElementById('dock');
const crumb = document.getElementById('crumb');

const scene = createScene(document.getElementById('bg'));
let modules = [];
let current = { id: null, cleanup: null };
let navToken = 0;

// ---------------------------------------------------------------------------
// Shared helpers handed to modules
// ---------------------------------------------------------------------------
function toast(message, { type = 'info', duration = 2200 } = {}) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

function storageFor(id) {
  const prefix = `prism:${id}:`;
  return {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        /* storage full or unavailable */
      }
    },
    remove(key) {
      localStorage.removeItem(prefix + key);
    },
  };
}

function makeContext(meta) {
  return {
    meta,
    scene,
    fx,
    toast,
    ai: createAI(),
    storage: storageFor(meta.id),
    navigate,
    /** Resolve a path relative to the module's folder. */
    url: (p) => new URL(p, meta.baseUrl).href,
  };
}

// ---------------------------------------------------------------------------
// Accent + chrome
// ---------------------------------------------------------------------------
function setAccent(hex) {
  document.documentElement.style.setProperty('--accent', hex);
  scene.setAccent(hex);
}

function iconMarkup(meta) {
  const icon = meta.icon || meta.name.slice(0, 1);
  if (/\.(svg|png|jpe?g|webp|gif)$/i.test(icon)) {
    return `<img src="${new URL(icon, meta.baseUrl).href}" alt="" draggable="false" />`;
  }
  const span = document.createElement('span');
  span.textContent = icon;
  return span.outerHTML;
}

function dockButton({ id, label, html, onClick, extraClass = '' }) {
  const btn = document.createElement('button');
  btn.className = `dock-btn ${extraClass}`;
  btn.dataset.id = id || '';
  btn.innerHTML = `<span class="dock-icon">${html}</span><span class="dock-label"></span>`;
  btn.querySelector('.dock-label').textContent = label;
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', onClick);
  fx.ripple(btn);
  fx.magnetic(btn, { strength: 0.18 });
  return btn;
}

const HOME_ICON = '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/></svg>';
const FOLDER_ICON = '<svg viewBox="0 0 24 24"><path d="M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/></svg>';
const RELOAD_ICON = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';

function buildDock() {
  dock.innerHTML = '';
  dock.appendChild(dockButton({ id: 'home', label: 'Home', html: HOME_ICON, onClick: () => navigate('home') }));
  const sep = document.createElement('div');
  sep.className = 'dock-sep';
  dock.appendChild(sep);
  for (const meta of modules) {
    const btn = dockButton({ id: meta.id, label: meta.name, html: iconMarkup(meta), onClick: () => navigate(meta.id) });
    btn.style.setProperty('--btn-accent', meta.accent || DEFAULT_ACCENT);
    dock.appendChild(btn);
  }
  const spacer = document.createElement('div');
  spacer.className = 'dock-spacer';
  dock.appendChild(spacer);
  dock.appendChild(dockButton({ id: '', label: 'Reload modules', html: RELOAD_ICON, onClick: reloadModules }));
  dock.appendChild(dockButton({ id: '', label: 'Open modules folder', html: FOLDER_ICON, onClick: openModulesFolder }));
  markActive();
}

function markActive() {
  dock.querySelectorAll('.dock-btn').forEach((b) => b.classList.toggle('active', b.dataset.id === current.id));
}

async function openModulesFolder() {
  const dir = await window.prism?.openModulesFolder();
  if (dir) toast(`Drop module folders into ${dir}`, { duration: 4000 });
}

async function reloadModules() {
  modules = await discoverModules();
  buildDock();
  toast(`${modules.length} module${modules.length === 1 ? '' : 's'} loaded`);
  if (current.id === 'home') navigate('home', { force: true });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function navigate(id, { force = false } = {}) {
  if (id !== 'home' && !modules.some((m) => m.id === id)) id = 'home';
  if (id === current.id && !force) return;
  const token = ++navToken;

  if (location.hash !== `#/${id}`) history.replaceState(null, '', `#/${id}`);

  const leaving = stage.querySelector('.view');
  if (leaving) {
    leaving.classList.add('view-leave');
    scene.warp(1);
    await wait(380);
  }
  if (token !== navToken) return;

  if (current.cleanup) {
    try {
      await current.cleanup();
    } catch (err) {
      console.error('[modules] cleanup failed', err);
    }
  }
  stage.innerHTML = '';
  current = { id, cleanup: null };
  markActive();

  const view = document.createElement('section');
  view.className = 'view view-enter';
  view.dataset.view = id;
  stage.appendChild(view);
  view.addEventListener('animationend', function done(e) {
    if (e.target !== view) return;
    view.classList.remove('view-enter');
    view.removeEventListener('animationend', done);
  });

  if (id === 'home') {
    crumb.textContent = '';
    setAccent(DEFAULT_ACCENT);
    scene.setFocus('home');
    current.cleanup = renderHome(view, { modules, fx, navigate, openModulesFolder, iconMarkup });
    return;
  }

  const meta = modules.find((m) => m.id === id);
  crumb.textContent = meta.name;
  setAccent(meta.accent || DEFAULT_ACCENT);
  scene.setFocus('module');
  view.dataset.module = meta.id;
  try {
    const ctx = makeContext(meta);
    const unmount = await mountModule(meta, view, ctx);
    const cleanup = async () => {
      ctx.ai.dispose();
      await unmount();
    };
    if (token !== navToken) {
      await cleanup();
      return;
    }
    current.cleanup = cleanup;
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="module-error"><h2>Module failed to load</h2><pre></pre></div>`;
    view.querySelector('pre').textContent = `${meta.name}: ${err.message}`;
    toast(`Could not load ${meta.name}`, { type: 'error' });
  }
}

// ---------------------------------------------------------------------------
// Window controls, cursor glow, keyboard
// ---------------------------------------------------------------------------
document.querySelectorAll('[data-win]').forEach((btn) => {
  btn.addEventListener('click', () => window.prism?.win[btn.dataset.win]());
});
document.querySelector('.titlebar-drag').addEventListener('dblclick', () => window.prism?.win.toggleMaximize());
window.prism?.win.onState(({ maximized }) => document.body.classList.toggle('maximized', maximized));

const glow = document.getElementById('cursor-glow');
addEventListener('pointermove', (e) => {
  glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
});

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && current.id !== 'home' && !e.defaultPrevented) navigate('home');
});

addEventListener('hashchange', () => navigate(location.hash.replace(/^#\/?/, '') || 'home'));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function boot() {
  try {
    modules = await discoverModules();
  } catch (err) {
    console.error(err);
    toast('Could not read modules', { type: 'error' });
  }
  buildDock();
  document.body.classList.add('booted');
  scene.warp(1.2);
  navigate(location.hash.replace(/^#\/?/, '') || 'home', { force: true });
})();
