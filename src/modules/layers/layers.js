// Layered encoding: invertible string transforms that can be stacked in any
// order and to any depth. Pure functions only (no DOM), so Node can test them.

const utf8 = new TextEncoder();
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

import { withHidden, reveal, stripHidden } from '../../core/hidden.js';

/** Intermediate strings above this length stop the chain (binary is 9x per layer). */
export const MAX_LENGTH = 400_000;
export const MAX_DEPTH = 8;

const bytesOf = (s) => utf8.encode(s);
function textOf(bytes) {
  try {
    return strictUtf8.decode(bytes);
  } catch {
    throw new Error('the bytes are not valid UTF-8 text');
  }
}

// ------------------------------------------------------------------ Base64
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64Encode(s) {
  const b = bytesOf(s);
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < b.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < b.length ? B64[n & 63] : '=';
  }
  return out;
}
function b64Decode(s) {
  let t = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(t)) throw new Error('not Base64 (unexpected characters)');
  t = t.replace(/=+$/, '');
  if (t.length % 4 === 1) throw new Error('not Base64 (wrong length)');
  const out = [];
  let acc = 0;
  let bits = 0;
  for (const c of t) {
    acc = (acc << 6) | B64.indexOf(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return textOf(Uint8Array.from(out));
}

// ------------------------------------------------------------------ Base32
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32Encode(s) {
  const b = bytesOf(s);
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const byte of b) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(acc >> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  if (bits) out += B32[(acc << (5 - bits)) & 31];
  while (out.length % 8) out += '=';
  return out;
}
function b32Decode(s) {
  const t = s.replace(/\s+/g, '').toUpperCase().replace(/=+$/, '');
  if (!/^[A-Z2-7]*$/.test(t)) throw new Error('not Base32 (unexpected characters)');
  if ([1, 3, 6].includes(t.length % 8)) throw new Error('not Base32 (wrong length)');
  const out = [];
  let acc = 0;
  let bits = 0;
  for (const c of t) {
    acc = (acc << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
    acc &= (1 << bits) - 1;
  }
  return textOf(Uint8Array.from(out));
}

// ----------------------------------------------------------------- Ascii85
function a85Encode(s) {
  const b = bytesOf(s);
  let out = '<~';
  for (let i = 0; i < b.length; i += 4) {
    const chunk = b.length - i >= 4 ? 4 : b.length - i;
    let n = 0;
    for (let k = 0; k < 4; k++) n = n * 256 + (b[i + k] ?? 0);
    if (n === 0 && chunk === 4) {
      out += 'z';
      continue;
    }
    const digits = [];
    for (let k = 0; k < 5; k++) {
      digits.unshift(String.fromCharCode(33 + (n % 85)));
      n = Math.floor(n / 85);
    }
    out += digits.slice(0, chunk + 1).join('');
  }
  return `${out}~>`;
}
function a85Decode(s) {
  const t = s.trim();
  if (!t.startsWith('<~') || !t.endsWith('~>')) throw new Error('not Ascii85 (missing <~ ~>)');
  const body = t.slice(2, -2).replace(/\s+/g, '').replace(/z/g, '!!!!!');
  if (!/^[!-u]*$/.test(body)) throw new Error('not Ascii85 (unexpected characters)');
  if (body.length % 5 === 1) throw new Error('not Ascii85 (wrong length)');
  const out = [];
  for (let i = 0; i < body.length; i += 5) {
    const group = body.slice(i, i + 5);
    const padded = group.padEnd(5, 'u');
    let n = 0;
    for (const c of padded) n = n * 85 + (c.charCodeAt(0) - 33);
    if (n > 0xffffffff) throw new Error('not Ascii85 (group out of range)');
    const bytes = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    out.push(...bytes.slice(0, group.length - 1));
  }
  return textOf(Uint8Array.from(out));
}

// -------------------------------------------------------- hex, binary, %XX
const hex2 = (b) => b.toString(16).padStart(2, '0');
function hexDecode(s) {
  const t = s.replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]*$/.test(t)) throw new Error('not hex (unexpected characters)');
  if (t.length % 2) throw new Error('not hex (odd number of digits)');
  return textOf(Uint8Array.from(t.match(/../g) || [], (h) => parseInt(h, 16)));
}
function binDecode(s) {
  const t = s.replace(/\s+/g, '');
  if (!/^[01]*$/.test(t)) throw new Error('not binary (only 0 and 1 allowed)');
  if (t.length % 8) throw new Error('not binary (bits are not a multiple of 8)');
  return textOf(Uint8Array.from(t.match(/.{8}/g) || [], (g) => parseInt(g, 2)));
}
function pctDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    throw new Error('not percent-encoded (broken %XX sequence)');
  }
}

