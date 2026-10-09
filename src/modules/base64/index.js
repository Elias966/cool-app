import { encodeBase64, encodeBytes, decodeBase64, ALPHABET, URL_ALPHABET } from './base64.js';

const HISTORY_KEY = 'history';
const MAX_HISTORY = 40;
const LIVE_GROUPS = 3; // groups drawn in the live pipeline (9 bytes)
const SAMPLES = ['Hello, World!', 'Man', 'Prism ✦', '🙂 emoji too'];

export default {
  mount(root, ctx) {
    const { fx, scene, storage, toast } = ctx;
    const accent = ctx.meta.accent || '#22d3ee';
    const cleanups = [];
    let alive = true;

    let opts = { urlSafe: false, pad: true, ...storage.get('options', {}) };
    let mode = storage.get('mode', 'encode') === 'decode' ? 'decode' : 'encode';
    let history = storage.get(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];

    root.classList.add('b64');
    root.innerHTML = `
      <canvas class="b64-rain" aria-hidden="true"></canvas>

      <header class="b64-head">
        <div class="b64-head-main">
          <div class="b64-badge"><span></span>MODULE · ENCODER</div>
          <h1 class="b64-title">Text to Base64</h1>
          <p class="b64-sub">Every <b>3 bytes</b> become <b>4 characters</b>. Type and watch it happen.</p>
        </div>
        <div class="b64-ring-wrap" aria-hidden="true" title="The 64 Base64 characters. The ones your text uses light up.">
          <div class="b64-ring"></div>
          <div class="b64-ring-core">64</div>
        </div>
      </header>

      <section class="b64-pipe" aria-label="How the current text is encoded">
        <div class="b64-pipe-legend">
          <span><i class="lg-byte"></i>bytes (8 bits)</span>
          <span><i class="lg-s0"></i><i class="lg-s1"></i>6-bit groups</span>
          <span><i class="lg-fill"></i>added zeros</span>
          <span><i class="lg-pad"></i>padding</span>
        </div>
        <div class="b64-groups"></div>
      </section>

      <div class="b64-feed" role="log" aria-live="polite">
        <div class="b64-empty">
          <p>Your encodings will appear here.</p>
          <div class="b64-samples"></div>
        </div>
      </div>

      <div class="b64-console">
        <div class="b64-console-border" aria-hidden="true"></div>
        <div class="b64-live"><span class="b64-live-text"></span></div>
        <div class="b64-inputrow">
          <textarea class="b64-input" rows="1" spellcheck="false" placeholder="Type text to encode and press Enter…" aria-label="Text to encode"></textarea>
          <button class="b64-send" aria-label="Encode to Base64">
            <span>Encode</span>
            <svg viewBox="0 0 24 24"><path d="M4 12h15M13 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="b64-bar">
          <div class="b64-modes" role="tablist" aria-label="Direction">
            <button class="b64-mode" role="tab" data-mode="encode">Text → Base64</button>
            <button class="b64-mode" role="tab" data-mode="decode">Base64 → Text</button>
          </div>
          <div class="b64-toggles">
            <button class="b64-chip b64-toggle" data-opt="urlSafe" aria-pressed="false" title="Use - and _ instead of + and /, safe for URLs and file names">URL-safe</button>
            <button class="b64-chip b64-toggle" data-opt="pad" aria-pressed="true" title="Add = at the end so the length is a multiple of 4">Padding =</button>
          </div>
          <span class="b64-hint"><kbd>Enter</kbd> <span class="b64-verb">encode</span> · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Esc</kbd> clear</span>
          <span class="b64-counter"></span>
          <button class="b64-chip b64-chip-danger b64-clear" title="Clear history">Clear</button>
        </div>
      </div>
    `;

    const $ = (s) => root.querySelector(s);
    const input = $('.b64-input');
    const sendBtn = $('.b64-send');
    const consoleEl = $('.b64-console');
    const feed = $('.b64-feed');
    const empty = $('.b64-empty');
    const groupsEl = $('.b64-groups');
    const liveText = $('.b64-live-text');
    const counter = $('.b64-counter');
    const ring = $('.b64-ring');

    // ------------------------------------------------------- 3D alphabet ring
    const ringChars = [];
    function buildRing() {
      ring.innerHTML = '';
      ringChars.length = 0;
      const abc = opts.urlSafe ? URL_ALPHABET : ALPHABET;
      Array.from(abc).forEach((ch, i) => {
        const el = document.createElement('span');
        el.textContent = ch;
        el.style.setProperty('--a', `${(i * 360) / 64}deg`);
        ring.appendChild(el);
        ringChars.push(el);
      });
    }
    function lightRing(text) {
      const used = new Set(text);
      ringChars.forEach((el) => el.classList.toggle('hit', used.has(el.textContent)));
    }
    function flashRing(text) {
      const order = Array.from(new Set(text.replace(/=/g, '')));
      order.slice(0, 40).forEach((ch, k) => {
        const el = ringChars.find((r) => r.textContent === ch);
        if (!el) return;
        setTimeout(() => {
          if (!el.isConnected) return;
          el.classList.remove('flash');
          void el.offsetWidth;
          el.classList.add('flash');
          if (k < 16) ctx.sound.play('chime', { note: ringChars.indexOf(el) % 10, peak: 0.035 });
        }, k * 35);
      });
    }

    // --------------------------------------------------------- live pipeline
    const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');
    const printable = (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '');
    let lastChars = [];
    let pipeTilts = [];
    cleanups.push(() => pipeTilts.forEach((fn) => fn()));

    // In decode mode the same grid is read bottom-up: characters, their 6-bit
    // values, then the bytes they rebuild.
    function pipelineSource(value) {
      const demo = !value;
      if (mode === 'encode') return { res: encodeBase64(demo ? 'Man' : value, opts), demo };
      const dec = decodeBase64(demo ? 'TWFu' : value);
      if (!dec.ok) return { res: { groups: [], text: '', bytes: [] }, demo, dec };
      return { res: encodeBytes(dec.bytes, { urlSafe: dec.urlSafe, pad: true }), demo, dec };
    }

    function renderPipeline(value) {
      pipeTilts.forEach((fn) => fn());
      pipeTilts = [];
      const src = pipelineSource(value);
      const { res, demo } = src;
      const showPad = mode === 'decode' || opts.pad;
      const shown = res.groups.slice(0, LIVE_GROUPS);
      groupsEl.classList.toggle('demo', demo);
      groupsEl.innerHTML = '';

      shown.forEach((g, gi) => {
        const col = document.createElement('div');
        col.className = 'b64-group';
        if (lastChars[gi] !== g.chars) col.classList.add('changed');
        const count = g.bytes.length;
        const cells = [];

        // Row 1: bytes, 8 columns each
        for (let k = 0; k < 3; k++) {
          const b = g.bytes[k];
          const ch = b === undefined ? '' : printable(b);
          cells.push(
            b === undefined
              ? `<div class="b64-byte none" style="grid-column: span 8">—</div>`
              : `<div class="b64-byte" style="grid-column: span 8"><b>${ch ? escapeHtml(ch) : '·'}</b><span>0x${hex(b)}</span>${ch ? '' : '<em>UTF-8</em>'}</div>`
          );
        }
        // Row 2: 24 bits, colored by the 6-bit group they land in
        for (let j = 0; j < 24; j++) {
          const s = Math.floor(j / 6);
          let cls;
          let bit = '';
          if (j < count * 8) {
            bit = (g.bytes[Math.floor(j / 8)] >> (7 - (j % 8))) & 1;
            cls = `bit s${s % 2}`;
          } else if (s <= count) {
            bit = 0;
            cls = 'bit fill';
          } else {
            cls = 'bit pad';
          }
          cells.push(`<div class="b64-${cls}" style="--j:${j}">${bit}</div>`);
        }
        // Row 3: the four 6-bit values and their characters, 6 columns each
        for (let s = 0; s < 4; s++) {
          const v = g.sextets[s];
          if (v === undefined) {
            cells.push(`<div class="b64-sextet pad" style="grid-column: span 6"><b>${showPad ? '=' : '∅'}</b><span>${showPad ? 'padding' : 'no pad'}</span></div>`);
          } else {
            cells.push(`<div class="b64-sextet s${s % 2}" style="grid-column: span 6;--s:${s}"><b>${escapeHtml(g.chars[s])}</b><span>${v}</span></div>`);
          }
        }
        col.innerHTML = `<div class="b64-grid">${cells.join('')}</div>`;
        groupsEl.appendChild(col);
        pipeTilts.push(fx.tilt(col, { max: 6, scale: 1.02, perspective: 900 }));
      });

      if (res.groups.length > LIVE_GROUPS) {
        const more = document.createElement('div');
        more.className = 'b64-more';
        more.textContent = `+${res.groups.length - LIVE_GROUPS} more group${res.groups.length - LIVE_GROUPS === 1 ? '' : 's'}`;
        groupsEl.appendChild(more);
      }
      if (demo) {
        const tag = document.createElement('div');
        tag.className = 'b64-more';
        tag.textContent = mode === 'encode' ? 'example: "Man" → TWFu' : 'example: TWFu → "Man"';
        groupsEl.appendChild(tag);
      }
      lastChars = shown.map((g) => g.chars);
      return src;
    }

    // Show the end of long output: "…" plus as many trailing characters as fit.
    // The font is monospaced, so one measured character width is enough.
    let charWidth = 0;
    function showTail(text) {
      const box = liveText.parentElement;
      if (!charWidth) {
        liveText.textContent = 'MMMMMMMMMM';
        charWidth = liveText.getBoundingClientRect().width / 10 || 9.75;
      }
      const fit = Math.max(8, Math.floor(box.clientWidth / charWidth) - 1);
      liveText.textContent = text.length > fit ? `…${text.slice(-(fit - 1))}` : text;
    }

    function updateLive() {
      const value = input.value;
      const { res, dec } = renderPipeline(value);
      const live = liveText.parentElement;
      live.classList.remove('err');
      if (!value) {
        showTail(mode === 'encode' ? 'VHlwZSBzb21ldGhpbmc=' : 'decoded text appears here');
        live.classList.add('idle');
        counter.textContent = mode === 'encode' ? '0 bytes → 0 chars' : '0 chars → 0 bytes';
        lightRing('');
        return;
      }
      live.classList.remove('idle');
      if (mode === 'decode') {
        lightRing(value);
        if (!dec.ok) {
          live.classList.add('err');
          liveText.textContent = dec.error;
          counter.textContent = '';
          return;
        }
        showTail(dec.utf8 ? dec.text.replace(/\n/g, ' ↵ ') : `binary data: ${hexDump(dec.bytes, 24)}`);
        counter.textContent = `${value.replace(/\s/g, '').length} chars → ${dec.bytes.length} byte${dec.bytes.length === 1 ? '' : 's'}`;
        return;
      }
      showTail(res.text);
      counter.textContent = `${res.bytes.length} byte${res.bytes.length === 1 ? '' : 's'} → ${res.text.length} chars`;
      lightRing(res.text);
    }
    let liveFrame = 0;
    const scheduleLive = () => {
      if (!liveFrame) liveFrame = requestAnimationFrame(() => ((liveFrame = 0), updateLive()));
    };
    cleanups.push(() => cancelAnimationFrame(liveFrame));

    // ------------------------------------------------------------------ cards
    function outputMarkup(text) {
      const m = /=+$/.exec(text);
      const body = m ? text.slice(0, m.index) : text;
      return `${escapeHtml(body)}${m ? `<span class="pad">${m[0]}</span>` : ''}`;
    }

    function addDecodeCard(entry, { animate }) {
      const dec = decodeBase64(entry.src);
      const card = document.createElement('article');
      card.className = 'b64-card b64-card-decode';
      card.dataset.id = entry.id;
      if (animate) card.classList.add('b64-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const tags = ['decoded', dec.urlSafe ? 'URL-safe' : 'standard', dec.utf8 ? 'text' : 'binary'];
      card.innerHTML = `
        <div class="b64-card-glare"></div>
        <header class="b64-card-head">
          <span class="b64-card-src b64-card-src-code"></span>
          <span class="b64-card-meta"></span>
        </header>
        <div class="b64-out b64-out-text" title="Decoded — select or copy"></div>
        <footer class="b64-card-actions">
          <span class="b64-tags">${tags.map((t) => `<i>${t}</i>`).join('')}</span>
          <button data-act="copy-text" class="b64-chip b64-chip-primary">${dec.utf8 ? 'Copy text' : 'Copy hex'}</button>
          <button data-act="copy-b64" class="b64-chip">Copy Base64</button>
          <button data-act="edit" class="b64-chip">Edit</button>
          <button data-act="delete" class="b64-chip b64-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      card.querySelector('.b64-card-src').textContent = entry.src.length > 160 ? `${entry.src.slice(0, 160)}…` : entry.src;
      card.querySelector('.b64-card-meta').textContent = `${entry.src.replace(/\s/g, '').length} chars → ${dec.bytes.length} bytes · ${time}`;
      const out = card.querySelector('.b64-out');
      const text = dec.utf8 ? dec.text : hexDump(dec.bytes, 64);
      if (!dec.utf8) {
        out.classList.add('b64-out-hex');
        const note = document.createElement('div');
        note.className = 'b64-binary-note';
        note.textContent = 'This decodes to binary data (not UTF-8 text), so it is shown as hex bytes.';
        out.after(note);
      }
      Object.assign(card, { _text: dec.utf8 ? dec.text : hexDump(dec.bytes), _b64: entry.src, _mode: 'decode' });
      feed.appendChild(card);
      if (animate && text) {
        fx.scramble(out, text, { duration: Math.min(1400, 350 + text.length * 8), glyphs: ALPHABET }).then(() => {
          if (out.isConnected) out.textContent = text;
        });
      } else {
        out.textContent = text;
      }
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.b64-chip').forEach((b) => fx.ripple(b));
      return card;
    }

    function addCard(entry, { animate }) {
      if (entry.mode === 'decode') return addDecodeCard(entry, { animate });
      const res = encodeBase64(entry.src, entry.opts);
      const card = document.createElement('article');
      card.className = 'b64-card';
      card.dataset.id = entry.id;
      if (animate) card.classList.add('b64-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const growth = res.bytes.length ? Math.round(((res.text.length - res.bytes.length) / res.bytes.length) * 100) : 0;
      const tags = [entry.opts.urlSafe ? 'URL-safe' : 'standard', entry.opts.pad ? 'padded' : 'no padding'];
      card.innerHTML = `
        <div class="b64-card-glare"></div>
        <header class="b64-card-head">
          <span class="b64-card-src"></span>
          <span class="b64-card-meta"></span>
        </header>
        <div class="b64-out" title="Base64 — select or copy"></div>
        <footer class="b64-card-actions">
          <span class="b64-tags">${tags.map((t) => `<i>${t}</i>`).join('')}</span>
          <button data-act="copy" class="b64-chip b64-chip-primary">Copy Base64</button>
          <button data-act="copy-uri" class="b64-chip" title="data:text/plain;charset=utf-8;base64,…">Copy as data URI</button>
          <button data-act="edit" class="b64-chip">Edit</button>
          <button data-act="delete" class="b64-chip b64-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      card.querySelector('.b64-card-src').textContent = entry.src;
      card.querySelector('.b64-card-meta').textContent = `${res.bytes.length} bytes → ${res.text.length} chars · +${growth}% · ${time}`;
      const out = card.querySelector('.b64-out');
      card._b64 = res.text;
      card._src = entry.src;
      card._opts = entry.opts;
      feed.appendChild(card);

      if (animate && res.text) {
        const glyphs = (entry.opts.urlSafe ? URL_ALPHABET : ALPHABET) + '01';
        fx.scramble(out, res.text, { duration: Math.min(1400, 350 + res.text.length * 6), glyphs }).then(() => {
          if (out.isConnected) out.innerHTML = outputMarkup(res.text);
        });
      } else {
        out.innerHTML = outputMarkup(res.text);
      }
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.b64-chip').forEach((b) => fx.ripple(b));
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
      const card = btn.closest('.b64-card');
      const act = btn.dataset.act;
      if (act === 'copy-text' || act === 'copy-b64') {
        copy(act === 'copy-text' ? card._text : card._b64, act === 'copy-text' ? 'Text' : 'Base64');
        const r = btn.getBoundingClientRect();
        fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 18, color: accent, spread: 4 });
      } else if (act === 'edit' && card._mode === 'decode') {
        setMode('decode');
        input.value = card._b64;
        autosize();
        updateLive();
        input.focus();
      } else if (act === 'copy' || act === 'copy-uri') {
        copy(act === 'copy' ? card._b64 : `data:text/plain;charset=utf-8;base64,${encodeBase64(card._src).text}`, act === 'copy' ? 'Base64' : 'Data URI');
        const r = btn.getBoundingClientRect();
        fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 18, color: accent, spread: 4 });
      } else if (act === 'edit') {
        setMode('encode');
        setOptions(card._opts);
        input.value = card._src;
        autosize();
        updateLive();
        input.focus();
      } else if (act === 'delete') {
        history = history.filter((h) => String(h.id) !== card.dataset.id);
        storage.set(HISTORY_KEY, history);
        card.classList.add('b64-card-out');
        card.addEventListener('animationend', () => {
          card.remove();
          refreshMeta();
        }, { once: true });
      }
    });

    $('.b64-clear').addEventListener('click', () => {
      if (!history.length) return;
      history = [];
      storage.remove(HISTORY_KEY);
      const cards = feed.querySelectorAll('.b64-card');
      cards.forEach((c, i) => {
        c.style.animationDelay = `${i * 30}ms`;
        c.classList.add('b64-card-out');
        c.addEventListener('animationend', () => c.remove(), { once: true });
      });
      setTimeout(refreshMeta, 400 + cards.length * 30);
      scene.pulse(0.6);
    });

    // ------------------------------------------------------------------ input
    function autosize() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
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
      if (mode === 'decode') {
        const dec = decodeBase64(value);
        if (!dec.ok) {
          ctx.sound.play('error');
          consoleEl.animate([{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '0' }], { duration: 400 });
          toast(dec.error, { type: 'error' });
          return;
        }
      }
      const entry = mode === 'decode'
        ? { id: Date.now() + Math.floor(Math.random() * 1000), mode: 'decode', src: value.trim(), at: Date.now() }
        : { id: Date.now() + Math.floor(Math.random() * 1000), src: value, opts: { ...opts }, at: Date.now() };
      history.push(entry);
      if (history.length > MAX_HISTORY) {
        const dropped = history.splice(0, history.length - MAX_HISTORY);
        dropped.forEach((d) => feed.querySelector(`.b64-card[data-id="${d.id}"]`)?.remove());
      }
      storage.set(HISTORY_KEY, history);

      const card = addCard(entry, { animate: true });
      refreshMeta();
      flashRing(card._b64);
      input.value = '';
      autosize();
      updateLive();

      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      const b = sendBtn.getBoundingClientRect();
      requestAnimationFrame(() => {
        const c = card.getBoundingClientRect();
        fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 24, color: accent, spread: 6 });
        fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 44, color: '#a5f3fc', spread: 14, target: { x: c.left + c.width / 2, y: c.top + 50 } });
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
        updateLive();
      }
    });
    sendBtn.addEventListener('click', send);
    cleanups.push(fx.ripple(sendBtn), fx.magnetic(sendBtn, { strength: 0.15 }), fx.tilt(consoleEl, { max: 2, scale: 1, perspective: 1600 }));

    // ---------------------------------------------------------------- options
    function setOptions(next) {
      const ringChanged = Boolean(next.urlSafe) !== Boolean(opts.urlSafe);
      opts = { ...opts, ...next };
      storage.set('options', opts);
      root.querySelectorAll('.b64-toggle').forEach((t) => t.setAttribute('aria-pressed', String(Boolean(opts[t.dataset.opt]))));
      if (ringChanged) buildRing();
      lastChars = [];
      updateLive();
    }
    root.querySelectorAll('.b64-toggle').forEach((t) => {
      t.addEventListener('click', () => {
        setOptions({ [t.dataset.opt]: !opts[t.dataset.opt] });
        const r = t.getBoundingClientRect();
        fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 12, color: accent, spread: 3.5 });
      });
      cleanups.push(fx.ripple(t));
    });

    // --------------------------------------------------------------- mode
    function setMode(next, { animate = true } = {}) {
      const changed = next !== mode;
      mode = next;
      storage.set('mode', mode);
      root.classList.toggle('b64-decoding', mode === 'decode');
      root.querySelectorAll('.b64-mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
      const title = mode === 'encode' ? 'Text to Base64' : 'Base64 to Text';
      if (animate && changed) fx.scramble($('.b64-title'), title, { duration: 600, glyphs: ALPHABET });
      else $('.b64-title').textContent = title;
      $('.b64-sub').innerHTML = mode === 'encode'
        ? 'Every <b>3 bytes</b> become <b>4 characters</b>. Type and watch it happen.'
        : 'Every <b>4 characters</b> turn back into <b>3 bytes</b>. Paste Base64 and read it.';
      const enter = document.body.classList.contains('handheld') ? '' : ' and press Enter'; // no Enter key hint on touch screens
      input.placeholder = mode === 'encode' ? `Type text to encode${enter}…` : `Paste Base64 (or a data: URI)${enter}…`;
      input.setAttribute('aria-label', mode === 'encode' ? 'Text to encode' : 'Base64 to decode');
      sendBtn.querySelector('span').textContent = mode === 'encode' ? 'Encode' : 'Decode';
      $('.b64-verb').textContent = mode === 'encode' ? 'encode' : 'decode';
      $('.b64-toggles').hidden = mode === 'decode';
      $('.b64-empty p').textContent = mode === 'encode' ? 'Your encodings will appear here.' : 'Decoded messages will appear here.';
      buildSamples();
      if (changed) {
        input.value = '';
        autosize();
        lastChars = [];
        if (animate) {
          scene.pulse(0.8);
          const b = root.querySelector(`.b64-mode[data-mode="${mode}"]`).getBoundingClientRect();
          fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 24, color: accent, spread: 5 });
        }
      }
      updateLive();
    }
    root.querySelectorAll('.b64-mode').forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
      cleanups.push(fx.ripple(b));
    });

    const samples = $('.b64-samples');
    function buildSamples() {
      samples.innerHTML = '';
      for (const s of SAMPLES) {
        const value = mode === 'encode' ? s : encodeBase64(s).text;
        const chip = document.createElement('button');
        chip.className = 'b64-chip';
        chip.textContent = value;
        chip.addEventListener('click', () => {
          input.value = value;
          updateLive();
          send();
        });
        samples.appendChild(chip);
      }
    }

    // History from previous sessions (no entrance animation).
    buildRing();
    setOptions({});
    setMode(mode, { animate: false });
    history.forEach((h) => addCard({ opts: { urlSafe: false, pad: true }, ...h }, { animate: false }));
    refreshMeta();
    feed.scrollTop = feed.scrollHeight;

    // ------------------------------------------------------------------ intro
    root.classList.add('b64-intro');
    const rain = playRain($('.b64-rain'), accent);
    // Sound: digital rain that gets denser and faster with the animation.
    const introSfx = ctx.sound.sequence([
      { at: 0, name: 'rain', duration: 1.9 },
      { at: 0, name: 'wind', duration: 1.9, freq: 1400, peak: 0.03 },
      { at: 1650, name: 'swish' },
    ]);
    cleanups.push(rain.cancel, introSfx.stop);
    rain.done.then(() => introSfx.stop());
    rain.done.then(() => {
      if (!alive) return;
      root.classList.add('b64-ready');
      scene.pulse(1.2);
      fx.scramble($('.b64-title'), mode === 'encode' ? 'Text to Base64' : 'Base64 to Text', { duration: 900, glyphs: ALPHABET });
      setTimeout(() => alive && input.focus(), 450);
    });

    return () => {
      alive = false;
      cleanups.forEach((fn) => fn());
    };
  },
};

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Bytes as hex pairs, e.g. "89 50 4E 47", cut off after `max` bytes. */
function hexDump(bytes, max = Infinity) {
  const parts = Array.from(bytes.slice(0, max), (b) => b.toString(16).toUpperCase().padStart(2, '0'));
  return parts.join(' ') + (bytes.length > max ? ' …' : '');
}

