import { SCRIPTS, scriptById, convert, decode } from './scripts.js';

const HISTORY_KEY = 'history';
const MAX_HISTORY = 40;
const MAX_LIVE_TOKENS = 160;
const SAMPLES = ['Hello World', 'Cleopatra', 'Ragnar 793', 'Veni vidi vici'];
const DUST = '#e8d3a3';

export default {
  mount(root, ctx) {
    const { fx, scene, storage, toast } = ctx;
    const accent = ctx.meta.accent || '#d9a441';
    const cleanups = [];
    let alive = true;

    let scriptId = scriptById(storage.get('script')) ? storage.get('script') : 'futhark';
    let bous = storage.get('boustrophedon', true) !== false;
    let mode = storage.get('mode', 'encode') === 'decode' ? 'decode' : 'encode';
    let history = storage.get(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];

    root.classList.add('an');
    root.innerHTML = `
      <canvas class="an-sand" aria-hidden="true"></canvas>

      <header class="an-head">
        <div class="an-head-main">
          <div class="an-badge"><span></span>MODULE · ANCIENT SCRIPTS</div>
          <h1 class="an-title">Ancient Scripts</h1>
          <p class="an-sub">Carve your words the way they were written thousands of years ago.</p>
        </div>
        <div class="an-seals" role="radiogroup" aria-label="Writing system">
          ${SCRIPTS.map((s, i) => `
            <button class="an-seal" role="radio" data-script="${s.id}" style="--i:${i}" title="${s.name}">
              <span class="an-seal-coin f-${s.font}${s.seal.length > 2 ? ' small' : ''}">${s.seal}</span>
              <span class="an-seal-name">${s.name.replace(' (Ugaritic)', '').replace(' Inscription', '').replace('Egyptian ', '')}</span>
            </button>`).join('')}
        </div>
      </header>

      <div class="an-main">
        <div class="an-left">
          <section class="an-tablet" aria-label="Live inscription">
            <div class="an-tablet-label"></div>
            <div class="an-carving"></div>
            <div class="an-reading" hidden><span>reads:</span> <b></b></div>
            <div class="an-tablet-hint">Start typing to carve your words into stone.</div>
          </section>
          <div class="an-feed" role="log" aria-live="polite">
            <div class="an-empty">
              <p>Your inscriptions will appear here.</p>
              <div class="an-samples"></div>
            </div>
          </div>
        </div>

        <aside class="an-side">
          <section class="an-rosetta" aria-label="The same text in every script">
            <div class="an-side-title">Rosetta Stone · same words, six scripts</div>
            <div class="an-rows"></div>
          </section>
          <section class="an-inspect">
            <div class="an-inspect-glyph"></div>
            <div class="an-inspect-body">
              <div class="an-inspect-head"></div>
              <div class="an-inspect-info"></div>
            </div>
          </section>
          <section class="an-about">
            <div class="an-about-name"></div>
            <div class="an-about-era"></div>
            <p class="an-about-blurb"></p>
            <p class="an-about-how"><b>How it works:</b> <span></span></p>
          </section>
        </aside>
      </div>

      <div class="an-console">
        <div class="an-console-border" aria-hidden="true"></div>
        <div class="an-inputrow">
          <textarea class="an-input" rows="1" spellcheck="false" placeholder="Type words to carve and press Enter…" aria-label="Text to carve"></textarea>
          <button class="an-send" aria-label="Carve inscription">
            <span>Carve</span>
            <svg viewBox="0 0 24 24"><path d="M14.5 4.5l5 5M4 20l9.5-9.5M12 7l5 5-3 3-5-5z"/></svg>
          </button>
        </div>
        <div class="an-bar">
          <div class="an-modes" role="tablist" aria-label="Direction">
            <button class="an-mode" role="tab" data-mode="encode">Text → Script</button>
            <button class="an-mode" role="tab" data-mode="decode">Script → Text</button>
          </div>
          <button class="an-chip an-bous" aria-pressed="false" title="Ancient Greek: every other line runs backwards, mirrored, “as the ox turns”">Boustrophedon</button>
          <span class="an-hint"><kbd>Enter</kbd> <span class="an-verb">carve</span> · <kbd>Esc</kbd> clear · hover a glyph to read it</span>
          <span class="an-counter"></span>
          <button class="an-chip an-chip-danger an-clear" title="Clear history">Clear</button>
        </div>
      </div>
    `;

    const $ = (s) => root.querySelector(s);
    const input = $('.an-input');
    const sendBtn = $('.an-send');
    const consoleEl = $('.an-console');
    const feed = $('.an-feed');
    const empty = $('.an-empty');
    const carving = $('.an-carving');
    const rowsEl = $('.an-rows');
    const counter = $('.an-counter');

    // ------------------------------------------------------------- rendering
    // Draws converted text into `el`: lines of words, word dividers between
    // them, cartouches for hieroglyphs, Ogham feather marks, and mirrored
    // every-other lines for Greek boustrophedon.
    function renderInscription(el, value, id, { boustrophedon, fresh = null, maxTokens = Infinity } = {}) {
      const s = scriptById(id);
      const res = convert(value, id);
      el.innerHTML = '';
      el.className = `${el.className.split(' ').filter((c) => !c.startsWith('f-')).join(' ')} f-${s.font}`;
      const tokens = [];
      let count = 0;

      let lines = res.lines.filter((l) => l.length);
      if (s.boustrophedon && boustrophedon) {
        // Break into short lines so the alternating direction shows.
        const all = lines.flat();
        lines = [];
        let line = [];
        let len = 0;
        for (const w of all) {
          const wl = w.reduce((n, t) => n + Array.from(t.out).length, 0);
          if (line.length && len + wl > 20) {
            lines.push(line);
            line = [];
            len = 0;
          }
          line.push(w);
          len += wl + 1;
        }
        if (line.length) lines.push(line);
      }

      lines.forEach((words, li) => {
        const lineEl = document.createElement('div');
        lineEl.className = 'an-line';
        if (s.boustrophedon && boustrophedon && li % 2) lineEl.classList.add('rev');
        const mark = (ch, info) => {
          const m = document.createElement('span');
          m.className = 'an-g an-mark';
          m.textContent = ch;
          m.dataset.t = tokens.push({ src: '', out: ch, info, kind: 'punct' }) - 1;
          lineEl.appendChild(m);
        };
        if (s.wrap) mark(s.wrap[0], s.names[s.wrap[0]]);
        words.forEach((w, wi) => {
          if (wi > 0) {
            const prev = words[wi - 1].at(-1);
            const dividerAlready = prev && ['᛫', '᛬', '⁝', '·', '𐎟'].includes(prev.out);
            if (s.sep === ' ') lineEl.appendChild(Object.assign(document.createElement('span'), { className: 'an-space' }));
            else if (!dividerAlready) mark(s.sep === ' ' ? ' ' : s.sep, s.names[s.sep] || 'word divider');
          }
          const wordEl = document.createElement('span');
          wordEl.className = `an-word${s.cartouche ? ' cartouche' : ''}`;
          w.forEach((t) => {
            if (!t.out || count >= maxTokens) return;
            const g = document.createElement('span');
            g.className = `an-g k-${t.kind}`;
            g.textContent = t.out;
            g.dataset.t = tokens.push(t) - 1;
            g.style.setProperty('--i', Math.min(count, 60));
            if (fresh === true || (fresh && fresh(count, t))) g.classList.add('carve');
            count++;
            wordEl.appendChild(g);
          });
          lineEl.appendChild(wordEl);
        });
        if (s.wrap) mark(s.wrap[1], s.names[s.wrap[1]]);
        el.appendChild(lineEl);
      });
      if (count >= maxTokens) el.appendChild(Object.assign(document.createElement('div'), { className: 'an-more', textContent: '…' }));
      el._tokens = tokens;
      return res;
    }

    // Draws a pasted inscription for reading: every sign in its own script's
    // font (so mixed inscriptions work), with what it reads as on hover.
    function renderDecoded(el, value, { fresh = null, maxTokens = Infinity } = {}) {
      const res = decode(value);
      el.innerHTML = '';
      el.className = el.className.split(' ').filter((c) => !c.startsWith('f-')).join(' ');
      const tokens = [];
      let line = Object.assign(document.createElement('div'), { className: 'an-line' });
      el.appendChild(line);
      let count = 0;
      for (const t of res.tokens) {
        if (count >= maxTokens) break;
        for (const piece of t.src.split(/(\n)/)) {
          if (piece === '\n') {
            line = Object.assign(document.createElement('div'), { className: 'an-line' });
            el.appendChild(line);
            continue;
          }
          if (!piece) continue;
          if (/^\s+$/.test(piece) && t.kind === 'kept') {
            line.appendChild(Object.assign(document.createElement('span'), { className: 'an-space' }));
            continue;
          }
          const g = document.createElement('span');
          const font = t.script ? scriptById(t.script).font : null;
          g.className = `an-g k-${t.kind === 'mark' ? 'punct' : t.kind}${font ? ` f-${font}` : ''}`;
          g.textContent = piece;
          g.dataset.t = tokens.push({ src: t.out.trim() || '(space)', out: piece, info: t.info, kind: t.kind }) - 1;
          g.style.setProperty('--i', Math.min(count, 60));
          if (fresh === true || (fresh && fresh(count, t))) g.classList.add('carve');
          count++;
          line.appendChild(g);
        }
      }
      el._tokens = tokens;
      return res;
    }

    // --------------------------------------------------------------- picker
    function applyScriptInfo() {
      const s = scriptById(scriptId);
      root.querySelectorAll('.an-seal').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.script === scriptId)));
      $('.an-about-name').textContent = s.name;
      $('.an-about-era').textContent = `${s.era} · ${s.region}`;
      $('.an-about-blurb').textContent = s.blurb;
      $('.an-about-how span').textContent = s.how;
      $('.an-tablet-label').textContent = s.name;
      $('.an-bous').hidden = !s.boustrophedon || mode === 'decode';
      $('.an-bous').setAttribute('aria-pressed', String(bous));
      rowsEl.querySelectorAll('.an-row').forEach((r) => r.classList.toggle('active', r.dataset.script === scriptId));
      clearInspector();
    }

    function setScript(id, { animate = true } = {}) {
      if (id === scriptId && animate) return;
      scriptId = id;
      storage.set('script', id);
      applyScriptInfo();
      lastSig = [];
      renderLive({ carveAll: animate });
      if (animate) {
        scene.pulse(0.9);
        const b = root.querySelector(`.an-seal[data-script="${id}"]`).getBoundingClientRect();
        fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 34, color: DUST, spread: 6 });
        $('.an-tablet').animate(
          [{ transform: 'perspective(1200px) rotateX(0)' }, { transform: 'perspective(1200px) rotateX(-12deg) translateY(4px)', offset: 0.35 }, { transform: 'perspective(1200px) rotateX(0)' }],
          { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        );
      }
    }
    root.querySelectorAll('.an-seal').forEach((b) => {
      b.addEventListener('click', () => setScript(b.dataset.script));
      // No ripple here: it clips the coin's round glow into a square.
      cleanups.push(fx.tilt(b, { max: 18, scale: 1.06, perspective: 500 }));
    });

    $('.an-bous').addEventListener('click', () => {
      bous = !bous;
      storage.set('boustrophedon', bous);
      $('.an-bous').setAttribute('aria-pressed', String(bous));
      lastSig = [];
      renderLive({ carveAll: true });
    });
    cleanups.push(fx.ripple($('.an-bous')));

    // ------------------------------------------------------- Rosetta panel
    rowsEl.innerHTML = SCRIPTS.map(
      (s) => `<button class="an-row" data-script="${s.id}"><span class="an-row-name">${s.name.replace(' (Ugaritic)', '')}</span><span class="an-row-text f-${s.font}"></span></button>`
    ).join('');
    rowsEl.addEventListener('click', (e) => {
      const row = e.target.closest('.an-row');
      if (row) setScript(row.dataset.script);
    });
    function renderRosetta(value) {
      const text = value || 'Hello World';
      rowsEl.querySelectorAll('.an-row').forEach((r) => {
        r.querySelector('.an-row-text').textContent = convert(text, r.dataset.script).text.replace(/\n/g, ' ');
        r.classList.toggle('demo', !value);
      });
    }

    // ------------------------------------------------------------ inspector
    function clearInspector() {
      $('.an-inspect-glyph').textContent = scriptById(scriptId).seal;
      $('.an-inspect-glyph').className = `an-inspect-glyph f-${scriptById(scriptId).font}`;
      $('.an-inspect-head').textContent = 'Hover a glyph';
      $('.an-inspect-info').textContent = 'to see which letter it stands for and what it’s called.';
    }
    function inspect(el, host) {
      const t = host._tokens?.[el.dataset.t];
      if (!t) return;
      // A sign's own font (pasted inscriptions can mix scripts), else the tablet's.
      const font = [...el.classList].find((c) => c.startsWith('f-')) || [...host.classList].find((c) => c.startsWith('f-'));
      $('.an-inspect-glyph').textContent = t.out;
      $('.an-inspect-glyph').className = `an-inspect-glyph ${font || ''}`;
      $('.an-inspect-head').textContent = t.src ? `“${t.src}”` : 'Mark';
      $('.an-inspect-info').textContent = t.info;
      const box = $('.an-inspect');
      box.classList.remove('ping');
      void box.offsetWidth;
      box.classList.add('ping');
    }
    root.addEventListener('mouseover', (e) => {
      const g = e.target.closest('.an-g');
      if (!g) return;
      const host = g.closest('.an-carving, .an-card-text');
      if (host) inspect(g, host);
    });

    // ----------------------------------------------------------- live tablet
    let lastSig = [];

    function renderDecodeLive({ carveAll = false } = {}) {
      const value = input.value;
      const has = Boolean(value.trim());
      root.classList.toggle('an-has-text', has);
      const sigs = [];
      const res = renderDecoded(carving, value, {
        maxTokens: MAX_LIVE_TOKENS,
        fresh: (i, t) => {
          const sig = `${t.src}|${t.out}`;
          sigs[i] = sig;
          return carveAll || lastSig[i] !== sig;
        },
      });
      lastSig = sigs;
      const reading = $('.an-reading');
      reading.hidden = !has;
      reading.querySelector('b').textContent = res.text;
      // Light up the detected script, and show the decoded words in all six scripts.
      root.querySelectorAll('.an-seal').forEach((b) => b.setAttribute('aria-checked', String(has && b.dataset.script === res.script)));
      $('.an-tablet-label').textContent = has && res.script ? `${scriptById(res.script).name} · reading` : 'Paste an inscription';
      renderRosetta(has ? res.text : '');
      rowsEl.querySelectorAll('.an-row').forEach((r) => r.classList.toggle('active', has && r.dataset.script === res.script));
      const signs = res.tokens.filter((t) => t.kind === 'letter' || t.kind === 'number').length;
      counter.textContent = has ? `${signs} sign${signs === 1 ? '' : 's'} read${res.script ? ` · mostly ${scriptById(res.script).name}` : ''}` : '';
      return res;
    }

    function renderLive({ carveAll = false } = {}) {
      if (mode === 'decode') return renderDecodeLive({ carveAll });
      const value = input.value;
      root.classList.toggle('an-has-text', Boolean(value.trim()));
      const sigs = [];
      const res = renderInscription(carving, value, scriptId, {
        boustrophedon: bous,
        maxTokens: MAX_LIVE_TOKENS,
        fresh: (i, t) => {
          const sig = `${t.src}|${t.out}`;
          sigs[i] = sig;
          return carveAll || lastSig[i] !== sig;
        },
      });
      // Chisel dust from newly carved glyphs (a few at most per update).
      if (!carveAll) {
        [...carving.querySelectorAll('.an-g.carve')].slice(-3).forEach((g) => {
          const r = g.getBoundingClientRect();
          fx.burst(r.left + r.width / 2, r.bottom - 4, { count: 7, color: DUST, spread: 2.6 });
        });
      }
      lastSig = sigs;
      renderRosetta(value);
      const letters = res.lines.flat(2).filter((t) => t.kind === 'letter' || t.kind === 'number').length;
      counter.textContent = value.trim() ? `${letters} sign${letters === 1 ? '' : 's'} carved` : '';
    }
    let liveFrame = 0;
    const scheduleLive = () => {
      if (!liveFrame) liveFrame = requestAnimationFrame(() => ((liveFrame = 0), renderLive()));
    };
    cleanups.push(() => cancelAnimationFrame(liveFrame));

    // ----------------------------------------------------------------- cards
    function addDecodeCard(entry, { animate }) {
      const card = document.createElement('article');
      card.className = 'an-card an-card-decode';
      card.dataset.id = entry.id;
      if (animate) card.classList.add('an-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="an-card-stone">
          <div class="an-card-text an-carving-static"></div>
        </div>
        <footer class="an-card-plaque">
          <span class="an-card-src an-card-reading"></span>
          <span class="an-card-meta"><i class="an-tag"></i><span></span></span>
          <span class="an-card-actions">
            <button data-act="copy-text" class="an-chip an-chip-primary">Copy text</button>
            <button data-act="copy-insc" class="an-chip">Copy inscription</button>
            <button data-act="edit" class="an-chip">Edit</button>
            <button data-act="delete" class="an-chip an-chip-danger" aria-label="Remove">Remove</button>
          </span>
        </footer>`;
      const res = renderDecoded(card.querySelector('.an-card-text'), entry.src, { fresh: animate ? true : null });
      const reading = card.querySelector('.an-card-reading');
      card.querySelector('.an-tag').textContent = `${res.script ? scriptById(res.script).name : 'Inscription'} → text`;
      card.querySelector('.an-card-meta span').textContent = time;
      Object.assign(card, { _text: res.text, _src: entry.src, _mode: 'decode' });
      feed.appendChild(card);
      if (animate && res.text) {
        fx.scramble(reading, res.text, { duration: Math.min(1400, 400 + res.text.length * 25), glyphs: 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟΑΒΓΔΘΛΞΠΣΦΨΩ' }).then(() => {
          if (reading.isConnected) reading.textContent = res.text;
        });
      } else {
        reading.textContent = res.text;
      }
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.an-chip').forEach((b) => fx.ripple(b));
      return card;
    }

    function addCard(entry, { animate }) {
      if (entry.mode === 'decode') return addDecodeCard(entry, { animate });
      const s = scriptById(entry.script);
      const card = document.createElement('article');
      card.className = 'an-card';
      card.dataset.id = entry.id;
      if (animate) card.classList.add('an-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="an-card-stone">
          <div class="an-card-text an-carving-static"></div>
        </div>
        <footer class="an-card-plaque">
          <span class="an-card-src"></span>
          <span class="an-card-meta"><i class="an-tag"></i><span></span></span>
          <span class="an-card-actions">
            <button data-act="copy" class="an-chip an-chip-primary">Copy inscription</button>
            <button data-act="copy-src" class="an-chip">Copy original</button>
            <button data-act="edit" class="an-chip">Edit</button>
            <button data-act="delete" class="an-chip an-chip-danger" aria-label="Remove">Remove</button>
          </span>
        </footer>`;
      card.querySelector('.an-card-src').textContent = entry.src;
      card.querySelector('.an-tag').textContent = s.name;
      card.querySelector('.an-card-meta span').textContent = time;
      const res = renderInscription(card.querySelector('.an-card-text'), entry.src, entry.script, {
        boustrophedon: entry.bous,
        fresh: animate ? true : null,
      });
      Object.assign(card, { _text: res.text, _src: entry.src, _script: entry.script });
      feed.appendChild(card);
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.an-chip').forEach((b) => fx.ripple(b));
      return card;
    }

    function refreshMeta() {
      empty.hidden = history.length > 0;
    }

    async function copy(text, label) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast(`${label} copied to clipboard`);
    }

    feed.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const card = btn.closest('.an-card');
      const act = btn.dataset.act;
      if (act === 'copy' || act === 'copy-src' || act === 'copy-text' || act === 'copy-insc') {
        const label = { copy: 'Inscription', 'copy-src': 'Original text', 'copy-text': 'Text', 'copy-insc': 'Inscription' }[act];
        copy(act === 'copy' || act === 'copy-text' ? card._text : card._src, label);
        const r = btn.getBoundingClientRect();
        fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 18, color: accent, spread: 4 });
      } else if (act === 'edit' && card._mode === 'decode') {
        setMode('decode');
        input.value = card._src;
        autosize();
        renderLive({ carveAll: true });
        input.focus();
      } else if (act === 'edit') {
        setMode('encode');
        setScript(card._script, { animate: card._script !== scriptId });
        input.value = card._src;
        autosize();
        renderLive({ carveAll: true });
        input.focus();
      } else if (act === 'delete') {
        history = history.filter((h) => String(h.id) !== card.dataset.id);
        storage.set(HISTORY_KEY, history);
        card.classList.add('an-card-out');
        card.addEventListener('animationend', () => {
          card.remove();
          refreshMeta();
        }, { once: true });
      }
    });

    $('.an-clear').addEventListener('click', () => {
      if (!history.length) return;
      history = [];
      storage.remove(HISTORY_KEY);
      const cards = feed.querySelectorAll('.an-card');
      cards.forEach((c, i) => {
        c.style.animationDelay = `${i * 30}ms`;
        c.classList.add('an-card-out');
        c.addEventListener('animationend', () => c.remove(), { once: true });
      });
      setTimeout(refreshMeta, 450 + cards.length * 30);
      scene.pulse(0.6);
    });

    // ----------------------------------------------------------------- input
    function autosize() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    }

    function send() {
      const value = input.value.replace(/\s+$/, '');
      if (!value.trim()) {
        consoleEl.animate(
          [{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '-5px' }, { translate: '3px' }, { translate: '0' }],
          { duration: 450, easing: 'ease-in-out' }
        );
        return;
      }
      if (mode === 'decode' && !decode(value).tokens.some((t) => t.kind === 'letter' || t.kind === 'number')) {
        consoleEl.animate([{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '0' }], { duration: 400 });
        toast('No runes, hieroglyphs, Ogham, cuneiform, Greek or Latin capitals found', { type: 'error' });
        return;
      }
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const entry = mode === 'decode'
        ? { id, mode: 'decode', src: value, at: Date.now() }
        : { id, src: value, script: scriptId, bous, at: Date.now() };
      history.push(entry);
      if (history.length > MAX_HISTORY) {
        const dropped = history.splice(0, history.length - MAX_HISTORY);
        dropped.forEach((d) => feed.querySelector(`.an-card[data-id="${d.id}"]`)?.remove());
      }
      storage.set(HISTORY_KEY, history);

      const card = addCard(entry, { animate: true });
      refreshMeta();
      input.value = '';
      autosize();
      renderLive();

      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      requestAnimationFrame(() => {
        // A rumble, then chisel dust along the new stone.
        const c = card.getBoundingClientRect();
        for (let k = 0; k < 6; k++) {
          setTimeout(() => fx.burst(c.left + (c.width * (k + 0.5)) / 6, c.top + 40, { count: 10, color: DUST, spread: 4 }), 180 + k * 90);
        }
        const b = sendBtn.getBoundingClientRect();
        fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 26, color: accent, spread: 6 });
      });
      root.animate(
        [{ translate: '0 0' }, { translate: '-3px 2px' }, { translate: '3px -2px' }, { translate: '-2px 1px' }, { translate: '0 0' }],
        { duration: 360, easing: 'ease-out' }
      );
      scene.pulse(1);
    }

    input.addEventListener('input', () => {
      autosize();
      scheduleLive();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      } else if (e.key === 'Escape' && input.value) {
        e.preventDefault();
        input.value = '';
        autosize();
        renderLive();
      }
    });
    sendBtn.addEventListener('click', send);
    cleanups.push(fx.ripple(sendBtn), fx.magnetic(sendBtn, { strength: 0.15 }), fx.tilt(consoleEl, { max: 2, scale: 1, perspective: 1600 }));

    const samples = $('.an-samples');
    // Decode samples are inscriptions written by this module in different scripts.
    const DECODE_SAMPLES = [['Hello World', 'futhark'], ['Cleopatra', 'hieroglyphs'], ['Veni vidi vici 2026', 'latin'], ['Thank you', 'greek']];
    function buildSamples() {
      samples.innerHTML = '';
      const list = mode === 'encode' ? SAMPLES.map((s) => [s, null]) : DECODE_SAMPLES.map(([t, id]) => [convert(t, id).text, id]);
      for (const [s, id] of list) {
        const chip = document.createElement('button');
        chip.className = `an-chip${id ? ` an-chip-script f-${scriptById(id).font}` : ''}`;
        chip.textContent = s;
        chip.addEventListener('click', () => {
          input.value = s;
          renderLive({ carveAll: true });
          send();
        });
        samples.appendChild(chip);
      }
    }

    // ------------------------------------------------------------------ mode
    function setMode(next, { animate = true } = {}) {
      const changed = next !== mode;
      mode = next;
      storage.set('mode', mode);
      root.classList.toggle('an-decoding', mode === 'decode');
      root.querySelectorAll('.an-mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
      $('.an-sub').textContent = mode === 'encode'
        ? 'Carve your words the way they were written thousands of years ago.'
        : 'Paste an inscription in any of these scripts, even mixed, and read it.';
      input.placeholder = mode === 'encode' ? 'Type words to carve and press Enter…' : 'Paste runes, hieroglyphs, Ogham, cuneiform, Greek or Latin capitals…';
      input.setAttribute('aria-label', mode === 'encode' ? 'Text to carve' : 'Inscription to read');
      sendBtn.querySelector('span').textContent = mode === 'encode' ? 'Carve' : 'Read';
      $('.an-verb').textContent = mode === 'encode' ? 'carve' : 'read';
      $('.an-tablet-hint').textContent = mode === 'encode' ? 'Start typing to carve your words into stone.' : 'Paste an inscription to read it.';
      $('.an-empty p').textContent = mode === 'encode' ? 'Your inscriptions will appear here.' : 'Translations will appear here.';
      $('.an-reading').hidden = true;
      if (mode === 'decode') $('.an-bous').hidden = true;
      else applyScriptInfo();
      buildSamples();
      if (changed) {
        input.value = '';
        autosize();
        lastSig = [];
        if (animate) {
          scene.pulse(0.8);
          const b = root.querySelector(`.an-mode[data-mode="${mode}"]`).getBoundingClientRect();
          fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 26, color: DUST, spread: 5 });
        }
      }
      renderLive({ carveAll: true });
    }
    root.querySelectorAll('.an-mode').forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
      cleanups.push(fx.ripple(b));
    });

    // First paint, then history from previous sessions (no entrance animation).
    applyScriptInfo();
    setMode(mode, { animate: false });
    history.forEach((h) => addCard({ script: 'futhark', bous: true, ...h }, { animate: false }));
    refreshMeta();
    feed.scrollTop = feed.scrollHeight;

    // ----------------------------------------------------------------- intro
    root.classList.add('an-intro');
    const fontsReady = Promise.race([
      Promise.all(['AN Runic', 'AN Ogham', 'AN Hiero', 'AN Ugaritic', 'AN Serif'].map((f) => document.fonts.load(`32px "${f}"`))).catch(() => {}),
      new Promise((r) => setTimeout(r, 800)),
    ]);
    let sand = { cancel() {} };
    cleanups.push(() => sand.cancel());
    fontsReady.then(() => {
      if (!alive) return;
      sand = playSandstorm($('.an-sand'), accent);
      sand.done.then(() => {
        if (!alive) return;
        root.classList.add('an-ready');
        scene.pulse(1.3);
        root.animate(
          [{ translate: '0 0' }, { translate: '-4px 2px' }, { translate: '4px -1px' }, { translate: '-2px 1px' }, { translate: '0 0' }],
          { duration: 420, delay: 380, easing: 'ease-out' }
        );
        // Scramble through runes, Ogham and Greek (single-unit characters only).
        fx.scramble($('.an-title'), 'Ancient Scripts', { duration: 1000, glyphs: 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᚁᚂᚃᚄᚅᚆᚇᚈᚉᚊᚋᚌᚐᚑᚒᚓᚔΑΒΓΔΘΛΞΠΣΦΨΩ' });
        setTimeout(() => alive && input.focus(), 500);
      });
    });

    return () => {
      alive = false;
      cleanups.forEach((fn) => fn());
    };
  },
};