// ------------------------------------------------------- escape notations
function htmlDecode(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (m, h, d, name) => {
    if (name) return named[name.toLowerCase()] ?? m;
    const cp = h ? parseInt(h, 16) : parseInt(d, 10);
    if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) throw new Error('not HTML entities (invalid code point)');
    return String.fromCodePoint(cp);
  });
}
function uniEncode(s) {
  return Array.from(s, (c) => {
    const cp = c.codePointAt(0);
    return cp > 0xffff ? `\\u{${cp.toString(16)}}` : `\\u${cp.toString(16).padStart(4, '0')}`;
  }).join('');
}
function uniDecode(s) {
  return s.replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})/gi, (m, big, small) => {
    const cp = parseInt(big || small, 16);
    if (cp > 0x10ffff || (big && cp >= 0xd800 && cp <= 0xdfff)) throw new Error('not Unicode escapes (invalid code point)');
    return String.fromCodePoint(cp);
  });
}

// ------------------------------------------------------ character ciphers
function rot13(s) {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26));
  });
}
function rot47(s) {
  return s.replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)));
}
function atbash(s) {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
  });
}
const reverse = (s) => Array.from(s).reverse().join('');
// ASCII and its fullwidth twins swap places in both directions, so the layer
// is its own inverse even when the text already contains wide characters.
function fullwidth(s) {
  return s.replace(/[!-~ \uff01-\uff5e\u3000]/g, (c) => {
    if (c === ' ') return '\u3000';
    if (c === '\u3000') return ' ';
    const code = c.charCodeAt(0);
    return String.fromCharCode(code < 0x80 ? code + 0xfee0 : code - 0xfee0);
  });
}

// ----------------------------------------------------------------- layers
// `kind: 'format'` layers have a recognisable output alphabet; `kind: 'cipher'`
// layers keep the alphabet and only move characters around, so the auto-peeler
// has to try them blindly. `detect` is a cheap test used only by autoPeel.
export const LAYERS = [
  {
    id: 'base64', name: 'Base64', glyph: '64', color: '#22d3ee', kind: 'format',
    blurb: '3 bytes become 4 characters',
    encode: b64Encode, decode: b64Decode,
    detect: (s) => /^[A-Za-z0-9+/\-_]+={0,2}$/.test(s) && s.length >= 4,
  },
  {
    id: 'base32', name: 'Base32', glyph: '32', color: '#60a5fa', kind: 'format',
    blurb: '5 bytes become 8 capital letters and digits',
    encode: b32Encode, decode: b32Decode,
    detect: (s) => /^[A-Z2-7]+=*$/i.test(s) && s.length >= 8,
  },
  {
    id: 'ascii85', name: 'Ascii85', glyph: '85', color: '#a78bfa', kind: 'format',
    blurb: '4 bytes become 5 characters, wrapped in <~ ~>',
    encode: a85Encode, decode: a85Decode,
    detect: (s) => s.startsWith('<~') && s.endsWith('~>'),
  },
  {
    id: 'hex', name: 'Hex', glyph: '0x', color: '#34d399', kind: 'format',
    blurb: 'every byte becomes two hex digits',
    encode: (s) => Array.from(bytesOf(s), hex2).join(''), decode: hexDecode,
    detect: (s) => /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0,
  },
  {
    id: 'binary', name: 'Binary', glyph: '01', color: '#4ade80', kind: 'format',
    blurb: 'every byte becomes 8 bits',
    encode: (s) => Array.from(bytesOf(s), (b) => b.toString(2).padStart(8, '0')).join(' '), decode: binDecode,
    detect: (s) => /^[01\s]+$/.test(s) && s.replace(/\s/g, '').length % 8 === 0,
  },
  {
    id: 'percent', name: 'Percent', glyph: '%', color: '#facc15', kind: 'format',
    blurb: 'every byte becomes %XX, like a URL',
    encode: (s) => Array.from(bytesOf(s), (b) => `%${hex2(b).toUpperCase()}`).join(''), decode: pctDecode,
    detect: (s) => /%[0-9a-fA-F]{2}/.test(s),
  },
  {
    id: 'html', name: 'HTML entities', short: 'HTML', glyph: '&#', color: '#fb923c', kind: 'format',
    blurb: 'every character becomes &#x…;',
    encode: (s) => Array.from(s, (c) => `&#x${c.codePointAt(0).toString(16)};`).join(''), decode: htmlDecode,
    detect: (s) => /&#x?[0-9a-f]+;/i.test(s),
  },
  {
    id: 'unicode', name: 'Unicode escapes', short: 'Unicode', glyph: '\\u', color: '#f472b6', kind: 'format',
    blurb: 'every character becomes \\uXXXX',
    encode: uniEncode, decode: uniDecode,
    detect: (s) => /\\u(\{[0-9a-f]+\}|[0-9a-f]{4})/i.test(s),
  },
  {
    id: 'rot13', name: 'ROT13', glyph: '13', color: '#f87171', kind: 'cipher', selfInverse: true,
    blurb: 'letters move 13 places along the alphabet',
    encode: rot13, decode: rot13,
    detect: (s) => /[a-z]/i.test(s),
  },
  {
    id: 'rot47', name: 'ROT47', glyph: '47', color: '#fb7185', kind: 'cipher', selfInverse: true,
    blurb: 'every visible ASCII character moves 47 places',
    encode: rot47, decode: rot47,
    detect: (s) => /[!-~]/.test(s),
  },
  {
    id: 'atbash', name: 'Atbash', glyph: 'Z↔A', color: '#e879f9', kind: 'cipher', selfInverse: true,
    blurb: 'the alphabet is mirrored: A↔Z, B↔Y',
    encode: atbash, decode: atbash,
    detect: (s) => /[a-z]/i.test(s),
  },
  {
    id: 'reverse', name: 'Reverse', glyph: '⇄', color: '#c084fc', kind: 'cipher', selfInverse: true,
    blurb: 'the whole string is read backwards',
    encode: reverse, decode: reverse,
    detect: (s) => s.length > 1,
  },
  {
    id: 'fullwidth', name: 'Fullwidth', glyph: 'Ａ', color: '#94a3b8', kind: 'cipher', selfInverse: true,
    blurb: 'ASCII swaps with wide Ｕｎｉｃｏｄｅ look-alikes',
    encode: fullwidth, decode: fullwidth,
    detect: (s) => /[！-～　]/.test(s),
  },
];

