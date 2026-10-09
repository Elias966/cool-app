import { LAYERS, PRESETS, MAX_DEPTH, layerById, encodeChain, decodeChain, autoPeel, randomChain, recipe } from './layers.js';

const HISTORY_KEY = 'history';
const MAX_HISTORY = 40;
const SAMPLES = ['Hello, World!', 'Order matters', 'Meet me at midnight', 'Peel me 🧅'];
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=%&#';
const SHOW_CHARS = 140; // characters drawn per live plate (the rest is cut with …)

export default {
  mount(root, ctx) {
    const { fx, scene, storage, toast } = ctx;
    const accent = ctx.meta.accent || '#ff4fd8';
    const cleanups = [];
    let alive = true;

    let mode = storage.get('mode', 'encode') === 'decode' ? 'decode' : 'encode';
    let method = storage.get('method', 'auto') === 'chain' ? 'chain' : 'auto';
    let chain = storage.get('chain', PRESETS[0].chain);
    if (!Array.isArray(chain) || !chain.every((id) => layerById(id))) chain = [...PRESETS[0].chain];
    chain = chain.slice(0, MAX_DEPTH);
    let history = storage.get(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];

    root.classList.add('ly');
    root.innerHTML = `
      <canvas class="ly-intro" aria-hidden="true"></canvas>

      <header class="ly-head">
        <div class="ly-head-main">
          <div class="ly-badge"><span></span>MODULE · ENCODING CHAINS</div>
          <h1 class="ly-title">Layered Encoding</h1>
          <p class="ly-sub"></p>
          <p class="ly-aka">also known as <b>String Compositions</b> · <b>Mixture-of-Encodings</b> · <b>stacked encoding</b></p>
        </div>
        <div class="ly-gauge" title="Your chain as a stack: the first layer is at the bottom">
          <div class="ly-tower-wrap" aria-hidden="true"><div class="ly-tower"></div></div>
          <div class="ly-gauge-num"><b class="ly-depth">0</b><span>layers deep</span><em class="ly-growth"></em></div>
        </div>
      </header>

      <div class="ly-main">
        <div class="ly-left">
          <section class="ly-stack" aria-label="The string after every layer"></section>
          <div class="ly-feed" role="log" aria-live="polite">
            <div class="ly-empty">
              <p></p>
              <div class="ly-samples"></div>
            </div>
          </div>
        </div>

        <aside class="ly-side">
          <section class="ly-panel ly-chainbox">
            <div class="ly-panel-head">
              <span>Chain <em class="ly-chain-count"></em></span>
              <span class="ly-panel-tools">
                <button class="ly-chip ly-shuffle" title="A random chain: new order and depth">⤮ Shuffle</button>
                <button class="ly-chip ly-chip-danger ly-empty-chain" title="Remove every layer">Empty</button>
              </span>
            </div>
            <ol class="ly-chain"></ol>
            <div class="ly-chain-off">Auto-peel finds the layers by itself. Switch to <b>My chain</b> to undo exactly this chain.</div>
            <div class="ly-presets"></div>
          </section>
          <section class="ly-panel ly-palettebox">
            <div class="ly-panel-head"><span>Add a layer</span><span class="ly-palette-note"></span></div>
            <div class="ly-palette"></div>
          </section>
        </aside>
      </div>

      <div class="ly-console">
        <div class="ly-console-border" aria-hidden="true"></div>
        <div class="ly-live"><span class="ly-live-text"></span></div>
        <div class="ly-inputrow">
          <textarea class="ly-input" rows="1" spellcheck="false"></textarea>
          <button class="ly-send">
            <span>Encode</span>
            <svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5"/></svg>
          </button>
        </div>
        <div class="ly-bar">
          <div class="ly-switch ly-modes" role="tablist" aria-label="Direction">
            <button class="ly-mode" role="tab" data-mode="encode">Text → Layers</button>
            <button class="ly-mode" role="tab" data-mode="decode">Layers → Text</button>
          </div>
          <div class="ly-switch ly-methods" role="tablist" aria-label="How to decode">
            <button class="ly-method" role="tab" data-method="auto" title="Detect and peel the layers automatically">Auto-peel</button>
            <button class="ly-method" role="tab" data-method="chain" title="Undo the chain on the right, last layer first">My chain</button>
          </div>
          <span class="ly-hint"><kbd>Enter</kbd> <span class="ly-verb">encode</span> · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Esc</kbd> clear</span>
          <span class="ly-counter"></span>
          <button class="ly-chip ly-chip-danger ly-clear" title="Clear history">Clear</button>
        </div>
      </div>
    `;

    const $ = (s) => root.querySelector(s);
    const input = $('.ly-input');
    const sendBtn = $('.ly-send');
    const consoleEl = $('.ly-console');
    const feed = $('.ly-feed');
    const empty = $('.ly-empty');
    const stackEl = $('.ly-stack');
    const chainEl = $('.ly-chain');
    const paletteEl = $('.ly-palette');
    const tower = $('.ly-tower');
    const liveText = $('.ly-live-text');
    const counter = $('.ly-counter');

    const burstAt = (el, opts) => {
      const r = el.getBoundingClientRect();
      fx.burst(r.left + r.width / 2, r.top + r.height / 2, { color: accent, ...opts });
    };
    const shake = () =>
      consoleEl.animate(
        [{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '-5px' }, { translate: '3px' }, { translate: '0' }],
        { duration: 450, easing: 'ease-in-out' }
      );

    // ---------------------------------------------------------- 3D tower
    // The chain drawn as floating slabs in the header, first layer at the bottom.
    let towerIds = [];
    function renderTower() {
      const grew = chain.length > towerIds.length && chain.slice(0, towerIds.length).every((id, i) => id === towerIds[i]);
      tower.innerHTML = '';
      chain.forEach((id, i) => {
        const l = layerById(id);
        const slab = document.createElement('div');
        slab.className = 'ly-slab';
        if ((grew && i >= towerIds.length) || (!grew && towerIds[i] !== id)) slab.classList.add('new');
        slab.style.setProperty('--c', l.color);
        slab.style.setProperty('--z', `${i * 13}px`);
        slab.style.setProperty('--i', i);
        slab.innerHTML = `<b>${escapeHtml(l.glyph)}</b>`;
        tower.appendChild(slab);
      });
      tower.style.setProperty('--h', `${chain.length * 13}px`);
      towerIds = [...chain];
      $('.ly-depth').textContent = chain.length;
    }

    // ---------------------------------------------------------- live stack
    let lastOuts = [];
    function plate({ cls = '', color, glyph, name, out, note }, i) {
      const shown = out == null ? '' : out.length > SHOW_CHARS ? `${out.slice(0, SHOW_CHARS)}…` : out;
      const changed = out != null && lastOuts[i] !== out;
      return `
        <div class="ly-plate ${cls}${changed ? ' changed' : ''}" style="--c:${color};--i:${i}">
          <span class="ly-plate-glyph">${escapeHtml(glyph)}</span>
          <span class="ly-plate-name">${escapeHtml(name)}</span>
          <span class="ly-plate-out">${note ? `<em>${escapeHtml(note)}</em>` : escapeHtml(visible(shown))}</span>
          <span class="ly-plate-len">${out == null ? '' : out.length.toLocaleString()}</span>
        </div>`;
    }

    // What the current input turns into, step by step. Shared by the live
    // stack, the live line and the counter.
    function compute(value) {
      if (mode === 'encode') {
        const res = encodeChain(value, chain);
        return { kind: 'encode', res, output: res.output };
      }
      if (method === 'chain') {
        const res = decodeChain(value, chain);
        return { kind: 'chain', res, output: res.output };
      }
      const res = autoPeel(value);
      return { kind: 'auto', res: { ok: true, ...res }, output: res.output };
    }

    function renderStack(value, result) {
      const demo = !value;
      const outs = [];
      let html = '';
      const push = (p) => {
        html += plate(p, outs.length);
        outs.push(p.out);
      };
      if (mode === 'encode') {
        push({ cls: 'ly-plate-src', color: '#ffffff', glyph: 'T', name: demo ? 'example' : 'your text', out: demo ? 'Hello, World!' : value });
        if (!chain.length) {
          html += `<div class="ly-stack-hint">Add layers from the palette on the right. Each one encodes the output of the one before it.</div>`;
        }
        const { res } = result;
        res.steps.forEach((s, i) => push({ cls: i === res.steps.length - 1 && res.ok ? 'ly-plate-final' : '', color: s.layer.color, glyph: s.layer.glyph, name: s.layer.name, out: s.out }));
        if (!res.ok) {
          const l = layerById(chain[res.failedAt]);
          push({ cls: 'ly-plate-err', color: '#ff6b6b', glyph: l.glyph, name: l.name, out: null, note: res.error });
        }
      } else {
        push({ cls: 'ly-plate-src', color: '#ffffff', glyph: '⧉', name: demo ? 'waiting' : 'encoded', out: demo ? null : value, note: demo ? 'paste a layered string below' : undefined });
        const { res } = result;
        if (!demo) {
          res.steps.forEach((s, i) => push({ cls: i === res.steps.length - 1 && res.ok ? 'ly-plate-final' : '', color: s.layer.color, glyph: s.layer.glyph, name: `peel ${s.layer.name}`, out: s.out }));
          if (!res.ok) {
            const l = layerById(chain[chain.length - 1 - res.failedAt]);
            push({ cls: 'ly-plate-err', color: '#ff6b6b', glyph: l.glyph, name: `peel ${l.name}`, out: null, note: res.error });
          } else if (!res.steps.length) {
            html += `<div class="ly-stack-hint">${method === 'auto' ? 'No layers detected: this already reads like plain text.' : 'Your chain is empty: add layers on the right.'}</div>`;
          }
        }
      }
      stackEl.classList.toggle('demo', demo);
      stackEl.innerHTML = html;
      lastOuts = outs;
    }

    // Show the end of long output: "…" plus as many trailing characters as fit.
    function showTail(text) {
      const fit = Math.max(12, Math.floor(liveText.parentElement.clientWidth / 9.4) - 1);
      const t = visible(text);
      liveText.textContent = t.length > fit ? `…${t.slice(-(fit - 1))}` : t;
    }

    function updateLive() {
      const value = input.value;
      const demoValue = mode === 'encode' && !value ? 'Hello, World!' : value;
      const result = compute(demoValue);
      renderStack(value, result);
      const live = liveText.parentElement;
      live.classList.remove('err', 'idle');
      const growth = mode === 'encode' && result.res.ok && demoValue ? result.output.length / Math.max(1, demoValue.length) : 0;
      $('.ly-growth').textContent = growth ? `×${growth < 10 ? growth.toFixed(1) : Math.round(growth)} size` : '';
      if (!value) {
        live.classList.add('idle');
        liveText.textContent = mode === 'encode' ? (chain.length ? result.output : 'add a layer to start') : 'the peeled text appears here';
        counter.textContent = '';
        return;
      }
      if (!result.res.ok) {
        live.classList.add('err');
        liveText.textContent = result.res.error;
        counter.textContent = '';
        return;
      }
      showTail(result.output);
      counter.textContent = mode === 'encode'
        ? `${value.length.toLocaleString()} → ${result.output.length.toLocaleString()} chars`
        : `${result.res.steps.length} layer${result.res.steps.length === 1 ? '' : 's'} peeled`;
    }
    // Encoding is cheap; auto-peel is a search, so it waits for a short pause in typing.
    let liveFrame = 0;
    let liveTimer = 0;
    const scheduleLive = () => {
      cancelAnimationFrame(liveFrame);
      clearTimeout(liveTimer);
      if (mode === 'decode' && method === 'auto') liveTimer = setTimeout(updateLive, 160);
      else liveFrame = requestAnimationFrame(updateLive);
    };
    cleanups.push(() => (cancelAnimationFrame(liveFrame), clearTimeout(liveTimer)));

    // ------------------------------------------------------------ chain UI
    function setChain(next, { save = true } = {}) {
      chain = next.slice(0, MAX_DEPTH);
      if (save) storage.set('chain', chain);
      renderChain();
      renderTower();
      updateLive();
    }

    function renderChain() {
      chainEl.innerHTML = chain
        .map((id, i) => {
          const l = layerById(id);
          return `
            <li class="ly-link" draggable="true" data-i="${i}" style="--c:${l.color};--i:${i}">
              <span class="ly-link-n">${i + 1}</span>
              <span class="ly-link-glyph">${escapeHtml(l.glyph)}</span>
              <span class="ly-link-name" title="${escapeHtml(l.blurb)}">${escapeHtml(l.name)}<small>${escapeHtml(l.blurb)}</small></span>
              <span class="ly-link-tools">
                <button data-move="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button data-move="1" title="Move down" ${i === chain.length - 1 ? 'disabled' : ''}>↓</button>
                <button data-remove title="Remove this layer">×</button>
              </span>
            </li>`;
        })
        .join('') || '<li class="ly-chain-empty">No layers yet: pick some below, or try a preset.</li>';
      $('.ly-chain-count').textContent = `${chain.length} / ${MAX_DEPTH}`;
      const full = chain.length >= MAX_DEPTH;
      paletteEl.querySelectorAll('.ly-tile').forEach((t) => (t.disabled = full));
      $('.ly-palette-note').textContent = full ? 'chain is full' : 'click to stack on top';
      root.querySelectorAll('.ly-preset').forEach((p) => p.setAttribute('aria-pressed', String(PRESETS[p.dataset.i].chain.join() === chain.join())));
    }

    chainEl.addEventListener('click', (e) => {
      const li = e.target.closest('.ly-link');
      const btn = e.target.closest('button');
      if (!li || !btn) return;
      const i = Number(li.dataset.i);
      const next = [...chain];
      if (btn.dataset.move) {
        const j = i + Number(btn.dataset.move);
        [next[i], next[j]] = [next[j], next[i]];
      } else if ('remove' in btn.dataset) {
        next.splice(i, 1);
        burstAt(btn, { count: 12, color: '#ff6b6b', spread: 3 });
      }
      setChain(next);
    });

    // Drag a layer to reorder the chain.
    let dragFrom = -1;
    const dropIndex = (y) => {
      const rows = [...chainEl.querySelectorAll('.ly-link')];
      const k = rows.findIndex((r) => {
        const b = r.getBoundingClientRect();
        return y < b.top + b.height / 2;
      });
      return k === -1 ? rows.length : k;
    };
    const clearMarks = () => chainEl.querySelectorAll('.drop-before, .drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
    chainEl.addEventListener('dragstart', (e) => {
      const li = e.target.closest('.ly-link');
      if (!li) return;
      dragFrom = Number(li.dataset.i);
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
    });
    chainEl.addEventListener('dragover', (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      clearMarks();
      const rows = chainEl.querySelectorAll('.ly-link');
      const k = dropIndex(e.clientY);
      if (rows[k]) rows[k].classList.add('drop-before');
      else rows[rows.length - 1]?.classList.add('drop-after');
    });
    chainEl.addEventListener('drop', (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      let k = dropIndex(e.clientY);
      const next = [...chain];
      const [moved] = next.splice(dragFrom, 1);
      if (k > dragFrom) k--;
      next.splice(k, 0, moved);
      dragFrom = -1;
      setChain(next);
    });
    chainEl.addEventListener('dragend', () => {
      dragFrom = -1;
      clearMarks();
      chainEl.querySelectorAll('.dragging').forEach((r) => r.classList.remove('dragging'));
    });

    // Palette: one tile per layer, showing what it does to "Hi".
    paletteEl.innerHTML = LAYERS.map((l) => {
      const sample = l.encode('Hi');
      return `
        <button class="ly-tile" data-id="${l.id}" style="--c:${l.color}" title="${escapeHtml(`${l.name}: ${l.blurb}`)}">
          <span class="ly-tile-top"><span class="ly-tile-glyph">${escapeHtml(l.glyph)}</span><span class="ly-tile-name">${escapeHtml(l.short || l.name)}</span></span>
          <span class="ly-tile-ex">Hi → ${escapeHtml(sample.length > 14 ? `${sample.slice(0, 13)}…` : sample)}</span>
        </button>`;
    }).join('');
    paletteEl.querySelectorAll('.ly-tile').forEach((t) => {
      cleanups.push(fx.tilt(t, { max: 10, scale: 1.04, perspective: 500 }));
      t.addEventListener('click', () => {
        if (chain.length >= MAX_DEPTH) return;
        const r = t.getBoundingClientRect();
        setChain([...chain, t.dataset.id]);
        const last = chainEl.querySelector('.ly-link:last-child');
        last?.classList.add('ly-link-new');
        const c = (last || chainEl).getBoundingClientRect();
        const color = layerById(t.dataset.id).color;
        fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 26, color, spread: 5, target: { x: c.left + c.width / 2, y: c.top + c.height / 2 } });
        scene.pulse(0.5);
      });
    });

    $('.ly-presets').innerHTML = PRESETS.map((p, i) => `<button class="ly-chip ly-preset" data-i="${i}" title="${escapeHtml(recipe(p.chain))}">${escapeHtml(p.name)}</button>`).join('');
    root.querySelectorAll('.ly-preset').forEach((b) => {
      cleanups.push(fx.ripple(b));
      b.addEventListener('click', () => {
        setChain(PRESETS[b.dataset.i].chain);
        chainEl.querySelectorAll('.ly-link').forEach((li) => li.classList.add('ly-link-new'));
        burstAt(b, { count: 18, spread: 4 });
        scene.pulse(0.7);
      });
    });
    $('.ly-shuffle').addEventListener('click', (e) => {
      let next;
      do next = randomChain(2, 5);
      while (next.join() === chain.join());
      setChain(next);
      chainEl.querySelectorAll('.ly-link').forEach((li) => li.classList.add('ly-link-new'));
      burstAt(e.currentTarget, { count: 22, spread: 5 });
      scene.pulse(0.8);
    });
    $('.ly-empty-chain').addEventListener('click', () => {
      if (!chain.length) return;
      setChain([]);
      scene.pulse(0.4);
    });
    cleanups.push(fx.ripple($('.ly-shuffle')), fx.ripple($('.ly-empty-chain')));

    // --------------------------------------------------------------- cards
    function chainChips(layers, peel) {
      return layers
        .map((l, i) => `${i ? '<i class="ly-arrow">→</i>' : ''}<span class="ly-link-chip" style="--c:${l.color};--i:${i}"><b>${escapeHtml(l.glyph)}</b>${peel ? '−' : ''}${escapeHtml(l.name)}</span>`)
        .join('');
    }

    function stepsMarkup(steps, peel) {
      return steps
        .map((s) => {
          const out = s.out.length > 400 ? `${s.out.slice(0, 400)}…` : s.out;
          return `<li style="--c:${s.layer.color}"><b>${escapeHtml(s.layer.glyph)} ${peel ? 'peel ' : ''}${escapeHtml(s.layer.name)}</b><code>${escapeHtml(visible(out))}</code></li>`;
        })
        .join('');
    }

    function addCard(entry, { animate }) {
      const decode = entry.mode === 'decode';
      const res = decode ? decodeChain(entry.src, entry.chain) : encodeChain(entry.src, entry.chain);
      const card = document.createElement('article');
      card.className = `ly-card${decode ? ' ly-card-decode' : ''}`;
      card.dataset.id = entry.id;
      if (animate) card.classList.add('ly-card-new');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const depth = res.steps.length;
      const tags = decode
        ? [entry.method === 'auto' ? 'auto-peeled' : 'your chain', `${depth} layer${depth === 1 ? '' : 's'}`]
        : [`${depth} layer${depth === 1 ? '' : 's'}`, res.verified ? '✓ round-trip' : '✗ not reversible'];
      const shownLayers = res.steps.map((s) => s.layer);
      card.innerHTML = `
        <div class="ly-card-glare"></div>
        <header class="ly-card-head">
          <span class="ly-card-src${decode ? ' ly-card-src-code' : ''}"></span>
          <span class="ly-card-meta"></span>
        </header>
        <div class="ly-card-chain">${chainChips(shownLayers, decode)}</div>
        <div class="ly-out${decode ? ' ly-out-text' : ''}" title="${decode ? 'Peeled text' : 'Layered output'}: select or copy"></div>
        <ol class="ly-card-steps" hidden>${stepsMarkup(res.steps, decode)}</ol>
        <footer class="ly-card-actions">
          <span class="ly-tags">${tags.map((t) => `<i${t.startsWith('✗') ? ' class="bad"' : ''}>${t}</i>`).join('')}</span>
          <button data-act="copy" class="ly-chip ly-chip-primary">${decode ? 'Copy text' : 'Copy output'}</button>
          <button data-act="copy-alt" class="ly-chip">${decode ? 'Copy encoded' : 'Copy recipe'}</button>
          <button data-act="steps" class="ly-chip" aria-expanded="false">Show layers</button>
          <button data-act="edit" class="ly-chip">Edit</button>
          <button data-act="delete" class="ly-chip ly-chip-danger" aria-label="Remove">Remove</button>
        </footer>`;
      const src = entry.src.length > 240 ? `${entry.src.slice(0, 240)}…` : entry.src;
      card.querySelector('.ly-card-src').textContent = src;
      card.querySelector('.ly-card-meta').textContent = `${entry.src.length.toLocaleString()} → ${res.output.length.toLocaleString()} chars · ${time}`;
      Object.assign(card, { _entry: entry, _output: res.output });
      feed.appendChild(card);

      const out = card.querySelector('.ly-out');
      const text = res.output.length > 4000 ? `${res.output.slice(0, 4000)}…` : res.output;
      if (animate && text) {
        fx.scramble(out, text.slice(0, 600), { duration: Math.min(1400, 400 + text.length * 4), glyphs: GLYPHS }).then(() => {
          if (out.isConnected) out.textContent = text;
        });
      } else {
        out.textContent = text;
      }
      cleanups.push(fx.tilt(card, { max: 3, scale: 1.005, perspective: 1400 }));
      card.querySelectorAll('.ly-chip').forEach((b) => fx.ripple(b));
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
      const card = btn.closest('.ly-card');
      const entry = card._entry;
      const decode = entry.mode === 'decode';
      const act = btn.dataset.act;
      if (act === 'copy') copy(card._output, decode ? 'Text' : 'Layered output');
      else if (act === 'copy-alt') copy(decode ? entry.src : recipe(entry.chain), decode ? 'Encoded string' : 'Recipe');
      else if (act === 'steps') {
        const steps = card.querySelector('.ly-card-steps');
        steps.hidden = !steps.hidden;
        btn.textContent = steps.hidden ? 'Show layers' : 'Hide layers';
        btn.setAttribute('aria-expanded', String(!steps.hidden));
      } else if (act === 'edit') {
        setMode(entry.mode);
        if (decode) setMethod(entry.method);
        if (!decode || entry.method === 'chain') setChain(entry.chain);
        input.value = entry.src;
        autosize();
        updateLive();
        input.focus();
      } else if (act === 'delete') {
        history = history.filter((h) => String(h.id) !== card.dataset.id);
        storage.set(HISTORY_KEY, history);
        card.classList.add('ly-card-out');
        card.addEventListener('animationend', () => {
          card.remove();
          refreshMeta();
        }, { once: true });
        return;
      }
      if (act === 'copy' || act === 'copy-alt') burstAt(btn, { count: 18, spread: 4 });
    });

    $('.ly-clear').addEventListener('click', () => {
      if (!history.length) return;
      history = [];
      storage.remove(HISTORY_KEY);
      const cards = feed.querySelectorAll('.ly-card');
      cards.forEach((c, i) => {
        c.style.animationDelay = `${i * 30}ms`;
        c.classList.add('ly-card-out');
        c.addEventListener('animationend', () => c.remove(), { once: true });
      });
      setTimeout(refreshMeta, 450 + cards.length * 30);
      scene.pulse(0.6);
    });

    // --------------------------------------------------------------- input
    function autosize() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    }

    function send() {
      const value = mode === 'encode' ? input.value.replace(/\s+$/, '') : input.value.trim();
      if (!value) return void shake();
      let entryChain;
      if (mode === 'encode') {
        if (!chain.length) {
          shake();
          toast('Add at least one layer to the chain first', { type: 'error' });
          return;
        }
        const res = encodeChain(value, chain);
        if (!res.ok) {
          shake();
          toast(res.error, { type: 'error' });
          return;
        }
        entryChain = [...chain];
      } else if (method === 'chain') {
        if (!chain.length) {
          shake();
          toast('Your chain is empty: add the layers to undo, or use Auto-peel', { type: 'error' });
          return;
        }
        const res = decodeChain(value, chain);
        if (!res.ok) {
          shake();
          toast(res.error, { type: 'error' });
          return;
        }
        entryChain = [...chain];
      } else {
        const res = autoPeel(value);
        if (!res.steps.length) {
          shake();
          toast('No layers detected: this already reads like plain text', { type: 'error' });
          return;
        }
        // Peel order is the chain backwards.
        entryChain = res.steps.map((s) => s.layer.id).reverse();
      }
      const entry = { id: Date.now() + Math.floor(Math.random() * 1000), mode, src: value, chain: entryChain, at: Date.now() };
      if (mode === 'decode') entry.method = method;
      history.push(entry);
      if (history.length > MAX_HISTORY) {
        const dropped = history.splice(0, history.length - MAX_HISTORY);
        dropped.forEach((d) => feed.querySelector(`.ly-card[data-id="${d.id}"]`)?.remove());
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
        // One burst per layer, each in that layer's colour.
        entryChain.forEach((id, i) =>
          setTimeout(() => fx.burst(b.left + b.width / 2, b.top + b.height / 2, { count: 16, color: layerById(id).color, spread: 12, target: { x: c.left + c.width / 2, y: c.top + 60 } }), i * 70)
        );
      });
      consoleEl.animate(
        [
          { translate: '0', scale: '1', filter: 'brightness(1)' },
          { translate: '0 4px', scale: '0.985', filter: 'brightness(1.35)', offset: 0.25 },
          { translate: '0', scale: '1', filter: 'brightness(1)' },
        ],
        { duration: 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
      );
      tower.classList.remove('ly-tower-pop');
      void tower.offsetWidth;
      tower.classList.add('ly-tower-pop');
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

    // ---------------------------------------------------------------- modes
    function setMethod(next, { animate = false } = {}) {
      method = next;
      storage.set('method', method);
      root.classList.toggle('ly-auto', mode === 'decode' && method === 'auto');
      root.querySelectorAll('.ly-method').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.method === method)));
      if (animate) {
        burstAt(root.querySelector(`.ly-method[data-method="${method}"]`), { count: 14, spread: 3.5 });
        lastOuts = [];
      }
      buildSamples();
      updateLive();
    }
    root.querySelectorAll('.ly-method').forEach((b) => {
      b.addEventListener('click', () => b.dataset.method !== method && setMethod(b.dataset.method, { animate: true }));
      cleanups.push(fx.ripple(b));
    });

    function setMode(next, { animate = true } = {}) {
      const changed = next !== mode;
      mode = next;
      storage.set('mode', mode);
      root.classList.toggle('ly-decoding', mode === 'decode');
      root.classList.toggle('ly-auto', mode === 'decode' && method === 'auto');
      root.querySelectorAll('.ly-mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
      const title = mode === 'encode' ? 'Layered Encoding' : 'Peel the Layers';
      if (animate && changed) fx.scramble($('.ly-title'), title, { duration: 650, glyphs: GLYPHS });
      else $('.ly-title').textContent = title;
      $('.ly-sub').innerHTML = mode === 'encode'
        ? 'Stack encoders on the <b>same string</b>, one on top of the other. <b>Order</b> and <b>depth</b> change everything.'
        : 'Strip the layers back off, <b>last one first</b>, until the original text comes out.';
      input.placeholder = mode === 'encode' ? 'Type text to wrap in layers and press Enter…' : 'Paste a layered string and press Enter…';
      input.setAttribute('aria-label', mode === 'encode' ? 'Text to encode' : 'Layered string to decode');
      sendBtn.querySelector('span').textContent = mode === 'encode' ? 'Encode' : 'Peel';
      sendBtn.setAttribute('aria-label', mode === 'encode' ? 'Encode through the chain' : 'Peel the layers');
      $('.ly-verb').textContent = mode === 'encode' ? 'encode' : 'peel';
      $('.ly-empty p').textContent = mode === 'encode' ? 'Your layered strings will appear here.' : 'Peeled messages will appear here.';
      buildSamples();
      if (changed) {
        input.value = '';
        autosize();
        lastOuts = [];
        if (animate) {
          scene.pulse(0.8);
          burstAt(root.querySelector(`.ly-mode[data-mode="${mode}"]`), { count: 24, spread: 5 });
        }
      }
      updateLive();
    }
    root.querySelectorAll('.ly-mode').forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
      cleanups.push(fx.ripple(b));
    });

    // Encode samples are plain text; decode samples are each wrapped in a preset chain.
    const samples = $('.ly-samples');
    function buildSamples() {
      samples.innerHTML = '';
      SAMPLES.forEach((s, i) => {
        const value = mode === 'encode' ? s : encodeChain(s, method === 'chain' && chain.length ? chain : PRESETS[i % PRESETS.length].chain).output;
        const chip = document.createElement('button');
        chip.className = `ly-chip${mode === 'decode' ? ' ly-chip-code' : ''}`;
        chip.textContent = value.length > 30 ? `${value.slice(0, 29)}…` : value;
        chip.title = mode === 'decode' ? value : '';
        chip.addEventListener('click', () => {
          input.value = value;
          updateLive();
          send();
        });
        samples.appendChild(chip);
      });
    }

    // History from previous sessions (no entrance animation).
    renderChain();
    renderTower();
    setMethod(method);
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
    root.classList.add('ly-intro-on');
    const intro = playSlabs($('.ly-intro'), accent);
    cleanups.push(intro.cancel);
    intro.done.then(() => {
      if (!alive) return;
      root.classList.add('ly-ready');
      scene.pulse(1.2);
      fx.scramble($('.ly-title'), mode === 'encode' ? 'Layered Encoding' : 'Peel the Layers', { duration: 900, glyphs: GLYPHS });
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

/** Make line breaks and tabs visible on one-line displays. */
const visible = (s) => s.replace(/\n/g, '↵').replace(/\t/g, '⇥');

// ---------------------------------------------------------------------------
// Intro: glowing isometric slabs, each one an encoder, drop out of the dark and
// slam onto a stack. The stack then splits apart and fades to reveal the page.
// Click or any key skips it.
// ---------------------------------------------------------------------------
function playSlabs(canvas, accent) {
  const host = canvas.parentElement;
  const g = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const picks = ['base64', 'rot13', 'reverse', 'hex', 'ascii85', 'atbash'].map((id) => layerById(id));
  const hw = Math.min(170, W * 0.16); // half width of a slab's top face
  const hh = hw / 2;
  const thick = 16;
  const gap = 30;
  const cx = W / 2;
  const baseY = H / 2 + (picks.length * gap) / 2;
  const DROP = 420;
  const STAGGER = 150;
  const HOLD = DROP + STAGGER * (picks.length - 1) + 300;
  const T_END = HOLD + 650;
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
  const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.round(Math.min(255, v * k));
    return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  };

  function slab(y, color, label, alpha) {
    g.globalAlpha = alpha;
    // left and right faces give the slab its thickness
    g.fillStyle = shade(color, 0.45);
    g.beginPath();
    g.moveTo(cx - hw, y);
    g.lineTo(cx, y + hh);
    g.lineTo(cx, y + hh + thick);
    g.lineTo(cx - hw, y + thick);
    g.fill();
    g.fillStyle = shade(color, 0.3);
    g.beginPath();
    g.moveTo(cx + hw, y);
    g.lineTo(cx, y + hh);
    g.lineTo(cx, y + hh + thick);
    g.lineTo(cx + hw, y + thick);
    g.fill();
    // top face
    g.shadowColor = color;
    g.shadowBlur = 28;
    g.fillStyle = shade(color, 0.85);
    g.beginPath();
    g.moveTo(cx, y - hh);
    g.lineTo(cx + hw, y);
    g.lineTo(cx, y + hh);
    g.lineTo(cx - hw, y);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1.2;
    g.stroke();
    // the label lies flat on the top face
    g.save();
    g.transform(1, 0.5, -1, 0.5, cx, y);
    g.fillStyle = 'rgba(10,6,20,0.8)';
    g.font = `800 ${Math.round(hw * 0.2)}px 'JetBrains Mono', 'DejaVu Sans Mono', monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 0, 0);
    g.restore();
    g.globalAlpha = 1;
  }

  function frame(now) {
    const t = now - start;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // dark backdrop that thins out at the end
    const fade = t > HOLD ? Math.min(1, (t - HOLD) / (T_END - HOLD)) : 0;
    g.fillStyle = `rgba(4,3,10,${0.9 * (1 - fade)})`;
    g.fillRect(0, 0, W, H);
    picks.forEach((l, i) => {
      const k = Math.min(1, Math.max(0, (t - i * STAGGER) / DROP));
      if (k <= 0) return;
      const rest = baseY - i * gap;
      let y = rest - (1 - easeOutBack(k)) * (H * 0.7);
      // when the stack splits, slabs fly apart from the middle
      if (fade) y += (i - (picks.length - 1) / 2) * gap * 4 * fade * fade;
      slab(y, l.color, l.glyph, Math.min(1, k * 2) * (1 - fade));
      if (k >= 1 && t - i * STAGGER - DROP < 90) {
        // impact flash
        g.globalAlpha = 1 - (t - i * STAGGER - DROP) / 90;
        g.fillStyle = accent;
        g.fillRect(cx - hw * 1.3, rest + hh + thick, hw * 2.6, 2);
        g.globalAlpha = 1;
      }
    });
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
