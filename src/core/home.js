// The launcher view: a 3D hero title, the universal translator and one tilt card per module.

import { loadReaders, translate } from './translate.js';
import { sound } from './sound.js';

export function renderHome(view, { modules, fx, navigate, openModulesFolder, iconMarkup, storageFor, toast }) {
  const cleanups = [];
  view.classList.add('home');
  view.innerHTML = `
    <div class="home-hero">
      <div class="eyebrow"><span class="pulse-dot"></span>MODULAR WORKSPACE</div>
      <h1 class="hero-title" aria-label="PRISM">
        ${Array.from({ length: 10 }, (_, i) => `<span class="hero-layer" style="--z:${i}">PRISM</span>`).join('')}
      </h1>
      <p class="hero-sub">${openModulesFolder ? 'Every page is a plug-in module. Pick one below — or drop your own into the modules folder.' : 'Every page is a module. Pick one below to start.'}</p>
    </div>
    <section class="home-tr" aria-label="Universal translator">
      <div class="home-tr-bar">
        <span class="home-tr-prism" aria-hidden="true"></span>
        <textarea class="home-tr-input" rows="1" spellcheck="false" aria-label="Text to translate"
          placeholder="Paste anything a module made: Prism finds which one and reads it back"></textarea>
        <button class="home-tr-go" aria-label="Translate"><span>Translate</span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </div>
      <div class="home-tr-orbs" aria-hidden="true"></div>
      <div class="home-tr-status" aria-live="polite"></div>
      <div class="home-tr-out" hidden>
        <div class="home-tr-head">
          <span class="home-tr-badge"><span class="home-tr-badge-icon"></span><b></b><i></i></span>
          <span class="home-tr-meter" title="How sure the translator is"><span></span></span>
          <span class="home-tr-score"></span>
        </div>
        <div class="home-tr-text"></div>
        <div class="home-tr-actions">
          <button class="home-tr-chip home-tr-chip-primary" data-act="copy">Copy text</button>
          <button class="home-tr-chip" data-act="open"></button>
        </div>
        <div class="home-tr-alts"></div>
      </div>
    </section>
    <div class="module-grid"></div>
  `;

  const hero = view.querySelector('.hero-title');
  const onMove = (e) => {
    const x = e.clientX / innerWidth - 0.5;
    const y = e.clientY / innerHeight - 0.5;
    hero.style.transform = `rotateX(${y * -26}deg) rotateY(${x * 34}deg)`;
  };
  addEventListener('pointermove', onMove);
  cleanups.push(() => removeEventListener('pointermove', onMove));

  const top = hero.lastElementChild;
  fx.scramble(top, 'PRISM', { duration: 1100 });

  const grid = view.querySelector('.module-grid');
  const cards = [];

  modules.forEach((meta, i) => {
    const card = document.createElement('button');
    card.className = 'mcard';
    card.style.setProperty('--card-accent', meta.accent || '#7c5cff');
    card.style.setProperty('--i', i);
    card.innerHTML = `
      <span class="mcard-glare"></span>
      <span class="mcard-icon">${iconMarkup(meta)}</span>
      <span class="mcard-body">
        <span class="mcard-title"></span>
        <span class="mcard-desc"></span>
      </span>
      <span class="mcard-foot">
        <span class="mcard-tag"></span>
        <span class="mcard-go">Launch <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
      </span>`;
    card.querySelector('.mcard-title').textContent = meta.name;
    card.querySelector('.mcard-desc').textContent = meta.description || '';
    card.querySelector('.mcard-tag').textContent = meta.source === 'user' ? 'user module' : 'built-in';
    card.addEventListener('click', (e) => {
      fx.burst(e.clientX, e.clientY, { color: meta.accent, count: 40 });
      navigate(meta.id);
    });
    cards.push(card);
  });

  // Platforms without a modules folder (the Android app) have no "add" card.
  if (openModulesFolder) cards.push(addCard(modules.length, openModulesFolder));

  for (const card of cards) {
    grid.appendChild(card);
    cleanups.push(fx.tilt(card, { max: 9, scale: 1.03 }));
  }

  cleanups.push(mountTranslator(view, { modules, fx, navigate, iconMarkup, storageFor, toast }));
  return () => cleanups.forEach((fn) => fn());
}