const BY_ID = new Map(LAYERS.map((l) => [l.id, l]));
export const layerById = (id) => BY_ID.get(id);

export const PRESETS = [
  { id: 'classic', name: 'Classic', chain: ['base64', 'rot13', 'reverse'] },
  { id: 'cipher-soup', name: 'Cipher soup', chain: ['atbash', 'rot47', 'reverse', 'base32'] },
  { id: 'hex-sandwich', name: 'Hex sandwich', chain: ['hex', 'base64', 'hex'] },
  { id: 'deep', name: 'Deep dive', chain: ['percent', 'base64', 'rot13', 'ascii85', 'reverse'] },
];

/** A random chain: varied depth and order, never the same self-inverse layer twice in a row. */
export function randomChain(min = 2, max = 5, rand = Math.random) {
  const depth = min + Math.floor(rand() * (max - min + 1));
  const chain = [];
  while (chain.length < depth) {
    const l = LAYERS[Math.floor(rand() * LAYERS.length)];
    const prev = chain.at(-1);
    if (prev === l.id && l.selfInverse) continue;
    // Byte-expanding layers grow fast; keep at most two of the big ones.
    if ((l.id === 'binary' || l.id === 'unicode' || l.id === 'html') && chain.filter((id) => ['binary', 'unicode', 'html'].includes(id)).length >= 1) continue;
    chain.push(l.id);
  }
  return chain;
}

function guard(s) {
  if (s.length > MAX_LENGTH) throw new Error(`too big (over ${MAX_LENGTH.toLocaleString()} characters)`);
  return s;
}

/**
 * Run `text` through every layer in `chain` (ids), in order.
 * Returns each intermediate step, the output, and whether decoding the output
 * with the same chain gives the exact input back.
 */
export function encodeChain(text, chain) {
  const steps = [];
  let cur = text;
  for (let i = 0; i < chain.length; i++) {
    const layer = layerById(chain[i]);
    try {
      cur = guard(layer.encode(cur));
    } catch (err) {
      return { ok: false, steps, output: cur, error: `${layer.name}: ${err.message}`, failedAt: i };
    }
    steps.push({ layer, out: cur });
  }
  const back = decodeChain(cur, chain);
  // The result carries the chain invisibly (core/hidden.js), so Auto-peel can undo
  // it exactly instead of guessing.
  const output = chain.length ? withHidden(cur, `layers:${chain.join(',')}`) : cur;
  return { ok: true, steps, output, verified: back.ok && back.output === text };
}

