// Cipher Pact: a fresh substitution alphabet for every message.
//
// A key code such as "EMBER-OWL-735" is the whole key: it seeds a random
// generator that picks a symbol theme and shuffles it onto a–z and 0–9. The
// same code always rebuilds the same alphabet, so a friend only needs the code
// (or the key card) to read a message. Any text works as a code, so two people
// can also agree on their own passphrase.
//
// Pure functions only (no DOM), so Node can test them.

import { withHidden, reveal } from '../../core/hidden.js';

export const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Every theme has at least 36 symbols that look clearly different from each
// other, and its own colour (the whole app takes it on while the cipher is active). All are plain text characters, so they paste into any chat app.
export const THEMES = [
  { id: 'runes', color: '#6ee7ff', name: 'Runes', icon: 'ᛟ', font: 'runic', symbols: 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᚩᚪᚫᚣᛡᛠᚸᛣᛥᛦᛨᛩᛪᚬᚭᚯᛆᛔᛘᛙ' },
  { id: 'alchemy', color: '#ffb347', name: 'Alchemy', icon: '🜁', font: 'sym', symbols: alchemy() },
  { id: 'geometry', color: '#5eead4', name: 'Geometry', icon: '◈', font: 'sym2', symbols: '◆◇○●□■△▲▽▼◁▷◀▶◐◑◒◓◧◨◩◪◫◬◭◮⬟⬠⬡⬢⬣⬤⬥⬦⬧⬨⬩⬪⬫⬬⬭⬮⬯⊕⊗⊘⊙⊚⊛' },
  { id: 'stars', color: '#c4b5fd', name: 'Starlight', icon: '✦', font: 'sym2', symbols: '✦✧★☆✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋' },
  { id: 'arrows', color: '#4ade80', name: 'Vectors', icon: '➤', font: 'sym', symbols: '←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓⇔⇕⇖⇗⇘⇙⇚⇛⇜⇝⇞⇟⇠⇡⇢⇣⇤⇥⇦⇧⇨⇩⇪➔➘➙➚➛➜➝➞➟➠➡➢➣➤' },
  { id: 'arcane', color: '#f472b6', name: 'Arcane Math', icon: '∮', font: 'math', symbols: '∀∂∃∅∇∈∉∋∏∑∓∗∘√∝∞∠∡∢∧∨∩∪∫∬∮∴∵∶∷∼≀≃≈≋≡≢≣⊂⊃⊄⊅⊆⊇' },
  { id: 'tabletop', color: '#facc15', name: 'Tabletop', icon: '♞', font: 'sym2', symbols: '♔♕♖♗♘♙♚♛♜♝♞♟♠♡♢♣♤♥♦♧⚀⚁⚂⚃⚄⚅♩♪♫♬♭♮♯⚐⚑⚒⚔⚖⚗⚙⚛⚜' },
  { id: 'dots', color: '#38bdf8', name: 'Dot Matrix', icon: '⣿', font: 'sym2', symbols: Array.from({ length: 255 }, (_, i) => String.fromCharCode(0x2801 + i)).join('') },
  { id: 'emoji', color: '#fb7185', name: 'Emoji', icon: '🔮', font: 'emoji', colorful: true, symbols: '🌙🔥⚡🍀🌊🍄🐍🦊🐙🦉🌵🍒🎲🔮🌸🍉🐝🦋🐢🌈🍕🎈💎👻🌻🐳🦄🍩🚀🪐🌋🍋🐸🦀🌽🎃🐧🍓🌶🧊' },
];
// The Color boxes alphabet: coloured squares, circles, hearts, books and gems, one
// per letter or digit. It belongs to keys whose code starts with BOX- (made by
// the 🟥 Color boxes style), so the key card, the wheel and Read all use it.
// Kept out of THEMES: adding a theme there would change every existing code.
export const BOXES = {
  id: 'boxes', color: '#f43f5e', name: 'Color boxes', icon: '🟥', font: 'emoji', colorful: true,
  symbols: '🟥🟧🟨🟩🟦🟪🟫⬛⬜🔴🟠🟡🟢🔵🟣🟤⚫⚪💗🧡💛💚💙💜🤎🖤🤍📕📗📘📙🔶🔷💠⭐🔘',
};
// The Emoji letters alphabet: everyday emoji (all shown in colour without an
// extra selector), for keys whose code starts with EMO- (the 😀 Emoji letters style).
export const EMOJIS = {
  id: 'emojis', color: '#fbbf24', name: 'Emoji letters', icon: '😀', font: 'emoji', colorful: true,
  symbols: '😀😂😍😎🤔😴🤖👻👽🎃🐶🐱🦊🐸🐵🐼🐧🦄🐝🐙🍕🍔🍩🍉🍓🍒🌮🍦⚽🎸🚀🌈🔥🌙💎🎁🎈',
};
// Code prefix → alphabet. Other codes pick one of THEMES from their hash.
const ALPHABETS = { 'BOX-': BOXES, 'EMO-': EMOJIS };
const PREFIX = { boxes: 'BOX-', emojis: 'EMO-' };

// Alchemical symbols, minus the ones Noto draws with Latin letters or digits
// (QE, AR, SSS, MB…), which would look like readable plaintext.
function alchemy() {
  const skip = new Set([0x00, 0x05, 0x06, 0x07, 0x08, 0x13, 0x29, 0x2a, 0x43, 0x47, 0x48, 0x49, 0x4c, 0x57, 0x58, 0x5b, 0x5c, 0x5d, 0x61, 0x63, 0x65, 0x67, 0x68, 0x6a, 0x6b, 0x6c, 0x6d, 0x72, 0x73]);
  let out = '';
  for (let i = 0; i <= 0x73; i++) if (!skip.has(i)) out += String.fromCodePoint(0x1f700 + i);
  return out;
}

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// ------------------------------------------------------------- key codes
const ADJ = (
  'AMBER ASH BRAVE BRIGHT CALM COPPER CRIMSON CRYSTAL DAWN DUSK EMBER FROST GHOST GOLDEN HOLLOW IRON ' +
  'IVORY JADE LUCKY LUNAR MAGIC MISTY NEON NOBLE OCEAN ONYX PALE PRISM QUIET RAPID ROYAL RUBY ' +
  'RUSTY SILENT SILVER SOLAR STORM SWIFT THUNDER TINY VELVET VIOLET WILD WINTER WISE ZEN COSMIC SHADOW'
).split(' ');
const NOUN = (
  'OWL FOX WOLF RAVEN TIGER LYNX HAWK BEAR OTTER COBRA DRAGON PHOENIX KOI CRANE PANDA SHARK ' +
  'FALCON MOTH VIPER BADGER BISON HERON STAG HARE ORCA GECKO LOTUS COMET NOVA ORBIT RIVER CANYON ' +
  'GLACIER ISLAND LANTERN ANCHOR COMPASS CASTLE TEMPLE HARBOR MEADOW FORGE CROWN SPHINX GRIFFIN KRAKEN YETI MAMMOTH'
).split(' ');

/** Codes are compared without case, spaces or dashes: "ember owl 735" = "EMBER-OWL-735". */
export const normalizeCode = (code) => String(code).toUpperCase().trim().replace(/[\s_-]+/g, '-').replace(/^-|-$/g, '');

/** A new random key code, e.g. "EMBER-OWL-735" (about two million possibilities). */
/** A new key code; `alphabet` 'boxes' or 'emojis' makes a BOX- or EMO- code for that alphabet. */
export function newCode(rand = cryptoRandom, { alphabet } = {}) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  return `${PREFIX[alphabet] ?? ''}${pick(ADJ)}-${pick(NOUN)}-${100 + Math.floor(rand() * 900)}`;
}

