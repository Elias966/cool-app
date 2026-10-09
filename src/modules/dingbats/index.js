import { FONTS, toDingbats, fromDingbats, glyphFor } from './dingbats.js';
import { MAPS } from './maps.js';

const HISTORY_KEY = 'history';
const MAX_HISTORY = 40;
const MAX_TILES = 72;
const SAMPLES = ['Hello World', 'J', 'Secret message!', 'pi = 3.14'];
// Text presentation selector: asks for the plain, single-colour version of
// symbols that would otherwise turn into colour emoji. Display only.
const VS15 = '︎';

// US keyboard: each key is "normal" + "shifted" character.
const KEYBOARD = [
  ['`~', '1!', '2@', '3#', '4$', '5%', '6^', '7&', '8*', '9(', '0)', '-_', '=+'],
  ['qQ', 'wW', 'eE', 'rR', 'tT', 'yY', 'uU', 'iI', 'oO', 'pP', '[{', ']}', '\\|'],
  ['aA', 'sS', 'dD', 'fF', 'gG', 'hH', 'jJ', 'kK', 'lL', ';:', '\'"'],
  ['zZ', 'xX', 'cC', 'vV', 'bB', 'nN', 'mM', ',<', '.>', '/?'],
];

export default {
  mount(root, ctx) {
    const { fx, scene, storage, toast } = ctx;
    const accent = ctx.meta.accent || '#ff8a3d';
    const cleanups = [];
    let alive = true;

    let fontId = FONTS.some((f) => f.id === storage.get('font')) ? storage.get('font') : 'wingdings';
    let shift = false;
    let mode = storage.get('mode', 'encode') === 'decode' ? 'decode' : 'encode';
    // When decoding: 'auto' detects the font, or a font id forces it.
    let decodeFont = 'auto';
    let history = storage.get(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];
    const fontOf = (id) => FONTS.find((f) => f.id === id);
    const show = (glyph) => glyph + VS15;

    root.classList.add('dg');
    root.innerHTML = `
      <canvas class="dg-storm" aria-hidden="true"></canvas>

      <header class="dg-head">
        <div class="dg-head-main">
          <div class="dg-badge"><span></span>MODULE · SYMBOL FONTS</div>
          <h1 class="dg-title">Text to Dingbats</h1>
          <p class="dg-sub">Old fonts that drew pictures instead of letters, rebuilt as real symbols you can paste anywhere.</p>
        </div>
        <div class="dg-deck" role="radiogroup" aria-label="Symbol font">
          ${FONTS.map((f, i) => `
            <button class="dg-font" role="radio" data-font="${f.id}" style="--i:${i}">
              <span class="dg-font-glyphs">${Array.from(f.sample).map((c) => `<i>${show(glyphFor(c, f.id).glyph)}</i>`).join('')}</span>
              <span class="dg-font-name">${f.name}</span>
              <span class="dg-font-maker">${f.maker}</span>
            </button>`).join('')}
        </div>
      </header>

      <div class="dg-main">
        <div class="dg-left">
          <section class="dg-stream" aria-label="Live preview">
            <div class="dg-stream-tiles"></div>
            <div class="dg-stream-hint">Start typing: every key becomes a symbol. Hover a tile to flip it.</div>
          </section>
          <div class="dg-feed" role="log" aria-live="polite">
            <div class="dg-empty">
              <p>Your converted text will appear here.</p>
              <div class="dg-samples"></div>
            </div>
          </div>
        </div>

        <aside class="dg-side">
          <div class="dg-kb" aria-label="Symbol keyboard">
            <div class="dg-kb-head">
              <span>Symbol keyboard</span>
              <button class="dg-chip dg-shift" aria-pressed="false" title="Show the shifted characters">⇧ Shift</button>
            </div>
            <div class="dg-kb-rows"></div>
            <button class="dg-key dg-space" data-char=" " aria-label="Space">space</button>
          </div>
          <div class="dg-info">
            <div class="dg-info-name"></div>
            <div class="dg-info-maker"></div>
            <p class="dg-info-blurb"></p>
            <p class="dg-info-fact"><b>Did you know?</b> <span></span></p>
          </div>
        </aside>
      </div>

      <div class="dg-console">
        <div class="dg-console-border" aria-hidden="true"></div>
        <div class="dg-live"><span class="dg-live-text"></span></div>
        <div class="dg-inputrow">
          <textarea class="dg-input" rows="1" spellcheck="false" placeholder="Type text to turn into symbols and press Enter…" aria-label="Text to convert"></textarea>
          <button class="dg-send" aria-label="Convert to symbols">
            <span>Convert</span>
            <svg viewBox="0 0 24 24"><path d="M4 12h15M13 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="dg-bar">
          <div class="dg-modes" role="tablist" aria-label="Direction">
            <button class="dg-mode" role="tab" data-mode="encode">Text → Symbols</button>
            <button class="dg-mode" role="tab" data-mode="decode">Symbols → Text</button>
          </div>
          <span class="dg-hint"><kbd>Enter</kbd> <span class="dg-verb">convert</span> · <kbd>Esc</kbd> clear · <span class="dg-kbhint">click keyboard keys to type</span></span>
          <span class="dg-counter"></span>
          <button class="dg-chip dg-chip-danger dg-clear" title="Clear history">Clear</button>
        </div>
      </div>
    `;

    const $ = (s) => root.querySelector(s);
    const input = $('.dg-input');
    const sendBtn = $('.dg-send');
    const consoleEl = $('.dg-console');
    const feed = $('.dg-feed');
    const empty = $('.dg-empty');
    const tilesEl = $('.dg-stream-tiles');
    const liveText = $('.dg-live-text');
    const counter = $('.dg-counter');

    // --------------------------------------------------------------- font deck
    function applyFontInfo() {
      const f = fontOf(fontId);
      root.querySelectorAll('.dg-font').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.font === fontId)));
      $('.dg-info-name').textContent = f.name;
      $('.dg-info-maker').textContent = f.maker;
      $('.dg-info-blurb').textContent = f.blurb;
      $('.dg-info-fact span').textContent = f.fact;
    }

    function setFont(id, { animate = true } = {}) {
      if (id === fontId && animate) return;
      fontId = id;
      storage.set('font', id);
      applyFontInfo();
      renderKeyboard(animate);
      renderStream({ reskin: animate });
      if (animate) {
        ctx.sound.play('shuffle');
        scene.pulse(0.9);
        const b = root.querySelector(`.dg-font[data-font="${id}"]`).getBoundingClientRect();
        fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 30, color: accent, spread: 6 });
        fx.scramble($('.dg-info-name'), fontOf(id).name, { duration: 500 });
      }
    }
    // Decoding: clicking a font forces it; clicking the forced font again goes back to auto-detect.
    function forceFont(id) {
      decodeFont = decodeFont === id ? 'auto' : id;
      if (decodeFont !== 'auto') setFont(id, { animate: id !== fontId });
      renderStream({ reskin: true });
    }
    root.querySelectorAll('.dg-font').forEach((b) => {
      b.addEventListener('click', () => (mode === 'decode' ? forceFont(b.dataset.font) : setFont(b.dataset.font)));
      cleanups.push(fx.tilt(b, { max: 14, scale: 1.04, perspective: 600 }), fx.ripple(b));
    });

    // ---------------------------------------------------------------- keyboard
    const rowsEl = $('.dg-kb-rows');
    function renderKeyboard(flip = false) {
      rowsEl.innerHTML = KEYBOARD.map(
        (row, r) =>
          `<div class="dg-kb-row" style="--r:${r}">${row
            .map((pair, k) => {
              const ch = Array.from(pair)[shift ? 1 : 0];
              const g = glyphFor(ch, fontId);
              return `<button class="dg-key${g.mapped ? '' : ' same'}${flip ? ' flip' : ''}" style="--k:${r * 13 + k}" data-char="${escapeAttr(ch)}" data-glyph="${escapeAttr(g.glyph)}" title="${escapeAttr(`${ch}  ${g.code}  →  ${g.glyph}  ${g.name}`)}"><b>${escapeHtml(show(g.glyph))}</b><span>${escapeHtml(ch)}</span></button>`;
            })
            .join('')}</div>`
      ).join('');
    }
    function setShift(on) {
      if (shift === on) return;
      shift = on;
      $('.dg-shift').setAttribute('aria-pressed', String(on));
      renderKeyboard(true);
    }
    $('.dg-shift').addEventListener('click', () => setShift(!shift));
    cleanups.push(fx.ripple($('.dg-shift')));

    // Typing on the real keyboard lights up the matching symbol key.
    function pressKey(ch) {
      if (!ch || ch === '\n') return;
      if (ch === ' ') return flash($('.dg-space'));
      const pair = KEYBOARD.flat().find((p) => p.includes(ch));
      if (!pair) return;
      const wantShift = Array.from(pair)[1] === ch && Array.from(pair)[0] !== ch;
      setShift(wantShift);
      flash(rowsEl.querySelector(`.dg-key[data-char="${CSS.escape(ch)}"]`));
    }
    function flash(el) {
      if (!el) return;
      el.classList.remove('press');
      void el.offsetWidth;
      el.classList.add('press');
    }

    // Clicking a symbol key types its character.
    root.querySelector('.dg-kb').addEventListener('click', (e) => {
      const key = e.target.closest('.dg-key');
      if (!key) return;
      // Encoding types the letter; decoding types the symbol itself.
      const insert = mode === 'decode' && key.dataset.glyph ? key.dataset.glyph : key.dataset.char;
      input.setRangeText(insert, input.selectionStart, input.selectionEnd, 'end');
      flash(key);
      autosize();
      renderStream();
      input.focus();
      const r = key.getBoundingClientRect();
      fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 8, color: accent, spread: 3 });
    });

    // ------------------------------------------------------------ live stream
    let lastTiles = [];

    // Decoding: tiles show the recovered letter and flip to show the symbol.
    function renderDecodeStream({ reskin = false } = {}) {
      const value = input.value;
      const res = fromDingbats(value, decodeFont);
      root.classList.toggle('dg-has-text', Boolean(value.trim()));
      if (res.font !== fontId && res.total) {
        fontId = res.font;
        applyFontInfo();
        renderKeyboard(true);
      }
      root.querySelectorAll('.dg-font').forEach((b) => {
        b.setAttribute('aria-checked', String(Boolean(res.total) && b.dataset.font === res.font));
        b.classList.toggle('forced', decodeFont !== 'auto' && b.dataset.font === decodeFont);
      });
      tilesEl.innerHTML = '';
      const tokens = res.tokens.slice(0, MAX_TILES);
      tokens.forEach((t, i) => {
        if (t.type === 'newline' || t.type === 'space') {
          tilesEl.appendChild(Object.assign(document.createElement('span'), { className: t.type === 'space' ? 'dg-gap' : 'dg-break' }));
          return;
        }
        const tile = document.createElement('span');
        const sig = `${t.src}|${t.out}`;
        tile.className = `dg-tile dec${t.mapped ? '' : ' same'}`;
        if (reskin) tile.classList.add('reskin');
        else if (lastTiles[i] !== sig) tile.classList.add('fresh');
        tile.style.setProperty('--i', i);
        tile.title = t.mapped ? `${t.src}  →  ${t.out}  (${t.code}, ${t.name})` : `${t.src}  ${t.name}`;
        tile.innerHTML = `<span class="dg-tile-in"><span class="dg-face">${escapeHtml(t.out)}</span><span class="dg-back"><b>${escapeHtml(show(t.src))}</b><i>${t.code || '—'}</i></span></span>`;
        tilesEl.appendChild(tile);
      });
      if (res.tokens.length > MAX_TILES) {
        tilesEl.appendChild(Object.assign(document.createElement('span'), { className: 'dg-more', textContent: `+${res.tokens.length - MAX_TILES} more` }));
      }
      lastTiles = tokens.map((t) => `${t.src}|${t.out}`);
      if (!value.trim()) {
        liveText.textContent = 'decoded text appears here';
        liveText.parentElement.classList.add('idle');
        counter.textContent = decodeFont === 'auto' ? 'font: auto-detect' : `font: ${fontOf(decodeFont).name} (forced)`;
      } else {
        liveText.textContent = res.text.replace(/\n/g, ' ');
        liveText.parentElement.classList.remove('idle');
        counter.textContent = `${res.auto ? 'Detected' : 'Forced'}: ${fontOf(res.font).name} · ${res.hits} of ${res.total} symbols matched`;
      }
      return res;
    }

    function renderStream({ reskin = false } = {}) {
      if (mode === 'decode') return renderDecodeStream({ reskin });
      const value = input.value;
      const res = toDingbats(value, fontId);
      const tokens = res.tokens.slice(0, MAX_TILES);
      root.classList.toggle('dg-has-text', Boolean(value));
      tilesEl.innerHTML = '';
      tokens.forEach((t, i) => {
        if (t.type === 'newline') {
          tilesEl.appendChild(Object.assign(document.createElement('span'), { className: 'dg-break' }));
          return;
        }
        if (t.type === 'space') {
          tilesEl.appendChild(Object.assign(document.createElement('span'), { className: 'dg-gap' }));
          return;
        }
        const tile = document.createElement('span');
        const sig = `${t.src}|${t.glyph}`;
        tile.className = `dg-tile${t.mapped ? '' : ' same'}`;
        if (reskin) tile.classList.add('reskin');
        else if (lastTiles[i] !== sig) tile.classList.add('fresh');
        tile.style.setProperty('--i', i);
        tile.title = `${t.src}  ${t.code}  →  ${t.glyph}  ${t.name}`;
        tile.innerHTML = `<span class="dg-tile-in"><span class="dg-face">${escapeHtml(show(t.glyph))}</span><span class="dg-back"><b>${escapeHtml(t.src)}</b><i>${t.code}</i></span></span>`;
        tilesEl.appendChild(tile);
      });
      if (res.tokens.length > MAX_TILES) {
        const more = document.createElement('span');
        more.className = 'dg-more';
        more.textContent = `+${res.tokens.length - MAX_TILES} more`;
        tilesEl.appendChild(more);
      }
      lastTiles = tokens.map((t) => `${t.src}|${t.glyph}`);

      if (!value) {
        liveText.textContent = toDingbats('Type something', fontId).text;
        liveText.parentElement.classList.add('idle');
        counter.textContent = '0 characters';
      } else {
        liveText.textContent = Array.from(res.text).map((c) => (c === '\n' ? ' ' : c)).join('');
        liveText.parentElement.classList.remove('idle');
        const mapped = res.tokens.filter((t) => t.mapped).length;
        counter.textContent = `${mapped} of ${res.tokens.filter((t) => t.type === 'glyph').length} characters became symbols`;
      }
    }
    let streamFrame = 0;
    const scheduleStream = () => {
      if (!streamFrame) streamFrame = requestAnimationFrame(() => ((streamFrame = 0), renderStream()));
    };
    cleanups.push(() => cancelAnimationFrame(streamFrame));

    // ------------------------------------------------------------------ cards
    function addDecodeCard(entry, { animate }) {
      const res = fromDingbats(entry.src, entry.font || 'auto');
      const f = fontOf(res.font);
      const card = document.createElement('article');
      card.className = 'dg-card dg-card-decode';
      card.dataset.id = entry.id;
      if (animate) card.classList.add('dg-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="dg-card-glare"></div>
        <header class="dg-card-head">
          <span class="dg-card-src dg-card-symbols"></span>
          <span class="dg-card-meta"><i class="dg-tag"></i><span></span></span>
        </header>
        <div class="dg-decoded" title="Decoded text — select or copy"></div>
        <footer class="dg-card-actions">
          <button data-act="copy-text" class="dg-chip dg-chip-primary">Copy text</button>
          <button data-act="copy-symbols" class="dg-chip">Copy symbols</button>
          <button data-act="edit" class="dg-chip">Edit</button>
          <button data-act="delete" class="dg-chip dg-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      card.querySelector('.dg-card-symbols').textContent = Array.from(entry.src.replace(/[︎️]/g, ''), (c) => (/\s/.test(c) ? c : show(c))).join('');
      card.querySelector('.dg-tag').textContent = `${f.name} → text`;
      card.querySelector('.dg-card-meta span').textContent = `${res.hits}/${res.total} matched · ${time}`;
      const out = card.querySelector('.dg-decoded');
      Object.assign(card, { _text: res.text, _src: entry.src, _mode: 'decode', _font: entry.font || 'auto' });
      feed.appendChild(card);
      if (animate && res.text) {
        const glyphs = Object.values(MAPS[res.font]).map((v) => v[0]).filter((g) => g.length === 1).join('');
        fx.scramble(out, res.text, { duration: Math.min(1300, 350 + res.text.length * 20), glyphs }).then(() => {
          if (out.isConnected) out.textContent = res.text;
        });
      } else {
        out.textContent = res.text;
      }
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.dg-chip').forEach((b) => fx.ripple(b));
      return card;
    }

    function addCard(entry, { animate }) {
      if (entry.mode === 'decode') return addDecodeCard(entry, { animate });
      const res = toDingbats(entry.src, entry.font);
      const f = fontOf(entry.font);
      const card = document.createElement('article');
      card.className = 'dg-card';
      card.dataset.id = entry.id;
      if (animate) card.classList.add('dg-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="dg-card-glare"></div>
        <header class="dg-card-head">
          <span class="dg-card-src"></span>
          <span class="dg-card-meta"><i class="dg-tag"></i><span></span></span>
        </header>
        <div class="dg-out" title="Symbols — select or copy"></div>
        <footer class="dg-card-actions">
          <button data-act="copy" class="dg-chip dg-chip-primary">Copy symbols</button>
          <button data-act="copy-src" class="dg-chip" title="Set this text in the ${escapeAttr(f.name)} font to get the same symbols">Copy original</button>
          <button data-act="edit" class="dg-chip">Edit</button>
          <button data-act="delete" class="dg-chip dg-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      card.querySelector('.dg-card-src').textContent = entry.src;
      card.querySelector('.dg-tag').textContent = f.name;
      card.querySelector('.dg-card-meta span').textContent = `${Array.from(entry.src).length} characters · ${time}`;
      const out = card.querySelector('.dg-out');
      // Symbols are grouped by word so lines only break at spaces.
      let word = null;
      const flush = () => {
        if (word) out.appendChild(word);
        word = null;
      };
      res.tokens.forEach((t, i) => {
        if (t.type === 'newline' || t.type === 'space') {
          flush();
          out.appendChild(Object.assign(document.createElement('span'), { className: t.type === 'space' ? 'sp' : 'nl' }));
          return;
        }
        if (!word) word = Object.assign(document.createElement('span'), { className: 'w' });
        const s = document.createElement('span');
        s.className = t.mapped ? 'sym' : 'kept';
        s.style.setProperty('--i', Math.min(i, 80));
        s.textContent = show(t.glyph);
        s.title = `${t.src} ${t.code} → ${t.name}`;
        word.appendChild(s);
      });
      flush();
      out.classList.toggle('dg-animate', animate);
      card._text = res.text;
      card._src = entry.src;
      card._font = entry.font;
      feed.appendChild(card);
      if (out.scrollHeight > 206) out.classList.add('dg-scroll');
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.dg-chip').forEach((b) => fx.ripple(b));
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
      const card = btn.closest('.dg-card');
      const act = btn.dataset.act;
      if (act === 'copy' || act === 'copy-src' || act === 'copy-text' || act === 'copy-symbols') {
        const label = { copy: 'Symbols', 'copy-src': 'Original text', 'copy-text': 'Text', 'copy-symbols': 'Symbols' }[act];
        copy(act === 'copy' || act === 'copy-text' ? card._text : card._src, label);
        const r = btn.getBoundingClientRect();
        fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 18, color: accent, spread: 4 });
      } else if (act === 'edit' && card._mode === 'decode') {
        setMode('decode');
        decodeFont = card._font;
        input.value = card._src;
        autosize();
        renderStream();
        input.focus();
      } else if (act === 'edit') {
        setMode('encode');
        setFont(card._font, { animate: card._font !== fontId });
        input.value = card._src;
        autosize();
        renderStream();
        input.focus();
      } else if (act === 'delete') {
        history = history.filter((h) => String(h.id) !== card.dataset.id);
        storage.set(HISTORY_KEY, history);
        card.classList.add('dg-card-out');
        card.addEventListener('animationend', () => {
          card.remove();
          refreshMeta();
        }, { once: true });
      }
    });

    $('.dg-clear').addEventListener('click', () => {
      if (!history.length) return;
      history = [];
      storage.remove(HISTORY_KEY);
      const cards = feed.querySelectorAll('.dg-card');
      cards.forEach((c, i) => {
        c.style.animationDelay = `${i * 30}ms`;
        c.classList.add('dg-card-out');
        c.addEventListener('animationend', () => c.remove(), { once: true });
      });
      setTimeout(refreshMeta, 400 + cards.length * 30);
      scene.pulse(0.6);
    });

    // ------------------------------------------------------------------ input
    function autosize() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    }

    function send() {
      const value = input.value.replace(/\s+$/, '');
      if (!value) {
        ctx.sound.play('error');
        consoleEl.animate(
          [{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '-5px' }, { translate: '3px' }, { translate: '0' }],
          { duration: 450, easing: 'ease-in-out' }
        );
        return;
      }
      if (mode === 'decode' && !fromDingbats(value, decodeFont).hits) {
        ctx.sound.play('error');
        consoleEl.animate([{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '0' }], { duration: 400 });
        toast('None of these are Wingdings, Webdings, Symbol or Zapf Dingbats symbols', { type: 'error' });
        return;
      }
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const entry = mode === 'decode'
        ? { id, mode: 'decode', src: value, font: decodeFont, at: Date.now() }
        : { id, src: value, font: fontId, at: Date.now() };
      history.push(entry);
      if (history.length > MAX_HISTORY) {
        const dropped = history.splice(0, history.length - MAX_HISTORY);
        dropped.forEach((d) => feed.querySelector(`.dg-card[data-id="${d.id}"]`)?.remove());
      }
      storage.set(HISTORY_KEY, history);

      // The live tiles fly into the new card.
      const from = [...tilesEl.querySelectorAll('.dg-tile')].slice(0, 24).map((t) => t.getBoundingClientRect());
      const card = addCard(entry, { animate: true });
      refreshMeta();
      input.value = '';
      autosize();
      renderStream();

      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      requestAnimationFrame(() => {
        const c = card.getBoundingClientRect();
        const target = { x: c.left + c.width / 2, y: c.top + 50 };
        from.forEach((r, i) =>
          setTimeout(() => fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 5, color: i % 2 ? '#ffd7b8' : accent, spread: 5, target }), i * 18)
        );
        const b = sendBtn.getBoundingClientRect();
        fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 24, color: accent, spread: 6 });
      });
      consoleEl.animate(
        [
          { translate: '0', scale: '1', filter: 'brightness(1)' },
          { translate: '0 4px', scale: '0.985', filter: 'brightness(1.35)', offset: 0.25 },
          { translate: '0', scale: '1', filter: 'brightness(1)' },
        ],
        { duration: 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
      );
      scene.pulse(1);
    }

    input.addEventListener('input', (e) => {
      autosize();
      scheduleStream();
      if (mode === 'encode' && e.inputType?.startsWith('insert') && e.data) pressKey(Array.from(e.data).pop());
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      } else if (e.key === 'Escape' && input.value) {
        e.preventDefault();
        input.value = '';
        autosize();
        renderStream();
      }
    });
    sendBtn.addEventListener('click', send);
    cleanups.push(fx.ripple(sendBtn), fx.magnetic(sendBtn, { strength: 0.15 }), fx.tilt(consoleEl, { max: 2, scale: 1, perspective: 1600 }));

    const samples = $('.dg-samples');
    // Decode samples are the encode samples written in each of the fonts.
    const DECODE_SAMPLES = [['Hello World', 'wingdings'], ['please say hi', 'zapf'], ['pi = 3.14', 'symbol'], ['Secret!', 'webdings']];
    function buildSamples() {
      samples.innerHTML = '';
      const list = mode === 'encode' ? SAMPLES : DECODE_SAMPLES.map(([t, f]) => toDingbats(t, f).text);
      for (const s of list) {
        const chip = document.createElement('button');
        chip.className = `dg-chip${mode === 'decode' ? ' dg-chip-glyphs' : ''}`;
        chip.textContent = mode === 'decode' ? Array.from(s, (c) => (c === ' ' ? c : show(c))).join('') : s;
        chip.addEventListener('click', () => {
          input.value = s;
          renderStream();
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
      decodeFont = 'auto';
      root.classList.toggle('dg-decoding', mode === 'decode');
      root.querySelectorAll('.dg-mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
      root.querySelectorAll('.dg-font').forEach((b) => b.classList.remove('forced'));
      const title = mode === 'encode' ? 'Text to Dingbats' : 'Dingbats to Text';
      if (animate && changed) fx.scramble($('.dg-title'), title, { duration: 600 });
      else $('.dg-title').textContent = title;
      $('.dg-sub').textContent = mode === 'encode'
        ? 'Old fonts that drew pictures instead of letters, rebuilt as real symbols you can paste anywhere.'
        : 'Paste Wingdings, Webdings, Symbol or Zapf Dingbats symbols: the font is detected and they turn back into text.';
      input.placeholder = mode === 'encode'
        ? 'Type text to turn into symbols and press Enter…'
        : 'Paste Wingdings, Webdings, Symbol or Zapf symbols and press Enter…';
      input.setAttribute('aria-label', mode === 'encode' ? 'Text to convert' : 'Symbols to decode');
      sendBtn.querySelector('span').textContent = mode === 'encode' ? 'Convert' : 'Decode';
      $('.dg-verb').textContent = mode === 'encode' ? 'convert' : 'decode';
      $('.dg-kbhint').textContent = mode === 'encode' ? 'click keyboard keys to type' : 'click keys to type symbols · click a font to force it';
      $('.dg-stream-hint').textContent = mode === 'encode'
        ? 'Start typing: every key becomes a symbol. Hover a tile to flip it.'
        : 'Paste symbols: the font is detected and every symbol turns back into its letter.';
      $('.dg-empty p').textContent = mode === 'encode' ? 'Your converted text will appear here.' : 'Decoded messages will appear here.';
      buildSamples();
      if (changed) {
        input.value = '';
        autosize();
        lastTiles = [];
        applyFontInfo();
        if (animate) {
          scene.pulse(0.8);
          const b = root.querySelector(`.dg-mode[data-mode="${mode}"]`).getBoundingClientRect();
          fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 24, color: accent, spread: 5 });
        }
      }
      renderStream();
    }
    root.querySelectorAll('.dg-mode').forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
      cleanups.push(fx.ripple(b));
    });

    // First paint, then history from previous sessions (no entrance animation).
    applyFontInfo();
    renderKeyboard();
    setMode(mode, { animate: false });
    history.forEach((h) => addCard({ font: 'wingdings', ...h }, { animate: false }));
    refreshMeta();
    feed.scrollTop = feed.scrollHeight;

    // ------------------------------------------------------------------ intro
    root.classList.add('dg-intro');
    const fontsReady = Promise.race([
      Promise.all(['DG Symbols2', 'DG Symbols', 'DG Math'].map((f) => document.fonts.load(`32px "${f}"`))).catch(() => {}),
      new Promise((r) => setTimeout(r, 700)),
    ]);
    let storm = { cancel() {} };
    cleanups.push(() => storm.cancel());
    fontsReady.then(() => {
      if (!alive) return;
      storm = playStorm($('.dg-storm'), accent);
      // Sound: the symbol storm bursts out of the centre and rattles past.
      const stormSfx = ctx.sound.sequence([
        { at: 0, name: 'boom' },
        { at: 0, name: 'whir', duration: 1.4 },
        { at: 150, name: 'shuffle' },
        { at: 520, name: 'shuffle' },
        { at: 900, name: 'shuffle' },
        { at: 1350, name: 'swish' },
      ]);
      cleanups.push(stormSfx.stop);
      storm.done.then(() => stormSfx.stop());
      storm.done.then(() => {
        if (!alive) return;
        root.classList.add('dg-ready');
        scene.pulse(1.2);
        // Only single-unit symbols, so the scramble never splits an emoji in half.
        const glyphs = Object.values(MAPS)
          .flatMap((m) => Object.values(m).map((v) => v[0]))
          .filter((g) => g.length === 1 && g.codePointAt(0) > 0x2000)
          .join('');
        fx.scramble($('.dg-title'), mode === 'encode' ? 'Text to Dingbats' : 'Dingbats to Text', { duration: 900, glyphs });
        setTimeout(() => alive && input.focus(), 450);
      });
    });

    return () => {
      alive = false;
      cleanups.forEach((fn) => fn());
    };
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}
function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------------------------------------------------------------------------
// Intro: a storm of symbols from all four fonts bursts out of the centre in
// 3D, spins and fades. Click or any key skips it.
// ---------------------------------------------------------------------------
function playStorm(canvas, accent) {
  const host = canvas.parentElement;
  const g = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pool = Object.values(MAPS).flatMap((m) => Object.values(m).map((v) => v[0]));
  const parts = Array.from({ length: 170 }, () => {
    const a = Math.random() * Math.PI * 2;
    const tilt = (Math.random() - 0.5) * 2;
    const v = 0.35 + Math.random() * 0.9;
    return {
      ch: pool[(Math.random() * pool.length) | 0] + VS15,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v * 0.75,
      vz: tilt * v,
      spin: (Math.random() - 0.5) * 0.01,
      size: 18 + Math.random() * 26,
      white: Math.random() < 0.25,
    };
  });
  const T_END = 1700;
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
    setTimeout(() => canvas.remove(), 700);
  };

  function frame(now) {
    const t = now - start;
    const k = t / T_END;
    const ease = 1 - Math.pow(1 - Math.min(k, 1), 3);
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of parts) {
      const dist = ease * Math.max(W, H) * 0.62;
      const z = 1 + p.vz * ease * 1.4;
      const persp = Math.max(0.2, z);
      const x = W / 2 + p.vx * dist * persp;
      const y = H * 0.45 + p.vy * dist * persp;
      const alpha = Math.min(1, t / 180) * (1 - Math.max(0, (k - 0.55) / 0.45));
      if (alpha <= 0) continue;
      g.save();
      g.translate(x, y);
      g.rotate(p.spin * t);
      g.globalAlpha = alpha;
      g.font = `${p.size * persp}px 'DG Symbols2', 'DG Symbols', 'DG Math', 'DejaVu Sans', sans-serif`;
      g.shadowColor = accent;
      g.shadowBlur = 14;
      g.fillStyle = p.white ? '#ffffff' : accent;
      g.fillText(p.ch, 0, 0);
      g.restore();
    }
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