// ---------------------------------------------------------------------------
// Intro: a desert sandstorm sweeps across the screen and clears, uncovering
// the stone. Click or any key skips it.
// ---------------------------------------------------------------------------
function playSandstorm(canvas, accent) {
  const host = canvas.parentElement;
  const g = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ['#e8d3a3', '#d9a441', '#b07a2a', '#fff1d0', accent];
  const grains = Array.from({ length: 900 }, () => ({
    x: Math.random() * W * 1.6 - W * 0.8,
    y: Math.random() * H,
    v: 6 + Math.random() * 14,
    size: 0.6 + Math.random() * 2.2,
    phase: Math.random() * Math.PI * 2,
    color: colors[(Math.random() * colors.length) | 0],
  }));
  const T_END = 1800;
  const start = performance.now();
  let raf = 0;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    resolveDone();
    canvas.classList.add('gone');
    setTimeout(() => canvas.remove(), 800);
  };

  function frame(now) {
    const t = now - start;
    const k = t / T_END;
    // Haze builds up, then the storm passes and clears.
    const density = Math.sin(Math.min(k, 1) * Math.PI);
    g.clearRect(0, 0, W, H);
    g.fillStyle = `rgba(120, 84, 34, ${0.28 * density})`;
    g.fillRect(0, 0, W, H);
    for (const p of grains) {
      p.x += p.v * (1 + k * 1.5);
      p.y += Math.sin(t / 220 + p.phase) * 1.4;
      if (p.x > W + 20) p.x = -20 - Math.random() * 200;
      g.globalAlpha = Math.min(1, density * 1.4) * 0.85;
      g.fillStyle = p.color;
      g.fillRect(p.x, p.y, p.size * (1 + p.v / 12), p.size);
    }
    g.globalAlpha = 1;
    if (t < T_END) raf = requestAnimationFrame(frame);
    else finish();
  }
  raf = requestAnimationFrame(frame);

  const skip = () => {
    cancelAnimationFrame(raf);
    finish();
  };
  host.addEventListener('pointerdown', skip, { once: true });
  addEventListener('keydown', skip, { once: true });

  return {
    done,
    cancel() {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointerdown', skip);
      removeEventListener('keydown', skip);
      if (!finished) {
        finished = true;
        resolveDone();
      }
    },
  };
}
