import { createScene } from './scene.js';
import { fx } from './fx.js';
import { discoverModules, mountModule } from './modules.js';
import { renderHome } from './home.js';
import { createAI } from './ai.js';
import { sound } from './sound.js';

const DEFAULT_ACCENT = '#7c5cff';
const stage = document.getElementById('stage');
const dock = document.getElementById('dock');
const crumb = document.getElementById('crumb');

// 'desktop' (Electron) or 'android' (the WebView app in "android version/").
const PLATFORM = window.prism?.platform || 'desktop';
document.body.classList.add(`platform-${PLATFORM}`);
document.body.classList.toggle('handheld', sound.handheld);
const CAN_ADD_MODULES = typeof window.prism?.openModulesFolder === 'function';

// On touch screens a focused text box raises the on-screen keyboard. Modules
// focus their input after intros, samples and mode switches, which on a phone
// would cover half the screen uninvited, so there focus only moves while the
// keyboard is already up (and never scrolls the page to get there).
if (sound.handheld) {
  for (const proto of [HTMLTextAreaElement.prototype, HTMLInputElement.prototype]) {
    const focus = proto.focus;
    proto.focus = function (opts) {
      const a = document.activeElement;
      const typing = a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && /^(text|search|)$/.test(a.type));
      if (a === this || typing) focus.call(this, { ...opts, preventScroll: true });
    };
  }
}

const scene = createScene(document.getElementById('bg'));
let modules = [];
let current = { id: null, cleanup: null };
let navToken = 0;

