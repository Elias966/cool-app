// Text -> six historical writing systems.
//
// These are letter-by-letter (or sound-by-sound) substitutions into each
// script, the way names are usually spelled out in them today. They are not
// translations into the ancient languages. Every code point here was checked
// against the Unicode character database.

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// ----------------------------------------------------------------- numerals
function roman(n) {
  if (n < 1 || n > 3999) return null;
  const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) (out += s), (n -= v);
  return out;
}

// Ionic Greek numerals: letters for 1-9, 10-90 and 100-900, ͵ marks thousands, ʹ ends the number.
function greekNumeral(n) {
  if (n < 1 || n > 9999) return null;
  const units = ['', 'Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ϛ', 'Ζ', 'Η', 'Θ'];
  const tens = ['', 'Ι', 'Κ', 'Λ', 'Μ', 'Ν', 'Ξ', 'Ο', 'Π', 'Ϟ'];
  const hundreds = ['', 'Ρ', 'Σ', 'Τ', 'Υ', 'Φ', 'Χ', 'Ψ', 'Ω', 'Ϡ'];
  const th = Math.floor(n / 1000);
  const h = Math.floor(n / 100) % 10;
  const t = Math.floor(n / 10) % 10;
  const u = n % 10;
  return `${th ? `͵${units[th]}` : ''}${hundreds[h]}${tens[t]}${units[u]}ʹ`;
}

// Egyptian numerals: one sign per power of ten, repeated.
function egyptianNumeral(n) {
  if (n < 1 || n > 9999999) return null;
  const signs = [[1000000, '𓁨'], [100000, '𓆐'], [10000, '𓂭'], [1000, '𓆼'], [100, '𓍢'], [10, '𓎆'], [1, '𓏺']];
  let out = '';
  for (const [v, s] of signs) {
    out += s.repeat(Math.floor(n / v));
    n %= v;
  }
  return out;
}