function cryptoRandom() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  return Math.random();
}

// cyrb53-style string hash → seed, then mulberry32 as the generator.
function seedOf(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0) ^ (h2 >>> 0);
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A repeatable random generator for a piece of text (same text → same numbers). */
export const seededRand = (text) => mulberry32(seedOf(`cipher-pact:${text}`));

const cache = new Map();

/**
 * The alphabet for a key code: { code, theme, symbols (36, in LETTERS order),
 * toSymbol: Map letter → symbol, toLetter: Map symbol → letter }.
 */
export function keyFor(rawCode) {
  const code = normalizeCode(rawCode);
  if (cache.has(code)) return cache.get(code);
  const rand = mulberry32(seedOf(`cipher-pact:${code}`));
  const picked = THEMES[Math.floor(rand() * THEMES.length)];
  const theme = Object.entries(ALPHABETS).find(([p]) => code.startsWith(p))?.[1] ?? picked;
  const pool = Array.from(theme.symbols);
  // Fisher–Yates, then keep the first 36.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const symbols = pool.slice(0, LETTERS.length);
  const key = {
    code,
    theme,
    symbols,
    toSymbol: new Map(Array.from(LETTERS, (l, i) => [l, symbols[i]])),
    toLetter: new Map(symbols.map((s, i) => [s, LETTERS[i]])),
  };
  cache.set(code, key);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return key;
}