/** Undo `chain` (ids, in encoding order): its layers are peeled last to first. */
export function decodeChain(text, chain) {
  const steps = [];
  let cur = stripHidden(text);
  for (let i = chain.length - 1; i >= 0; i--) {
    const layer = layerById(chain[i]);
    try {
      cur = guard(layer.decode(cur));
    } catch (err) {
      return { ok: false, steps, output: cur, error: `${layer.name} layer: ${err.message}`, failedAt: chain.length - 1 - i };
    }
    steps.push({ layer, out: cur });
  }
  return { ok: true, steps, output: cur };
}

// ------------------------------------------------------------ auto-peel
// A beam search over decodings. Every state is scored for how much it reads
// like natural text; states that still look like an encoding format are kept
// in the beam so the search can go deeper through them.

const COMMON = new Set(
  ('the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one ' +
    'all would there their what so up out if about who get which go me when make can like time no just him know take people into year ' +
    'your good some could them see other than then now look only come its over think also back after use two how our work first well way ' +
    'even new want because any these give day most us is are was were has had been hello world hi hey yes ok okay thanks thank please ' +
    'secret message text test this here where why love friend meet tonight tomorrow today code key password order matters peel me layer ' +
    'layers encoding encoded string hidden behind am let lets dont im').split(' ')
);
const BIGRAMS = new Set(
  'th he in er an re on at en nd ti es or te of ed is it al ar st to nt ng se ha as ou io le ve co me de hi ri ro ic ne ea ra ce li ch ll be ma si om ur'.split(' ')
);
// English letter frequencies (%), for a quick "does this look like English" check.
const FREQ = { e: 12.7, t: 9.1, a: 8.2, o: 7.5, i: 7, n: 6.7, s: 6.3, h: 6.1, r: 6, d: 4.3, l: 4, c: 2.8, u: 2.8, m: 2.4, w: 2.4, f: 2.2, g: 2, y: 2, p: 1.9, b: 1.5, v: 1, k: 0.8, j: 0.15, x: 0.15, q: 0.1, z: 0.07 };
// Symbols people rarely type in prose, but ROT47 and friends produce constantly.
const ODD = /[\[\]{}|\\^~`<>_]/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f�]/;

/** True when every character is printable (tabs and new lines allowed). */
export const isClean = (s) => !CONTROL.test(s);

/** 0..1: how much `s` reads like something a person wrote. */
export function readability(s) {
  if (!s || !isClean(s)) return 0;
  const chars = Array.from(s);
  const n = chars.length;
  let wordy = 0;
  let spaces = 0;
  for (const c of chars) {
    if (c === ' ' || c === '\n') spaces++;
    // Non-ASCII letters, emoji and symbols count as content: none of the
    // format layers produce them.
    if (/[a-z\s]/i.test(c) || c.charCodeAt(0) > 127) wordy++;
  }
  const words = s.match(/\p{L}+/gu) || [];
  const latin = words.filter((w) => /^[a-z]+$/i.test(w));
  const caseOk = words.length
    ? words.filter((w) => w === w.toLowerCase() || w === w.toUpperCase() || (w[0] === w[0].toUpperCase() && w.slice(1) === w.slice(1).toLowerCase())).length / words.length
    : 1;
  const common = latin.length ? latin.filter((w) => COMMON.has(w.toLowerCase())).length / latin.length : 0;
  let pairs = 0;
  let hits = 0;
  for (const w of latin) {
    const lw = w.toLowerCase();
    for (let i = 0; i + 1 < lw.length; i++) {
      pairs++;
      if (BIGRAMS.has(lw.slice(i, i + 2))) hits++;
    }
  }
  const bigram = pairs ? Math.min(1, hits / pairs / 0.45) : 0;
  const letters = latin.join('').toLowerCase();
  const unigram = letters.length ? Math.max(0, Math.min(1, (Array.from(letters, (c) => Math.log10(FREQ[c])).reduce((a, b) => a + b, 0) / letters.length - 0.3) / 0.5)) : 0;
  const odd = Math.max(0, 1 - ((s.match(ODD) || []).length / n) * 6);
  const vowels = latin.length ? (latin.join('').match(/[aeiouy]/gi) || []).length / latin.join('').length : 0;
  const vowelOk = latin.length ? Math.max(0, 1 - Math.abs(vowels - 0.4) * 3) : 0.5;
  const avgLen = words.length ? words.reduce((a, w) => a + w.length, 0) / words.length : 0;
  const lenOk = !words.length ? 0.5 : avgLen <= 9 ? 1 : Math.max(0, 1 - (avgLen - 9) / 10);
  const spacing = n > 14 && spaces === 0 ? 0.4 : 1;
  // People rarely type fullwidth letters; text full of them is still wrapped.
  const wide = /[\uff01-\uff5e\u3000]/.test(s) ? 0.6 : 1;
  const latinShare = words.length ? latin.length / words.length : 0;
  // Scripts without Latin words can't be checked against English, so they lean
  // on the structural signals alone.
  // Bit strings and long digit runs are what Binary and Hex produce, not numbers people write.
  const numeric = /^[01\s]+$/.test(s) || /\d{9}/.test(s) ? 0 : (s.match(/[\d\s.,:;+\-()/]/g) || []).length / n;
  const nonAscii = chars.filter((c) => c.charCodeAt(0) > 127).length / n;
  // A handful of letters is weak evidence either way.
  const sure = Math.min(1, letters.length / 10);
  const language = latinShare > 0.5
    ? sure * (0.22 * bigram + 0.28 * common + 0.06 * unigram + 0.04 * vowelOk)
    : words.length
      ? 0.42 * (1 - latinShare) + 0.18 * latinShare * bigram
      : 0.42 * nonAscii + 0.15 * numeric; // no words: emoji, symbols, numbers like 555-0199
  const content = words.length ? wordy / n : Math.max(wordy / n, 0.6 * numeric);
  return Math.min(1, odd * wide * spacing * (0.22 * content + 0.18 * caseOk + 0.1 * lenOk + 0.1 + language) - 0.1);
}

/** Bonus for strings that look like a format layer's output (worth peeling further). */
function looksEncoded(s) {
  for (const l of LAYERS) if (l.kind === 'format' && l.detect(s)) return 0.6;
  return 0;
}

/**
 * Peel layers off `text` without knowing the chain.
 * Returns the best reading found and the layers peeled, in peel order.
 */
// Final pick: a clean decode through a format layer is evidence (random text
// almost never decodes to clean text), while every blind cipher step costs a
// little, so a run of letter ciphers can't win by stumbling onto a slightly
// more word-like scramble.
const FORMAT_BONUS = 0.08;
const CIPHER_COST = 0.05;
/** Longest run of blind cipher layers the search tries in a row. */
const MAX_CIPHER_RUN = 4;

export function autoPeel(raw, { maxDepth = 10, beam } = {}) {
  const { visible: text, original } = reveal(raw);
  // A chain carried invisibly by encodeChain(): use it when it really made this text.
  const chain = /^layers:([\w,]+)$/.exec(original ?? '')?.[1].split(',').filter((id) => layerById(id));
  if (chain?.length) {
    const back = decodeChain(text, chain);
    if (back.ok && encodeChain(back.output, chain).steps.at(-1)?.out === text) {
      return { steps: back.steps, output: back.output, score: readability(back.output), chain };
    }
  }
  const width = beam ?? (text.length > 20_000 ? 6 : text.length > 4_000 ? 12 : 28);
  const start = { text, path: [], score: readability(text) };
  start.readable = start.score;
  start.cipherRun = 0;
  let best = start;
  let frontier = [start];
  const seen = new Set([text]);
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next = [];
    for (const st of frontier) {
      const last = st.path.at(-1)?.layer;
      for (const layer of LAYERS) {
        if (last === layer && layer.selfInverse) continue;
        if (layer.kind === 'cipher' && st.cipherRun >= MAX_CIPHER_RUN) continue;
        if (!layer.detect(st.text)) continue;
        let out;
        try {
          out = layer.decode(st.text);
        } catch {
          continue;
        }
        if (out === st.text || out.length > MAX_LENGTH || seen.has(out) || !isClean(out)) continue;
        seen.add(out);
        const path = [...st.path, { layer, out }];
        const readable = readability(out);
        const score = readable + path.reduce((a, p) => a + (p.layer.kind === 'format' ? FORMAT_BONUS : -CIPHER_COST), 0);
        const cipherRun = layer.kind === 'cipher' ? st.cipherRun + 1 : 0;
        const node = { text: out, path, score, readable, cipherRun, rank: score + looksEncoded(out) };
        next.push(node);
        if (score > best.score) best = node;
      }
    }
    next.sort((a, b) => b.rank - a.rank);
    frontier = next.slice(0, width);
  }
  return { steps: best.path, output: best.text, score: best.readable };
}

/** Human-readable recipe, e.g. "Base64 → ROT13 → Reverse". */
export const recipe = (chain) => chain.map((id) => layerById(id).name).join(' → ');
