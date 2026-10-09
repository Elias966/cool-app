import { LANGS, compile, machineFor, runToEnd, toTernary, OOK, detectLanguage, loadProgram, hiddenText } from './esolangs.js';

const HISTORY_KEY = 'history';
const MAX_HISTORY = 30;
const SAMPLES = ['Hello, World!', 'hi', 'Esoteric!', '42'];
const BOOT = ['initialising esoteric runtime…', 'loading brainfuck tape [30000 cells]', 'teaching orangutans to say Ook', 'erasing all visible characters (whitespace)', 'summoning malbolge from the eighth circle', 'turning befunge sideways', 'counting zeros for unary… still counting', 'ready.'];
const OP_NAMES = { j: 'mov d', i: 'jump', '*': 'rotate', p: 'crazy', '<': 'output', '/': 'input', v: 'halt', o: 'nop' };
const langOf = (id) => LANGS.find((l) => l.id === id);

export default {
  mount(root, ctx) {
    const { fx, scene, storage, toast } = ctx;
    const accent = ctx.meta.accent || '#39ff88';
    const cleanups = [];
    let alive = true;

    let lang = langOf(storage.get('lang')) ? storage.get('lang') : 'brainfuck';
    let speed = storage.get('speed', 1);
    // 'encode': text -> program. 'decode': paste a program, run it, read its output.
    let mode = storage.get('mode', 'encode') === 'decode' ? 'decode' : 'encode';
    let forcedLang = null; // decode mode: null = auto-detect
    let history = storage.get(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];

    root.classList.add('es');
    root.innerHTML = `
      <div class="es-boot" aria-hidden="true"><pre></pre></div>
      <div class="es-scan" aria-hidden="true"></div>

      <header class="es-head">
        <div class="es-head-main">
          <div class="es-badge"><span></span>MODULE · ESOLANG COMPILER</div>
          <h1 class="es-title" data-text="Esoteric Languages">Esoteric Languages</h1>
          <p class="es-sub">Your text, compiled into the strangest programming languages ever made, and run live.</p>
        </div>
        <nav class="es-tabs" role="tablist" aria-label="Language">
          ${LANGS.map((l, i) => `<button role="tab" class="es-tab" data-lang="${l.id}" style="--i:${i}">${l.name}</button>`).join('')}
        </nav>
      </header>

      <div class="es-main">
        <div class="es-left">
          <section class="es-panel es-program">
            <div class="es-panel-head">
              <span class="es-file"></span>
              <span class="es-stats"></span>
              <span class="es-verify"></span>
            </div>
            <div class="es-code-wrap"><pre class="es-code"></pre><span class="es-cursor" hidden></span></div>
            <div class="es-note" hidden></div>
          </section>
          <div class="es-feed" role="log" aria-live="polite">
            <div class="es-empty"><p>Compiled programs will appear here.</p><div class="es-samples"></div></div>
          </div>
        </div>
        <aside class="es-side">
          <section class="es-panel es-machine">
            <div class="es-panel-head">
              <span class="es-file">virtual machine</span>
              <span class="es-controls">
                <button class="es-btn" data-ctl="run" title="Run">▶ Run</button>
                <button class="es-btn" data-ctl="step" title="One step">Step</button>
                <button class="es-btn" data-ctl="reset" title="Reset">Reset</button>
                <button class="es-btn es-speed" data-ctl="speed" title="Speed"></button>
              </span>
            </div>
            <div class="es-view"></div>
            <div class="es-term"><span class="es-out"></span><span class="es-caret"></span></div>
            <div class="es-steps">ready</div>
          </section>
          <section class="es-panel es-about">
            <div class="es-about-name"></div>
            <div class="es-about-year"></div>
            <p class="es-about-blurb"></p>
            <p class="es-about-how"></p>
          </section>
        </aside>
      </div>

      <div class="es-console">
        <span class="es-prompt">$</span>
        <textarea class="es-input" rows="1" spellcheck="false" placeholder="type text to compile and press Enter…" aria-label="Text to compile"></textarea>
        <button class="es-send" aria-label="Compile and run">compile &amp; run</button>
        <div class="es-bar">
          <div class="es-modes" role="tablist" aria-label="Direction">
            <button class="es-mode" role="tab" data-mode="encode">text → program</button>
            <button class="es-mode" role="tab" data-mode="decode">program → text</button>
          </div>
          <span class="es-hint"><kbd>Enter</kbd> <span class="es-verb">compile</span> · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Esc</kbd> clear</span>
          <button class="es-chip es-chip-danger es-clear" title="Clear history">clear</button>
        </div>
      </div>
    `;

    const $ = (s) => root.querySelector(s);
    const input = $('.es-input');
    const codeEl = $('.es-code');
    const cursor = $('.es-cursor');
    const view = $('.es-view');
    const outEl = $('.es-out');
    const stepsEl = $('.es-steps');
    const feed = $('.es-feed');

    // ------------------------------------------------------------ code view
    // The code is drawn as runs of same-coloured characters. `runs` lets the
    // running instruction be found by character offset and highlighted.
    let runs = [];
    function classFor(l, ch, i, compiled) {
      if (l === 'brainfuck' || l === 'unary') return { '+': 'c-math', '-': 'c-math', '<': 'c-move', '>': 'c-move', '[': 'c-loop', ']': 'c-loop', '.': 'c-out' }[ch] || 'c-dim';
      if (l === 'whitespace') return ch === ' ' ? 'c-s' : ch === '\t' ? 'c-t' : 'c-l';
      if (l === 'malbolge') return `c-mb-${{ '<': 'out', p: 'crz', '*': 'rot', o: 'nop', v: 'halt' }[compiled.ops[i]] || 'nop'}`;
      if (l === 'befunge') return compiled.strMask[i] ? 'c-str' : /[0-9+*]/.test(ch) ? 'c-math' : 'c-loop';
      return 'c-dim';
    }
    function renderCode(compiled, l) {
      codeEl.textContent = '';
      runs = [];
      cursor.hidden = true;
      if (l === 'unary') {
        codeEl.innerHTML = `<span class="c-dim">a program of</span>\n<span class="c-big"></span>\n<span class="c-dim">zeros. That number has ${compiled.unary.length.toLocaleString()} digits.</span>`;
        codeEl.querySelector('.c-big').textContent = compiled.code;
        return;
      }
      if (l === 'ook') {
        // One coloured run per Ook pair, coloured by the Brainfuck command it means.
        const back = Object.fromEntries(Object.entries(OOK).map(([k, v]) => [v, k]));
        compiled.code.split(' ').reduce((acc, w, k, arr) => (k % 2 ? acc : [...acc, `${w} ${arr[k + 1]}`]), []).forEach((pair, k) => {
          const span = document.createElement('span');
          span.className = classFor('brainfuck', back[pair]);
          span.textContent = `${pair}${k % 8 === 7 ? '\n' : ' '}`;
          runs.push({ start: k * 10, node: span.firstChild });
          codeEl.appendChild(span);
        });
        return;
      }
      const show = l === 'whitespace' ? { ' ': '·', '\t': '→', '\n': '↵' } : {};
      let cur = null;
      let curCls = '';
      Array.from(compiled.code).forEach((ch, i) => {
        const cls = classFor(l, ch, i, compiled);
        if (cls !== curCls || !cur) {
          cur = document.createElement('span');
          cur.className = cls;
          curCls = cls;
          codeEl.appendChild(cur);
          runs.push({ start: i, node: cur, text: '' });
        }
        runs.at(-1).text += show[ch] || ch;
        if (ch === '\n' && l === 'whitespace') {
          cur.textContent = runs.at(-1).text;
          cur.after(document.createElement('br'));
          cur = null;
        }
      });
      runs.forEach((r) => {
        r.node.textContent = r.text;
        r.node = r.node.firstChild;
      });
    }
    function highlight(pos, len = 1) {
      if (pos < 0 || !runs.length) return (cursor.hidden = true);
      let lo = 0;
      let hi = runs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (runs[mid].start <= pos) lo = mid;
        else hi = mid - 1;
      }
      const run = runs[lo];
      if (!run.node) return;
      const off = Math.min(pos - run.start, run.node.length - 1);
      const range = document.createRange();
      range.setStart(run.node, off);
      range.setEnd(run.node, Math.min(off + len, run.node.length));
      const r = range.getBoundingClientRect();
      const box = codeEl.parentElement.getBoundingClientRect();
      const wrap = codeEl.parentElement;
      cursor.hidden = false;
      cursor.style.transform = `translate(${r.left - box.left + wrap.scrollLeft - 2}px, ${r.top - box.top + wrap.scrollTop - 1}px)`;
      cursor.style.width = `${r.width + 4}px`;
      cursor.style.height = `${r.height + 2}px`;
      // Keep the running instruction in view.
      if (r.top < box.top + 10 || r.bottom > box.bottom - 10) wrap.scrollTop += r.top - box.top - box.height / 2;
    }

    // --------------------------------------------------------- compiling
    let current = null; // { lang, text, compiled, ok }
    // A pasted program: detect (or use the forced) language, load it, run it.
    function buildRun(code, forced = null) {
      const l = forced || detectLanguage(code);
      if (!l) return { lang: null, error: 'Couldn’t tell which language this is. Pick one above.' };
      let compiled;
      try {
        compiled = decorate(loadProgram(code, l), l);
      } catch (err) {
        return { lang: l, error: err.message };
      }
      let text = '';
      let error = '';
      try {
        // A program made here can carry the exact text it was made from (Malbolge
        // can't print non-ASCII); that wins over the "?" the machine prints.
        text = hiddenText(code, l) ?? runToEnd(l, compiled, 3_000_000);
      } catch (err) {
        error = err.message === 'Step limit reached' ? 'Still running after 3,000,000 steps (an endless loop?)' : err.message;
      }
      return { lang: l, text, compiled, ok: !error, error, run: true, src: code, auto: !forced };
    }

    // Extra details the code view needs (what each Malbolge character decodes
    // to, which Befunge characters are inside string mode).
    function decorate(compiled, l) {
      if (l === 'malbolge') {
        const XL = '+b(29e*j1VMEKLyC})8&m#~W>qxdRp0wkrUo[D7,XTcA"lI.v%{gJh4G\\-=O@5`_3i<?Z\';FNQuY]szf$!BS/|t:Pn6^Ha';
        compiled.ops = Array.from(compiled.code, (c, i) => XL[(c.charCodeAt(0) - 33 + i) % 94]);
      }
      if (l === 'befunge') {
        let str = false;
        compiled.strMask = Array.from(compiled.code, (c) => (c === '"' ? ((str = !str), true) : str));
      }
      return compiled;
    }

    function build(text, l) {
      const compiled = decorate(compile(text, l), l);
      let ok = false;
      try {
        ok = runToEnd(l, compiled, 3_000_000) === compiled.prints;
      } catch {
        ok = false;
      }
      return { lang: l, text, compiled, ok };
    }

    // Decode mode with nothing runnable (empty, or not a known language).
    function showNothing(message) {
      current = null;
      stopRun();
      vm = null;
      codeEl.textContent = '';
      runs = [];
      cursor.hidden = true;
      $('.es-program .es-file').textContent = 'program.???';
      $('.es-stats').textContent = '';
      const v = $('.es-verify');
      v.textContent = message;
      v.className = `es-verify ${message ? 'bad' : ''}`;
      $('.es-note').hidden = true;
      outEl.textContent = '';
      stepsEl.textContent = 'paste a program to run it';
      root.querySelectorAll('.es-tab').forEach((t) => t.setAttribute('aria-selected', String(forcedLang === t.dataset.lang)));
      drawView();
    }

    function showProgram(p) {
      current = p;
      stopRun();
      const c = p.compiled;
      const ext = { brainfuck: 'bf', ook: 'ook', whitespace: 'ws', malbolge: 'mb', befunge: 'bf93', unary: 'unary' }[p.lang];
      $('.es-program .es-file').textContent = `program.${ext}`;
      const size = p.lang === 'unary' ? `10^${c.unary.length - 1}+ zeros` : `${c.code.length.toLocaleString()} chars`;
      const v = $('.es-verify');
      if (p.run) {
        // A pasted program: show its language and what it prints.
        root.querySelectorAll('.es-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.lang === p.lang)));
        $('.es-stats').textContent = `${langOf(p.lang).name}${p.auto ? ' (detected)' : ''} · ${size}`;
        const shown = p.text.length > 48 ? `${p.text.slice(0, 48)}…` : p.text;
        v.textContent = p.error ? `✗ ${p.error}` : `▶ prints: “${shown.replace(/\n/g, '↵')}”`;
        v.className = `es-verify ${p.error ? 'bad' : 'ok'}`;
      } else {
        const ratio = p.text && p.lang !== 'unary' ? ` · ${(c.code.length / Math.max(1, Array.from(p.text).length)).toFixed(1)}× your text` : '';
        $('.es-stats').textContent = p.text ? `${size}${ratio}` : '';
        v.textContent = p.text ? (p.ok ? '✓ verified: running it prints your text' : '✗ check failed') : '';
        v.className = `es-verify ${p.ok ? 'ok' : 'bad'}`;
      }
      const note = $('.es-note');
      note.hidden = !c.note;
      note.textContent = c.note || '';
      renderCode(c, p.lang);
      resetMachine();
    }

    // ------------------------------------------------------------- machine
    let vm = null;
    let raf = 0;
    let running = false;
    let totalSteps = 1;
    function resetMachine() {
      stopRun();
      vm = null;
      outEl.textContent = '';
      stepsEl.textContent = current?.compiled ? 'ready. press ▶ Run' : 'ready';
      cursor.hidden = true;
      drawView();
    }
    function ensureVM() {
      if (!vm && current?.compiled) {
        vm = machineFor(current.lang, current.compiled);
        // Size the animation so a full run takes a few seconds at 1×.
        const probe = machineFor(current.lang, current.compiled);
        while (probe.step() && probe.state.steps < 3_000_000) {}
        totalSteps = Math.max(1, probe.state.steps);
      }
      return vm;
    }
    function decode(bytes) {
      return new TextDecoder().decode(new Uint8Array(bytes));
    }
    function stepMany(n) {
      const m = ensureVM();
      if (!m) return;
      const before = m.state.out.length;
      for (let k = 0; k < n && m.step(); k++) {}
      if (m.state.out.length !== before) {
        outEl.textContent = decode(m.state.out);
        const r = $('.es-caret').getBoundingClientRect();
        fx.burst(r.left, r.top + 8, { count: 6, color: accent, spread: 2.5, silent: true });
        ctx.sound.play('bleep', { pitch: 0.75 + (m.state.out.at(-1) % 32) / 24, x: r.left });
      }
      drawView();
      const len = current.lang === 'ook' ? 9 : 1;
      const pos = m.pos();
      highlight(current.lang === 'ook' ? pos * 10 : pos, len);
      stepsEl.textContent = `${m.state.steps.toLocaleString()} / ${totalSteps.toLocaleString()} steps${m.state.done ? ' · halted' : ''}`;
      if (m.state.done) {
        stopRun();
        cursor.hidden = true;
        ctx.sound.play('success');
        if (current.lang !== 'unary') scene.pulse(0.9);
      }
    }
    function startRun() {
      if (!ensureVM()) return;
      if (vm.state.done) resetMachine(), ensureVM();
      running = true;
      $('[data-ctl="run"]').textContent = '❚❚ Pause';
      const perFrame = speed === 0 ? Infinity : Math.max(1, Math.ceil((totalSteps / 300) * speed));
      const tick = () => {
        if (!running || !alive) return;
        stepMany(perFrame === Infinity ? totalSteps : perFrame);
        if (running) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    function stopRun() {
      running = false;
      cancelAnimationFrame(raf);
      const b = root.querySelector('[data-ctl="run"]');
      if (b) b.textContent = '▶ Run';
    }
    cleanups.push(stopRun);

    const SPEEDS = [[1, '1×'], [4, '4×'], [0, 'max']];
    const speedLabel = () => (SPEEDS.find(([v]) => v === speed) || SPEEDS[0])[1];
    $('[data-ctl="speed"]').textContent = `speed ${speedLabel()}`;
    root.querySelector('.es-controls').addEventListener('click', (e) => {
      const ctl = e.target.closest('[data-ctl]')?.dataset.ctl;
      if (!ctl) return;
      if (ctl === 'run') running ? stopRun() : startRun();
      if (ctl === 'step') stopRun(), stepMany(1);
      if (ctl === 'reset') resetMachine();
      if (ctl === 'speed') {
        const i = SPEEDS.findIndex(([v]) => v === speed);
        speed = SPEEDS[(i + 1) % SPEEDS.length][0];
        storage.set('speed', speed);
        e.target.textContent = `speed ${speedLabel()}`;
        if (running) stopRun(), startRun();
      }
    });

    // Language-specific machine views.
    function drawView() {
      const l = current?.lang || lang;
      const s = vm?.state;
      if (l === 'brainfuck' || l === 'ook' || l === 'unary') {
        const ptr = s?.ptr ?? 0;
        const from = Math.max(0, ptr - 4);
        let cells = '';
        for (let i = from; i < from + 9; i++) {
          const v = s ? s.tape[i] : 0;
          cells += `<div class="es-cell${i === ptr ? ' on' : ''}"><i>${i}</i><b>${v}</b><span>${v >= 32 && v < 127 ? escapeHtml(String.fromCharCode(v)) : '·'}</span></div>`;
        }
        view.innerHTML = `<div class="es-view-label">memory tape · pointer at cell ${ptr}</div><div class="es-tape">${cells}</div>`;
      } else if (l === 'whitespace') {
        const st = s?.stack || [];
        view.innerHTML = `<div class="es-view-label">stack · ${st.length} item${st.length === 1 ? '' : 's'}</div><div class="es-stack">${st.slice(-6).reverse().map((v) => `<div class="es-item"><b>${v}</b><span>${escapeHtml(safeChar(v))}</span></div>`).join('') || '<div class="es-item empty">empty</div>'}</div>`;
      } else if (l === 'malbolge') {
        const reg = (name, v) => `<div class="es-reg"><i>${name}</i><b>${v}</b><span>${toTernary(v).split('').map((t) => `<em class="t${t}">${t}</em>`).join('')}</span></div>`;
        view.innerHTML = `<div class="es-view-label">registers (ternary) · last op: ${s?.op ? `${escapeHtml(s.op)} ${OP_NAMES[s.op]}` : '—'}</div><div class="es-regs">${reg('a', s?.a || 0)}${reg('c', s?.c || 0)}${reg('d', s?.d || 0)}</div>`;
      } else if (l === 'befunge') {
        // The row the instruction pointer is on (programs can span several lines).
        const x = s?.x ?? 0;
        const row = (vm?.row ? vm.row(s.y) : (current?.compiled.code || '').split('\n')[0]).replace(/\s+$/, '').padEnd(x + 1);
        const from = Math.max(0, x - 8);
        let cells = '';
        for (let i = from; i < Math.min(row.length, from + 17); i++) cells += `<div class="es-bcell${i === x ? ' on' : ''}">${escapeHtml(row[i] === ' ' ? '·' : row[i])}</div>`;
        const st = s?.stack || [];
        view.innerHTML = `<div class="es-view-label">playfield · moving ${s?.dx === -1 ? '←' : '→'}${s?.str ? ' · string mode' : ''}</div><div class="es-grid">${cells}</div><div class="es-view-label">stack top</div><div class="es-stack row">${st.slice(-8).reverse().map((v) => `<div class="es-item"><b>${v}</b><span>${escapeHtml(safeChar(v))}</span></div>`).join('') || '<div class="es-item empty">empty</div>'}</div>`;
      }
    }

    // ------------------------------------------------------------ language
    function applyLang() {
      const L = langOf(lang);
      root.querySelectorAll('.es-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.lang === lang)));
      $('.es-about-name').textContent = L.name;
      $('.es-about-year').textContent = L.year;
      $('.es-about-blurb').textContent = L.blurb;
      $('.es-about-how').textContent = L.how;
    }
    function setLang(id) {
      if (mode === 'decode') {
        // Force this language for the pasted program; clicking it again goes back to auto-detect.
        forcedLang = forcedLang === id ? null : id;
        lang = forcedLang || lang;
        applyLang();
        liveCompile(true);
        toast(forcedLang ? `Running it as ${langOf(id).name}` : 'Detecting the language automatically');
        return;
      }
      if (id === lang) return;
      lang = id;
      storage.set('lang', id);
      applyLang();
      liveCompile(true);
      scene.pulse(0.8);
      const t = root.querySelector(`.es-tab[data-lang="${id}"]`).getBoundingClientRect();
      fx.burst(t.left + t.width / 2, t.top + t.height / 2, { count: 26, color: accent, spread: 5 });
      fx.scramble($('.es-about-name'), langOf(id).name, { duration: 450, glyphs: '+-<>[].,01' });
    }
    root.querySelectorAll('.es-tab').forEach((t) => {
      t.addEventListener('click', () => setLang(t.dataset.lang));
      cleanups.push(fx.ripple(t));
    });

    let liveTimer = 0;
    function liveCompile(now = false) {
      clearTimeout(liveTimer);
      const go = () => {
        const text = input.value;
        if (mode === 'decode') {
          if (!text.trim() && !/[ \t]/.test(text)) return showNothing('');
          const p = buildRun(text, forcedLang);
          if (!p.compiled) return showNothing(`✗ ${p.error}`);
          lang = p.lang;
          applyLang();
          showProgram(p);
          return;
        }
        try {
          showProgram(build(text || 'Hello, World!', lang));
          if (!text) $('.es-stats').textContent = 'example: Hello, World!';
        } catch (err) {
          $('.es-verify').textContent = `✗ ${err.message}`;
        }
      };
      if (now) go();
      else liveTimer = setTimeout(go, 160);
    }
    cleanups.push(() => clearTimeout(liveTimer));

    // ---------------------------------------------------------------- cards
    // A program that was pasted and run: its code, and what it printed.
    function addRunCard(entry, { animate }) {
      const p = buildRun(entry.src, entry.forced ? entry.lang : null);
      const card = document.createElement('article');
      card.className = `es-card es-card-run${animate ? ' es-card-new' : ''}`;
      card.dataset.id = entry.id;
      card.innerHTML = `
        <header class="es-card-head"><span class="es-card-src es-card-output"></span><span class="es-card-meta"><i class="es-tag"></i><span></span></span></header>
        <pre class="es-card-code"></pre>
        <footer class="es-card-actions">
          <button data-act="run" class="es-chip es-chip-primary">▶ Run</button>
          <button data-act="copy-out" class="es-chip">Copy output</button>
          <button data-act="copy-prog" class="es-chip">Copy program</button>
          <button data-act="delete" class="es-chip es-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      const out = card.querySelector('.es-card-output');
      out.textContent = p.error ? `✗ ${p.error}` : `▶ ${p.text || '(prints nothing)'}`;
      out.classList.toggle('bad', Boolean(p.error));
      card.querySelector('.es-tag').textContent = p.lang ? `${langOf(p.lang).name} → text` : 'unknown';
      card.querySelector('.es-card-meta span').textContent = `${entry.src.length.toLocaleString()} chars`;
      const preview = p.lang === 'whitespace' ? (p.compiled?.code || entry.src).replace(/ /g, '·').replace(/\t/g, '→').replace(/\n/g, '↵') : entry.src;
      card.querySelector('.es-card-code').textContent = preview.length > 600 ? `${preview.slice(0, 600)}…` : preview;
      card._p = p;
      card._mode = 'decode';
      feed.appendChild(card);
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      return card;
    }

    function addCard(entry, { animate }) {
      if (entry.mode === 'decode') return addRunCard(entry, { animate });
      const p = build(entry.src, entry.lang);
      const L = langOf(entry.lang);
      const card = document.createElement('article');
      card.className = `es-card${animate ? ' es-card-new' : ''}`;
      card.dataset.id = entry.id;
      card.innerHTML = `
        <header class="es-card-head"><span class="es-card-src"></span><span class="es-card-meta"><i class="es-tag"></i><span></span></span></header>
        <pre class="es-card-code"></pre>
        <footer class="es-card-actions">
          <button data-act="run" class="es-chip es-chip-primary">▶ Run</button>
          <button data-act="copy" class="es-chip">${entry.lang === 'unary' ? 'Copy length' : 'Copy program'}</button>
          <button data-act="copy-src" class="es-chip">Copy original</button>
          <button data-act="delete" class="es-chip es-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      card.querySelector('.es-card-src').textContent = entry.src;
      card.querySelector('.es-tag').textContent = L.name;
      card.querySelector('.es-card-meta span').textContent = `${p.compiled.code.length.toLocaleString()} chars${p.ok ? ' · ✓' : ''}`;
      const preview = entry.lang === 'whitespace' ? p.compiled.code.replace(/ /g, '·').replace(/\t/g, '→').replace(/\n/g, '↵') : p.compiled.code;
      card.querySelector('.es-card-code').textContent = preview.length > 600 ? `${preview.slice(0, 600)}…` : preview;
      card._p = p;
      feed.appendChild(card);
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      return card;
    }
    const refreshMeta = () => ($('.es-empty').hidden = history.length > 0);

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
      const card = btn.closest('.es-card');
      const p = card._p;
      const act = btn.dataset.act;
      if (act === 'run' && card._mode === 'decode') {
        if (!p.compiled) return toast(p.error || 'Nothing to run', { type: 'error' });
        setMode('decode', { animate: false });
        forcedLang = p.auto ? null : p.lang;
        lang = p.lang;
        applyLang();
        input.value = p.src;
        autosize();
        clearTimeout(liveTimer);
        showProgram(p);
        startRun();
      } else if (act === 'run') {
        setMode('encode', { animate: false });
        if (p.lang !== lang) {
          lang = p.lang;
          storage.set('lang', lang);
          applyLang();
        }
        input.value = p.text;
        clearTimeout(liveTimer);
        showProgram(p);
        startRun();
      } else if (act === 'copy-out') copy(p.text, 'Output');
      else if (act === 'copy-prog') copy(p.src, 'Program');
      else if (act === 'copy') copy(p.compiled.copy ?? p.compiled.code, p.lang === 'unary' ? 'Number of zeros' : 'Program');
      else if (act === 'copy-src') copy(p.text, 'Original text');
      else if (act === 'delete') {
        history = history.filter((h) => String(h.id) !== card.dataset.id);
        storage.set(HISTORY_KEY, history);
        card.classList.add('es-card-out');
        card.addEventListener('animationend', () => (card.remove(), refreshMeta()), { once: true });
      }
      if (act !== 'delete') {
        const r = btn.getBoundingClientRect();
        fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 14, color: accent, spread: 4 });
      }
    });

    $('.es-clear').addEventListener('click', () => {
      if (!history.length) return;
      history = [];
      storage.remove(HISTORY_KEY);
      const cards = feed.querySelectorAll('.es-card');
      cards.forEach((c, i) => {
        c.style.animationDelay = `${i * 30}ms`;
        c.classList.add('es-card-out');
        c.addEventListener('animationend', () => c.remove(), { once: true });
      });
      setTimeout(refreshMeta, 350 + cards.length * 30);
      scene.pulse(0.6);
    });

    // ----------------------------------------------------------------- input
    function autosize() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
    }
    function send() {
      if (mode === 'decode') return sendRun();
      const text = input.value.replace(/\s+$/, '');
      if (!text) {
        ctx.sound.play('error');
        $('.es-console').animate([{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '0' }], { duration: 400 });
        return;
      }
      // A live recompile still pending from typing would reset the run below.
      clearTimeout(liveTimer);
      const entry = { id: Date.now() + Math.floor(Math.random() * 1000), src: text, lang, at: Date.now() };
      history.push(entry);
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY).forEach((d) => feed.querySelector(`.es-card[data-id="${d.id}"]`)?.remove());
      storage.set(HISTORY_KEY, history);
      const card = addCard(entry, { animate: true });
      refreshMeta();
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      showProgram(card._p);
      startRun();
      const b = $('.es-send').getBoundingClientRect();
      fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 30, color: accent, spread: 7 });
      scene.pulse(1);
    }
    // Decode mode: keep the pasted program, run it on the machine, and save it with its output.
    function sendRun() {
      const code = input.value;
      clearTimeout(liveTimer);
      const p = buildRun(code, forcedLang);
      if (!p.compiled) {
        ctx.sound.play('error');
        $('.es-console').animate([{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '0' }], { duration: 400 });
        toast(p.error || 'Paste a program first', { type: 'error' });
        return;
      }
      const entry = { id: Date.now() + Math.floor(Math.random() * 1000), mode: 'decode', src: code, lang: p.lang, forced: Boolean(forcedLang), at: Date.now() };
      history.push(entry);
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY).forEach((d) => feed.querySelector(`.es-card[data-id="${d.id}"]`)?.remove());
      storage.set(HISTORY_KEY, history);
      addCard(entry, { animate: true });
      refreshMeta();
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      lang = p.lang;
      applyLang();
      showProgram(p);
      startRun();
      const b = $('.es-send').getBoundingClientRect();
      fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 30, color: accent, spread: 7 });
      scene.pulse(1);
    }

    input.addEventListener('input', () => (autosize(), liveCompile()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) e.preventDefault(), send();
      else if (e.key === 'Escape' && input.value) e.preventDefault(), (input.value = ''), autosize(), liveCompile(true);
    });
    $('.es-send').addEventListener('click', send);
    cleanups.push(fx.ripple($('.es-send')), fx.magnetic($('.es-send'), { strength: 0.12 }));

    // Decode samples: programs in different languages, including a classic
    // hand-written Brainfuck "Hello World!" (from Wikipedia's Brainfuck article).
    const RUN_SAMPLES = [
      ['Brainfuck classic', '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.'],
      ['Befunge', compile('Hi there!', 'befunge').code],
      ['Ook!', compile('Ook!', 'ook').code],
      ['Malbolge', compile('Hello', 'malbolge').code],
    ];
    function buildSamples() {
      const box = $('.es-samples');
      box.innerHTML = '';
      const list = mode === 'encode' ? SAMPLES.map((s) => [s, s]) : RUN_SAMPLES;
      for (const [label, value] of list) {
        const chip = document.createElement('button');
        chip.className = 'es-chip';
        chip.textContent = label;
        chip.title = value.length > 80 ? `${value.slice(0, 80)}…` : value;
        chip.addEventListener('click', () => ((input.value = value), autosize(), send()));
        box.appendChild(chip);
      }
    }

    // ------------------------------------------------------------------ mode
    function setMode(next, { animate = true } = {}) {
      const changed = next !== mode;
      mode = next;
      storage.set('mode', mode);
      forcedLang = null;
      root.classList.toggle('es-decoding', mode === 'decode');
      root.querySelectorAll('.es-mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
      const touch = document.body.classList.contains('handheld'); // no Enter key hint, and less room, on touch screens
      input.placeholder = mode === 'encode'
        ? (touch ? 'text to compile…' : 'type text to compile and press Enter…')
        : touch ? 'paste a program…' : 'paste a Brainfuck, Ook!, Whitespace, Malbolge, Befunge or Unary program…';
      input.setAttribute('aria-label', mode === 'encode' ? 'Text to compile' : 'Program to run');
      $('.es-send').textContent = mode === 'encode' ? 'compile & run' : 'run program';
      $('.es-verb').textContent = mode === 'encode' ? 'compile' : 'run';
      $('.es-sub').textContent = mode === 'encode'
        ? 'Your text, compiled into the strangest programming languages ever made, and run live.'
        : 'Paste a program in any of these languages: the language is detected, the machine runs it, and you read what it prints.';
      $('.es-empty p').textContent = mode === 'encode' ? 'Compiled programs will appear here.' : 'Programs you run will appear here.';
      buildSamples();
      if (changed) {
        input.value = '';
        autosize();
        if (animate) {
          scene.pulse(0.8);
          const b = root.querySelector(`.es-mode[data-mode="${mode}"]`).getBoundingClientRect();
          fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 24, color: accent, spread: 5 });
        }
      }
      if (mode === 'encode') lang = langOf(storage.get('lang')) ? storage.get('lang') : lang;
      applyLang();
      liveCompile(true);
    }
    root.querySelectorAll('.es-mode').forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
      cleanups.push(fx.ripple(b));
    });

    setMode(mode, { animate: false });
    history.forEach((h) => addCard(h, { animate: false }));
    refreshMeta();
    feed.scrollTop = feed.scrollHeight;

    // ----------------------------------------------------------------- intro
    // A terminal boot log types itself out, glitches, and clears.
    root.classList.add('es-intro');
    const pre = $('.es-boot pre');
    let line = 0;
    let char = 0;
    let bootTimer = 0;
    const finishBoot = () => {
      if (root.classList.contains('es-ready')) return;
      clearTimeout(bootTimer);
      root.classList.add('es-ready');
      scene.pulse(1.2);
      fx.scramble($('.es-title'), 'Esoteric Languages', { duration: 900, glyphs: '+-<>[].,Ook!01→·↵' });
      setTimeout(() => alive && input.focus(), 400);
    };
    const type = () => {
      if (!alive) return;
      if (line >= BOOT.length) return (bootTimer = setTimeout(finishBoot, 260));
      const text = BOOT[line];
      if (char === 0 && line) ctx.sound.play('beep');
      ctx.sound.play('type');
      char += 3;
      const done = BOOT.slice(0, line).map((t) => `> ${t}${t === 'ready.' ? '' : '  [ok]'}`).join('\n');
      pre.textContent = `${done}${done ? '\n' : ''}> ${text.slice(0, char)}█`;
      if (char >= text.length) (line++, (char = 0));
      bootTimer = setTimeout(type, char === 0 ? 70 : 12);
    };
    type();
    $('.es-boot').addEventListener('pointerdown', finishBoot);
    addEventListener('keydown', finishBoot, { once: true });
    cleanups.push(() => (clearTimeout(bootTimer), removeEventListener('keydown', finishBoot)));

    return () => {
      alive = false;
      cleanups.forEach((fn) => fn());
    };
  },
};

function safeChar(v) {
  return v >= 32 && v < 0x110000 && !(v >= 0xd800 && v <= 0xdfff) ? String.fromCodePoint(v) : '·';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
