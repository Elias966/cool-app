// Cipher Pact: a fresh substitution alphabet for every message.
//
// A key code such as "EMBER-OWL-735" is the whole key: it seeds a random
// generator that picks a symbol theme and shuffles it onto a–z and 0–9. The
// same code always rebuilds the same alphabet, so a friend only needs the code
// (or the key card) to read a message. Any text works as a code, so two people
// can also agree on their own passphrase.
//
// Pure functions only (no DOM), so Node can test them.

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
  { id: 'emoji', color: '#fb7185', name: 'Emoji', icon: '🔮', font: 'emoji', symbols: '🌙🔥⚡🍀🌊🍄🐍🦊🐙🦉🌵🍒🎲🔮🌸🍉🐝🦋🐢🌈🍕🎈💎👻🌻🐳🦄🍩🚀🪐🌋🍋🐸🦀🌽🎃🐧🍓🌶🧊' },
];
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
export function newCode(rand = cryptoRandom) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  return `${pick(ADJ)}-${pick(NOUN)}-${100 + Math.floor(rand() * 900)}`;
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

const cache = new Map();

/**
 * The alphabet for a key code: { code, theme, symbols (36, in LETTERS order),
 * toSymbol: Map letter → symbol, toLetter: Map symbol → letter }.
 */
export function keyFor(rawCode) {
  const code = normalizeCode(rawCode);
  if (cache.has(code)) return cache.get(code);
  const rand = mulberry32(seedOf(`cipher-pact:${code}`));
  const theme = THEMES[Math.floor(rand() * THEMES.length)];
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
/** Letters lose their accents and case (é → e, Q → q); everything else is kept. */
const plain = (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Text → symbols. Returns the string and one token per character, for animation. */
export function encodeWith(key, text) {
  const tokens = Array.from(text, (c) => {
    const p = plain(c);
    const s = p.length === 1 ? key.toSymbol.get(p) : undefined;
    return s ? { src: c, out: s, letter: p, index: LETTERS.indexOf(p) } : { src: c, out: c };
  });
  return { text: tokens.map((t) => t.out).join(''), tokens };
}

/** Symbols → text. Anything that isn't one of the key's symbols is kept as it is. */
export function decodeWith(key, text) {
  const tokens = Array.from(text.replace(/️/g, ''), (c) => {
    const l = key.toLetter.get(c);
    return l ? { src: c, out: l, letter: l, index: LETTERS.indexOf(l) } : { src: c, out: c };
  });
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
  lines.push(`🔒 ${encodeWith(key, secret).text}`);
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

/** Characters in a message that could be cipher symbols (not ASCII, not our markers). */
function symbolsIn(text) {
  return Array.from(text.replace(MARKERS, '')).filter((c) => c.codePointAt(0) > 0x7f && !/\s|[·…—–“”‘’]/.test(c));
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
export const secretLine = (text) => /🔒\s*([^\n]*)/u.exec(text)?.[1] ?? text;
