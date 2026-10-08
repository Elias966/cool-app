// Reusable interaction effects, handed to every module as `ctx.fx`.
// Each binder returns a cleanup function.

const BRAILLE_GLYPHS = '⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵⠿⠷⠾⠮';
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=<>/\\' + BRAILLE_GLYPHS;

/** 3D tilt that follows the pointer. Sets --rx, --ry, --mx, --my on the element. */
export function tilt(el, { max = 10, scale = 1.02, perspective = 900 } = {}) {
  let raf = 0;
  const move = (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${px * 100}%`);
      el.style.setProperty('--my', `${py * 100}%`);
      el.style.transform =
        `perspective(${perspective}px) rotateX(${(0.5 - py) * max * 2}deg) rotateY(${(px - 0.5) * max * 2}deg) scale(${scale})`;
    });
  };
  const leave = () => {
    cancelAnimationFrame(raf);
    el.style.transform = '';
  };
  el.classList.add('fx-tilt');
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  return () => {
    cancelAnimationFrame(raf);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
    el.classList.remove('fx-tilt');
    el.style.transform = '';
  };
}

/** Elements that drift toward the pointer when it is near. */
export function magnetic(el, { strength = 0.3 } = {}) {
  const move = (e) => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.translate = `${dx * strength}px ${dy * strength}px`;
  };
  const leave = () => (el.style.translate = '');
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  return () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
    el.style.translate = '';
  };
}

/** Material-style ripple on press. */
export function ripple(el) {
  const down = (e) => {
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'fx-ripple';
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    el.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove());
  };
  el.classList.add('fx-ripple-host');
  el.addEventListener('pointerdown', down);
  return () => el.removeEventListener('pointerdown', down);
}

/** Decode-style text reveal. Resolves when finished. */
export function scramble(el, text, { duration = 900, glyphs = GLYPHS } = {}) {
  return new Promise((resolve) => {
    const chars = Array.from(text);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const settled = Math.floor(t * chars.length);
      let out = '';
      for (let i = 0; i < chars.length; i++) {
        if (i < settled || chars[i] === ' ') out += chars[i];
        else out += glyphs[(Math.random() * glyphs.length) | 0];
      }
      el.textContent = out;
      if (t < 1) requestAnimationFrame(step);
      else {
        el.textContent = text;
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

// --- Particle bursts on the global overlay canvas ---------------------------
const particles = [];
let fxCanvas;
let fxCtx;
let fxRaf = 0;

function ensureCanvas() {
  if (fxCanvas) return;
  fxCanvas = document.getElementById('fx');
  fxCtx = fxCanvas.getContext('2d');
  const size = () => {
    fxCanvas.width = innerWidth * devicePixelRatio;
    fxCanvas.height = innerHeight * devicePixelRatio;
    fxCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  };
  size();
  addEventListener('resize', size);
}

function tick() {
  fxCtx.clearRect(0, 0, innerWidth, innerHeight);
  fxCtx.globalCompositeOperation = 'lighter';
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= p.decay;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    if (p.target) {
      p.x += (p.target.x - p.x) * 0.08 + p.vx;
      p.y += (p.target.y - p.y) * 0.08 + p.vy;
      p.vx *= 0.9;
      p.vy *= 0.9;
    } else {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 + 0.04;
    }
    fxCtx.globalAlpha = Math.min(p.life, 1);
    fxCtx.fillStyle = p.color;
    fxCtx.beginPath();
    fxCtx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2);
    fxCtx.fill();
  }
  fxCtx.globalAlpha = 1;
  fxRaf = particles.length ? requestAnimationFrame(tick) : 0;
}

/**
 * Throw sparks from (x, y). Pass `target: {x, y}` to make them stream there.
 */
export function burst(x, y, { count = 28, color = getAccent(), spread = 7, target = null } = {}) {
  ensureCanvas();
  const colors = [color, '#ffffff', color];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = Math.random() * spread;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      size: 1 + Math.random() * 2.5,
      life: 1 + Math.random() * 0.6,
      decay: 0.012 + Math.random() * 0.02,
      color: colors[i % colors.length],
      target,
    });
  }
  if (!fxRaf) fxRaf = requestAnimationFrame(tick);
}

function getAccent() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cff';
}

export const fx = { tilt, magnetic, ripple, scramble, burst };
