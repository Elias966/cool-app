import { toBraille, fromBraille, dotsOf, INDICATORS } from './braille.js';
import { stripHidden } from '../../core/hidden.js';
import { AI_SPEC, AI_SIZE_MB, AI_LABEL, SLOT, randomPrompt, markSlots, hidePartialPlaceholder, finalize, randomWord } from './ai-modes.js';

const HISTORY_KEY = 'history';
const MAX_HISTORY = 40;
// Dot positions in reading order of a 2×3 grid: 1 4 / 2 5 / 3 6
const GRID_ORDER = [1, 4, 2, 5, 3, 6];
// Perkins brailler: left hand F D S = dots 1 2 3, right hand J K L = dots 4 5 6.
// Physical key codes, so it works on any keyboard layout.
const PERKINS = { KeyF: 1, KeyD: 2, KeyS: 3, KeyJ: 4, KeyK: 5, KeyL: 6 };
const KEY_LABEL = { 1: 'F', 2: 'D', 3: 'S', 4: 'J', 5: 'K', 6: 'L' };

const MODES = {
  t2b: {
    title: 'Text to Braille',
    tag: 'TEXT → BRAILLE',
    subBraille: '⠞⠑⠭⠞ ⠞⠕ ⠃⠗⠁⠊⠇⠇⠑',
    sub: 'Unified English Braille · Grade 1 · Unicode output',
    placeholder: 'Type something and press Enter…',
    idle: '⠞⠽⠏⠑ ⠎⠕⠍⠑⠞⠓⠊⠝⠛',
    empty: 'Your translations will materialize here.',
    samples: ['Hello, World!', 'Braille was invented in 1824.', 'NASA', 'Feel the dots ✨'],
    accent: null, // the module's own accent
  },
  b2t: {
    title: 'Braille to Text',
    tag: 'BRAILLE → TEXT',
    subBraille: '⠃⠗⠁⠊⠇⠇⠑ ⠞⠕ ⠞⠑⠭⠞',
    sub: 'Paste Unicode braille · type Braille ASCII · or chord the Perkins keys',
    placeholder: 'Paste braille (⠓⠊), type Braille ASCII (,hi), or chord F D S · J K L…',
    idle: 'decoded text appears here',
    empty: 'Decoded messages will materialize here.',
    samples: ['⠠⠓⠑⠇⠇⠕⠂ ⠠⠺⠕⠗⠇⠙⠖', '⠠⠃⠗⠁⠊⠇⠇⠑ ⠊⠎ ⠼⠃⠚⠃⠋ ⠉⠕⠕⠇', '⠠⠠⠝⠁⠎⠁', ',hello ,world'],
    accent: '#ff5ca8',
  },
  quest: {
    ai: true,
    title: 'Braille Quest',
    tag: 'AI · BRAILLE QUEST',
    subBraille: '⠟⠥⠑⠎⠞',
    sub: 'A tiny offline AI writes something random, and your braille is the goal',
    placeholder: 'Type a word or message to hide as the goal, or leave it empty for a surprise…',
    idle: '⠎⠥⠗⠏⠗⠊⠎⠑ ⠍⠑',
    empty: 'Quests, heists, recipes and prophecies, all chasing your braille.',
    samples: ['treasure', 'Hello World', 'pizza time', '🎲 Surprise me'],
    accent: '#ffb547',
  },
  anywhere: {
    ai: true,
    title: 'Braille Anywhere',
    tag: 'AI · BRAILLE ANYWHERE',
    subBraille: '⠁⠝⠽⠺⠓⠑⠗⠑',
    sub: 'A tiny offline AI drops your braille where it has no business being',
    placeholder: 'Type a word or message to drop somewhere unexpected, or leave it empty for a surprise…',
    idle: '⠎⠥⠗⠏⠗⠊⠎⠑ ⠍⠑',
    empty: 'Menus, forecasts, parking tickets… braille gets everywhere.',
    samples: ['banana', 'Good morning', 'error 404', '🎲 Surprise me'],
    accent: '#3ddc97',
  },
};
const MODE_ORDER = ['t2b', 'b2t', 'quest', 'anywhere'];
const isAI = (m) => Boolean(MODES[m]?.ai);