// -------------------------------------------------------- encode / decode
/** A letter's alphabet slot: accents and case come off here (é → e, Q → q) and travel as invisible marks. */
const plain = (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Capitals and accents ride along as invisible marks right after a letter's
// symbol (variation selectors, which fonts never draw): U+E0100 for a capital,
// U+E0101 + n for the combining mark U+0300 + n. They only tell which letters
// are capitals or accented, not which letters they are, so É decodes as É.
const CAPITAL = 0xe0100;
const ACCENT = 0xe0101;
// A character of the secret that happens to be one of the key's own symbols (🍕
// in the Emoji alphabet) is followed by this mark, so it reads back as itself.
const LITERAL = String.fromCodePoint(0xe01ec);
const VS16 = '\ufe0f'; // emoji presentation selector
const isMark = (c) => c !== undefined && c.codePointAt(0) >= CAPITAL && c.codePointAt(0) <= ACCENT + 0x6f;

/** The invisible marks for letter `c`, '' for a plain small letter, or null if they can't be written. */
function marksFor(c) {
  const d = c.normalize('NFD');
  let out = d[0] !== d[0].toLowerCase() ? String.fromCodePoint(CAPITAL) : '';
  for (const m of d.slice(1)) {
    const n = m.codePointAt(0) - 0x300;
    if (n < 0 || n > 0x6f) return null;
    out += String.fromCodePoint(ACCENT + n);
  }
  return out;
}

/** `letter` with the marks that follow position `i` of `chars` applied; returns { out, next }. */
function applyMarks(letter, chars, i) {
  let upper = false;
  let accents = '';
  while (isMark(chars[i])) {
    const v = chars[i++].codePointAt(0);
    if (v === CAPITAL) upper = true;
    else accents += String.fromCodePoint(0x300 + v - ACCENT);
  }
  return { out: ((upper ? letter.toUpperCase() : letter) + accents).normalize('NFC'), next: i };
}

/** Text → symbols. Returns the string and one token per character, for animation. */
export function encodeWith(key, text) {
  const chars = Array.from(text);
  const tokens = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const p = plain(c);
    const s = p.length === 1 ? key.toSymbol.get(p) : undefined;
    const marks = s ? marksFor(c) : null;
    if (marks !== null) tokens.push({ src: c, out: s + marks, letter: p, index: LETTERS.indexOf(p) });
    else if (key.toLetter.has(c)) {
      // One of the key's symbols typed in the secret: keep it (with its emoji selector), marked literal.
      const vs = chars[i + 1] === VS16 ? (i++, VS16) : '';
      tokens.push({ src: c + vs, out: c + vs + LITERAL });
    } else tokens.push({ src: c, out: c });
  }
  return { text: tokens.map((t) => t.out).join(''), tokens };
}

