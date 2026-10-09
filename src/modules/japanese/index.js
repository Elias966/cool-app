import { STYLES, styleById, chartFor, encode, decode, romajiOf, hasJapanese } from './japanese.js';

const HISTORY_KEY = 'history';
const MAX_HISTORY = 40;
const PREVIEW_TOKENS = 160; // tokens drawn in the live scroll
const SAMPLES = ['Hello, World!', 'I love sushi', 'konnichiwa', 'Meet me at midnight'];
const DECODE_SAMPLES = [
  ['こんにちは、せかい', 'mixed'],
  ['Hello world', 'katakana'],
  ['Wake up, Neo', 'hankaku'],
  ['Hello world', 'kanjilook'],
];
const GLYPHS = 'あいうえおかきくけこさしすせそアイウエオカキクケコｱｲｳｴｵ卂乃匚刀乇千';

export default {
  mount(root, ctx) {
    const { fx, scene, storage, toast } = ctx;
    const accent = ctx.meta.accent || '#ff3b5c';
    const cleanups = [];
    let alive = true;

    let mode = storage.get('mode', 'encode') === 'decode' ? 'decode' : 'encode';
    let styleId = styleById(storage.get('style', 'katakana')).id;
    // When decoding: 'auto' detects the style, or a style id forces it.
    let decodeStyle = 'auto';
    let opts = { furigana: true, vertical: false, ...storage.get('options', {}) };
    let history = storage.get(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];

    root.classList.add('jp');
    root.innerHTML = `
      <canvas class="jp-intro" aria-hidden="true"></canvas>

      <header class="jp-head">
        <div class="jp-head-main">
          <div class="jp-badge"><span></span>MODULE · 日本語</div>
          <h1 class="jp-title">Japanese Scripts</h1>
          <p class="jp-sub"></p>
        </div>
        <div class="jp-emblem" aria-hidden="true">
          <div class="jp-sun"></div>
          <div class="jp-ring"></div>
          <div class="jp-hanko"><span>文字</span></div>
        </div>
      </header>

      <div class="jp-main">
        <div class="jp-left">
          <section class="jp-scroll" aria-label="Live preview">
            <span class="jp-scroll-label"></span>
            <div class="jp-scroll-text"></div>
          </section>
          <div class="jp-feed" role="log" aria-live="polite">
            <div class="jp-empty">
              <p></p>
              <div class="jp-samples"></div>
            </div>
          </div>
        </div>

        <aside class="jp-side">
          <section class="jp-panel">
            <div class="jp-panel-head"><span>Style</span><span class="jp-style-note"></span></div>
            <div class="jp-styles" role="radiogroup" aria-label="Writing style">
              ${STYLES.map((s, i) => `
                <button class="jp-style" role="radio" data-style="${s.id}" style="--i:${i}">
                  <span class="jp-style-jp">${s.jp}</span>
                  <span class="jp-style-main"><b>${s.name}</b><small>${s.blurb}</small></span>
                  <span class="jp-style-sample">${escapeHtml(encode('Hello', s.id).text)}</span>
                  <i class="jp-style-badge"></i>
                </button>`).join('')}
            </div>
          </section>
          <section class="jp-panel jp-chartbox">
            <div class="jp-panel-head"><span class="jp-chart-title"></span><span class="jp-chart-note"></span></div>
            <div class="jp-chart"></div>
          </section>
        </aside>
      </div>

      <div class="jp-console">
        <div class="jp-console-border" aria-hidden="true"></div>
        <div class="jp-live"><span class="jp-live-text"></span></div>
        <div class="jp-inputrow">
          <textarea class="jp-input" rows="1" spellcheck="false"></textarea>
          <button class="jp-send">
            <span>Convert</span>
            <svg viewBox="0 0 24 24"><path d="M4 12h15M13 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="jp-bar">
          <div class="jp-modes" role="tablist" aria-label="Direction">
            <button class="jp-mode" role="tab" data-mode="encode">Text → 日本語</button>
            <button class="jp-mode" role="tab" data-mode="decode">日本語 → Text</button>
          </div>
          <div class="jp-toggles">
            <button class="jp-chip jp-toggle" data-opt="furigana" title="Show the reading above every character, like furigana">ふりがな Reading</button>
            <button class="jp-chip jp-toggle" data-opt="vertical" title="Write top to bottom, right to left (tategaki)">縦 Vertical</button>
          </div>
          <span class="jp-hint"><kbd>Enter</kbd> <span class="jp-verb">convert</span> · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Esc</kbd> clear</span>
          <span class="jp-counter"></span>
          <button class="jp-chip jp-chip-danger jp-clear" title="Clear history">Clear</button>
        </div>
      </div>
    `;

    const $ = (s) => root.querySelector(s);
    const input = $('.jp-input');
    const sendBtn = $('.jp-send');
    const consoleEl = $('.jp-console');
    const feed = $('.jp-feed');
    const empty = $('.jp-empty');
    const scrollEl = $('.jp-scroll');
    const scrollText = $('.jp-scroll-text');
    const chartEl = $('.jp-chart');
    const ring = $('.jp-ring');
    const liveText = $('.jp-live-text');
    const counter = $('.jp-counter');

    const burstAt = (el, o) => {
      const r = el.getBoundingClientRect();
      fx.burst(r.left + r.width / 2, r.top + r.height / 2, { color: accent, ...o });
    };
    const shake = () =>
      consoleEl.animate(
        [{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '-5px' }, { translate: '3px' }, { translate: '0' }],
        { duration: 450, easing: 'ease-in-out' }
      );

    // ------------------------------------------------------ ruby rendering
    // Japanese is the base text and its reading sits on top (furigana). For
    // decoded text it is the other way round: the reading is the Japanese.
    function rubyHtml(tokens, { flip = false, limit = Infinity, prev = null } = {}) {
      let html = '';
      tokens.slice(0, limit).forEach((t, i) => {
        const base = flip ? t.src : t.out;
        const top = flip ? t.out : t.src;
        const fresh = prev && prev[i] !== base ? ' fresh' : '';
        html += t.jp
          ? `<ruby class="jp-tok${fresh}" style="--i:${i % 40}">${escapeHtml(base)}<rt>${escapeHtml(top)}</rt></ruby>`
          : `<span class="jp-plain${fresh}">${escapeHtml(base).replace(/\n/g, '<br>')}</span>`;
      });
      if (tokens.length > limit) html += '<span class="jp-more">…</span>';
      return html;
    }

    // ----------------------------------------------------------- 3D ring
    function buildRing() {
      const glyphs = chartFor(styleId).filter(Boolean).map((c) => c.glyph);
      const shown = glyphs.slice(0, 46);
      ring.innerHTML = shown.map((g, i) => `<span style="--a:${(i * 360) / shown.length}deg">${escapeHtml(g)}</span>`).join('');
    }
    function lightRing(text) {
      const used = new Set(Array.from(text));
      ring.querySelectorAll('span').forEach((s) => s.classList.toggle('hit', used.has(s.textContent)));
      chartEl.querySelectorAll('.jp-cell[data-glyph]').forEach((c) => c.classList.toggle('hit', used.has(c.dataset.glyph)));
    }

    // -------------------------------------------------------------- chart
    function buildChart() {
      const cells = chartFor(styleId);
      const kana = styleId === 'katakana' || styleId === 'mixed';
      chartEl.classList.toggle('jp-chart-kana', kana);
      chartEl.innerHTML = cells
        .map((c) =>
          c
            ? `<button class="jp-cell" data-glyph="${escapeHtml(c.glyph)}" data-key="${c.key}" title="${c.key} ↔ ${escapeHtml(c.glyph)}"><b>${escapeHtml(c.glyph)}</b><small>${c.key}</small></button>`
            : '<span class="jp-cell jp-cell-gap"></span>'
        )
        .join('');
      $('.jp-chart-title').textContent = kana ? 'Gojūon chart · 五十音' : `${styleById(styleId).name} alphabet`;
      $('.jp-chart-note').textContent = mode === 'encode' ? 'click to type the Latin side' : 'click to type the glyph';
    }
    chartEl.addEventListener('click', (e) => {
      const cell = e.target.closest('.jp-cell[data-glyph]');
      if (!cell) return;
      const insert = mode === 'encode' ? cell.dataset.key : cell.dataset.glyph;
      const at = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, at) + insert + input.value.slice(input.selectionEnd ?? at);
      input.focus();
      input.selectionStart = input.selectionEnd = at + insert.length;
      autosize();
      updateLive();
      cell.classList.remove('press');
      void cell.offsetWidth;
      cell.classList.add('press');
      burstAt(cell, { count: 10, spread: 3 });
    });

    // ------------------------------------------------------------ live view
    let lastBases = [];
    function updateLive() {
      const value = input.value;
      const live = liveText.parentElement;
      live.classList.remove('idle', 'err');
      if (mode === 'encode') {
        const demo = !value;
        const res = encode(demo ? 'Hello, World!' : value, styleId);
        scrollText.innerHTML = rubyHtml(res.tokens, { limit: PREVIEW_TOKENS, prev: lastBases });
        lastBases = res.tokens.map((t) => t.out);
        scrollEl.classList.toggle('demo', demo);
        $('.jp-scroll-label').textContent = demo ? 'example' : styleById(styleId).jp;
        liveText.textContent = res.text.replace(/\n/g, ' ↵ ');
        live.classList.toggle('idle', demo);
        counter.textContent = demo ? '' : `${Array.from(value).length} → ${Array.from(res.text).length} chars`;
        lightRing(res.text);
        markStyles(null);
        return;
      }
      if (!value) {
        scrollText.innerHTML = '<span class="jp-scroll-hint">Paste kana, ﾊﾝｶｸ or 漢字風 text below: the style is detected and it reads back as Latin.</span>';
        lastBases = [];
        scrollEl.classList.add('demo');
        $('.jp-scroll-label').textContent = 'waiting';
        liveText.textContent = 'the reading appears here';
        live.classList.add('idle');
        counter.textContent = decodeStyle === 'auto' ? 'style: auto-detect' : `style: ${styleById(decodeStyle).name} (forced)`;
        lightRing('');
        markStyles(null);
        return;
      }
      const res = decode(value, decodeStyle);
      scrollText.innerHTML = rubyHtml(res.tokens, { flip: true, limit: PREVIEW_TOKENS, prev: lastBases });
      lastBases = res.tokens.map((t) => t.src);
      scrollEl.classList.remove('demo');
      $('.jp-scroll-label').textContent = res.style.jp;
      liveText.textContent = res.text.replace(/\n/g, ' ↵ ');
      if (!hasJapanese(value)) live.classList.add('err');
      counter.textContent = `${res.auto ? 'Detected' : 'Forced'}: ${decodeName(res.style.id, value)}${res.kanji ? ` · ${res.kanji} kanji kept as is` : ''}`;
      lightRing(value);
      markStyles(res.style.id);
    }
    let liveFrame = 0;
    const scheduleLive = () => {
      if (!liveFrame) liveFrame = requestAnimationFrame(() => ((liveFrame = 0), updateLive()));
    };
    cleanups.push(() => cancelAnimationFrame(liveFrame));

    // Real kana with no Latin in it is plain romaji transliteration.
    const decodeName = (id, text) => (id === 'mixed' && !/[A-Za-z]/.test(text) ? 'Romaji' : styleById(id).name);

    // -------------------------------------------------------------- styles
    function markStyles(detected) {
      root.querySelectorAll('.jp-style').forEach((b) => {
        const id = b.dataset.style;
        const badge = b.querySelector('.jp-style-badge');
        const forced = mode === 'decode' && decodeStyle === id;
        const found = mode === 'decode' && decodeStyle === 'auto' && detected === id;
        b.classList.toggle('forced', forced);
        b.classList.toggle('detected', found);
        badge.textContent = forced ? 'forced' : found ? 'detected' : '';
      });
    }

    function setStyle(id, { animate = true } = {}) {
      const changed = id !== styleId;
      styleId = id;
      storage.set('style', styleId);
      root.querySelectorAll('.jp-style').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === styleId)));
      root.dataset.style = styleId;
      buildChart();
      buildRing();
      lastBases = [];
      if (animate && changed) {
        scene.pulse(0.7);
        burstAt(root.querySelector(`.jp-style[data-style="${id}"]`), { count: 20, spread: 4.5 });
      }
      updateLive();
    }
    root.querySelectorAll('.jp-style').forEach((b) => {
      cleanups.push(fx.tilt(b, { max: 6, scale: 1.02, perspective: 700 }), fx.ripple(b));
      b.addEventListener('click', () => {
        const id = b.dataset.style;
        if (mode === 'decode') {
          // Decoding: clicking a style forces it; clicking it again goes back to auto-detect.
          decodeStyle = decodeStyle === id ? 'auto' : id;
          if (decodeStyle !== 'auto') setStyle(id);
          else updateLive();
          burstAt(b, { count: 14, spread: 3.5 });
        } else {
          setStyle(id);
        }
      });
    });

    // --------------------------------------------------------------- cards
    function addCard(entry, { animate }) {
      const decoding = entry.mode === 'decode';
      const res = decoding ? decode(entry.src, entry.style || 'auto') : encode(entry.src, entry.style);
      const card = document.createElement('article');
      card.className = `jp-card${decoding ? ' jp-card-decode' : ''}`;
      card.dataset.id = entry.id;
      if (animate) card.classList.add('jp-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const style = res.style;
      let tags;
      if (decoding) {
        tags = [`${entry.style === 'auto' || !entry.style ? 'detected' : 'forced'}: ${decodeName(style.id, entry.src)}`];
        if (res.kanji) tags.push(`${res.kanji} kanji kept`);
      } else {
        tags = [style.name, res.exact ? '✓ reversible' : style.id === 'katakana' ? '≈ sound-alike' : style.id === 'kanjilook' && res.back === entry.src.toLowerCase() ? 'case not kept' : '≈ approximate'];
      }
      const romaji = !decoding && (style.id === 'katakana' || style.id === 'mixed');
      card.innerHTML = `
        <div class="jp-card-glare"></div>
        <header class="jp-card-head">
          <span class="jp-card-src"></span>
          <span class="jp-card-meta"></span>
        </header>
        <div class="jp-out" title="${decoding ? 'Reading' : 'Japanese'}: select or copy"></div>
        <footer class="jp-card-actions">
          <span class="jp-tags">${tags.map((t) => `<i>${escapeHtml(t)}</i>`).join('')}</span>
          <button data-act="copy" class="jp-chip jp-chip-primary">${decoding ? 'Copy text' : 'Copy Japanese'}</button>
          ${romaji ? '<button data-act="copy-romaji" class="jp-chip">Copy romaji</button>' : ''}
          ${decoding ? '<button data-act="copy-src" class="jp-chip">Copy Japanese</button>' : ''}
          <button data-act="edit" class="jp-chip">Edit</button>
          <button data-act="delete" class="jp-chip jp-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      const src = entry.src.length > 220 ? `${entry.src.slice(0, 220)}…` : entry.src;
      card.querySelector('.jp-card-src').textContent = src;
      card.querySelector('.jp-card-meta').textContent = `${Array.from(entry.src).length} → ${Array.from(res.text).length} chars · ${time}`;
      const out = card.querySelector('.jp-out');
      // Cards always show the result as the base text; the other side is the reading on top.
      out.innerHTML = rubyHtml(res.tokens, { limit: 1200 });
      if (animate) out.classList.add('jp-ink');
      Object.assign(card, { _entry: entry, _text: res.text });
      feed.appendChild(card);
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.jp-chip').forEach((b) => fx.ripple(b));
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
      const card = btn.closest('.jp-card');
      const entry = card._entry;
      const act = btn.dataset.act;
      if (act === 'copy') copy(card._text, entry.mode === 'decode' ? 'Text' : 'Japanese');
      else if (act === 'copy-romaji') copy(romajiOf(card._text), 'Romaji');
      else if (act === 'copy-src') copy(entry.src, 'Japanese');
      else if (act === 'edit') {
        setMode(entry.mode);
        if (entry.mode === 'decode') {
          decodeStyle = entry.style || 'auto';
          if (decodeStyle !== 'auto') setStyle(decodeStyle, { animate: false });
        } else {
          setStyle(entry.style, { animate: false });
        }
        input.value = entry.src;
        autosize();
        updateLive();
        input.focus();
        return;
      } else if (act === 'delete') {
        history = history.filter((h) => String(h.id) !== card.dataset.id);
        storage.set(HISTORY_KEY, history);
        card.classList.add('jp-card-out');
        card.addEventListener('animationend', () => {
          card.remove();
          refreshMeta();
        }, { once: true });
        return;
      }
      burstAt(btn, { count: 18, spread: 4 });
    });

    $('.jp-clear').addEventListener('click', () => {
      if (!history.length) return;
      history = [];
      storage.remove(HISTORY_KEY);
      const cards = feed.querySelectorAll('.jp-card');
      cards.forEach((c, i) => {
        c.style.animationDelay = `${i * 30}ms`;
        c.classList.add('jp-card-out');
        c.addEventListener('animationend', () => c.remove(), { once: true });
      });
      setTimeout(refreshMeta, 500 + cards.length * 30);
      scene.pulse(0.6);
    });

    // --------------------------------------------------------------- input
    function autosize() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    }

    function send() {
      const value = input.value.replace(/\s+$/, '');
      if (!value) return void shake();
      if (mode === 'decode' && !hasJapanese(value)) {
        shake();
        toast('No Japanese characters to read here', { type: 'error' });
        return;
      }
      if (mode === 'encode' && !/[A-Za-z0-9]/.test(value)) {
        shake();
        toast('Type some Latin letters to convert', { type: 'error' });
        return;
      }
      const entry = { id: Date.now() + Math.floor(Math.random() * 1000), mode, src: value, at: Date.now(), style: mode === 'encode' ? styleId : decodeStyle };
      history.push(entry);
      if (history.length > MAX_HISTORY) {
        const dropped = history.splice(0, history.length - MAX_HISTORY);
        dropped.forEach((d) => feed.querySelector(`.jp-card[data-id="${d.id}"]`)?.remove());
      }
      storage.set(HISTORY_KEY, history);

      const card = addCard(entry, { animate: true });
      refreshMeta();
      input.value = '';
      autosize();
      updateLive();

      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      const b = sendBtn.getBoundingClientRect();
      requestAnimationFrame(() => {
        const c = card.getBoundingClientRect();
        fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 24, color: accent, spread: 6 });
        // a gust of petals towards the new card
        fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 40, color: '#ffc2d1', spread: 14, target: { x: c.left + c.width / 2, y: c.top + 50 } });
      });
      consoleEl.animate(
        [
          { translate: '0', scale: '1', filter: 'brightness(1)' },
          { translate: '0 4px', scale: '0.985', filter: 'brightness(1.35)', offset: 0.25 },
          { translate: '0', scale: '1', filter: 'brightness(1)' },
        ],
        { duration: 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
      );
      const hanko = $('.jp-hanko');
      hanko.classList.remove('stamp');
      void hanko.offsetWidth;
      hanko.classList.add('stamp');
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

    // -------------------------------------------------------------- options
    function setOptions(next) {
      opts = { ...opts, ...next };
      storage.set('options', opts);
      root.classList.toggle('jp-nofuri', !opts.furigana);
      root.classList.toggle('jp-vertical', opts.vertical);
      root.querySelectorAll('.jp-toggle').forEach((t) => t.setAttribute('aria-pressed', String(Boolean(opts[t.dataset.opt]))));
    }
    root.querySelectorAll('.jp-toggle').forEach((t) => {
      cleanups.push(fx.ripple(t));
      t.addEventListener('click', () => {
        setOptions({ [t.dataset.opt]: !opts[t.dataset.opt] });
        burstAt(t, { count: 12, spread: 3.5 });
      });
    });

    // ---------------------------------------------------------------- modes
    function setMode(next, { animate = true } = {}) {
      const changed = next !== mode;
      mode = next;
      storage.set('mode', mode);
      root.classList.toggle('jp-decoding', mode === 'decode');
      root.querySelectorAll('.jp-mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
      const title = mode === 'encode' ? 'Japanese Scripts' : 'Read It Back';
      if (animate && changed) fx.scramble($('.jp-title'), title, { duration: 650, glyphs: GLYPHS });
      else $('.jp-title').textContent = title;
      $('.jp-sub').innerHTML = mode === 'encode'
        ? 'Write anything in <b>katakana</b>, <b>hiragana</b>, code-rain <b>ﾊﾝｶｸ</b> or look-alike <b>漢字</b>.'
        : 'Paste Japanese-style text: the style is <b>detected</b>, and any kana reads back as <b>romaji</b>.';
      input.placeholder = mode === 'encode' ? 'Type text to write in Japanese and press Enter…' : 'Paste kana, ﾊﾝｶｸ or 漢字風 text and press Enter…';
      input.setAttribute('aria-label', mode === 'encode' ? 'Text to convert' : 'Japanese text to read');
      sendBtn.querySelector('span').textContent = mode === 'encode' ? 'Convert' : 'Read';
      sendBtn.setAttribute('aria-label', mode === 'encode' ? 'Convert to Japanese' : 'Read back as text');
      $('.jp-verb').textContent = mode === 'encode' ? 'convert' : 'read';
      $('.jp-empty p').textContent = mode === 'encode' ? 'Your Japanese writing will appear here.' : 'Readings will appear here.';
      $('.jp-style-note').textContent = mode === 'encode' ? 'pick how to write' : 'click to force, again for auto';
      buildChart();
      buildSamples();
      if (changed) {
        decodeStyle = 'auto';
        input.value = '';
        autosize();
        lastBases = [];
        if (animate) {
          scene.pulse(0.8);
          burstAt(root.querySelector(`.jp-mode[data-mode="${mode}"]`), { count: 24, spread: 5 });
        }
      }
      updateLive();
    }
    root.querySelectorAll('.jp-mode').forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
      cleanups.push(fx.ripple(b));
    });

    const samples = $('.jp-samples');
    function buildSamples() {
      samples.innerHTML = '';
      const list = mode === 'encode' ? SAMPLES : DECODE_SAMPLES.map(([text, id]) => (id === 'mixed' ? text : encode(text, id).text));
      for (const value of list) {
        const chip = document.createElement('button');
        chip.className = 'jp-chip';
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
    setOptions({});
    setStyle(styleId, { animate: false });
    setMode(mode, { animate: false });
    history.forEach((h) => {
      try {
        addCard(h, { animate: false });
      } catch {
        /* a malformed old entry: skip it */
      }
    });
    refreshMeta();
    feed.scrollTop = feed.scrollHeight;

    // ---------------------------------------------------------------- intro
    root.classList.add('jp-intro-on');
    const intro = playSakura($('.jp-intro'), accent, () => $('.jp-sun').getBoundingClientRect());
    cleanups.push(intro.cancel);
    intro.done.then(() => {
      if (!alive) return;
      root.classList.add('jp-ready');
      scene.pulse(1.2);
      fx.scramble($('.jp-title'), mode === 'encode' ? 'Japanese Scripts' : 'Read It Back', { duration: 900, glyphs: GLYPHS });
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

// ---------------------------------------------------------------------------
// Intro: a red sun rises with 日本 written inside it, a gust of cherry blossom
// petals sweeps across the screen, and the sun flies up into the header
// emblem. Click or any key skips it.
// ---------------------------------------------------------------------------
function playSakura(canvas, accent, sunTarget) {
  const host = canvas.parentElement;
  const g = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const host0 = host.getBoundingClientRect();

  const T_SUN = 650;
  const T_GUST = 500;
  const T_FLY = 1500;
  const T_END = 2150;
  const R = Math.min(W, H) * 0.2;
  const petals = Array.from({ length: 170 }, () => ({
    x: -Math.random() * W * 0.9 - 30,
    y: Math.random() * H * 1.2 - H * 0.2,
    vx: 7 + Math.random() * 9,
    vy: 0.8 + Math.random() * 2.2,
    size: 5 + Math.random() * 9,
    rot: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.25,
    flutter: Math.random() * Math.PI * 2,
    hue: Math.random(),
  }));
  let start = 0;
  let last = 0;
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
  const ease = (t) => 1 - (1 - t) ** 3;

  function petal(p) {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.scale(1, 0.55 + 0.45 * Math.sin(p.flutter));
    g.fillStyle = p.hue < 0.7 ? '#ffc2d1' : p.hue < 0.9 ? '#ff9fb5' : '#fff0f3';
    g.beginPath();
    // a petal: rounded body with a small notch at the tip
    g.moveTo(0, 0);
    g.bezierCurveTo(p.size * 0.6, -p.size * 0.7, p.size * 1.4, -p.size * 0.3, p.size * 1.25, 0);
    g.lineTo(p.size * 1.05, 0.12 * p.size);
    g.lineTo(p.size * 1.25, 0.25 * p.size);
    g.bezierCurveTo(p.size * 1.4, p.size * 0.5, p.size * 0.6, p.size * 0.7, 0, 0);
    g.fill();
    g.restore();
  }

  function frame(now) {
    if (!start) start = last = now;
    const t = now - start;
    const dt = Math.min(2.5, (now - last) / 16.7);
    last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const fly = Math.max(0, Math.min(1, (t - T_FLY) / (T_END - T_FLY)));
    g.fillStyle = `rgba(6,4,10,${0.92 * (1 - fly)})`;
    g.fillRect(0, 0, W, H);

    // the sun: rises, then flies into the header emblem
    const rise = ease(Math.min(1, t / T_SUN));
    const target = sunTarget();
    const tx = target.left - host0.left + target.width / 2;
    const ty = target.top - host0.top + target.height / 2;
    const k = ease(fly);
    const cx = W / 2 + (tx - W / 2) * k;
    const cy = H / 2 + (1 - rise) * H * 0.35 + (ty - H / 2) * k;
    const r = R * (0.6 + 0.4 * rise) * (1 - k) + (target.width / 2) * k;
    g.globalAlpha = rise;
    const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    grad.addColorStop(0, '#ffb3c0');
    grad.addColorStop(0.5, accent);
    grad.addColorStop(1, '#a80f2c');
    g.shadowColor = accent;
    g.shadowBlur = 60 * (1 - k) + 10;
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    // 日本, written top to bottom inside the sun
    if (k < 0.6) {
      g.globalAlpha = rise * (1 - k / 0.6);
      g.fillStyle = '#fff6f0';
      g.font = `900 ${Math.round(r * 0.62)}px 'JP Serif', serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('日', cx, cy - r * 0.34);
      g.fillText('本', cx, cy + r * 0.34);
    }
    g.globalAlpha = 1;

    // the gust of petals
    if (t > T_GUST) {
      for (const p of petals) {
        p.x += p.vx * dt * (t < T_FLY ? 1 : 1.6);
        p.y += p.vy * dt + Math.sin(p.flutter) * 0.8;
        p.rot += p.spin * dt;
        p.flutter += 0.12 * dt;
        g.globalAlpha = 0.9 * (1 - fly * 0.8);
        petal(p);
      }
      g.globalAlpha = 1;
    }
    if (t < T_END) raf = requestAnimationFrame(frame);
    else finish();
  }
  // Draw only once the serif font is in, so 日本 doesn't flash in a fallback face.
  const fontReady = document.fonts?.load ? document.fonts.load("900 80px 'JP Serif'", '日本').catch(() => {}) : Promise.resolve();
  Promise.race([fontReady, new Promise((r) => setTimeout(r, 400))]).then(() => {
    if (!finished) raf = requestAnimationFrame(frame);
  });

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