// ------------------------------------------------------- universal translator
// Every module with a reader (module.json "reader") tries the text; the best
// reading is shown with its module, style and how sure it is (core/translate.js).
function mountTranslator(view, { modules, fx, navigate, iconMarkup, storageFor, toast }) {
  const $ = (sel) => view.querySelector(sel);
  const box = $('.home-tr');
  const input = $('.home-tr-input');
  const go = $('.home-tr-go');
  const status = $('.home-tr-status');
  const out = $('.home-tr-out');
  const textEl = $('.home-tr-text');
  const orbs = $('.home-tr-orbs');
  const timers = [];
  let readers = [];
  let results = [];
  let shown = null;
  let liveTimer = 0;
  let alive = true;

  const readable = modules.filter((m) => m.reader);
  orbs.innerHTML = readable
    .map((m, i) => `<span class="home-tr-orb" data-id="${m.id}" style="--c:${m.accent || '#7c5cff'};--i:${i}" title="${m.name}">${iconMarkup(m)}</span>`)
    .join('');
  const ready = loadReaders(readable, storageFor).then((list) => {
    readers = list;
    return list;
  });

  const autosize = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  };
  const light = (id) => orbs.querySelectorAll('.home-tr-orb').forEach((o) => o.classList.toggle('on', o.dataset.id === id));

  function show(r, { animate }) {
    shown = r;
    out.hidden = false;
    box.classList.add('has-result');
    box.style.setProperty('--hit', r.meta.accent || '#7c5cff');
    $('.home-tr-badge-icon').innerHTML = iconMarkup(r.meta);
    $('.home-tr-badge b').textContent = r.meta.name;
    $('.home-tr-badge i').textContent = r.style;
    const pct = Math.round(r.score * 100);
    $('.home-tr-meter span').style.width = `${r.exact ? 100 : Math.max(6, pct)}%`;
    $('.home-tr-score').textContent = r.exact ? '✓ exact' : `${pct}% sure`;
    $('[data-act="open"]').textContent = `Open ${r.meta.name}`;
    textEl.classList.toggle('note', r.text === null);
    const body = r.text === null ? r.note : r.text;
    if (animate && r.text !== null) {
      fx.scramble(textEl, body, { duration: Math.min(1300, 450 + body.length * 18), silent: true }).then(() => {
        if (alive && shown === r) textEl.textContent = body;
      });
    } else {
      textEl.textContent = body;
    }
    $('.home-tr-alts').innerHTML = results
      .filter((x) => x !== r && x.score >= 0.2)
      .slice(0, 3)
      .map((x) => `<button class="home-tr-alt" data-alt="${results.indexOf(x)}" style="--c:${x.meta.accent || '#7c5cff'}">${iconMarkup(x.meta)}<span>${escapeHtml(x.meta.name)}</span><small>${x.exact ? 'exact' : `${Math.round(x.score * 100)}%`}</small></button>`)
      .join('');
    light(r.meta.id);
  }

  function clear(message = '') {
    shown = null;
    out.hidden = true;
    box.classList.remove('has-result');
    status.textContent = message;
    light(null);
  }

  // As you type: a quiet live reading, no animation.
  async function live() {
    const value = input.value;
    if (!value.trim() && !/[\t\n]/.test(value)) return clear('');
    await ready;
    if (!alive || value !== input.value) return;
    results = translate(value, readers);
    status.textContent = '';
    if (results.length && results[0].score >= 0.2) show(results[0], { animate: false });
    else clear('No module recognises this yet. Paste something made in Prism: braille, Base64, runes, a Cipher Pact message…');
  }

  // Enter or the button: scan across the modules, then reveal the reading.
  async function run() {
    const value = input.value;
    if (!value.trim() && !/[\t\n]/.test(value)) {
      sound.play('error');
      box.animate([{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '0' }], { duration: 380 });
      return;
    }
    await ready;
    if (!alive) return;
    results = translate(value, readers);
    box.classList.add('scanning');
    sound.play('whir', { duration: 0.7 });
    timers.push(setTimeout(() => {
      if (!alive) return;
      box.classList.remove('scanning');
      if (!results.length || results[0].score < 0.2) {
        clear('No module recognises this. Paste something made in Prism: braille, Base64, runes, a Cipher Pact message…');
        sound.play('fail');
        return;
      }
      status.textContent = '';
      show(results[0], { animate: true });
      sound.play('chime', { note: 4 });
      const b = $('.home-tr-badge').getBoundingClientRect();
      fx.burst(b.left + 24, b.top + b.height / 2, { color: results[0].meta.accent, count: 36, spread: 6 });
    }, 650));
  }

  input.addEventListener('input', () => {
    autosize();
    clearTimeout(liveTimer);
    liveTimer = setTimeout(live, 260);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      run();
    } else if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      input.value = '';
      autosize();
      clear('');
    }
  });
  go.addEventListener('click', run);
  out.addEventListener('click', async (e) => {
    const alt = e.target.closest('[data-alt]');
    if (alt) return show(results[Number(alt.dataset.alt)], { animate: true });
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act || !shown) return;
    if (act === 'open') return navigate(shown.meta.id);
    const text = shown.text ?? shown.note;
    try {
      await navigator.clipboard.writeText(text);
      toast?.('Copied to the clipboard');
    } catch {
      toast?.('Could not copy', { type: 'error' });
    }
  });
  const offTilt = fx.tilt(out, { max: 3, scale: 1.005, perspective: 1400 });

  return () => {
    alive = false;
    clearTimeout(liveTimer);
    timers.forEach(clearTimeout);
    offTilt();
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function addCard(i, openModulesFolder) {
  const add = document.createElement('button');
  add.className = 'mcard mcard-add';
  add.style.setProperty('--i', i);
  add.innerHTML = `
    <span class="mcard-glare"></span>
    <span class="mcard-icon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span>
    <span class="mcard-body">
      <span class="mcard-title">Add a module</span>
      <span class="mcard-desc">Open the modules folder. Each sub-folder with a module.json becomes a new page — hit reload in the dock to pick it up.</span>
    </span>
    <span class="mcard-foot"><span class="mcard-tag">extend</span><span class="mcard-go">Open folder</span></span>`;
  add.addEventListener('click', openModulesFolder);
  return add;
}