/** Symbols → text. Anything that isn't one of the key's symbols is kept as it is. */
export function decodeWith(key, text) {
  const chars = Array.from(text);
  const tokens = [];
  for (let i = 0; i < chars.length; ) {
    const c = chars[i];
    const l = key.toLetter.get(c);
    if (!l) {
      tokens.push({ src: c, out: c });
      i++;
      continue;
    }
    // Apps sometimes add an emoji selector after a symbol (🌶 → 🌶️); it isn't part of the code.
    const j = chars[i + 1] === VS16 ? i + 2 : i + 1;
    if (chars[j] === LITERAL) {
      tokens.push({ src: chars.slice(i, j + 1).join(''), out: chars.slice(i, j).join('') });
      i = j + 1;
      continue;
    }
    const { out, next } = applyMarks(l, chars, j);
    tokens.push({ src: chars.slice(i, next).join(''), out, letter: l, index: LETTERS.indexOf(l) });
    i = next;
  }
  return { text: tokens.map((t) => t.out).join(''), tokens };
}

// ------------------------------------------------------------ the lesson
const COMMON = 'etaoinshrdlucmfwypgb';
const WARMUPS = [
  'moon', 'fire', 'storm', 'ghost', 'pizza', 'river', 'tiger', 'magic', 'candy', 'robot', 'wolf', 'cloud',
  'jungle', 'pixel', 'comet', 'lava', 'ninja', 'piano', 'quest', 'zebra', 'honey', 'kiwi', 'vault', 'yeti',
];

/**
 * Clues teach part of the alphabet without giving the secret away: they only
 * use letters that are not in the secret. Returns
 * { clues: [{ symbol, letter }], warmup: { word, symbols } | null }.
 */
export function lessonFor(key, secret, rand = Math.random) {
  const used = new Set(Array.from(plain(secret)).filter((c) => key.toSymbol.has(c)));
  const free = Array.from(COMMON).filter((l) => !used.has(l));
  const clues = [];
  while (clues.length < 3 && free.length) {
    // Lean towards common letters (they help most), with some variety.
    const i = Math.floor(rand() ** 2 * free.length);
    const [l] = free.splice(i, 1);
    clues.push({ symbol: key.toSymbol.get(l), letter: l });
  }
  const clueLetters = new Set(clues.map((c) => c.letter));
  const options = WARMUPS.filter((w) => !Array.from(w).some((c) => used.has(c)))
    // A warm-up that reuses a clue letter or two is easier to work out.
    .sort((a, b) => Array.from(b).filter((c) => clueLetters.has(c)).length - Array.from(a).filter((c) => clueLetters.has(c)).length);
  const word = options.length ? options[Math.floor(rand() * Math.min(options.length, 6))] : null;
  return { clues, warmup: word ? { word, symbols: encodeWith(key, word).text } : null };
}

/** The message to send: the note, the clues, the warm-up and the sealed secret. */
export function composeMessage({ note, key, secret, lesson }) {
  const lines = [];
  if (note) lines.push(note.trim(), '');
  if (lesson.clues.length) lines.push(`🔑 Clues: ${lesson.clues.map((c) => `${c.symbol} = ${c.letter}`).join(' · ')}`);
  if (lesson.warmup) lines.push(`✏️ Warm-up: ${lesson.warmup.symbols} = ${lesson.warmup.word}`);
  // One 🔒 line per line of the secret, so a multi-line secret comes back whole.
  for (const line of secret.split('\n')) lines.push(`🔒 ${encodeWith(key, line).text}`);
  return lines.join('\n');
}