// --------------------------------------------------------------- the scripts
export const SCRIPTS = [
  {
    id: 'futhark',
    name: 'Elder Futhark',
    seal: 'ᚠ',
    era: 'c. AD 150–800',
    region: 'Northern Europe',
    blurb: 'The oldest runic alphabet: 24 runes used by Germanic peoples. It is named after its first six runes, ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ.',
    how: 'Each letter becomes the matching rune. TH becomes ᚦ and NG becomes ᛜ; C, K and Q all become ᚲ. Words are split by ᛫ as on rune stones, . ! ? become ᛬ and commas are dropped.',
    font: 'runic',
    sep: '᛫',
    letters: {
      A: 'ᚨ', B: 'ᛒ', C: 'ᚲ', D: 'ᛞ', E: 'ᛖ', F: 'ᚠ', G: 'ᚷ', H: 'ᚺ', I: 'ᛁ', J: 'ᛃ', K: 'ᚲ', L: 'ᛚ', M: 'ᛗ',
      N: 'ᚾ', O: 'ᛟ', P: 'ᛈ', Q: 'ᚲ', R: 'ᚱ', S: 'ᛊ', T: 'ᛏ', U: 'ᚢ', V: 'ᚹ', W: 'ᚹ', X: 'ᚲᛊ', Y: 'ᛃ', Z: 'ᛉ',
      TH: 'ᚦ', NG: 'ᛜ',
    },
    punct: { '.': '᛬', '!': '᛬', '?': '᛬', ';': '᛬', ':': '᛬', ',': '' },
    names: {
      ᚠ: 'fehu · cattle, wealth', ᚢ: 'uruz · aurochs', ᚦ: 'thurisaz · giant', ᚨ: 'ansuz · a god', ᚱ: 'raidō · ride, journey',
      ᚲ: 'kaunan · torch', ᚷ: 'gebō · gift', ᚹ: 'wunjō · joy', ᚺ: 'hagalaz · hail', ᚾ: 'naudiz · need', ᛁ: 'īsaz · ice',
      ᛃ: 'jēra · year, harvest', ᛈ: 'perþō · meaning unknown', ᛉ: 'algiz · elk', ᛊ: 'sōwilō · sun', ᛏ: 'tīwaz · the god Týr',
      ᛒ: 'berkanan · birch', ᛖ: 'ehwaz · horse', ᛗ: 'mannaz · man', ᛚ: 'laguz · water', ᛜ: 'ingwaz · the god Ing',
      ᛞ: 'dagaz · day', ᛟ: 'ōþalan · heritage', '᛫': 'word divider', '᛬': 'double divider',
    },
  },
  {
    id: 'hieroglyphs',
    name: 'Egyptian Hieroglyphs',
    seal: '𓂀',
    era: 'c. 3200 BC – AD 400',
    region: 'Egypt',
    blurb: 'Picture signs carved on temples and tombs for over three thousand years. The Rosetta Stone (196 BC) helped Champollion decipher them in 1822.',
    how: 'Uses the one-sound signs Egyptologists use to spell names, like 𓃭 lion for L. It’s a fun alphabet, not the Egyptian language, which wrote no vowels. Each word sits in a cartouche, the ring used for royal names, and numbers use real Egyptian numerals.',
    font: 'hiero',
    sep: ' ',
    cartouche: true,
    letters: {
      A: '𓄿', B: '𓃀', C: '𓎡', D: '𓂧', E: '𓇋', F: '𓆑', G: '𓎼', H: '𓉔', I: '𓇋', J: '𓆓', K: '𓎡', L: '𓃭', M: '𓅓',
      N: '𓈖', O: '𓅱', P: '𓊪', Q: '𓈎', R: '𓂋', S: '𓋴', T: '𓏏', U: '𓅱', V: '𓆑', W: '𓅱', X: '𓎡𓋴', Y: '𓇌', Z: '𓊃',
      SH: '𓈙', KH: '𓐍', CH: '𓍿',
    },
    numeral: egyptianNumeral,
    numeralName: 'Egyptian numerals',
    names: {
      '𓄿': 'Egyptian vulture (G1) · ꜣ', '𓃀': 'foot (D58) · b', '𓎡': 'basket with handle (V31) · k', '𓂧': 'hand (D46) · d',
      '𓇋': 'flowering reed (M17) · i', '𓆑': 'horned viper (I9) · f', '𓎼': 'jar stand (W11) · g', '𓉔': 'reed shelter (O4) · h',
      '𓆓': 'cobra (I10) · dj', '𓃭': 'lion (E23) · rw, later l', '𓅓': 'owl (G17) · m', '𓈖': 'water (N35) · n', '𓊪': 'stool (Q3) · p',
      '𓈎': 'hill slope (N29) · q', '𓂋': 'mouth (D21) · r', '𓋴': 'folded cloth (S29) · s', '𓏏': 'bread loaf (X1) · t',
      '𓅱': 'quail chick (G43) · w, u', '𓇌': 'two reeds (M17A) · y', '𓊃': 'door bolt (O34) · z', '𓈙': 'pool (N37) · sh',
      '𓐍': 'placenta (Aa1) · kh', '𓍿': 'tethering rope (V13) · tj', '𓏺': 'stroke · 1', '𓎆': 'hobble · 10', '𓍢': 'coil of rope · 100',
      '𓆼': 'lotus · 1,000', '𓂭': 'finger · 10,000', '𓆐': 'tadpole · 100,000', '𓁨': 'the god Heh · 1,000,000',
    },
  },
  {
    id: 'ogham',
    name: 'Ogham',
    seal: 'ᚑ',
    era: 'c. AD 300–600',
    region: 'Ireland and Britain',
    blurb: 'An early Irish alphabet of strokes cut along the edge of standing stones and read from the bottom up. Later tradition named many letters after trees.',
    how: 'Each letter becomes an Ogham letter, and NG becomes ᚍ. Each line starts with the feather mark ᚛ and ends with ᚜, and the words are joined by the stem line.',
    font: 'ogham',
    sep: ' ',
    wrap: ['᚛', '᚜'],
    letters: {
      A: 'ᚐ', B: 'ᚁ', C: 'ᚉ', D: 'ᚇ', E: 'ᚓ', F: 'ᚃ', G: 'ᚌ', H: 'ᚆ', I: 'ᚔ', J: 'ᚔ', K: 'ᚉ', L: 'ᚂ', M: 'ᚋ',
      N: 'ᚅ', O: 'ᚑ', P: 'ᚚ', Q: 'ᚊ', R: 'ᚏ', S: 'ᚄ', T: 'ᚈ', U: 'ᚒ', V: 'ᚃ', W: 'ᚃ', X: 'ᚉᚄ', Y: 'ᚔ', Z: 'ᚎ',
      NG: 'ᚍ',
    },
    names: {
      ᚁ: 'beith · birch', ᚂ: 'luis', ᚃ: 'fearn · alder', ᚄ: 'sail · willow', ᚅ: 'nion', ᚆ: 'uath', ᚇ: 'dair · oak',
      ᚈ: 'tinne', ᚉ: 'coll · hazel', ᚊ: 'ceirt', ᚋ: 'muin', ᚌ: 'gort', ᚍ: 'ngéadal', ᚎ: 'straif', ᚏ: 'ruis', ᚐ: 'ailm',
      ᚑ: 'onn', ᚒ: 'úr', ᚓ: 'eadhadh', ᚔ: 'iodhadh · yew', ᚚ: 'peith', '᚛': 'feather mark · start', '᚜': 'feather mark · end',
    },
  },
  {
    id: 'cuneiform',
    name: 'Cuneiform (Ugaritic)',
    seal: '𐎀',
    era: 'c. 1400–1200 BC',
    region: 'Ugarit, in modern Syria',
    blurb: 'A 30-letter alphabet pressed into wet clay with a wedge-shaped reed, one of the earliest alphabets ever found. The city of Ugarit was rediscovered in 1928.',
    how: 'Each letter becomes the closest Ugaritic sign, and SH 𐎌, TH 𐎘, KH 𐎃 and GH 𐎙 have their own. Ugaritic had no E, F, O or V, so they become 𐎛 i, 𐎔 p, 𐎜 u and 𐎆 w. Words are split by the wedge 𐎟.',
    font: 'ugaritic',
    sep: '𐎟',
    letters: {
      A: '𐎀', B: '𐎁', C: '𐎋', D: '𐎄', E: '𐎛', F: '𐎔', G: '𐎂', H: '𐎅', I: '𐎛', J: '𐎊', K: '𐎋', L: '𐎍', M: '𐎎',
      N: '𐎐', O: '𐎜', P: '𐎔', Q: '𐎖', R: '𐎗', S: '𐎒', T: '𐎚', U: '𐎜', V: '𐎆', W: '𐎆', X: '𐎋𐎒', Y: '𐎊', Z: '𐎇',
      SH: '𐎌', TH: '𐎘', KH: '𐎃', GH: '𐎙',
    },
    names: {
      '𐎀': 'alpa · a', '𐎁': 'beta · b', '𐎂': 'gamla · g', '𐎃': 'kha · kh', '𐎄': 'delta · d', '𐎅': 'ho · h', '𐎆': 'wo · w',
      '𐎇': 'zeta · z', '𐎊': 'yod · y', '𐎋': 'kaf · k', '𐎌': 'shin · sh', '𐎍': 'lamda · l', '𐎎': 'mem · m', '𐎐': 'nun · n',
      '𐎒': 'samka · s', '𐎔': 'pu · p', '𐎖': 'qopa · q', '𐎗': 'rasha · r', '𐎘': 'thanna · th', '𐎙': 'ghain · gh',
      '𐎚': 'to · t', '𐎛': 'i', '𐎜': 'u', '𐎟': 'word divider',
    },
  },
  {
    id: 'greek',
    name: 'Ancient Greek',
    seal: 'Ω',
    era: 'c. 700 BC onward',
    region: 'Greece and the Mediterranean',
    blurb: 'Inscriptions were cut in capitals, often with no spaces. The earliest ran boustrophedon, “as the ox turns”: every other line was written backwards.',
    how: 'Sounds become Greek capitals: TH Θ, PH Φ, CH Χ, PS Ψ, X Ξ, NG ΓΓ (as in ἄγγελος), and V or W ΟΥ. Words are split by ⁝, ? becomes ; and numbers become Greek numerals (2026 is ͵ΒΚϚʹ). Turn on boustrophedon to flip every other line.',
    font: 'serif',
    sep: '⁝',
    boustrophedon: true,
    letters: {
      A: 'Α', B: 'Β', C: 'Κ', D: 'Δ', E: 'Ε', F: 'Φ', G: 'Γ', H: 'Η', I: 'Ι', J: 'Ι', K: 'Κ', L: 'Λ', M: 'Μ',
      N: 'Ν', O: 'Ο', P: 'Π', Q: 'Κ', R: 'Ρ', S: 'Σ', T: 'Τ', U: 'Υ', V: 'ΟΥ', W: 'ΟΥ', X: 'Ξ', Y: 'Υ', Z: 'Ζ',
      TH: 'Θ', PH: 'Φ', CH: 'Χ', PS: 'Ψ', KS: 'Ξ', NG: 'ΓΓ',
    },
    punct: { '?': ';' },
    numeral: greekNumeral,
    numeralName: 'Greek numeral',
    names: {
      Α: 'alpha', Β: 'beta', Γ: 'gamma', Δ: 'delta', Ε: 'epsilon', Ζ: 'zeta', Η: 'eta', Θ: 'theta', Ι: 'iota', Κ: 'kappa',
      Λ: 'lambda', Μ: 'mu', Ν: 'nu', Ξ: 'xi', Ο: 'omicron', Π: 'pi', Ρ: 'rho', Σ: 'sigma', Τ: 'tau', Υ: 'upsilon',
      Φ: 'phi', Χ: 'chi', Ψ: 'psi', Ω: 'omega', '⁝': 'tricolon word divider', ';': 'Greek question mark',
    },
  },
  {
    id: 'latin',
    name: 'Latin Inscription',
    seal: 'SPQR',
    era: 'c. 500 BC – AD 500',
    region: 'The Roman world',
    blurb: 'Roman capitals carved in stone, with dots between words. There was no J, U or W: I and V did those jobs.',
    how: 'Letters become Roman capitals: J becomes I, U becomes V and W becomes VV. Words are split by ·, and numbers become Roman numerals (2026 is MMXXVI).',
    font: 'serif',
    sep: '·',
    letters: Object.fromEntries(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => [c, { J: 'I', U: 'V', W: 'VV' }[c] || c])
    ),
    numeral: roman,
    numeralName: 'Roman numeral',
    names: { '·': 'interpunct word divider' },
  },
];