export default {
  mount(root, ctx) {
    const { fx, scene, storage, toast } = ctx;
    const cleanups = [];
    let alive = true;
    const baseAccent = ctx.meta.accent || '#7c5cff';
    let mode = MODES[storage.get('mode', 't2b')] ? storage.get('mode', 't2b') : 't2b';
    const accentOf = (m) => MODES[m].accent || baseAccent;

    root.classList.add('br');
    root.dataset.mode = mode;
    root.innerHTML = `
      <canvas class="br-intro" aria-hidden="true"></canvas>
      <div class="br-shock" aria-hidden="true"></div>

      <header class="br-head">
        <div class="br-head-main">
          <div class="br-badge"><span></span>MODULE · TEXT ⇄ BRAILLE</div>
          <h1 class="br-title"></h1>
          <div class="br-sub">
            <span class="br-sub-braille" aria-hidden="true"></span>
            <span class="br-sub-text"></span>
          </div>
          <div class="br-mode" role="tablist" aria-label="Mode">
            <span class="br-mode-thumb" aria-hidden="true"></span>
            <button role="tab" data-mode="t2b">Text → Braille</button>
            <button role="tab" data-mode="b2t">Braille → Text</button>
            <button role="tab" data-mode="quest">Braille Quest<sup>AI</sup></button>
            <button role="tab" data-mode="anywhere">Braille Anywhere<sup>AI</sup></button>
          </div>
        </div>
        <div class="br-head-side">
          <div class="br-stat"><b class="br-stat-count">0</b><span>translations</span></div>
          <button class="br-ghost br-clear" title="Clear history">Clear</button>
        </div>
      </header>

      <div class="br-feed" role="log" aria-live="polite">
        <div class="br-empty">
          <div class="br-empty-orb" aria-hidden="true">${GRID_ORDER.map((d) => `<i class="${[1, 2, 4, 5].includes(d) ? 'on' : ''}"></i>`).join('')}</div>
          <p class="br-empty-text"></p>
          <div class="br-samples"></div>
        </div>
      </div>

      <div class="br-console">
        <div class="br-console-border" aria-hidden="true"></div>
        <div class="br-ai-status" aria-live="polite">
          <span class="br-ai-spinner" aria-hidden="true">⠋</span>
          <span class="br-ai-label"></span>
          <span class="br-ai-bar"><i></i></span>
          <button class="br-chip br-ai-retry" hidden>Retry</button>
        </div>
        <div class="br-live" aria-hidden="true"><span class="br-live-text"></span></div>
        <div class="br-inputrow">
          <textarea class="br-input" rows="1" spellcheck="false" aria-label="Text to convert"></textarea>
          <button class="br-send" aria-label="Translate">
            <span>Send</span>
            <svg viewBox="0 0 24 24"><path d="M4 12h15M13 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="br-pad" aria-label="Perkins braille keypad">
          <div class="br-pad-hand">${[3, 2, 1].map(padKey).join('')}</div>
          <div class="br-pad-preview" title="Current chord">${GRID_ORDER.map((d) => `<i data-d="${d}"></i>`).join('')}</div>
          <div class="br-pad-hand">${[4, 5, 6].map(padKey).join('')}</div>
          <div class="br-pad-actions">
            <button class="br-chip br-pad-add" title="Insert this cell">Add cell</button>
            <button class="br-chip br-pad-space" title="Insert a space">Space</button>
            <button class="br-chip br-pad-back" title="Delete the last cell" aria-label="Backspace">⌫</button>
            <button class="br-chip br-perkins" aria-pressed="false" title="Use F D S J K L as a Perkins brailler">Perkins keys</button>
          </div>
        </div>
        <div class="br-hint">
          <span class="br-hint-keys"></span>
          <span class="br-counter"></span>
        </div>
      </div>
    `;

    const $ = (s) => root.querySelector(s);
    const feed = $('.br-feed');
    const empty = $('.br-empty');
    const input = $('.br-input');
    const sendBtn = $('.br-send');
    const consoleEl = $('.br-console');
    const liveText = $('.br-live-text');
    const counter = $('.br-counter');
    const statCount = $('.br-stat-count');
    const title = $('.br-title');

    let history = storage.get(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];

    // ------------------------------------------------------------------ cards
    function cellEl(cell, index, role) {
      const el = document.createElement('span');
      el.className = 'br-cell';
      if (Object.values(INDICATORS).includes(role) || role === 'capital end') el.classList.add('br-ind');
      if (role === 'unknown') el.classList.add('br-bad');
      el.style.setProperty('--i', Math.min(index, 60));
      const dots = dotsOf(cell);
      el.innerHTML = GRID_ORDER.map((d) => `<i class="${dots.includes(d) ? 'on' : ''}"></i>`).join('');
      return el;
    }

    function describeToken(t, direction) {
      if (t.type === 'unknown') {
        return direction === 'b2t'
          ? `${t.src} is not Grade 1 braille (maybe a Grade 2 contraction)`
          : `“${t.src}” has no braille equivalent`;
      }
      const cells = t.parts
        .map((p) => Array.from(p.cell).map((c) => `${c} ${p.role} (dots ${dotsOf(c).join('-') || 'none'})`).join(' + '))
        .join(' + ');
      return direction === 'b2t' ? `${cells}  →  “${t.src}”` : `“${t.src}”  ${cells}`;
    }

    function renderCells(container, result, animate, direction) {
      container.innerHTML = '';
      let index = 0;
      let word = null;
      const flushWord = () => {
        if (word) container.appendChild(word);
        word = null;
      };
      for (const t of result.tokens) {
        if (t.type === 'space') {
          flushWord();
          container.appendChild(Object.assign(document.createElement('span'), { className: 'br-gap' }));
          continue;
        }
        if (t.type === 'newline') {
          flushWord();
          container.appendChild(Object.assign(document.createElement('span'), { className: 'br-break' }));
          continue;
        }
        if (!word) word = Object.assign(document.createElement('span'), { className: 'br-word' });
        const glyph = document.createElement('span');
        glyph.className = 'br-glyph';
        glyph.dataset.tip = describeToken(t, direction);
        const cells = document.createElement('span');
        cells.className = 'br-glyph-cells';
        if (t.type === 'unknown' && !t.parts.length) {
          const u = document.createElement('span');
          u.className = 'br-cell br-unknown';
          u.style.setProperty('--i', Math.min(index++, 60));
          u.textContent = t.src;
          cells.appendChild(u);
        } else {
          for (const p of t.parts) for (const c of Array.from(p.cell)) cells.appendChild(cellEl(c, index++, p.role));
        }
        const label = document.createElement('span');
        label.className = 'br-glyph-src';
        label.textContent = t.type === 'unknown' && direction === 'b2t' ? '?' : t.src;
        glyph.append(cells, label);
        word.appendChild(glyph);
      }
      flushWord();
      container.classList.toggle('br-animate', animate);
      // Each cell's dots pop in on a timer (CSS: --i × 34ms + 480ms); a soft chime per cell, in step.
      if (animate) {
        [...container.querySelectorAll('.br-cell')].slice(0, 18).forEach((el, i) =>
          setTimeout(() => alive && el.isConnected && ctx.sound.play('chime', { note: (el.querySelectorAll('i.on').length + i) % 10, peak: 0.03, x: el.getBoundingClientRect().left }), i * 34 + 480)
        );
      }
    }

    function addCard(entry, { animate }) {
      if (isAI(entry.mode)) return addAICard(entry, { animate });
      const direction = entry.mode === 'b2t' ? 'b2t' : 't2b';
      const b2t = direction === 'b2t';
      const result = b2t ? fromBraille(entry.src) : toBraille(entry.src);
      const text = b2t ? result.text : entry.src;
      const braille = b2t ? result.braille : result.text;
      const chars = Array.from(text).length;

      const card = document.createElement('article');
      card.className = `br-card br-card-${direction}`;
      card.dataset.id = entry.id;
      card.style.setProperty('--accent', accentOf(direction));
      if (animate) card.classList.add('br-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="br-card-glare"></div>
        <header class="br-card-head">
          <span class="br-card-src"></span>
          <span class="br-card-meta"><span class="br-card-mode"></span><span class="br-card-stats"></span></span>
        </header>
        <div class="br-cells"></div>
        <div class="br-uni-row">
          ${b2t ? '<div class="br-out-text" title="Decoded text — select or copy"></div>' : '<code class="br-uni" title="Unicode braille — select or copy"></code>'}
        </div>
        <footer class="br-card-actions">
          ${b2t
            ? '<button data-act="copy-text" class="br-chip br-chip-primary">Copy text</button><button data-act="copy-braille" class="br-chip">Copy braille</button>'
            : '<button data-act="copy-braille" class="br-chip br-chip-primary">Copy braille</button><button data-act="copy-text" class="br-chip">Copy text</button>'}
          <button data-act="edit" class="br-chip">Edit</button>
          <button data-act="delete" class="br-chip br-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      const src = card.querySelector('.br-card-src');
      src.textContent = b2t ? braille : entry.src;
      src.classList.toggle('br-card-src-braille', b2t);
      card.querySelector('.br-card-mode').textContent = MODES[direction].tag;
      card.querySelector('.br-card-stats').textContent = b2t
        ? `${result.cellCount} cells → ${chars} chars · ${time}`
        : `${chars} chars → ${result.cellCount} cells · ${time}`;
      renderCells(card.querySelector('.br-cells'), result, animate, direction);

      if (b2t) {
        const out = card.querySelector('.br-out-text');
        if (animate) {
          out.textContent = ' ';
          setTimeout(() => out.isConnected && fx.scramble(out, text, { duration: Math.min(1400, 400 + chars * 30) }), 450);
        } else {
          out.textContent = text;
        }
      } else {
        card.querySelector('.br-uni').textContent = braille;
      }

      Object.assign(card, { _text: text, _braille: braille, _src: entry.src, _mode: direction });
      feed.appendChild(card);
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.br-chip').forEach((b) => fx.ripple(b));
      if (result.unknown.length) {
        const warn = document.createElement('div');
        warn.className = 'br-warn';
        warn.textContent = b2t
          ? `Couldn't read (not Grade 1 braille): ${result.unknown.join(' ')}`
          : `Kept as-is (no braille form): ${result.unknown.join(' ')}`;
        card.querySelector('.br-uni-row').appendChild(warn);
      }
      return card;
    }

    // ------------------------------------------------------------- AI modes
    const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
    let spinTimer = 0;
    let modelPromise = null;
    let aiState = { state: 'idle' };
    let busy = null; // the card currently being written

    const mb = (bytes) => Math.round(bytes / 1e6);
    // (inside an AI story the invisible copy of the original couldn't be checked, so it's left out)
    const brailleFor = (value) =>
      stripHidden(/[⠀-⣿]/.test(value) ? fromBraille(value).braille : toBraille(value).text).replace(/\s+/g, ' ').trim();

    function aiStatusText(st = aiState) {
      if (st.state === 'checking') return 'Checking for the local AI model…';
      if (st.state === 'downloading') {
        const total = Math.max(st.total || 0, AI_SIZE_MB * 1e6); // small config files arrive first
        return `Downloading the AI model (one time only) · ${mb(st.loaded || 0)} / ${mb(total)} MB`;
      }
      if (st.state === 'loading') return 'Waking up the local AI…';
      if (st.state === 'ready') return `Local AI ready · ${AI_LABEL} · runs offline`;
      if (st.state === 'error') return `AI unavailable: ${st.message}`;
      return '';
    }

    function setAIState(state, extra = {}) {
      aiState = { state, ...extra };
      const strip = $('.br-ai-status');
      strip.dataset.state = state;
      $('.br-ai-label').textContent = aiStatusText();
      const expected = Math.max(extra.total || 0, AI_SIZE_MB * 1e6);
      const pct = state === 'downloading' ? Math.min(100, ((extra.loaded || 0) / expected) * 100) : state === 'ready' ? 100 : 0;
      $('.br-ai-bar i').style.width = `${pct}%`;
      $('.br-ai-retry').hidden = state !== 'error';
      const spinning = state === 'checking' || state === 'downloading' || state === 'loading' || Boolean(busy);
      clearInterval(spinTimer);
      const spinner = $('.br-ai-spinner');
      spinner.textContent = state === 'ready' && !busy ? '✦' : state === 'error' ? '!' : SPINNER[0];
      if (spinning) {
        let k = 0;
        spinTimer = setInterval(() => (spinner.textContent = SPINNER[++k % SPINNER.length]), 80);
      }
      // Mirror download progress into a card that is waiting for the model.
      if (busy?._progress) busy._progress.textContent = state === 'ready' ? '' : aiStatusText();
    }
    cleanups.push(() => clearInterval(spinTimer));

    function ensureModel() {
      if (!ctx.ai?.available) {
        setAIState('error', { message: 'local AI needs the desktop app' });
        return Promise.reject(new Error('Local AI is not available'));
      }
      if (modelPromise) return modelPromise;
      setAIState('checking');
      modelPromise = (async () => {
        const st = await ctx.ai.status(AI_SPEC);
        if (st.loaded) return setAIState('ready');
        const phase = st.installed ? 'loading' : 'downloading';
        setAIState(phase, { loaded: 0, total: AI_SIZE_MB * 1e6 });
        await ctx.ai.load(AI_SPEC, { onProgress: (p) => alive && setAIState(phase, p) });
        if (alive) {
          setAIState('ready');
          if (phase === 'downloading') toast('AI model downloaded, it now works offline');
        }
      })().catch((err) => {
        modelPromise = null;
        if (alive) setAIState('error', { message: err.message });
        throw err;
      });
      return modelPromise;
    }
    $('.br-ai-retry').addEventListener('click', () => ensureModel().catch(() => {}));

    function renderAIText(el, text, braille, src, { caret = false, reveal = false } = {}) {
      el.textContent = '';
      const parts = text.split(SLOT);
      parts.forEach((part, k) => {
        if (part) el.appendChild(document.createTextNode(part));
        if (k < parts.length - 1) {
          const b = document.createElement('span');
          b.className = 'br-ai-braille';
          if (reveal) {
            b.classList.add('br-ai-reveal');
            b.style.setProperty('--k', k);
          }
          b.textContent = braille;
          b.title = `“${src}” in braille`;
          el.appendChild(b);
        }
      });
      if (caret) el.appendChild(Object.assign(document.createElement('span'), { className: 'br-ai-caret' }));
    }

    function addAICard(entry, { animate, generating = false }) {
      const card = document.createElement('article');
      card.className = `br-card br-card-ai br-card-${entry.mode}`;
      card.dataset.id = entry.id;
      card.style.setProperty('--accent', accentOf(entry.mode));
      if (animate) card.classList.add('br-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="br-card-glare"></div>
        <header class="br-card-head">
          <span class="br-card-src"><span class="br-ai-format"></span><span class="br-ai-goal"></span></span>
          <span class="br-card-meta"><span class="br-card-mode"></span><span class="br-card-stats"></span></span>
        </header>
        <div class="br-ai-progress"></div>
        <div class="br-ai-text"></div>
        <div class="br-uni-row br-ai-key-row">
          <span class="br-ai-key-label">Hidden braille</span>
          <div class="br-cells br-ai-key"></div>
        </div>
        <footer class="br-card-actions">
          <button data-act="stop" class="br-chip br-chip-danger">Stop</button>
          <button data-act="copy-text" class="br-chip br-chip-primary">Copy</button>
          <button data-act="regen" class="br-chip">New random</button>
          <button data-act="edit" class="br-chip">Edit</button>
          <button data-act="delete" class="br-chip br-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      card.querySelector('.br-ai-format').textContent = entry.format;
      card.querySelector('.br-ai-goal').textContent = `hiding “${entry.src}”`;
      card.querySelector('.br-card-mode').textContent = MODES[entry.mode].tag;
      card.querySelector('.br-card-stats').textContent = time;
      renderCells(card.querySelector('.br-ai-key'), fromBraille(entry.braille), animate, 'b2t');
      card._progress = card.querySelector('.br-ai-progress');
      Object.assign(card, { _src: entry.src, _mode: entry.mode, _braille: entry.braille, _entry: entry });
      if (!generating) finishAICard(card, entry.text, { reveal: false });
      else card.classList.add('br-generating');
      feed.appendChild(card);
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.br-chip').forEach((b) => fx.ripple(b));
      return card;
    }

    function finishAICard(card, text, { reveal }) {
      card.classList.remove('br-generating');
      card._progress.textContent = '';
      card._text = text.split(SLOT).join(card._braille);
      renderAIText(card.querySelector('.br-ai-text'), text, card._braille, card._src, { reveal });
    }

    async function sendAI(value, forcedMode = mode) {
      if (busy) return;
      const src = value.trim() || randomWord();
      const braille = brailleFor(src) || toBraille(randomWord()).text;
      const prompt = randomPrompt(forcedMode);
      const entry = { id: Date.now() + Math.floor(Math.random() * 1000), mode: forcedMode, src, braille, format: prompt.format, text: '', at: Date.now() };
      const card = addAICard(entry, { animate: true, generating: true });
      busy = card;
      root.classList.add('br-busy');
      setAIState(aiState.state, aiState);
      refreshMeta();
      empty.hidden = true;
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });

      const textEl = card.querySelector('.br-ai-text');
      const protect = markSlots(prompt.prefill).length;
      let raw = prompt.prefill;
      let frame = 0;
      const paint = () => {
        frame = 0;
        renderAIText(textEl, markSlots(hidePartialPlaceholder(raw)), braille, src, { caret: true });
        if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 160) feed.scrollTop = feed.scrollHeight;
      };
      paint();

      try {
        await ensureModel();
        if (!alive) return;
        const job = ctx.ai.generate(AI_SPEC, prompt, {
          onToken: (t) => {
            raw += t;
            ctx.sound.play('type');
            if (!frame) frame = requestAnimationFrame(paint);
          },
        });
        card._job = job;
        await job.done;
        if (!alive) return;
        cancelAnimationFrame(frame);
        const final = finalize(markSlots(raw), { minSlots: forcedMode === 'anywhere' ? 2 : 1, protectChars: protect });
        entry.text = final;
        finishAICard(card, final, { reveal: true });
        if (card.isConnected) {
          history.push(entry);
          if (history.length > MAX_HISTORY) {
            const dropped = history.splice(0, history.length - MAX_HISTORY);
            dropped.forEach((d) => feed.querySelector(`.br-card[data-id="${d.id}"]`)?.remove());
          }
          storage.set(HISTORY_KEY, history);
          refreshMeta();
          scene.pulse(1.2);
          card.querySelectorAll('.br-ai-braille').forEach((b, i) =>
            setTimeout(() => {
              if (!b.isConnected) return;
              const r = b.getBoundingClientRect();
              fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 22, color: accentOf(forcedMode), spread: 5 });
            }, 250 + i * 180)
          );
        }
      } catch (err) {
        if (!alive) return;
        card.classList.remove('br-generating');
        card.classList.add('br-card-failed');
        card._progress.textContent = `Couldn't generate: ${err.message}`;
      } finally {
        if (busy === card) busy = null;
        if (alive) {
          root.classList.remove('br-busy');
          setAIState(aiState.state, aiState);
          refreshMeta();
        }
      }
    }

    function refreshMeta() {
      statCount.textContent = history.length;
      empty.hidden = history.length > 0 || Boolean(busy);
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
      const card = btn.closest('.br-card');
      const act = btn.dataset.act;
      if (act === 'copy-braille' || act === 'copy-text') {
        if (act === 'copy-braille') copy(card._braille, 'Braille');
        else copy(card._text, 'Text');
        const r = btn.getBoundingClientRect();
        fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 18, color: accentOf(card._mode), spread: 4 });
      } else if (act === 'stop') {
        card._job?.cancel();
      } else if (act === 'regen') {
        if (busy) return toast('Still writing, press Stop first');
        sendAI(card._src, card._mode);
      } else if (act === 'edit') {
        setMode(card._mode, { animate: card._mode !== mode });
        input.value = card._src;
        autosize();
        updateLive();
        input.focus();
      } else if (act === 'delete') {
        card._job?.cancel();
        history = history.filter((h) => String(h.id) !== card.dataset.id);
        storage.set(HISTORY_KEY, history);
        card.classList.add('br-card-out');
        card.addEventListener('animationend', () => {
          card.remove();
          refreshMeta();
        }, { once: true });
      }
    });

    $('.br-clear').addEventListener('click', () => {
      if (!history.length) return;
      history = [];
      storage.remove(HISTORY_KEY);
      feed.querySelectorAll('.br-card').forEach((c, i) => {
        c.style.animationDelay = `${i * 30}ms`;
        c.classList.add('br-card-out');
        c.addEventListener('animationend', () => c.remove(), { once: true });
      });
      setTimeout(refreshMeta, 400);
      scene.pulse(0.6);
    });

    // ------------------------------------------------------------------ input
    function autosize() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
    }

    function updateLive() {
      const value = input.value;
      const live = liveText.parentElement;
      if (!value) {
        liveText.textContent = MODES[mode].idle;
        live.classList.add('idle');
        counter.textContent = isAI(mode) ? 'empty = surprise word' : mode === 'b2t' ? '0 cells → 0 chars' : '0 chars → 0 cells';
        return;
      }
      live.classList.remove('idle');
      if (isAI(mode)) {
        const b = brailleFor(value);
        liveText.textContent = b ? `hiding ${b}` : '…';
        counter.textContent = `${Array.from(b).filter((c) => c !== ' ').length} cells to hide`;
      } else if (mode === 'b2t') {
        const r = fromBraille(value);
        liveText.textContent = r.text.replace(/\n/g, ' ') || '…';
        counter.textContent = `${r.cellCount} cells → ${Array.from(r.text).length} chars`;
      } else {
        const r = toBraille(value);
        liveText.textContent = r.text.replace(/\n/g, ' ');
        counter.textContent = `${Array.from(value).length} chars → ${r.cellCount} cells`;
      }
    }

    function send() {
      if (isAI(mode)) {
        if (busy) {
          consoleEl.animate([{ translate: '0' }, { translate: '-8px' }, { translate: '6px' }, { translate: '0' }], { duration: 350 });
          return;
        }
        const value = input.value;
        input.value = '';
        autosize();
        updateLive();
        const b = sendBtn.getBoundingClientRect();
        fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 30, color: accentOf(mode), spread: 7 });
        scene.pulse(0.8);
        sendAI(value);
        return;
      }
      const value = input.value.replace(/\s+$/, '');
      if (!value.trim()) {
        ctx.sound.play('error');
        consoleEl.animate(
          [{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '-5px' }, { translate: '3px' }, { translate: '0' }],
          { duration: 450, easing: 'ease-in-out' }
        );
        return;
      }
      const entry = { id: Date.now() + Math.floor(Math.random() * 1000), src: value, mode, at: Date.now() };
      history.push(entry);
      if (history.length > MAX_HISTORY) {
        const dropped = history.splice(0, history.length - MAX_HISTORY);
        dropped.forEach((d) => feed.querySelector(`.br-card[data-id="${d.id}"]`)?.remove());
      }
      storage.set(HISTORY_KEY, history);

      const card = addCard(entry, { animate: true });
      refreshMeta();
      input.value = '';
      autosize();
      updateLive();
      clearChord();

      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      const b = sendBtn.getBoundingClientRect();
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      const accent = accentOf(mode);
      requestAnimationFrame(() => {
        const c = card.getBoundingClientRect();
        fx.burst(bx, by, { count: 26, color: accent, spread: 6 });
        fx.burst(bx, by, { count: 46, color: '#7ef9ff', spread: 14, target: { x: c.left + c.width / 2, y: c.top + 60 } });
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

    function insertAtCursor(text) {
      input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
      autosize();
      updateLive();
      input.focus();
    }

    // ------------------------------------------------------------- Perkins pad
    const chord = new Set();
    const held = new Set();
    let perkins = storage.get('perkins', true) !== false;
    const perkinsBtn = $('.br-perkins');

    function renderChord() {
      root.querySelectorAll('.br-key').forEach((k) => k.classList.toggle('on', chord.has(Number(k.dataset.dot))));
      root.querySelectorAll('.br-pad-preview i').forEach((i) => i.classList.toggle('on', chord.has(Number(i.dataset.d))));
    }
    function clearChord() {
      chord.clear();
      held.clear();
      renderChord();
    }
    function chordCell() {
      let bits = 0;
      chord.forEach((d) => (bits |= 1 << (d - 1)));
      return String.fromCodePoint(0x2800 + bits);
    }
    function commitChord() {
      if (!chord.size) return;
      const cell = chordCell();
      insertAtCursor(cell);
      const p = $('.br-pad-preview').getBoundingClientRect();
      fx.burst(p.left + p.width / 2, p.top + p.height / 2, { count: 12, color: accentOf('b2t'), spread: 3.5 });
      $('.br-pad-preview').animate([{ scale: '1.25' }, { scale: '1' }], { duration: 260, easing: 'ease-out' });
      clearChord();
    }
    function setPerkins(on) {
      perkins = on;
      storage.set('perkins', on);
      perkinsBtn.setAttribute('aria-pressed', String(on));
      perkinsBtn.classList.toggle('br-chip-primary', on);
      updateHint();
    }

    root.querySelectorAll('.br-key').forEach((k) => {
      k.addEventListener('click', () => {
        const d = Number(k.dataset.dot);
        chord.has(d) ? chord.delete(d) : chord.add(d);
        renderChord();
      });
      cleanups.push(fx.ripple(k));
    });
    $('.br-pad-add').addEventListener('click', () => {
      if (chord.size) commitChord();
      else $('.br-pad-preview').animate([{ translate: '0' }, { translate: '-4px' }, { translate: '4px' }, { translate: '0' }], { duration: 260 });
    });
    $('.br-pad-space').addEventListener('click', () => insertAtCursor(' '));
    $('.br-pad-back').addEventListener('click', () => {
      const pos = input.selectionStart;
      if (input.selectionEnd > pos) input.setRangeText('', pos, input.selectionEnd, 'end');
      else if (pos > 0) {
        const before = Array.from(input.value.slice(0, pos));
        const cut = before.pop() || '';
        input.setRangeText('', pos - cut.length, pos, 'end');
      }
      autosize();
      updateLive();
      input.focus();
    });
    perkinsBtn.addEventListener('click', () => {
      setPerkins(!perkins);
      input.focus();
    });

    input.addEventListener('input', () => {
      autosize();
      updateLive();
    });
    input.addEventListener('keydown', (e) => {
      if (mode === 'b2t' && perkins && PERKINS[e.code] && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (e.repeat) return;
        held.add(e.code);
        chord.add(PERKINS[e.code]);
        renderChord();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (chord.size) commitChord();
        send();
      } else if (e.key === 'Escape' && (input.value || chord.size)) {
        e.preventDefault();
        input.value = '';
        clearChord();
        autosize();
        updateLive();
      }
    });
    input.addEventListener('keyup', (e) => {
      if (!held.has(e.code)) return;
      held.delete(e.code);
      if (!held.size) commitChord(); // all keys released: the chord becomes a cell
    });
    input.addEventListener('blur', () => held.clear());
    sendBtn.addEventListener('click', () => {
      if (busy) return busy._job?.cancel();
      if (mode === 'b2t' && chord.size) commitChord();
      send();
    });
    cleanups.push(fx.ripple(sendBtn), fx.magnetic(sendBtn, { strength: 0.15 }), fx.tilt(consoleEl, { max: 2, scale: 1, perspective: 1600 }));

    // ------------------------------------------------------------------- mode
    function updateHint() {
      $('.br-hint-keys').innerHTML = isAI(mode)
        ? '<kbd>Enter</kbd> generate · a new random format every time · <kbd>Esc</kbd> clear'
        : mode === 'b2t' && perkins
          ? '<kbd>F</kbd><kbd>D</kbd><kbd>S</kbd> · <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> chord a cell · <kbd>Space</kbd> gap · <kbd>Enter</kbd> translate'
          : '<kbd>Enter</kbd> translate · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Esc</kbd> clear';
    }

    function applyModeText(animateTitle) {
      const m = MODES[mode];
      root.dataset.mode = mode;
      root.style.setProperty('--mi', MODE_ORDER.indexOf(mode));
      sendBtn.querySelector('span').textContent = isAI(mode) ? 'Generate' : 'Send';
      if (animateTitle) fx.scramble(title, m.title, { duration: 700 });
      else title.textContent = m.title;
      $('.br-sub-braille').textContent = m.subBraille;
      $('.br-sub-text').textContent = m.sub;
      $('.br-empty-text').textContent = m.empty;
      input.placeholder = m.placeholder;
      input.setAttribute('aria-label', mode === 'b2t' ? 'Braille to translate' : 'Text to convert');
      root.querySelectorAll('.br-mode button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));

      const samples = $('.br-samples');
      samples.innerHTML = '';
      for (const s of m.samples) {
        const chip = document.createElement('button');
        chip.className = 'br-chip';
        if (mode === 'b2t') chip.classList.add('br-chip-braille');
        chip.textContent = s;
        chip.addEventListener('click', () => {
          input.value = s.startsWith('🎲') ? '' : s;
          updateLive();
          send();
        });
        samples.appendChild(chip);
      }
      updateHint();
      updateLive();
      if (isAI(mode)) ensureModel().catch(() => {});
    }

    function setAccent(hex) {
      document.documentElement.style.setProperty('--accent', hex);
      scene.setAccent(hex);
    }

    function setMode(next, { animate = true } = {}) {
      if (next === mode) return;
      mode = next;
      storage.set('mode', mode);
      clearChord();
      setAccent(accentOf(mode));
      if (!animate) {
        applyModeText(false);
        return;
      }
      scene.warp(0.35);
      scene.pulse(0.8);
      const sw = $('.br-mode').getBoundingClientRect();
      fx.burst(sw.left + sw.width * (mode === 'b2t' ? 0.75 : 0.25), sw.top + sw.height / 2, { count: 30, color: accentOf(mode), spread: 6 });
      // Flip the console over; swap its contents while it is edge-on.
      consoleEl.animate(
        [
          { transform: 'perspective(1100px) rotateX(0deg)' },
          { transform: 'perspective(1100px) rotateX(88deg) scale(0.96)', opacity: 0.4, offset: 0.45 },
          { transform: 'perspective(1100px) rotateX(-88deg) scale(0.96)', opacity: 0.4, offset: 0.46 },
          { transform: 'perspective(1100px) rotateX(0deg)' },
        ],
        { duration: 760, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }
      );
      setTimeout(() => {
        if (!alive) return;
        applyModeText(true);
        input.value = '';
        autosize();
        updateLive();
        input.focus();
      }, 340);
    }

    root.querySelectorAll('.br-mode button').forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
      cleanups.push(fx.ripple(b));
    });

    // History from previous sessions (no entrance animation).
    history.forEach((h) => addCard(h, { animate: false }));
    refreshMeta();
    setPerkins(perkins);
    if (MODES[mode].accent) setAccent(accentOf(mode));
    applyModeText(false);
    feed.scrollTop = feed.scrollHeight;

    // ------------------------------------------------------------------ intro
    // Sound: the sphere hums and spins while it gathers, chimes climb as it
    // morphs into braille, and it locks with a stamp.
    const introSfx = ctx.sound.sequence([
      { at: 0, name: 'swell', duration: 2.2, notes: [0, 2, 4] },
      { at: 0, name: 'whir', duration: 1.0 },
      { at: 900, name: 'swish' },
      ...[0, 1, 2, 3, 4, 5].map((n) => ({ at: 950 + n * 150, name: 'chime', note: n })),
    ]);
    const intro = playIntro($('.br-intro'), accentOf(mode), () => {
      if (!alive) return;
      ctx.sound.play('stamp');
      ctx.sound.play('success');
      scene.pulse(1.4);
      root.classList.add('br-locked');
    });
    cleanups.push(intro.cancel, introSfx.stop);
    intro.done.then(() => introSfx.stop());
    root.classList.add('br-intro-on');
    intro.done.then(() => {
      if (!alive) return;
      root.classList.add('br-ready');
      fx.scramble(title, MODES[mode].title, { duration: 900 });
      setTimeout(() => alive && input.focus(), 500);
    });

    return () => {
      alive = false;
      cleanups.forEach((fn) => fn());
    };
  },
};