/** The key card as text: a = ᚠ  b = ᛟ … in rows of six. */
export function keyCardText(key) {
  const rows = [];
  for (let i = 0; i < LETTERS.length; i += 6) {
    rows.push(Array.from(LETTERS.slice(i, i + 6), (l, k) => `${l} = ${key.symbols[i + k]}`).join('   '));
  }
  return `CIPHER PACT · KEY ${key.code} · ${key.theme.name}\n\n${rows.join('\n')}`;
}

// -------------------------------------------------------------- reading
/** "ᚠ = e" pairs written in a message's clue line. */
export function parseClues(text) {
  const out = [];
  const line = /🔑[^\n]*/.exec(text)?.[0] ?? '';
  for (const m of line.matchAll(/(\S+?)\s*=\s*([a-z0-9])\b/gi)) {
    const sym = m[1].replace(/️/g, '').replace(/^.*?:/, '');
    if (sym) out.push({ symbol: Array.from(sym).at(-1), letter: m[2].toLowerCase() });
  }
  return out;
}

const MARKERS = /[🔑✏🔒️]/gu;
let allSymbols = null;

/**
 * The cipher symbols in a message: characters of any theme's alphabet, read
 * from the coded lines only (🔑 / ✏️ / 🔒) when there are any, since the note
 * can hold any script or emoji. Symbols typed literally in the secret don't count.
 */
function symbolsIn(text) {
  const coded = /🔒/u.test(text) ? text.split('\n').filter((l) => /^\s*(🔒|🔑|✏)/u.test(l)).join('\n') : text;
  const chars = Array.from(coded.replace(MARKERS, ''));
  allSymbols ??= new Set([...THEMES, BOXES, EMOJIS].flatMap((t) => Array.from(t.symbols)));
  return chars.filter((c, i) => allSymbols.has(c) && chars[i + 1] !== LITERAL && !(chars[i + 1] === VS16 && chars[i + 2] === LITERAL));
}

/**
 * Which of `codes` was this message written with? Every symbol must belong to
 * the alphabet, and the clue line (if there is one) must agree with it.
 * Returns { key, coverage, clueMatch } for the best code, or null.
 */
export function findKey(text, codes) {
  const syms = symbolsIn(text);
  if (!syms.length) return null;
  const clues = parseClues(text);
  let best = null;
  for (const code of codes) {
    const key = keyFor(code);
    const coverage = syms.filter((s) => key.toLetter.has(s)).length / syms.length;
    const clueMatch = clues.length ? clues.every((c) => key.toSymbol.get(c.letter) === c.symbol) : null;
    if (clueMatch === false || coverage < 0.6) continue;
    const score = coverage + (clueMatch ? 1 : 0);
    if (!best || score > best.score) best = { key, coverage, clueMatch, score };
  }
  return best;
}

/** The sealed line of a message (after 🔒), or the whole text if there is none. */
export function secretLine(text) {
  const lines = Array.from(text.matchAll(/🔒 ?([^\n]*)/gu), (m) => m[1]);
  return lines.length ? lines.join('\n') : text;
}

// ----------------------------------------------------- message styles
// How the key travels with the message. "clues" keeps it separate (the key
// code or key card); the other styles write the key into the message, so a
// friend reads it at a glance (and so can anyone else who sees it).
export const STYLES = [
  { id: 'clues', icon: '🔑', name: 'Clues', blurb: 'Key sent separately: a few clues, a warm-up, the sealed line', keyInside: false },
  { id: 'letters', icon: '🔤', name: 'Letter code', blurb: '“code: A=✦, B=✧” then the message in symbols', keyInside: true },
  { id: 'words', icon: '🍎', name: 'Word swap', blurb: '“When I say ‘apple’ I mean ‘cool’” then the code words', keyInside: true },
  { id: 'numbers', icon: '🔢', name: 'Number map', blurb: '“mapping: 1=y, 2=i” then 1-2-3', keyInside: true },
  { id: 'boxes', icon: '🟥', name: 'Color boxes', blurb: 'every letter is a coloured box: “code: A=🟥, B=🟦” then 🟥🟦', keyInside: true },
  { id: 'emojis', icon: '😀', name: 'Emoji letters', blurb: 'every letter is an emoji: “code: A=🍕, B=🦊” then 🍕🦊', keyInside: true },
  // Older messages: one emoji per word. Still read and shown, no longer offered.
  { id: 'emoji', icon: '🟢', name: 'Emoji words', blurb: '“Our secret language: 🔴=hide” then 🔴🔵', keyInside: true, legacy: true },
];
/** The styles offered for new messages. */
export const PICKABLE = STYLES.filter((s) => !s.legacy);
export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];