export const scriptById = (id) => SCRIPTS.find((s) => s.id === id);

/**
 * Convert text to a script.
 * @returns {{ text: string, lines: Word[][] }}
 *   Each word is an array of tokens { src, out, info, kind } where kind is
 *   'letter' | 'number' | 'punct' | 'kept' (no equivalent, copied as is).
 *   `text` is the copyable result, with the script's word dividers and marks.
 */
export function convert(input, scriptId) {
  const s = scriptById(scriptId);
  const digraphs = Object.keys(s.letters).filter((k) => k.length > 1);
  const info = (out) => Array.from(out).map((g) => s.names[g] || g).join(' + ');

  const lines = String(input)
    .split('\n')
    .map((line) =>
      line
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => {
          const chars = Array.from(strip(word));
          const tokens = [];
          for (let i = 0; i < chars.length; ) {
            const rest = chars.slice(i).join('').toUpperCase();
            const digits = /^\d+/.exec(rest);
            if (digits) {
              const n = Number(digits[0]);
              const out = s.numeral?.(n);
              if (out) tokens.push({ src: digits[0], out, info: `${s.numeralName} for ${n.toLocaleString('en')}`, kind: 'number' });
              else tokens.push({ src: digits[0], out: digits[0], info: 'kept as written', kind: 'kept' });
              i += digits[0].length;
              continue;
            }
            const pair = digraphs.find((d) => rest.startsWith(d));
            if (pair) {
              const out = s.letters[pair];
              tokens.push({ src: chars.slice(i, i + pair.length).join(''), out, info: `${pair} → ${info(out)}`, kind: 'letter' });
              i += pair.length;
              continue;
            }
            const ch = chars[i];
            const up = ch.toUpperCase();
            if (s.letters[up]) {
              const out = s.letters[up];
              tokens.push({ src: ch, out, info: `${up} → ${info(out)}`, kind: 'letter' });
            } else if (s.punct && Object.hasOwn(s.punct, ch)) {
              tokens.push({ src: ch, out: s.punct[ch], info: s.names[s.punct[ch]] || 'punctuation', kind: 'punct' });
            } else {
              tokens.push({ src: ch, out: ch, info: 'no equivalent, kept as is', kind: 'kept' });
            }
            i++;
          }
          return tokens;
        })
    );

  // A word that already ends in a divider-like mark (e.g. ᛬) doesn't get another.
  const DIVIDERS = new Set(['᛫', '᛬', '⁝', '·', '𐎟']);
  const text = lines
    .map((words) => {
      let body = '';
      words.forEach((w, i) => {
        const part = w.map((t) => t.out).join('');
        if (i > 0 && !DIVIDERS.has(Array.from(body).pop())) body += s.sep;
        body += part;
      });
      return s.wrap && body ? `${s.wrap[0]}${body}${s.wrap[1]}` : body;
    })
    .join('\n');
  return { text, lines };
}

