import {
  THEMES, LETTERS, STYLES, styleById, keyFor, newCode, encodeWith, decodeWith, lessonFor, composeMessage, keyCardText, findKey, secretLine,
  buildStyle, parseInline, messageFor, seededRand,
} from './cipher.js';
import { AI_SPEC, AI_SIZE_MB, AI_LABEL, lessonPrompt, finalizeNote } from './cipher-ai.js';

const HISTORY_KEY = 'history';
const MAX_HISTORY = 40;
const MAX_KEYS = 40;
const SPINNER = '⣾⣽⣻⢿⡿⣟⣯⣷';
const MIX = THEMES.filter((t) => t.id !== 'emoji' && t.id !== 'dots').map((t) => t.symbols).join('');
const R_OUT = 132; // wheel radii (px): letters, symbols
const R_IN = 97;

export default {
  mount(root, ctx) {
    const { fx, scene, storage, toast } = ctx;
    const cleanups = [];
    let alive = true;

    let mode = ['make', 'read', 'practice'].includes(storage.get('mode')) ? storage.get('mode') : 'make';
    let friend = storage.get('friend', '') || '';
    let keys = storage.get('keys', []);
    if (!Array.isArray(keys)) keys = [];
    let currentCode = storage.get('current', null) || keys[0] || newCode();
    let history = storage.get(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];
    let mastery = storage.get('mastery', {});
    // Message style for new messages: one of STYLES, or 'surprise' for a random one each time.
    let styleChoice = storage.get('style', 'surprise');
    if (styleChoice !== 'surprise' && !STYLES.some((st) => st.id === styleChoice)) styleChoice = 'surprise';
    let pending = null; // the message card waiting for its secret
    let wheelCode = null;

    root.classList.add('cp');
    root.innerHTML = `
      <canvas class="cp-intro" aria-hidden="true"></canvas>
      <div class="cp-scan" aria-hidden="true"></div>

      <header class="cp-head">
        <div class="cp-head-main">
          <div class="cp-badge"><span></span>MODULE · PRIVATE CIPHER</div>
          <h1 class="cp-title">Cipher Pact</h1>
          <p class="cp-sub"></p>
        </div>
        <div class="cp-ai" data-state="idle">
          <span class="cp-ai-spin">✦</span>
          <span class="cp-ai-text">
            <span class="cp-ai-label">Local AI writes every lesson note</span>
            <span class="cp-ai-bar"><i></i></span>
          </span>
          <button class="cp-chip cp-ai-retry" hidden>Retry</button>
        </div>
      </header>

      <div class="cp-main">
        <aside class="cp-vault">
          <div class="cp-wheel-wrap">
            <div class="cp-wheel">
              <div class="cp-radar"></div>
              <div class="cp-beams"></div>
              <div class="cp-ring cp-ring-out"></div>
              <div class="cp-ring cp-ring-in"></div>
              <div class="cp-ticks"></div>
              <div class="cp-hub"><div class="cp-seal"><b class="cp-seal-icon"></b></div></div>
            </div>
          </div>
          <div class="cp-keyline">
            <span class="cp-theme"></span>
            <button class="cp-code" title="Copy the key code"></button>
          </div>
          <div class="cp-vault-actions">
            <button class="cp-forge"><span>✦</span> Forge new cipher</button>
            <button class="cp-chip cp-icon" data-card="copy" title="Copy the key card as an image">▣</button>
            <button class="cp-chip cp-icon" data-card="save" title="Save the key card as a PNG">⤓</button>
            <button class="cp-chip cp-icon" data-card="text" title="Copy the key card as text">Aa</button>
          </div>
          <div class="cp-ringbox">
            <div class="cp-ringbox-head"><span>Key ring</span><em class="cp-ring-count"></em></div>
            <div class="cp-keyring"></div>
          </div>
        </aside>

        <section class="cp-stage">
          <div class="cp-practice" hidden>
            <div class="cp-flip-wrap">
              <div class="cp-flip">
                <div class="cp-face cp-front"><b class="cp-flip-sym"></b><small>which letter?</small></div>
                <div class="cp-face cp-back"><b class="cp-flip-letter"></b><small class="cp-flip-verdict"></small></div>
              </div>
            </div>
            <div class="cp-pstats">
              <div><b class="cp-streak">0</b><span>streak</span></div>
              <div><b class="cp-best">0</b><span>best</span></div>
              <div><b class="cp-learned">0</b><span>of 36 learned</span></div>
            </div>
            <div class="cp-mastery"></div>
          </div>
          <div class="cp-feed" role="log" aria-live="polite">
            <div class="cp-empty">
              <div class="cp-empty-orb" aria-hidden="true"></div>
              <p></p>
              <div class="cp-samples"></div>
            </div>
          </div>
        </section>
      </div>

      <div class="cp-console">
        <div class="cp-console-border" aria-hidden="true"></div>
        <div class="cp-live"><span class="cp-live-text"></span></div>
        <div class="cp-inputrow">
          <textarea class="cp-input" rows="1" spellcheck="false"></textarea>
          <button class="cp-send"><span>Forge</span><b>✦</b></button>
        </div>
        <div class="cp-bar">
          <div class="cp-modes" role="tablist" aria-label="Mode">
            <button class="cp-mode" role="tab" data-mode="make">Make</button>
            <button class="cp-mode" role="tab" data-mode="read">Read</button>
            <button class="cp-mode" role="tab" data-mode="practice">Practice</button>
          </div>
          <div class="cp-stylepick" role="radiogroup" aria-label="Message style">
            ${STYLES.map((st) => `<button role="radio" data-style="${st.id}" title="${st.name}: ${st.blurb}">${st.icon}</button>`).join('')}
            <button role="radio" data-style="surprise" title="Surprise: a random style for every message">🎲</button>
            <span class="cp-stylename"></span>
          </div>
          <label class="cp-field cp-field-to" title="Your friend's name, used in the lesson notes">To <input class="cp-friend" maxlength="24" spellcheck="false" placeholder="friend"></label>
          <label class="cp-field cp-field-key" title="Paste the key code your friend sent. Leave empty to try every key in your key ring.">Key <input class="cp-keyinput" maxlength="48" spellcheck="false" placeholder="auto · key ring"></label>
          <span class="cp-hint"></span>
          <span class="cp-counter"></span>
          <button class="cp-chip cp-chip-danger cp-clear" title="Clear history">Clear</button>
        </div>
      </div>
    `;

    const $ = (s) => root.querySelector(s);
    const input = $('.cp-input');
    const sendBtn = $('.cp-send');
    const consoleEl = $('.cp-console');
    const feed = $('.cp-feed');
    const empty = $('.cp-empty');
    const liveText = $('.cp-live-text');
    const counter = $('.cp-counter');
    const wheel = $('.cp-wheel');
    const ringIn = $('.cp-ring-in');
    const ringOut = $('.cp-ring-out');
    const friendInput = $('.cp-friend');
    const keyInput = $('.cp-keyinput');
    friendInput.value = friend;

    const accentNow = () => keyFor(wheelCode || currentCode).theme.color;
    const burstAt = (el, o = {}) => {
      const r = el.getBoundingClientRect();
      fx.burst(r.left + r.width / 2, r.top + r.height / 2, { color: accentNow(), ...o });
    };
    const shake = (el = consoleEl) =>
      el.animate(
        [{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '-5px' }, { translate: '3px' }, { translate: '0' }],
        { duration: 450, easing: 'ease-in-out' }
      );
    const later = (fn, ms) => {
      const t = setTimeout(() => alive && fn(), ms);
      cleanups.push(() => clearTimeout(t));
      return t;
    };

    // ================================================================ wheel
    // Letters on the outside, their symbols on the inside, lined up so each
    // spoke reads "letter → symbol". Built once; forging swaps the symbols.
    const at = (i, r) => {
      const a = (i / LETTERS.length) * Math.PI * 2;
      return `left:calc(50% + ${(Math.sin(a) * r).toFixed(1)}px);top:calc(50% - ${(Math.cos(a) * r).toFixed(1)}px)`;
    };
    ringOut.innerHTML = Array.from(LETTERS, (l, i) => `<span style="${at(i, R_OUT)}">${l}</span>`).join('');
    ringIn.innerHTML = Array.from(LETTERS, (_, i) => `<span style="${at(i, R_IN)}"></span>`).join('');
    $('.cp-beams').innerHTML = Array.from(LETTERS, (_, i) => `<i style="--a:${(i * 360) / LETTERS.length}deg"></i>`).join('');
    $('.cp-ticks').innerHTML = Array.from({ length: 72 }, (_, i) => `<i style="--a:${i * 5}deg"></i>`).join('');
    const outSpans = [...ringOut.children];
    const inSpans = [...ringIn.children];
    const beams = [...$('.cp-beams').children];
    cleanups.push(fx.tilt($('.cp-wheel-wrap'), { max: 14, scale: 1.02, perspective: 900 }));

    function lightWheel(indexes) {
      outSpans.forEach((s, i) => s.classList.toggle('lit', indexes.has(i)));
      inSpans.forEach((s, i) => s.classList.toggle('lit', indexes.has(i)));
      beams.forEach((b, i) => b.classList.toggle('on', indexes.has(i)));
    }
    function flashSpoke(i) {
      [outSpans[i], inSpans[i], beams[i]].forEach((el) => {
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
      });
    }

    let spinTimer = 0;
    cleanups.push(() => clearInterval(spinTimer));
    /** Show a key on the wheel. `forge` plays the full spin-and-lock animation. */
    function showKey(code, { forge = false } = {}) {
      const key = keyFor(code);
      const changed = code !== wheelCode;
      wheelCode = code;
      root.style.setProperty('--theme', key.theme.color);
      scene.setAccent(key.theme.color);
      $('.cp-seal-icon').textContent = key.theme.icon;
      $('.cp-theme').innerHTML = `<b>${key.theme.icon}</b>${key.theme.name}`;
      const codeEl = $('.cp-code');
      if (forge || changed) fx.scramble(codeEl, key.code, { duration: forge ? 1100 : 500, glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' });
      else codeEl.textContent = key.code;
      clearInterval(spinTimer);
      if (!forge) {
        inSpans.forEach((s, i) => (s.textContent = key.symbols[i]));
        if (changed) {
          wheel.classList.remove('cp-swap');
          void wheel.offsetWidth;
          wheel.classList.add('cp-swap');
        }
        return Promise.resolve();
      }
      // Forge: the symbol ring spins and scrambles, then the spokes lock one by one.
      const pool = Array.from(key.theme.symbols);
      wheel.classList.remove('cp-locked', 'cp-forging');
      void wheel.offsetWidth;
      wheel.classList.add('cp-forging');
      spinTimer = setInterval(() => inSpans.forEach((s) => (s.textContent = pool[(Math.random() * pool.length) | 0])), 55);
      scene.warp(0.7);
      return new Promise((resolve) => {
        later(() => {
          clearInterval(spinTimer);
          wheel.classList.remove('cp-forging');
          inSpans.forEach((s, i) =>
            later(() => {
              s.textContent = key.symbols[i];
              flashSpoke(i);
            }, i * 22)
          );
          later(() => {
            wheel.classList.add('cp-locked');
            scene.pulse(1.3);
            burstAt($('.cp-seal'), { count: 46, spread: 9 });
            burstAt($('.cp-seal'), { count: 26, color: '#ffffff', spread: 4 });
            resolve();
          }, LETTERS.length * 22 + 80);
        }, 1150);
      });
    }

    // ============================================================= key ring
    function remember(code) {
      keys = [code, ...keys.filter((c) => c !== code)].slice(0, MAX_KEYS);
      storage.set('keys', keys);
      renderRing();
    }
    function setCurrent(code, opts) {
      currentCode = code;
      storage.set('current', code);
      remember(code);
      return showKey(code, opts);
    }
    function renderRing() {
      const box = $('.cp-keyring');
      box.innerHTML = keys
        .map((c) => {
          const k = keyFor(c);
          return `<button class="cp-keychip${c === wheelCode ? ' on' : ''}" data-code="${c}" style="--c:${k.theme.color}" title="${k.theme.name}"><b>${k.theme.icon}</b>${c}</button>`;
        })
        .join('') || '<span class="cp-ring-empty">Forged and used keys collect here.</span>';
      $('.cp-ring-count').textContent = keys.length ? `${keys.length}` : '';
    }
    $('.cp-keyring').addEventListener('click', (e) => {
      const chip = e.target.closest('.cp-keychip');
      if (!chip) return;
      if (mode === 'read') {
        keyInput.value = chip.dataset.code;
        updateLive();
      } else {
        setCurrent(chip.dataset.code);
        if (mode === 'practice') nextFlash();
      }
      renderRing();
      burstAt(chip, { count: 14, spread: 3 });
    });

    $('.cp-code').addEventListener('click', (e) => {
      copy(wheelCode, 'Key code');
      burstAt(e.currentTarget, { count: 18, spread: 4 });
    });

    // ============================================================ key card
    // A picture of the alphabet to learn from, drawn on a canvas.
    async function keyCardBlob(key) {
      const W = 1080;
      const H = 720;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      const col = key.theme.color;
      const symFont = getComputedStyle(root).getPropertyValue('--cfont').trim();
      await Promise.race([
        Promise.all(key.symbols.slice(0, 6).map((s) => document.fonts.load(`44px ${symFont}`, s).catch(() => {}))),
        new Promise((r) => setTimeout(r, 600)),
      ]);
      const bg = g.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#0d0f1f');
      bg.addColorStop(1, '#05060c');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let x = 0; x < W; x += 36) g.strokeRect(x, 0, 0.5, H);
      for (let y = 0; y < H; y += 36) g.strokeRect(0, y, W, 0.5);
      const glow = g.createRadialGradient(W * 0.85, 80, 10, W * 0.85, 80, 420);
      glow.addColorStop(0, `${col}55`);
      glow.addColorStop(1, 'transparent');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.strokeRect(18, 18, W - 36, H - 36);
      g.fillStyle = '#fff';
      g.font = "800 40px 'Inter', 'Ubuntu', sans-serif";
      g.fillText('CIPHER PACT', 56, 92);
      g.fillStyle = col;
      g.font = "700 26px 'JetBrains Mono', 'DejaVu Sans Mono', monospace";
      g.fillText(`KEY ${key.code}`, 56, 134);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = "500 20px 'Inter', 'Ubuntu', sans-serif";
      g.fillText(`${key.theme.name} alphabet · keep this card secret`, 56, 168);
      const cw = (W - 112) / 6;
      const ch = 82;
      LETTERS.split('').forEach((l, i) => {
        const x = 56 + (i % 6) * cw;
        const y = 200 + Math.floor(i / 6) * ch;
        g.fillStyle = 'rgba(255,255,255,0.045)';
        g.strokeStyle = `${col}66`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.roundRect(x + 4, y + 4, cw - 8, ch - 8, 12);
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.font = "700 22px 'JetBrains Mono', 'DejaVu Sans Mono', monospace";
        g.fillText(l.toUpperCase(), x + 22, y + 50);
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillText('→', x + 50, y + 50);
        g.fillStyle = '#fff';
        g.shadowColor = col;
        g.shadowBlur = 16;
        g.font = `44px ${symFont}`;
        g.textAlign = 'center';
        g.fillText(key.symbols[i], x + cw - 56, y + 56);
        g.textAlign = 'left';
        g.shadowBlur = 0;
      });
      return new Promise((r) => c.toBlob(r, 'image/png'));
    }
    async function keyCard(code, how) {
      const key = keyFor(code);
      if (how === 'text') return copy(keyCardText(key), 'Key card');
      const blob = await keyCardBlob(key);
      if (how === 'copy') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          toast('Key card copied as an image: paste it to your friend');
          return;
        } catch {
          /* no image clipboard here: save the file instead */
        }
      }
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `cipher-key-${key.code}.png` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`Key card saved as cipher-key-${key.code}.png`);
    }
    root.querySelectorAll('[data-card]').forEach((b) => {
      cleanups.push(fx.ripple(b));
      b.addEventListener('click', () => {
        keyCard(wheelCode, b.dataset.card);
        burstAt(b, { count: 16, spread: 3.5 });
      });
    });

    // ================================================================= AI
    let aiState = { state: 'idle' };
    let modelPromise = null;
    let spinnerTimer = 0;
    cleanups.push(() => clearInterval(spinnerTimer));
    const mb = (b) => Math.round(b / 1e6);
    function setAI(state, extra = {}) {
      aiState = { state, ...extra };
      const box = $('.cp-ai');
      box.dataset.state = state;
      const total = Math.max(extra.total || 0, AI_SIZE_MB * 1e6);
      $('.cp-ai-label').textContent = {
        idle: 'Local AI writes every lesson note',
        checking: 'Checking for the local AI model…',
        downloading: `Downloading the AI model (one time only) · ${mb(extra.loaded || 0)} / ${mb(total)} MB`,
        loading: 'Waking up the local AI…',
        writing: `${AI_LABEL} is writing the lesson…`,
        ready: `Local AI ready · ${AI_LABEL} · runs offline`,
        offline: 'Built-in lesson notes (the AI runs in the desktop app)',
        error: `AI unavailable: ${extra.message || ''}`,
      }[state];
      $('.cp-ai-bar i').style.width = state === 'downloading' ? `${Math.min(100, ((extra.loaded || 0) / total) * 100)}%` : state === 'ready' ? '100%' : '0%';
      $('.cp-ai-retry').hidden = state !== 'error';
      clearInterval(spinnerTimer);
      const spin = $('.cp-ai-spin');
      spin.textContent = state === 'error' ? '!' : '✦';
      if (['checking', 'downloading', 'loading', 'writing'].includes(state)) {
        let k = 0;
        spinnerTimer = setInterval(() => (spin.textContent = SPINNER[++k % SPINNER.length]), 80);
      }
    }
    function ensureModel() {
      if (!ctx.ai?.available) return Promise.reject(new Error('offline'));
      if (modelPromise) return modelPromise;
      setAI('checking');
      modelPromise = (async () => {
        const st = await ctx.ai.status(AI_SPEC);
        if (st.loaded) return;
        const phase = st.installed ? 'loading' : 'downloading';
        setAI(phase, { loaded: 0, total: AI_SIZE_MB * 1e6 });
        await ctx.ai.load(AI_SPEC, { onProgress: (p) => alive && setAI(phase, p) });
        if (phase === 'downloading' && alive) toast('AI model downloaded, it now works offline');
      })().catch((err) => {
        modelPromise = null;
        throw err;
      });
      return modelPromise;
    }
    $('.cp-ai-retry').addEventListener('click', () => ensureModel().then(() => setAI('ready')).catch((e) => setAI('error', { message: e.message })));

    // =========================================================== make: forge
    // Shows the style, and whether the key travels inside the message (quick to read, but readable by anyone).
    function styleTag(id = 'clues') {
      const st = styleById(id);
      return `<span class="cp-styletag${st.keyInside ? ' open' : ''}" title="${st.keyInside ? 'The key is written inside the message: your friend reads it at once, but so can anyone who sees it' : 'The key travels separately (key code or key card): the most private'}">${st.icon} ${st.name}<small>${st.keyInside ? 'key inside' : 'private'}</small></span>`;
    }

    function cardShell(entry, { animate }) {
      const key = keyFor(entry.code);
      const card = document.createElement('article');
      card.className = `cp-card cp-style-${entry.style || 'clues'}`;
      card.dataset.id = entry.id;
      card.style.setProperty('--c', key.theme.color);
      if (animate) card.classList.add('cp-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="cp-card-glare"></div>
        <div class="cp-steps"><i class="s1">Forge</i><i class="s2">Your secret</i><i class="s3">Sealed</i></div>
        <header class="cp-card-head">
          <span class="cp-format"><b>${entry.icon}</b>${escapeHtml(entry.format)}<em>to ${escapeHtml(entry.to || 'friend')}</em>${styleTag(entry.style)}</span>
          <span class="cp-card-meta"><button class="cp-keytag" data-act="copy-code" title="Copy the key code"><b>${key.theme.icon}</b>${key.code}</button>${time}</span>
        </header>
        <div class="cp-note"></div>
        <div class="cp-slot">
          <span class="cp-slot-icon">✍</span>
          <span><b>Now write your secret</b> in normal text below and press Enter: it gets sealed in this cipher.</span>
        </div>
        <div class="cp-sealed" hidden>
          <div class="cp-lesson"></div>
          <div class="cp-secret"></div>
          <div class="cp-plain" title="Hover to peek"></div>
        </div>
        <footer class="cp-card-actions">
          <button data-act="stop" class="cp-chip cp-chip-danger">Stop</button>
          <button data-act="copy" class="cp-chip cp-chip-primary">Copy message</button>
          <button data-act="copy-code" class="cp-chip">Copy key code</button>
          <button data-act="card" class="cp-chip">Copy key card</button>
          <button data-act="delete" class="cp-chip cp-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      card._entry = entry;
      card._note = card.querySelector('.cp-note');
      feed.appendChild(card);
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.cp-chip').forEach((b) => fx.ripple(b));
      return card;
    }

    function paintNote(card, text, caret) {
      card._note.textContent = text;
      if (caret) card._note.appendChild(Object.assign(document.createElement('span'), { className: 'cp-caret' }));
    }

    async function forge(queued = '') {
      if (pending?._generating) return;
      if (pending) dropCard(pending);
      const code = newCode();
      const style = styleChoice === 'surprise' ? STYLES[Math.floor(Math.random() * STYLES.length)].id : styleChoice;
      const prompt = lessonPrompt(friend, { keyInside: styleById(style).keyInside });
      const entry = { id: Date.now() + Math.floor(Math.random() * 1000), mode: 'make', code, style, format: prompt.format, icon: prompt.icon, to: friend || 'friend', note: '', at: Date.now() };
      const spin = setCurrent(code, { forge: true });
      const card = cardShell(entry, { animate: true });
      card.classList.add('cp-generating');
      card._generating = true;
      card._queued = queued;
      pending = card;
      refreshMeta();
      updateConsole();
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });

      let raw = prompt.prefill;
      paintNote(card, raw, true);
      let note;
      let frame = 0;
      const paint = () => {
        frame = 0;
        paintNote(card, raw, true);
        if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 160) feed.scrollTop = feed.scrollHeight;
      };
      try {
        await ensureModel();
        if (!alive || pending !== card) return;
        setAI('writing');
        const job = ctx.ai.generate(AI_SPEC, prompt, {
          onToken: (t) => {
            raw += t;
            if (!frame) frame = requestAnimationFrame(paint);
          },
        });
        card._job = job;
        await job.done;
        cancelAnimationFrame(frame);
        note = finalizeNote(raw, prompt.prefill.length);
        setAI('ready');
      } catch (err) {
        if (!alive) return;
        // No AI (or it failed): type out a built-in note instead.
        setAI(err.message === 'offline' ? 'offline' : 'error', { message: err.message });
        note = prompt.fallback;
        for (let i = prompt.prefill.length; i <= note.length && alive && pending === card; i += 3) {
          paintNote(card, note.slice(0, i), true);
          await new Promise((r) => setTimeout(r, 14));
        }
      }
      await spin;
      if (!alive || pending !== card) return;
      entry.note = note || raw;
      paintNote(card, entry.note, false);
      card._generating = false;
      card.classList.remove('cp-generating');
      card.classList.add('cp-awaiting');
      updateConsole();
      input.focus();
      burstAt(card.querySelector('.cp-slot'), { count: 20, spread: 5 });
      const q = card._queued || input.value.trim();
      if (card._queued && q) seal(q);
    }

    // ============================================================ make: seal
    function seal(secret) {
      const card = pending;
      if (!card || card._generating) return;
      const entry = card._entry;
      const key = keyFor(entry.code);
      entry.secret = secret;
      if (entry.style === 'clues') entry.lesson = lessonFor(key, secret);
      else Object.assign(entry, buildStyle(entry.style, key, secret, seededRand(entry.code)));
      pending = null;
      history.push(entry);
      if (history.length > MAX_HISTORY) {
        const dropped = history.splice(0, history.length - MAX_HISTORY);
        dropped.forEach((d) => feed.querySelector(`.cp-card[data-id="${d.id}"]`)?.remove());
      }
      storage.set(HISTORY_KEY, history);
      renderSealed(card, { animate: true });
      input.value = '';
      autosize();
      updateConsole();
      refreshMeta();
      consoleEl.animate(
        [
          { translate: '0', scale: '1', filter: 'brightness(1)' },
          { translate: '0 4px', scale: '0.985', filter: 'brightness(1.4)', offset: 0.25 },
          { translate: '0', scale: '1', filter: 'brightness(1)' },
        ],
        { duration: 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
      );
    }

    /** Fill in the clues, warm-up and the sealed secret. Animated: every letter runs through the wheel. */
    /** What the sealed line is made of, piece by piece, for the landing animation. */
    function sealUnits(entry, key) {
      const style = entry.style || 'clues';
      if (style === 'clues' || style === 'letters') {
        const pool = Array.from(key.theme.symbols);
        return encodeWith(key, entry.secret).tokens.map((t) =>
          t.letter ? { start: t.src, final: t.out, pool, spoke: t.index, sym: true } : { final: t.out }
        );
      }
      if (style === 'words') {
        const pool = entry.legend.map((p) => p.from);
        return entry.line.split(/([\p{L}\p{N}'’]+)/u).filter(Boolean).map((seg) => (/^[\p{L}\p{N}'’]+$/u.test(seg) ? { start: seg, final: seg, pool, word: true } : { final: seg }));
      }
      if (style === 'numbers') return Array.from(entry.line, (c) => (/\d/.test(c) ? { final: c, pool: Array.from('0123456789') } : { final: c }));
      const pool = entry.legend.map((p) => p.from);
      return Array.from(entry.line, (c) => (pool.includes(c) ? { final: c, pool, emoji: true } : { final: c }));
    }

    /** Fill in the lesson or legend and the sealed line. Animated: every piece flickers and lands. */
    function renderSealed(card, { animate }) {
      const entry = card._entry;
      const key = keyFor(entry.code);
      const style = entry.style || 'clues';
      card.classList.remove('cp-awaiting', 'cp-generating');
      card.classList.add('cp-done');
      card.querySelector('.cp-sealed').hidden = false;
      const lesson = card.querySelector('.cp-lesson');
      if (style === 'clues') {
        const { clues, warmup } = entry.lesson;
        lesson.innerHTML =
          (clues.length ? `<span class="cp-lesson-label">🔑 Clues</span>${clues.map((c, i) => `<span class="cp-clue" style="--i:${i}"><b class="cp-sym">${c.symbol}</b><i>=</i>${c.letter}</span>`).join('')}` : '') +
          (warmup ? `<span class="cp-lesson-label">✏️ Warm-up</span><span class="cp-warm"><b class="cp-sym">${warmup.symbols}</b><i>=</i>${warmup.word}</span>` : '');
      } else {
        const st = styleById(style);
        const label = { letters: 'code', words: 'when I say … I mean', numbers: 'mapping', emoji: 'our secret language' }[style];
        const from = (p) => (style === 'words' ? `‘${escapeHtml(p.from)}’` : `<b class="${style === 'letters' ? 'cp-sym' : ''}">${escapeHtml(style === 'letters' ? p.to : p.from)}</b>`);
        const to = (p) => escapeHtml(style === 'letters' ? p.from : p.to);
        // Letter code reads "A = ✦" like the message; the others read "code = meaning".
        lesson.innerHTML = `<span class="cp-lesson-label">${st.icon} ${label}</span>${entry.legend
          .map((p, i) => (style === 'letters'
            ? `<span class="cp-clue" style="--i:${i}">${to(p)}<i>=</i>${from(p)}</span>`
            : `<span class="cp-clue cp-clue-${style}" style="--i:${i}">${from(p)}<i>=</i>${to(p)}</span>`))
          .join('')}`;
      }
      const units = sealUnits(entry, key);
      const secretEl = card.querySelector('.cp-secret');
      secretEl.classList.toggle('cp-secret-words', style === 'words' || style === 'numbers');
      secretEl.innerHTML = `<span class="cp-lock">🔒</span>${units.map((u) => `<span class="cp-g${u.sym ? ' cp-sym' : ''}${u.word ? ' cp-word' : ''}">${escapeHtml(u.start ?? u.final)}</span>`).join('')}`;
      card.querySelector('.cp-plain').textContent = entry.secret;
      card._message = messageFor(entry);
      const spans = [...secretEl.querySelectorAll('.cp-g')];
      if (!animate) {
        spans.forEach((g, i) => (g.textContent = units[i].final));
        return;
      }
      // Each piece starts as itself, flickers through its pool, then lands;
      // for the letter styles the matching spoke on the wheel lights up too.
      const moving = units.filter((u) => u.pool).length;
      const step = Math.max(28, Math.min(110, 1400 / Math.max(1, moving)));
      let k = 0;
      spans.forEach((g, i) => {
        const u = units[i];
        if (!u.pool) {
          g.textContent = u.final;
          return;
        }
        later(() => {
          g.classList.add('spin');
          let n = 0;
          const flick = setInterval(() => {
            if (!alive) return clearInterval(flick);
            g.textContent = u.pool[(Math.random() * u.pool.length) | 0];
            if (++n > 5) {
              clearInterval(flick);
              g.textContent = u.final;
              g.classList.remove('spin');
              g.classList.add('landed');
              if (u.spoke !== undefined) {
                flashSpoke(u.spoke);
                lightWheel(new Set([u.spoke]));
              }
            }
          }, 45);
          cleanups.push(() => clearInterval(flick));
        }, 200 + k++ * step);
      });
      later(() => {
        lightWheel(new Set());
        card.classList.add('cp-stamped');
        scene.pulse(1.2);
        scene.warp(0.4);
        const r = secretEl.getBoundingClientRect();
        fx.burst(r.left + 30, r.top + r.height / 2, { count: 40, color: keyFor(entry.code).theme.color, spread: 9 });
        fx.burst(r.left + 30, r.top + r.height / 2, { count: 20, color: '#ffffff', spread: 4 });
      }, 200 + moving * step + 350);
    }

    function addMakeCard(entry) {
      const card = cardShell(entry, { animate: false });
      paintNote(card, entry.note, false);
      renderSealed(card, { animate: false });
      return card;
    }

    // ================================================================= read
    function readKeyFor(text) {
      const typed = keyInput.value.trim();
      if (typed) return { key: keyFor(typed), how: 'typed' };
      const found = findKey(text, keys);
      return found ? { key: found.key, how: 'ring' } : null;
    }

    function addReadCard(entry, { animate }) {
      const key = keyFor(entry.code);
      const inline = entry.inline ? parseInline(entry.src) : null;
      const res = inline ? { text: entry.src } : decodeWith(key, entry.src);
      const secret = inline ? inline.secret : decodeWith(key, secretLine(entry.src)).text.trim();
      const card = document.createElement('article');
      card.className = 'cp-card cp-card-read';
      card.dataset.id = entry.id;
      card.style.setProperty('--c', key.theme.color);
      if (animate) card.classList.add('cp-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="cp-card-glare"></div>
        <header class="cp-card-head">
          <span class="cp-format"><b>🔓</b>Decrypted<em>${inline ? 'the key was inside the message' : entry.how === 'ring' ? 'key found in your key ring' : 'with the key you entered'}</em>${inline ? styleTag(inline.style) : ''}</span>
          <span class="cp-card-meta">${inline ? '' : `<button class="cp-keytag" data-act="copy-code"><b>${key.theme.icon}</b>${key.code}</button>`}${time}</span>
        </header>
        <div class="cp-readsecret"></div>
        <details class="cp-full"><summary>Whole message</summary><div></div></details>
        <footer class="cp-card-actions">
          <button data-act="copy" class="cp-chip cp-chip-primary">Copy secret</button>
          <button data-act="copy-all" class="cp-chip">Copy whole message</button>
          <button data-act="delete" class="cp-chip cp-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      card.querySelector('.cp-full div').textContent = res.text;
      const out = card.querySelector('.cp-readsecret');
      Object.assign(card, { _entry: entry, _message: res.text, _secret: secret });
      feed.appendChild(card);
      if (animate) {
        const glyphs = inline ? inline.legend.map((p) => p.from).join('') || '01' : Array.from(key.theme.symbols).slice(0, 40).join('');
        fx.scramble(out, secret, { duration: Math.min(1600, 500 + secret.length * 40), glyphs }).then(() => {
          if (out.isConnected) out.textContent = secret;
        });
      } else {
        out.textContent = secret;
      }
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.cp-chip').forEach((b) => fx.ripple(b));
      return card;
    }

    function read(text) {
      const inline = parseInline(text);
      if (inline) {
        const entry = { id: Date.now() + Math.floor(Math.random() * 1000), mode: 'read', src: text, inline: inline.style, code: wheelCode, at: Date.now() };
        history.push(entry);
        if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
        storage.set(HISTORY_KEY, history);
        addReadCard(entry, { animate: true });
        refreshMeta();
        input.value = '';
        autosize();
        updateLive();
        feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
        scene.pulse(1);
        burstAt(sendBtn, { count: 30, spread: 7 });
        return;
      }
      const found = readKeyFor(text);
      if (!found) {
        shake();
        toast('No key in your key ring fits: paste the key code in the Key box', { type: 'error' });
        keyInput.focus();
        return;
      }
      const entry = { id: Date.now() + Math.floor(Math.random() * 1000), mode: 'read', src: text, code: found.key.code, how: found.how, at: Date.now() };
      remember(found.key.code);
      history.push(entry);
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
      storage.set(HISTORY_KEY, history);
      addReadCard(entry, { animate: true });
      refreshMeta();
      input.value = '';
      autosize();
      updateLive();
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      scene.pulse(1);
      scene.warp(0.3);
      burstAt(sendBtn, { count: 30, spread: 7 });
    }

    // ============================================================= practice
    let flash = null;
    let streak = 0;
    let best = storage.get('best', 0);
    function levels() {
      return (mastery[currentCode] ||= {});
    }
    function renderMastery() {
      const key = keyFor(currentCode);
      const lv = levels();
      $('.cp-mastery').innerHTML = Array.from(LETTERS, (l, i) => `<span class="cp-m l${Math.min(3, lv[l] || 0)}" title="${l}: ${lv[l] || 0} right in a row"><b class="cp-sym">${key.symbols[i]}</b><i>${(lv[l] || 0) >= 2 ? l : '·'}</i></span>`).join('');
      $('.cp-learned').textContent = LETTERS.split('').filter((l) => (lv[l] || 0) >= 2).length;
      $('.cp-streak').textContent = streak;
      $('.cp-best').textContent = best;
    }
    function nextFlash() {
      const key = keyFor(currentCode);
      const lv = levels();
      // Unlearned letters come up more often; digits less.
      const weights = Array.from(LETTERS, (l, i) => (i >= 26 ? 0.25 : 1) / (1 + 2 * (lv[l] || 0)) * (flash?.index === i ? 0 : 1));
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      let i = 0;
      while ((r -= weights[i]) > 0) i++;
      flash = { index: i, letter: LETTERS[i], symbol: key.symbols[i], done: false };
      const box = $('.cp-flip');
      box.classList.remove('flipped', 'right', 'wrong');
      $('.cp-flip-sym').textContent = flash.symbol;
      later(() => ($('.cp-flip-letter').textContent = flash.letter), 250);
      box.animate([{ transform: 'rotateY(0) scale(0.85)', opacity: 0.4 }, { transform: 'rotateY(0) scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' });
      renderMastery();
    }
    function answer(ch) {
      if (!flash || flash.done) return;
      flash.done = true;
      const lv = levels();
      const ok = ch.toLowerCase() === flash.letter;
      lv[flash.letter] = ok ? (lv[flash.letter] || 0) + 1 : 0;
      streak = ok ? streak + 1 : 0;
      if (streak > best) storage.set('best', (best = streak));
      storage.set('mastery', mastery);
      const box = $('.cp-flip');
      box.classList.add('flipped', ok ? 'right' : 'wrong');
      $('.cp-flip-verdict').textContent = ok ? (streak > 2 ? `${streak} in a row!` : 'correct') : `you typed ${ch}`;
      flashSpoke(flash.index);
      if (ok) {
        burstAt(box, { count: 26 + streak * 3, spread: 6 });
        scene.pulse(0.6 + Math.min(streak, 10) * 0.08);
      } else {
        shake(box.parentElement);
      }
      renderMastery();
      later(nextFlash, ok ? 750 : 1400);
    }

    // =============================================================== cards
    function refreshMeta() {
      empty.hidden = history.some((h) => h.mode === mode) || (mode === 'make' && Boolean(pending));
      feed.querySelectorAll('.cp-card').forEach((c) => (c.hidden = (c._entry.mode || 'make') !== mode));
    }

    function dropCard(card) {
      card._job?.cancel();
      card.classList.add('cp-card-out');
      card.addEventListener('animationend', () => card.remove(), { once: true });
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
      const card = btn.closest('.cp-card');
      const entry = card._entry;
      const act = btn.dataset.act;
      if (act === 'stop') {
        card._job?.cancel();
        return;
      }
      if (act === 'copy') copy(entry.mode === 'read' ? card._secret : card._message, entry.mode === 'read' ? 'Secret' : 'Message');
      else if (act === 'copy-all') copy(card._message, 'Message');
      else if (act === 'copy-code') copy(entry.code, 'Key code');
      else if (act === 'card') keyCard(entry.code, 'copy');
      else if (act === 'delete') {
        if (card === pending) pending = null;
        history = history.filter((h) => String(h.id) !== card.dataset.id);
        storage.set(HISTORY_KEY, history);
        card.classList.add('cp-card-out');
        card.addEventListener('animationend', () => {
          card.remove();
          refreshMeta();
          updateConsole();
        }, { once: true });
        return;
      }
      burstAt(btn, { count: 18, spread: 4, color: keyFor(entry.code).theme.color });
    });

    $('.cp-clear').addEventListener('click', () => {
      const gone = history.filter((h) => h.mode === mode);
      if (!gone.length) return;
      history = history.filter((h) => h.mode !== mode);
      storage.set(HISTORY_KEY, history);
      const cards = [...feed.querySelectorAll('.cp-card')].filter((c) => !c.hidden && c !== pending);
      cards.forEach((c, i) => {
        c.style.animationDelay = `${i * 30}ms`;
        c.classList.add('cp-card-out');
        c.addEventListener('animationend', () => c.remove(), { once: true });
      });
      later(refreshMeta, 520 + cards.length * 30);
      scene.pulse(0.6);
    });

    // =============================================================== input
    function autosize() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    }

    /** What the console asks for right now. */
    function updateConsole() {
      const awaiting = pending && !pending._generating;
      const generating = pending?._generating;
      root.classList.toggle('cp-awaiting-secret', mode === 'make' && Boolean(awaiting));
      const label = sendBtn.querySelector('span');
      const icon = sendBtn.querySelector('b');
      if (mode === 'make') {
        label.textContent = awaiting ? 'Seal' : 'Forge';
        icon.textContent = awaiting ? '🔒' : '✦';
        input.placeholder = awaiting
          ? 'Write your secret word in normal text and press Enter to seal it…'
          : generating
            ? 'The lesson is being written… type your secret now if you like'
            : 'Press Enter to forge a new cipher (or type your secret first)…';
        $('.cp-hint').innerHTML = awaiting ? '<kbd>Enter</kbd> seal · <kbd>Esc</kbd> clear' : '<kbd>Enter</kbd> forge · a new alphabet every time';
      } else if (mode === 'read') {
        label.textContent = 'Decrypt';
        icon.textContent = '🔓';
        input.placeholder = 'Paste the message your friend sent…';
        $('.cp-hint').innerHTML = '<kbd>Enter</kbd> decrypt · key code optional if it is in your key ring';
      } else {
        label.textContent = 'Skip';
        icon.textContent = '↻';
        input.placeholder = 'Type the letter for the symbol above…';
        $('.cp-hint').innerHTML = 'type the letter · <kbd>Enter</kbd> skip';
      }
      updateLive();
    }

    function updateLive() {
      const value = input.value;
      const live = liveText.parentElement;
      live.classList.remove('idle', 'err');
      if (mode === 'make') {
        if (pending && value.trim()) {
          const entry = pending._entry;
          const key = keyFor(entry.code);
          const enc = encodeWith(key, value);
          // the same seeded shuffle as sealing, so the preview is exactly what gets sent
          const styled = entry.style === 'clues' || entry.style === 'letters' ? null : buildStyle(entry.style, key, value, seededRand(entry.code));
          liveText.textContent = styled ? styled.line : enc.text;
          lightWheel(styled ? new Set() : new Set(enc.tokens.filter((t) => t.letter).map((t) => t.index)));
          counter.textContent = `${Array.from(value).length} chars · ${styleById(entry.style).name}${styled ? '' : ` · ${key.theme.name}`}`;
        } else {
          liveText.textContent = pending ? 'your secret, sealed, shows up here' : 'every message gets a brand-new alphabet';
          live.classList.add('idle');
          lightWheel(new Set());
          counter.textContent = '';
        }
        return;
      }
      if (mode === 'read') {
        if (!value.trim()) {
          liveText.textContent = 'the decrypted secret shows up here';
          live.classList.add('idle');
          counter.textContent = `${keys.length} key${keys.length === 1 ? '' : 's'} in your ring`;
          lightWheel(new Set());
          return;
        }
        const inline = parseInline(value);
        if (inline) {
          liveText.textContent = inline.secret || '…';
          lightWheel(new Set());
          counter.textContent = `key inside the message · ${styleById(inline.style).name}`;
          return;
        }
        const found = readKeyFor(value);
        if (!found) {
          liveText.textContent = 'no key fits yet: paste the key code in the Key box';
          live.classList.add('err');
          counter.textContent = '';
          lightWheel(new Set());
          return;
        }
        if (found.key.code !== wheelCode) {
          showKey(found.key.code);
          renderRing();
        }
        const dec = decodeWith(found.key, secretLine(value));
        liveText.textContent = dec.text.trim();
        lightWheel(new Set(dec.tokens.filter((t) => t.letter).map((t) => t.index)));
        counter.textContent = `${found.how === 'ring' ? 'found' : 'using'} ${found.key.code}`;
        return;
      }
      liveText.textContent = 'learn the alphabet one symbol at a time';
      live.classList.add('idle');
      counter.textContent = '';
    }

    function send() {
      const value = input.value.trim();
      if (mode === 'practice') {
        input.value = '';
        if (flash && !flash.done) {
          flash.done = true;
          streak = 0;
          $('.cp-flip').classList.add('flipped', 'wrong');
          $('.cp-flip-verdict').textContent = 'skipped';
          renderMastery();
          later(nextFlash, 900);
        }
        return;
      }
      if (mode === 'read') {
        if (!value) return void shake();
        read(value);
        return;
      }
      if (pending && !pending._generating) {
        if (!value) {
          shake();
          return;
        }
        if (!/[a-z0-9]/i.test(value.normalize('NFD'))) {
          shake();
          toast('Use some letters or numbers: they are what gets ciphered', { type: 'error' });
          return;
        }
        seal(value);
        return;
      }
      if (pending?._generating) {
        if (value) {
          pending._queued = value;
          toast('Your secret will be sealed as soon as the lesson is written');
        }
        return;
      }
      forge(value);
    }

    input.addEventListener('input', () => {
      if (mode === 'practice') {
        const ch = input.value.trim().slice(-1);
        input.value = '';
        if (ch) answer(ch);
        return;
      }
      autosize();
      updateLive();
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
    $('.cp-forge').addEventListener('click', () => {
      if (mode !== 'make') setMode('make');
      // With no message waiting, anything already typed becomes the secret for the new cipher.
      forge(pending ? '' : input.value.trim());
    });
    friendInput.addEventListener('input', () => {
      friend = friendInput.value.trim();
      storage.set('friend', friend);
    });
    keyInput.addEventListener('input', updateLive);
    cleanups.push(fx.ripple(sendBtn), fx.magnetic(sendBtn, { strength: 0.15 }), fx.ripple($('.cp-forge')), fx.magnetic($('.cp-forge'), { strength: 0.1 }));

    // ================================================================ modes
    function setMode(next, { animate = true } = {}) {
      const changed = next !== mode;
      mode = next;
      storage.set('mode', mode);
      root.dataset.mode = mode;
      root.querySelectorAll('.cp-mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
      $('.cp-practice').hidden = mode !== 'practice';
      $('.cp-sub').innerHTML = {
        make: 'Every message gets a <b>brand-new alphabet</b>. The AI writes the lesson, you write the secret, your friend learns the code.',
        read: 'Paste what your friend sent. The key comes from your <b>key ring</b>, or from the code they gave you.',
        practice: 'Learn the current alphabet <b>by heart</b>: one symbol at a time, until you can read it without the card.',
      }[mode];
      $('.cp-empty p').textContent = {
        make: 'Forge a cipher: the AI writes a lesson, then you seal your secret in it. Pick a message style below: 🔑 keeps the key separate, the others put it inside so your friend reads it instantly.',
        read: 'Decrypted messages show up here.',
        practice: '',
      }[mode];
      buildSamples();
      if (mode !== 'read' && wheelCode !== currentCode) showKey(currentCode);
      if (mode === 'practice') nextFlash();
      input.value = '';
      autosize();
      updateConsole();
      refreshMeta();
      renderRing();
      if (animate && changed) {
        scene.pulse(0.8);
        burstAt(root.querySelector(`.cp-mode[data-mode="${mode}"]`), { count: 24, spread: 5 });
        input.focus();
      }
    }
    root.querySelectorAll('.cp-mode').forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
      cleanups.push(fx.ripple(b));
    });

    function buildSamples() {
      const box = $('.cp-samples');
      box.innerHTML = '';
      if (mode === 'make') {
        const b = Object.assign(document.createElement('button'), { className: 'cp-chip cp-chip-primary', textContent: '✦ Forge my first cipher' });
        b.addEventListener('click', () => forge());
        box.appendChild(b);
      } else if (mode === 'read') {
        // A demo message sealed with the current key, so it is in the ring.
        const key = keyFor(currentCode);
        const demo = composeMessage({ note: 'Psst! Our new code is live.', key, secret: 'meet me at the gate', lesson: lessonFor(key, 'meet me at the gate', () => 0.3) });
        // plus one demo for every key-inside style, written the way a person would
        const demos = [
          ['🔑 Clues demo', demo],
          ['🔤 code: A=X', 'code: A=X, B=Y, C=Z. ZXY'],
          ['🍎 When I say…', "cipher. When I say 'apple' I mean 'cool'. When I say 'banana' I mean 'moon'. Now: apple banana moon"],
          ['🔢 mapping: 1=y', 'mapping: 1=y, 2=i, 3=V, 4=l, 5=L.  1-2-3-2-4-5'],
          ['🟢 secret language', 'Our secret language: 🔴=hide, 🔵=me, 🟢=moon, 🟡=out. 🔴🔵🟢🟡'],
        ];
        for (const [label, text] of demos) {
          const b = Object.assign(document.createElement('button'), { className: 'cp-chip', textContent: label, title: text });
          b.addEventListener('click', () => {
            keyInput.value = '';
            input.value = text;
            autosize();
            updateLive();
            read(text);
          });
          box.appendChild(b);
        }
      }
    }

    // ========================================================= message style
    function setStyleChoice(id, { animate = false } = {}) {
      styleChoice = id;
      storage.set('style', id);
      root.querySelectorAll('.cp-stylepick button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === id)));
      const st = id === 'surprise' ? null : styleById(id);
      $('.cp-stylename').textContent = st ? `${st.name}${st.keyInside ? ' · key inside' : ' · private'}` : 'Surprise style';
      if (animate) burstAt(root.querySelector(`.cp-stylepick [data-style="${id}"]`), { count: 14, spread: 3.5 });
    }
    root.querySelectorAll('.cp-stylepick button').forEach((b) => {
      cleanups.push(fx.ripple(b));
      b.addEventListener('click', () => setStyleChoice(b.dataset.style, { animate: true }));
    });

    // ============================================================== startup
    setStyleChoice(styleChoice);
    showKey(currentCode);
    remember(currentCode);
    history.forEach((h) => {
      try {
        if (h.mode === 'read') addReadCard(h, { animate: false });
        else if (h.secret) addMakeCard(h);
      } catch {
        /* a malformed old entry: skip it */
      }
    });
    setMode(mode, { animate: false });
    setAI(ctx.ai?.available ? 'idle' : 'offline');
    feed.scrollTop = feed.scrollHeight;
    // Every few seconds the title "decrypts" itself through the current alphabet.
    const titleTimer = setInterval(() => {
      if (!document.hidden) fx.scramble($('.cp-title'), 'Cipher Pact', { duration: 900, glyphs: keyFor(wheelCode).symbols.join('') });
    }, 7000);
    cleanups.push(() => clearInterval(titleTimer));

    // ================================================================ intro
    const intro = playVault($('.cp-intro'), () => keyFor(currentCode));
    cleanups.push(intro.cancel);
    intro.opening.then(() => {
      if (!alive) return;
      root.classList.add('cp-ready');
      scene.pulse(1.3);
      scene.warp(0.5);
      fx.scramble($('.cp-title'), 'Cipher Pact', { duration: 1000, glyphs: MIX.slice(0, 80) });
      later(() => input.focus(), 450);
    });

    return () => {
      alive = false;
      pending?._job?.cancel();
      cleanups.forEach((fn) => fn());
      scene.setAccent(ctx.meta.accent);
    };
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------------------------------------------------------------------------
// Intro: a vault lock. Three rings of cipher symbols spin like the tumblers of
// a combination lock, click into place one after another, the keyhole turns,
// and the vault doors slide apart to reveal the page. Click or a key skips it.
// ---------------------------------------------------------------------------
function playVault(canvas, currentKey) {
  const host = canvas.parentElement;
  const g = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const key = currentKey();
  const col = key.theme.color;
  const font = getComputedStyle(host).getPropertyValue('--cfont').trim() || 'sans-serif';
  const R = Math.min(W, H) * 0.42;
  const rings = [0.52, 0.74, 0.96].map((k, n) => {
    const count = [14, 20, 26][n];
    const pool = Array.from(THEMES[(n * 3 + 1) % THEMES.length].symbols);
    return { r: R * k, count, glyphs: Array.from({ length: count }, (_, i) => pool[(i * 7 + n) % pool.length]), dir: n % 2 ? -1 : 1, stopAt: 650 + n * 330, angle: Math.random() * 6 };
  });
  const T_TURN = 1700;
  const T_OPEN = 1950;
  const T_END = 2650;
  let start = 0;
  let last = 0;
  let raf = 0;
  let resolveDone;
  let resolveOpen;
  const done = new Promise((r) => (resolveDone = r));
  // resolves as the doors start to part, so the page can rise behind them
  const opening = new Promise((r) => (resolveOpen = r));
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    resolveOpen();
    resolveDone();
    canvas.classList.add('gone');
    setTimeout(() => canvas.remove(), 700);
  };
  const off = document.createElement('canvas');
  off.width = canvas.width;
  off.height = canvas.height;
  const o = off.getContext('2d');

  function drawLock(t) {
    o.setTransform(dpr, 0, 0, dpr, 0, 0);
    o.clearRect(0, 0, W, H);
    const bg = o.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#11142a');
    bg.addColorStop(1, '#04050b');
    o.fillStyle = bg;
    o.fillRect(0, 0, W, H);
    // brushed-metal door plate
    o.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let k = 0; k < 40; k++) {
      o.beginPath();
      o.arc(W / 2, H / 2, R * 1.1 + k * 9, 0, Math.PI * 2);
      o.stroke();
    }
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    rings.forEach((ring, n) => {
      const stopped = t >= ring.stopAt;
      const flashK = stopped ? Math.max(0, 1 - (t - ring.stopAt) / 260) : 0;
      o.strokeStyle = stopped ? `rgba(255,255,255,${0.18 + flashK * 0.6})` : 'rgba(255,255,255,0.12)';
      o.lineWidth = 1.5 + flashK * 3;
      o.beginPath();
      o.arc(W / 2, H / 2, ring.r + 22, 0, Math.PI * 2);
      o.stroke();
      o.font = `${Math.round(18 + n * 4)}px ${font}`;
      ring.glyphs.forEach((gl, i) => {
        const a = ring.angle + (i / ring.count) * Math.PI * 2;
        const x = W / 2 + Math.sin(a) * ring.r;
        const y = H / 2 - Math.cos(a) * ring.r;
        const top = Math.abs(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) < (Math.PI * 2) / ring.count / 2;
        o.fillStyle = stopped && top ? '#fff' : stopped ? `${col}cc` : 'rgba(200,210,255,0.45)';
        o.shadowColor = col;
        o.shadowBlur = stopped ? 10 + flashK * 30 : 0;
        o.fillText(gl, x, y);
      });
      o.shadowBlur = 0;
    });
    // the keyhole, turning once all tumblers are set
    const turn = Math.min(1, Math.max(0, (t - T_TURN) / 260));
    o.save();
    o.translate(W / 2, H / 2);
    o.rotate(turn * Math.PI / 2);
    const glow = o.createRadialGradient(0, 0, 4, 0, 0, R * 0.36);
    glow.addColorStop(0, `${col}${t > rings[2].stopAt ? 'aa' : '33'}`);
    glow.addColorStop(1, 'transparent');
    o.fillStyle = glow;
    o.beginPath();
    o.arc(0, 0, R * 0.36, 0, Math.PI * 2);
    o.fill();
    o.fillStyle = '#05060c';
    o.strokeStyle = col;
    o.lineWidth = 2;
    o.beginPath();
    o.arc(0, -10, 16, Math.PI * 0.8, Math.PI * 2.2);
    o.lineTo(9, 34);
    o.lineTo(-9, 34);
    o.closePath();
    o.fill();
    o.stroke();
    o.restore();
  }

  function frame(now) {
    if (!start) start = last = now;
    const t = now - start;
    const dt = Math.min(3, (now - last) / 16.7);
    last = now;
    rings.forEach((ring) => {
      if (t < ring.stopAt) {
        // spin, slowing down towards the stop, then snap to the nearest slot
        const left = (ring.stopAt - t) / ring.stopAt;
        ring.angle += ring.dir * dt * (0.02 + left * 0.16);
      } else if (!ring.snapped) {
        const step = (Math.PI * 2) / ring.count;
        ring.angle = Math.round(ring.angle / step) * step;
        ring.snapped = true;
      }
    });
    drawLock(t);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (t < T_OPEN) {
      g.drawImage(off, 0, 0);
    } else {
      resolveOpen();
      // the doors slide apart
      const k = Math.min(1, (t - T_OPEN) / (T_END - T_OPEN));
      const e = k * k * (3 - 2 * k);
      const half = canvas.width / 2;
      g.globalAlpha = 1 - e * 0.6;
      g.drawImage(off, 0, 0, half, canvas.height, -e * half, 0, half, canvas.height);
      g.drawImage(off, half, 0, half, canvas.height, half + e * half, 0, half, canvas.height);
      g.globalAlpha = 1;
      // a seam of light between them
      g.fillStyle = col;
      g.globalAlpha = (1 - e) * 0.9;
      g.fillRect(half - 2 + 0, 0, 4, canvas.height);
      g.globalAlpha = 1;
    }
    if (t < T_END) raf = requestAnimationFrame(frame);
    else finish();
  }
  const fontsReady = Promise.race([
    Promise.all(rings.map((ring) => document.fonts?.load?.(`24px ${font}`, ring.glyphs.join('')).catch(() => {}))),
    new Promise((r) => setTimeout(r, 450)),
  ]);
  fontsReady.then(() => {
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
    opening,
    cancel() {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointerdown', skip);
      removeEventListener('keydown', skip);
      if (!finished) {
        finished = true;
        resolveOpen();
        resolveDone();
      }
    },
  };
}