function padKey(dot) {
  return `<button class="br-key" data-dot="${dot}" aria-label="Dot ${dot}"><i></i><span>${KEY_LABEL[dot]}</span><em>${dot}</em></button>`;
}

// ---------------------------------------------------------------------------
// Intro: a spinning sphere of light that collapses into the braille for
// "braille" (⠃⠗⠁⠊⠇⠇⠑), flashes, then lifts away to reveal the console.
// ---------------------------------------------------------------------------
function playIntro(canvas, accent, onLock) {
  const host = canvas.parentElement;
  const g = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  let W = 0;
  let H = 0;
  const size = () => {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();

  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const sg = sprite.getContext('2d');
  const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.2, accent);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 64, 64);

  const word = toBraille('braille').text;
  const cells = Array.from(word);
  const cw = Math.min(W / (cells.length + 3), 96);
  const s = cw * 0.34; // dot spacing
  const startX = W / 2 - (cells.length * cw) / 2 + cw / 2 - s / 2;
  const cy = H * 0.42 - s;

  const targets = [];
  cells.forEach((cell, k) => {
    const on = dotsOf(cell);
    [1, 2, 3, 4, 5, 6].forEach((d) => {
      const col = d > 3 ? 1 : 0;
      const row = (d - 1) % 3;
      targets.push({ x: startX + k * cw + col * s, y: cy + row * s, on: on.includes(d) });
    });
  });

  const R = Math.min(W, H) * 0.27;
  const particles = [];
  const total = targets.length + 320;
  for (let i = 0; i < total; i++) {
    // Even spread over a sphere (golden-angle spiral).
    const y = 1 - (i / (total - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    const far = 2 + Math.random() * 3;
    particles.push({
      sx: Math.cos(th) * r * R,
      sy: y * R,
      sz: Math.sin(th) * r * R,
      far,
      delay: Math.random() * 0.35,
      target: targets[i] || null,
      size: 1 + Math.random() * 1.4,
    });
  }

  const T_GATHER = 900;
  const T_MORPH = 1900;
  const T_HOLD = 2600;
  const T_END = 3200;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const clamp = (t) => Math.max(0, Math.min(1, t));

  let start = performance.now();
  let raf = 0;
  let locked = false;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  let resolved = false;
  const finish = () => {
    if (!resolved) {
      resolved = true;
      resolveDone();
    }
  };

  function frame(now) {
    const t = now - start;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';

    const rot = t * 0.0011;
    const cosA = Math.cos(rot);
    const sinA = Math.sin(rot);
    const tiltC = Math.cos(0.35);
    const tiltS = Math.sin(0.35);
    const gather = ease(clamp(t / T_GATHER));
    const morph = ease(clamp((t - T_GATHER) / (T_MORPH - T_GATHER)));
    const lift = ease(clamp((t - T_HOLD) / (T_END - T_HOLD)));

    if (!locked && t >= T_MORPH) {
      locked = true;
      onLock();
    }
    if (t >= T_HOLD) finish();

    const flash = t > T_MORPH ? Math.max(0, 1 - (t - T_MORPH) / 500) : 0;
    const cx = W / 2;
    const cyS = H * 0.42;

    for (const p of particles) {
      // Sphere, gathered in from far away.
      const k = ease(clamp((gather - p.delay) / (1 - p.delay)));
      const spread = 1 + (p.far - 1) * (1 - k);
      let x = p.sx * spread;
      let y = p.sy * spread;
      let z = p.sz * spread;
      const x1 = x * cosA - z * sinA;
      const z1 = x * sinA + z * cosA;
      const y1 = y * tiltC - z1 * tiltS;
      const z2 = y * tiltS + z1 * tiltC;
      const f = 700 / (700 + z2);
      let px = cx + x1 * f;
      let py = cyS + y1 * f;
      let radius = p.size * f;
      let alpha = clamp(0.25 + k * 0.75) * clamp(f * 0.9);

      if (p.target) {
        px += (p.target.x - px) * morph;
        py += (p.target.y - py) * morph;
        const tr = p.target.on ? s * 0.2 : s * 0.07;
        radius += (tr - radius) * morph;
        if (!p.target.on) alpha *= 1 - morph * 0.65;
        if (p.target.on) radius *= 1 + flash * 0.6;
      } else {
        // Extras burst outward and fade during the morph.
        const out = 1 + morph * 2.2;
        px = cx + (px - cx) * out;
        py = cyS + (py - cyS) * out;
        alpha *= 1 - morph;
      }

      py -= lift * H * 0.35;
      alpha *= 1 - lift;
      if (alpha <= 0.01) continue;

      g.globalAlpha = alpha;
      const glow = radius * (p.target?.on && morph > 0.5 ? 4.5 : 3.2);
      g.drawImage(sprite, px - glow, py - glow, glow * 2, glow * 2);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(px, py, Math.max(radius * 0.45, 0.6), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    if (t < T_END) raf = requestAnimationFrame(frame);
    else canvas.remove();
  }
  raf = requestAnimationFrame(frame);

  // Click or any key skips ahead to the lock-in moment.
  const skip = () => {
    const t = performance.now() - start;
    if (t < T_MORPH) start = performance.now() - T_MORPH;
  };
  host.addEventListener('pointerdown', skip, { once: true });
  addEventListener('keydown', skip, { once: true });
  addEventListener('resize', size);

  return {
    done,
    cancel() {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointerdown', skip);
      removeEventListener('keydown', skip);
      removeEventListener('resize', size);
      finish();
    },
  };
}