// ================================================================== decoding
// Several letters can share a sign (ᚲ is C, K and Q), so each shared sign is
// read as the letter that is most common in English text. Spelling can't
// always be restored exactly: the result is how the inscription reads.
const PREFER = {
  futhark: { ᚲ: 'k', ᛃ: 'y', ᚹ: 'w' },
  hieroglyphs: { '𓇋': 'e', '𓅱': 'o', '𓎡': 'k', '𓆑': 'f' },
  ogham: { ᚉ: 'c', ᚔ: 'i', ᚃ: 'f' },
  cuneiform: { '𐎛': 'e', '𐎜': 'o', '𐎔': 'p', '𐎆': 'w', '𐎋': 'k', '𐎊': 'y' },
  greek: { Κ: 'k', Ι: 'i', Υ: 'u', Φ: 'f', ΟΥ: 'w', Ξ: 'x' },
  latin: {},
};
// Words that happen to be valid Roman numerals.
const NOT_NUMERALS = new Set(['MIX', 'MI', 'DI', 'LI', 'CI', 'XI', 'MID', 'DIM', 'VI', 'LIV', 'MIL']);

function fromRoman(word) {
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  if (word.length < 2 || NOT_NUMERALS.has(word) || !/^[MDCLXVI]+$/.test(word)) return null;
  let n = 0;
  for (let i = 0; i < word.length; i++) {
    const v = values[word[i]];
    n += v < (values[word[i + 1]] || 0) ? -v : v;
  }
  // Only accept the standard spelling (so "IIII" or "VX" aren't treated as numbers).
  return n > 0 && n <= 3999 && roman(n) === word ? n : null;
}
const MARKS = { '᛫': ' ', '᛬': '. ', '⁝': ' ', '·': ' ', '𐎟': ' ', ' ': ' ', '᚛': '', '᚜': '', ';': '?' };
const EGYPTIAN_NUMBERS = { '𓁨': 1000000, '𓆐': 100000, '𓂭': 10000, '𓆼': 1000, '𓍢': 100, '𓎆': 10, '𓏺': 1 };
const GREEK_NUMBERS = {
  Α: 1, Β: 2, Γ: 3, Δ: 4, Ε: 5, Ϛ: 6, Ζ: 7, Η: 8, Θ: 9, Ι: 10, Κ: 20, Λ: 30, Μ: 40, Ν: 50, Ξ: 60, Ο: 70, Π: 80, Ϟ: 90,
  Ρ: 100, Σ: 200, Τ: 300, Υ: 400, Φ: 500, Χ: 600, Ψ: 700, Ω: 800, Ϡ: 900,
};