// ---------------------------------------------------------------------------
// Shared helpers handed to modules
// ---------------------------------------------------------------------------
function toast(message, { type = 'info', duration = 2200 } = {}) {
  sound.play(type === 'error' ? 'error' : 'toast');
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

// Modules get a scene whose pulses and warps also sound.
const moduleScene = {
  ...scene,
  setAccent: (hex) => scene.setAccent(hex),
  setFocus: (f) => scene.setFocus(f),
  pulse(strength = 1) {
    sound.play('pulse', { amount: strength });
    scene.pulse(strength);
  },
  warp(strength = 1) {
    sound.play('warp', { amount: strength });
    scene.warp(strength);
  },
};

function makeContext(meta) {
  return {
    meta,
    scene: moduleScene,
    fx,
    sound,
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
  if (CAN_ADD_MODULES) {
    const spacer = document.createElement('div');
    spacer.className = 'dock-spacer';
    dock.appendChild(spacer);
    dock.appendChild(dockButton({ id: '', label: 'Reload modules', html: RELOAD_ICON, onClick: reloadModules }));
    dock.appendChild(dockButton({ id: '', label: 'Open modules folder', html: FOLDER_ICON, onClick: openModulesFolder }));
  }
  markActive();
}

function markActive() {
  dock.querySelectorAll('.dock-btn').forEach((b) => b.classList.toggle('active', b.dataset.id === current.id));
  // The bottom tab bar on phones scrolls sideways: keep the open module in view.
  dock.querySelector('.dock-btn.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
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

  sound.play(id === 'home' ? 'navHome' : 'navIn');
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
    current.cleanup = renderHome(view, { modules, fx, navigate, openModulesFolder: CAN_ADD_MODULES ? openModulesFolder : null, iconMarkup, storageFor, toast });
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

/**
 * The Android back button/gesture. Returns true when the app handled it
 * (closed a panel, went home) and false when the system should leave the app.
 */
window.prismBack = () => {
  const pop = document.getElementById('sound-pop');
  if (pop && !pop.hidden) {
    pop.hidden = true;
    sound.play('click', { pitch: 0.8 });
    return true;
  }
  if (current.id && current.id !== 'home') {
    document.activeElement?.blur?.();
    navigate('home');
    return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Sounds for every click, hover and keystroke
// ---------------------------------------------------------------------------
const CLICKABLE = 'button, [role="tab"], [role="radio"], summary, a[href], .dg-key';
// Mouse and pen click on press, like a real button. A finger on a touch screen
// may be starting a scroll, so taps sound on the click that follows instead.
function pressSound(e) {
  const el = e.target.closest?.(CLICKABLE);
  if (!el || el.disabled) return;
  const x = e.clientX;
  if (el.matches('[class*="-send"], .cp-forge')) sound.play('press', { x });
  else if (el.hasAttribute('aria-pressed')) sound.play('toggle', { on: el.getAttribute('aria-pressed') !== 'true', x });
  else if (el.matches('[role="tab"], [role="radio"]')) sound.play('click', { pitch: 1.25, x });
  else sound.play('click', { pitch: 0.92 + Math.random() * 0.16, x });
}
let lastPointer = 'mouse';
addEventListener('pointerdown', (e) => {
  lastPointer = e.pointerType;
  if (e.button === 0 && e.pointerType !== 'touch') pressSound(e);
}, true);
addEventListener('click', (e) => {
  if (lastPointer === 'touch' && e.isTrusted) pressSound(e);
}, true);

addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return; // a tap is not a hover
  const el = e.target.closest('.dock-btn, .mcard');
  if (el && !el.contains(e.relatedTarget)) sound.play('hover', { x: e.clientX });
});

const isTextField = (t) => t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && /^(text|search|)$/.test(t.type));
let keyClickAt = 0;
addEventListener('keydown', (e) => {
  if (!sound.settings.typing || e.ctrlKey || e.metaKey || e.altKey || !isTextField(e.target)) return;
  if (e.key.length === 1) sound.play('key');
  else if (e.key === 'Backspace' || e.key === 'Delete') sound.play('key', { low: true });
  else return;
  keyClickAt = performance.now();
}, true);
// Phone keyboards report almost every key as "Unidentified" (key code 229), so
// the click follows the text change instead (unless keydown just played it).
addEventListener('beforeinput', (e) => {
  if (!sound.settings.typing || !isTextField(e.target) || performance.now() - keyClickAt < 80) return;
  if (/^insert(Text|CompositionText|ReplacementText)$/.test(e.inputType)) sound.play('key');
  else if (e.inputType.startsWith('delete')) sound.play('key', { low: true });
}, true);

// The sound control in the title bar: click for the panel, scroll to change volume.
(function soundControl() {
  const btn = document.getElementById('sound-btn');
  const pop = document.getElementById('sound-pop');
  if (!btn || !pop) return;
  const vol = pop.querySelector('[data-sound="volume"]');
  const mute = pop.querySelector('[data-sound="mute"]');
  const typing = pop.querySelector('[data-sound="typing"]');
  const haptics = pop.querySelector('[data-sound="haptics"]');
  if (haptics) haptics.hidden = !sound.handheld;
  const render = () => {
    const st = sound.settings;
    const level = st.muted ? 0 : st.volume;
    btn.dataset.level = level === 0 ? '0' : level < 0.4 ? '1' : level < 0.75 ? '2' : '3';
    btn.title = st.muted ? 'Sound off (click for settings)' : `Sound ${Math.round(st.volume * 100)}% (click for settings, scroll to change)`;
    vol.value = Math.round(st.volume * 100);
    pop.querySelector('.sound-pct').textContent = st.muted ? 'off' : `${Math.round(st.volume * 100)}%`;
    mute.setAttribute('aria-pressed', String(!st.muted));
    mute.textContent = st.muted ? 'Sound off' : 'Sound on';
    typing.setAttribute('aria-pressed', String(st.typing));
    haptics?.setAttribute('aria-pressed', String(st.haptics));
  };
  btn.addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    render();
  });
  btn.addEventListener('wheel', (e) => {
    e.preventDefault();
    sound.setVolume(sound.settings.volume + (e.deltaY < 0 ? 0.05 : -0.05));
    render();
    sound.play('click');
  }, { passive: false });
  vol.addEventListener('input', () => {
    sound.setVolume(vol.value / 100);
    render();
  });
  vol.addEventListener('change', () => sound.play('chime', { note: Math.round(vol.value / 20) }));
  mute.addEventListener('click', () => {
    sound.setMuted(!sound.settings.muted);
    render();
  });
  typing.addEventListener('click', () => {
    sound.setTyping(!sound.settings.typing);
    render();
  });
  haptics?.addEventListener('click', () => {
    sound.setHaptics(!sound.settings.haptics);
    render();
    sound.haptic('press');
  });
  addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) pop.hidden = true;
  });
  render();
})();

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