// ---------------------------------------------------------------------------
// Intro: falling streams of bits and Base64 characters that speed up, flash,
// then dissolve to reveal the page. Click or any key skips it.
// ---------------------------------------------------------------------------
function playRain(canvas, accent) {
  const host = canvas.parentElement;
  const g = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const glyphs = `01010101${ALPHABET}`;
  const size = 16;
  const cols = Math.ceil(W / size);
  const drops = Array.from({ length: cols }, () => ({ y: -Math.random() * H, speed: 0.6 + Math.random() * 1.4 }));
  const T_END = 1900;
  let start = performance.now();
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

  g.font = `600 ${size - 2}px 'JetBrains Mono', 'DejaVu Sans Mono', monospace`;
  function frame(now) {
    const t = now - start;
    const boost = 1 + Math.min(t / T_END, 1) * 3; // streams accelerate
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    drops.forEach((d, i) => {
      const ch = glyphs[(Math.random() * glyphs.length) | 0];
      const x = i * size;
      g.fillStyle = Math.random() < 0.08 ? '#ffffff' : accent;
      g.globalAlpha = 0.55 + Math.random() * 0.45;
      g.fillText(ch, x, d.y);
      d.y += size * 0.55 * d.speed * boost;
      if (d.y > H + size) d.y = -Math.random() * 200;
    });
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