// sign (one or more characters) -> { out, script, info }
const SIGNS = new Map();
for (const s of SCRIPTS) {
  if (s.id === 'latin') continue; // plain Latin letters are handled separately
  for (const [key, out] of Object.entries(s.letters)) {
    // X is spelled with two signs (k + s); reading those back as "ks" keeps words like "books" intact.
    if (key === 'X' && Array.from(out).length > 1) continue;
    const reading = PREFER[s.id][out] ?? key.toLowerCase();
    if (!SIGNS.has(out) || PREFER[s.id][out]) {
      SIGNS.set(out, { out: reading, script: s.id, info: `${s.name}: ${Array.from(out).map((g) => s.names[g] || g).join(' + ')}` });
    }
  }
}
const LONGEST_SIGN = Math.max(...[...SIGNS.keys()].map((k) => Array.from(k).length));

/** Latin inscriptions: VV is W; V is a consonant before a vowel, otherwise U. */
function readLatin(word) {
  const up = word.replace(/VV/g, 'W');
  return Array.from(up, (c, i) => {
    if (c !== 'V') return c;
    const next = up[i + 1] || '';
    const prev = up[i - 1] || '';
    return prev !== 'Q' && /[AEIOU]/.test(next) ? 'V' : 'U';
  }).join('');
}

/** Which script a piece of text is mostly written in. */
export function detectScript(input) {
  const counts = {};
  for (const ch of String(input)) {
    const sign = SIGNS.get(ch);
    const id = sign ? sign.script : EGYPTIAN_NUMBERS[ch] ? 'hieroglyphs' : /[A-Z]/.test(ch) ? 'latin' : null;
    if (id) counts[id] = (counts[id] || 0) + 1;
  }
  const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return best ? best[0] : null;
}