const DECOYS = (
  'apple banana cherry mango pebble rocket teapot pickle noodle waffle cactus pancake donut walrus penguin turnip ' +
  'muffin pretzel coconut kettle lantern biscuit pumpkin gecko tulip popcorn marble button pillow carrot llama ' +
  'trumpet violin igloo hammock parrot lobster bagel cupcake meteor sprout taco jellybean kiwi mitten yoyo zucchini'
).split(' ');
const PALETTE = Array.from('🔴🔵🟢🟡🟣🟠🟤⚫⚪🟥🟦🟩🟨🟪🟧🟫⬛⬜🔶🔷🔺🔻💠🔘');
const shuffled = (list, rand) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
// A word for the word styles: its letters, with punctuation left around it.
const WORD = /[\p{L}\p{N}'’]+/gu;
const bare = (w) => w.toLowerCase();

/**
 * Build the key-inside part of a message for `style`. Returns
 * { legend: [{ from, to }], line, body } where `body` is the text that goes
 * after the note, `legend` the pairs shown as chips and `line` the coded text.
 */
export function buildStyle(styleId, key, secret, rand = Math.random) {
  const built = buildVisible(styleId, key, secret, rand);
  if (!built || parseInline(built.body)?.secret === secret) return built;
  // Reads back with different spacing: tuck an invisible copy of the secret in.
  const line = withHidden(built.line, secret);
  return { ...built, line, body: built.body.replace(built.line, () => line) };
}

function buildVisible(styleId, key, secret, rand) {
  // Color boxes and Emoji letters are Letter code written with a BOX- / EMO- key's alphabet.
  if (styleId === 'letters' || styleId === 'boxes' || styleId === 'emojis') {
    const used = [...new Set(Array.from(plain(secret)).filter((c) => key.toSymbol.has(c)))];
    const legend = shuffled(used, rand).map((l) => ({ from: l.toUpperCase(), to: key.toSymbol.get(l) }));
    const line = encodeWith(key, secret).text;
    return { legend, line, body: `code: ${legend.map((p) => `${p.from}=${p.to}`).join(', ')}.\n${line}` };
  }
  if (styleId === 'words') {
    // One code per spelling, so "Hi" and "hi" both come back as written.
    const words = [...new Set(Array.from(secret.matchAll(WORD), (m) => m[0]))];
    const pool = shuffled(DECOYS.filter((d) => !words.some((w) => bare(w) === d)), rand);
    const codeOf = new Map(words.map((w, i) => [w, pool[i % pool.length] + (i >= pool.length ? i : '')]));
    const legend = words.map((w) => ({ from: codeOf.get(w), to: w }));
    const line = secret.replace(WORD, (w) => codeOf.get(w));
    return { legend, line, body: `Cipher: ${legend.map((p) => `When I say '${p.from}' I mean '${p.to}'.`).join(' ')} Now: ${line}` };
  }
  if (styleId === 'numbers') {
    // Every letter or digit gets a number, in the order it first appears. So does a
    // hyphen inside a word (42-17), since a bare - already joins the numbers.
    const chars = [...new Set(Array.from(secret).filter((c) => /[\p{L}\p{N}-]/u.test(c)))];
    const num = new Map(chars.map((c, i) => [c, i + 1]));
    const legend = chars.map((c) => ({ from: String(num.get(c)), to: c }));
    const line = secret
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[\p{L}\p{N}-]+/gu, (run) => Array.from(run, (c) => num.get(c)).join('-')))
      .join(' / ');
    return { legend, line, body: `mapping: ${legend.map((p) => `${p.from}=${p.to}`).join(', ')}.  ${line}` };
  }
  if (styleId === 'emoji') {
    const words = [...new Set(Array.from(secret.matchAll(WORD), (m) => m[0]))];
    // Code emoji never repeat one the secret already holds ("hide the 🔵 key").
    const inSecret = new Set(Array.from(secret.replace(/\ufe0f/g, '')));
    const pool = shuffled(PALETTE.filter((e) => !inSecret.has(e)), rand);
    const extra = shuffled(Array.from(themeById('emoji').symbols).filter((e) => !inSecret.has(e)), rand);
    const emojiOf = new Map(words.map((w, i) => [w, pool[i] ?? extra[i - pool.length] ?? `#${i}`]));
    const legend = words.map((w) => ({ from: emojiOf.get(w), to: w }));
    // Words sit side by side like in "🔴🔵🟢🟡"; a space survives only after punctuation.
    const line = secret.trim().replace(WORD, (w) => emojiOf.get(w)).replace(/(?<=[\p{L}\p{N}\p{Extended_Pictographic}⬛⬜])\s+(?=\S)/gu, '');
    return { legend, line, body: `Our secret language: ${legend.map((p) => `${p.from}=${p.to}`).join(', ')}. ${line}` };
  }
  return null;
}