/**
 * Ancient script -> readable text. Works on any mix of the six scripts.
 * @returns {{ text: string, script: string|null, tokens: Array<{src, out, info, kind}> }}
 */
export function decode(input) {
  const chars = Array.from(String(input).normalize('NFC'));
  const tokens = [];
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    // Egyptian numerals: add up a run of number signs.
    if (EGYPTIAN_NUMBERS[c]) {
      let n = 0;
      let src = '';
      while (EGYPTIAN_NUMBERS[chars[i]]) (n += EGYPTIAN_NUMBERS[chars[i]]), (src += chars[i++]);
      tokens.push({ src, out: String(n), info: `Egyptian numerals: ${n.toLocaleString('en')}`, kind: 'number' });
      continue;
    }
    // Greek numerals: letters ending in the keraia ʹ (͵ marks thousands).
    const greekNum = /^(͵[ΑΒΓΔΕϚΖΗΘ])?[ΡΣΤΥΦΧΨΩϠ]?[ΙΚΛΜΝΞΟΠϞ]?[ΑΒΓΔΕϚΖΗΘ]?ʹ/.exec(chars.slice(i, i + 7).join(''));
    if (greekNum && greekNum[0].length > 1) {
      const n = Array.from(greekNum[0]).reduce((sum, g, k, arr) => sum + (g === '͵' ? 0 : (GREEK_NUMBERS[g] || 0) * (arr[k - 1] === '͵' ? 1000 : 1)), 0);
      tokens.push({ src: greekNum[0], out: String(n), info: `Greek numeral: ${n.toLocaleString('en')}`, kind: 'number' });
      i += Array.from(greekNum[0]).length;
      continue;
    }
    if (c in MARKS) {
      tokens.push({ src: c, out: MARKS[c], info: 'word divider or mark', kind: 'mark' });
      i++;
      continue;
    }
    // Longest sign first (ΟΥ before Ο, ΓΓ before Γ).
    let matched = false;
    for (let len = LONGEST_SIGN; len >= 1 && !matched; len--) {
      const piece = chars.slice(i, i + len).join('');
      const sign = SIGNS.get(piece);
      if (sign && Array.from(piece).length === len) {
        tokens.push({ src: piece, out: sign.out, info: sign.info, kind: 'letter' });
        i += len;
        matched = true;
      }
    }
    if (matched) continue;
    // Latin capitals: read a whole word at a time for the U/V rules.
    if (/[A-Z]/.test(c)) {
      let word = '';
      while (i < chars.length && /[A-Z]/.test(chars[i])) word += chars[i++];
      const number = fromRoman(word);
      if (number) {
        tokens.push({ src: word, out: String(number), info: `Roman numeral: ${number.toLocaleString('en')}`, kind: 'number' });
        continue;
      }
      const read = readLatin(word);
      tokens.push({ src: word, out: read.toLowerCase(), info: read === word ? 'Latin capitals' : `Latin: ${word} reads as ${read}`, kind: 'letter' });
      continue;
    }
    tokens.push({ src: c, out: c, info: 'kept as is', kind: 'kept' });
    i++;
  }
  // Which script each piece belongs to (the page draws it in that script's font).
  const MARK_SCRIPT = { '᛫': 'futhark', '᛬': 'futhark', '⁝': 'greek', '·': 'latin', '𐎟': 'cuneiform', ' ': 'ogham', '᚛': 'ogham', '᚜': 'ogham', ';': 'greek' };
  for (const t of tokens) {
    const first = Array.from(t.src)[0];
    t.script = SIGNS.get(t.src)?.script
      ?? (EGYPTIAN_NUMBERS[first] ? 'hieroglyphs' : MARK_SCRIPT[first] ?? (/^[͵ΑΒΓΔΕϚΖΗΘΙΚΛΜΝΞΟΠϞΡΣΤΥΦΧΨΩϠ]/.test(first) ? 'greek' : /^[A-Z]/.test(first) ? 'latin' : null));
  }
  // Tidy spacing, then capitalise the start of each sentence.
  const text = tokens
    .map((t) => t.out)
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ([.,!?])/g, '$1')
    .replace(/(^|[.!?]\s+|\n)([a-z])/g, (m, p, l) => p + l.toUpperCase())
    .trim();
  return { text, script: detectScript(input), tokens };
}