const Q = `['"‘’“”]`;

/**
 * Read a message that carries its own key (any of the key-inside styles,
 * also when written by hand). Returns { secret, style, legend } or null.
 */
export function parseInline(text) {
  const { visible, original } = reveal(text);
  const res = readInline(visible);
  // Key-inside messages that wouldn't read back exactly (spacing, line breaks)
  // carry an invisible copy of the secret; it's used when it matches what the
  // visible message says.
  const loose = (x) => x.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase(); // letters and digits only
  if (res && original !== null && loose(original) === loose(res.secret)) res.secret = original;
  // Nothing in it had a code (only emoji, say): the invisible copy is all there is.
  // Only for text that is one of these messages, not anything else carrying a copy.
  if (!res && original !== null && /\b(code|mapping|secret language|cipher|now)\s*:|\bWhen I say\b/i.test(visible)) return { style: 'letters', secret: original, legend: [] };
  return res;
}

function readInline(text) {
  const t = text.replace(/️/g, '');
  // When I say 'apple' I mean 'cool'. … Now: apple banana
  // (the meaning can hold an apostrophe: I mean 'Don't'.)
  const says = [...t.matchAll(new RegExp(`When I say ${Q}?([^'"‘’“”]+?)${Q}? I mean ${Q}?(.+?)${Q}?\\s*[.!;,](?=\\s|$)`, 'gi'))];
  if (says.length) {
    const map = new Map(says.map((m) => [bare(m[1].trim()), m[2].trim()]));
    const now = /\bNow\s*:\s*([\s\S]*)/i.exec(t)?.[1] ?? t.slice(says.at(-1).index + says.at(-1)[0].length);
    const secret = now.trim().replace(WORD, (w) => map.get(bare(w)) ?? w);
    return { style: 'words', secret, legend: says.map((m) => ({ from: m[1].trim(), to: m[2].trim() })) };
  }
  // mapping: 1=y, 2=i …  1-2-3-2-4-5
  const mapping = /mapping\s*:\s*((?:\d+\s*=\s*[^\s,.;]+\s*[,;]?\s*)+)\.?/i.exec(t);
  if (mapping) {
    const map = new Map(Array.from(mapping[1].matchAll(/(\d+)\s*=\s*([^\s,.;]+)/g), (m) => [m[1], m[2]]));
    const rest = t.slice(mapping.index + mapping[0].length).trim();
    const secret = rest
      .split(/\s*\/\s*|\s{2,}|\s(?=\d)/)
      .map((w) => w.replace(/\d+(?:-\d+)*/g, (run) => run.split('-').map((n) => map.get(n) ?? n).join('')))
      .join(' ');
    return { style: 'numbers', secret: secret.trim(), legend: [...map].map(([from, to]) => ({ from, to })) };
  }
  // Our secret language: 🔴=hide, 🔵=me … 🔴🔵
  const lang = /secret language\s*:\s*/i.exec(t);
  if (lang) {
    const after = t.slice(lang.index + lang[0].length);
    const pairs = [...after.matchAll(/(\S+?)\s*=\s*([^,.;\n]+?)\s*(?=[,.;\n]|$)/gu)];
    const end = pairs.length ? pairs.at(-1).index + pairs.at(-1)[0].length : 0;
    const map = new Map(pairs.map((m) => [m[1], m[2].trim()]));
    const keys = [...map.keys()].sort((a, b) => b.length - a.length);
    let rest = after.slice(end).replace(/^[\s.,;]+/, '');
    let out = '';
    while (rest) {
      const k = keys.find((x) => rest.startsWith(x));
      if (k) {
        if (out && !/[\s(“"'/-]$/.test(out)) out += ' ';
        out += map.get(k);
        rest = rest.slice(k.length);
      } else {
        const ch = Array.from(rest)[0];
        out += ch;
        rest = rest.slice(ch.length);
      }
    }
    return { style: 'emoji', secret: out.replace(/\s+/g, ' ').trim(), legend: [...map].map(([from, to]) => ({ from, to })) };
  }
  // code: A=X, B=Y, C=Z.  XYZ
  const code = /\bcode\s*:\s*((?:[a-z0-9]\s*=\s*[^\s,;]+?\s*[,;]?\s*)+)(?:\.|\n|$)/i.exec(t);
  if (code) {
    const pairs = Array.from(code[1].matchAll(/([a-z0-9])\s*=\s*([^\s,;]+)/gi), (m) => [m[2].replace(/\.$/, ''), m[1].toLowerCase()]);
    const map = new Map(pairs);
    const keys = [...map.keys()].sort((a, b) => b.length - a.length);
    let rest = t.slice(code.index + code[0].length).trim();
    let out = '';
    while (rest) {
      const k = keys.find((x) => rest.startsWith(x));
      const ch = k ?? Array.from(rest)[0];
      rest = rest.slice(ch.length);
      const chars = Array.from(rest);
      const j = chars[0] === VS16 ? 1 : 0;
      if (chars[j] === LITERAL) {
        // a symbol typed in the secret itself: it stays as it is
        out += ch + (j ? VS16 : '');
        rest = chars.slice(j + 1).join('');
        continue;
      }
      if (!k) {
        out += ch;
        continue;
      }
      const { out: letter, next } = applyMarks(map.get(k), chars, j);
      out += letter;
      rest = chars.slice(next).join('');
    }
    const all = (alphabet) => pairs.length > 0 && pairs.every(([sym]) => Array.from(alphabet.symbols).includes(sym));
    return { style: all(BOXES) ? 'boxes' : all(EMOJIS) ? 'emojis' : 'letters', secret: out.trim(), legend: pairs.map(([to, from]) => ({ from: from.toUpperCase(), to })) };
  }
  return null;
}

/** The whole message for a sealed entry of any style. */
export function messageFor(entry) {
  const key = keyFor(entry.code);
  if (!entry.style || entry.style === 'clues') return composeMessage({ note: entry.note, key, secret: entry.secret, lesson: entry.lesson });
  return `${entry.note ? `${entry.note.trim()}\n\n` : ''}${entry.body}`;
}
