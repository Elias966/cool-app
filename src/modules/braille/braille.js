// Text -> Unicode braille, following Unified English Braille (UEB) Grade 1
// (uncontracted) rules: capital and capital-word indicators, numeric mode,
// the grade 1 indicator after numbers, and UEB punctuation.

const LETTERS = {
  a: '⠁', b: '⠃', c: '⠉', d: '⠙', e: '⠑', f: '⠋', g: '⠛', h: '⠓', i: '⠊', j: '⠚',
  k: '⠅', l: '⠇', m: '⠍', n: '⠝', o: '⠕', p: '⠏', q: '⠟', r: '⠗', s: '⠎', t: '⠞',
  u: '⠥', v: '⠧', w: '⠺', x: '⠭', y: '⠽', z: '⠵',
};
const DIGITS = { 1: '⠁', 2: '⠃', 3: '⠉', 4: '⠙', 5: '⠑', 6: '⠋', 7: '⠛', 8: '⠓', 9: '⠊', 0: '⠚' };

const PUNCTUATION = {
  ',': '⠂', ';': '⠆', ':': '⠒', '.': '⠲', '!': '⠖', '?': '⠦', "'": '⠄', '-': '⠤',
  '–': '⠠⠤', '—': '⠠⠤', '…': '⠲⠲⠲',
  '(': '⠐⠣', ')': '⠐⠜', '[': '⠨⠣', ']': '⠨⠜', '{': '⠸⠣', '}': '⠸⠜',
  '/': '⠸⠌', '\\': '⠸⠡', '@': '⠈⠁', '#': '⠸⠹', '$': '⠈⠎', '%': '⠨⠴', '&': '⠈⠯',
  '*': '⠐⠔', '+': '⠐⠖', '=': '⠐⠶', '<': '⠈⠣', '>': '⠈⠜', '_': '⠨⠤', '~': '⠈⠔',
  '^': '⠈⠢', '|': '⠸⠳', '`': '⠘⠡', '€': '⠈⠑', '£': '⠈⠇', '¢': '⠈⠉', '©': '⠘⠉',
  '°': '⠘⠚', '×': '⠐⠦', '÷': '⠐⠌', '•': '⠸⠲',
  '“': '⠦', '”': '⠴', '‘': '⠠⠦', '’': '⠠⠴', '«': '⠘⠦', '»': '⠘⠴',
};

export const INDICATORS = {
  '⠠': 'capital',
  '⠠⠠': 'capital word',
  '⠼': 'number',
  '⠰': 'grade 1',
};

const isDigit = (c) => c >= '0' && c <= '9';
const isBraille = (c) => c >= '⠀' && c <= '⣿';

/** Strip accents so "é" reads as "e"; returns '' when it is not a Latin letter. */
function baseLetter(c) {
  const b = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /^[a-z]$/i.test(b) ? b : '';
}
const isUpper = (c) => c !== c.toLowerCase() && c === c.toUpperCase();

/**
 * Convert text to braille.
 * @returns {{ text: string, tokens: Token[], cellCount: number, unknown: string[] }}
 *   text   - the Unicode braille string (spaces and newlines preserved)
 *   tokens - one token per source character: { src, type, parts: [{ cell, role }] }
 *            where type is 'char' | 'space' | 'newline' | 'unknown'
 */
export function toBraille(input) {
  const chars = Array.from(String(input).normalize('NFC'));
  const tokens = [];
  const unknown = new Set();
  let i = 0;
  let afterNumber = false;

  const push = (src, type, parts) => tokens.push({ src, type, parts });
  const prevIsBoundary = () => {
    const prev = chars[i - 1];
    return prev === undefined || /\s/.test(prev) || '([{“‘«'.includes(prev);
  };

  while (i < chars.length) {
    const c = chars[i];

    if (c === '\n') {
      push(c, 'newline', []);
      afterNumber = false;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      push(c, 'space', []);
      afterNumber = false;
      i++;
      continue;
    }

    // Numeric mode: ⠼ then digits; "." and "," between digits stay in the number.
    if (isDigit(c)) {
      let first = true;
      while (i < chars.length) {
        const d = chars[i];
        if (isDigit(d)) {
          const parts = first ? [{ cell: '⠼', role: 'number' }] : [];
          parts.push({ cell: DIGITS[d], role: d });
          push(d, 'char', parts);
          first = false;
          i++;
        } else if ((d === '.' || d === ',') && isDigit(chars[i + 1] || '')) {
          push(d, 'char', [{ cell: d === '.' ? '⠲' : '⠂', role: d === '.' ? 'decimal point' : 'comma' }]);
          i++;
        } else break;
      }
      afterNumber = true;
      continue;
    }

    // A word: letters, plus apostrophes sitting between letters.
    if (baseLetter(c)) {
      let j = i;
      while (j < chars.length) {
        const w = chars[j];
        if (baseLetter(w)) j++;
        else if ((w === "'" || w === '’') && baseLetter(chars[j + 1] || '') && j > i) j++;
        else break;
      }
      const word = chars.slice(i, j);
      const letters = word.filter(baseLetter);
      const capsWord = letters.length > 1 && letters.every(isUpper);

      word.forEach((w, k) => {
        if (!baseLetter(w)) {
          push(w, 'char', [{ cell: '⠄', role: 'apostrophe' }]);
          return;
        }
        const lower = baseLetter(w).toLowerCase();
        const parts = [];
        if (capsWord && k === 0) parts.push({ cell: '⠠⠠', role: 'capital word' });
        else if (!capsWord && isUpper(w)) parts.push({ cell: '⠠', role: 'capital' });
        // After a number, a lowercase a–j would read as a digit; the grade 1 indicator prevents that.
        if (k === 0 && afterNumber && !isUpper(w) && 'abcdefghij'.includes(lower)) {
          parts.unshift({ cell: '⠰', role: 'grade 1' });
        }
        parts.push({ cell: LETTERS[lower], role: lower });
        push(w, 'char', parts);
      });
      afterNumber = false;
      i = j;
      continue;
    }

    afterNumber = false;

    if (c === '"') {
      const opening = prevIsBoundary();
      push(c, 'char', [{ cell: opening ? '⠦' : '⠴', role: opening ? 'open quote' : 'close quote' }]);
    } else if (PUNCTUATION[c]) {
      push(c, 'char', [{ cell: PUNCTUATION[c], role: describe(c) }]);
    } else if (isBraille(c)) {
      push(c, 'char', [{ cell: c, role: 'braille' }]);
    } else {
      unknown.add(c);
      push(c, 'unknown', []);
    }
    i++;
  }

  let text = '';
  let cellCount = 0;
  for (const t of tokens) {
    if (t.type === 'space') text += ' ';
    else if (t.type === 'newline') text += '\n';
    else if (t.type === 'unknown') text += t.src;
    else {
      for (const p of t.parts) {
        text += p.cell;
        cellCount += Array.from(p.cell).length;
      }
    }
  }

  return { text, tokens, cellCount, unknown: [...unknown] };
}

const NAMES = {
  ',': 'comma', ';': 'semicolon', ':': 'colon', '.': 'period', '!': 'exclamation', '?': 'question',
  "'": 'apostrophe', '-': 'hyphen', '–': 'en dash', '—': 'em dash', '(': 'open paren', ')': 'close paren',
  '/': 'slash', '@': 'at', '#': 'hash', '$': 'dollar', '%': 'percent', '&': 'ampersand', '+': 'plus', '=': 'equals',
};
function describe(c) {
  return NAMES[c] || c;
}

/** Dot numbers (1–8) raised in a single braille cell, e.g. '⠓' -> [1, 2, 5]. */
export function dotsOf(cell) {
  const bits = cell.codePointAt(0) - 0x2800;
  const dots = [];
  for (let d = 0; d < 8; d++) if (bits & (1 << d)) dots.push(d + 1);
  return dots;
}

// ---------------------------------------------------------------------------
// Braille -> text (UEB Grade 1 back-translation)
// ---------------------------------------------------------------------------

// North American Braille ASCII: the character at index n is the cell U+2800+n.
// Lets people type braille on an ordinary keyboard (",hello" -> ⠠⠓⠑⠇⠇⠕).
const BRAILLE_ASCII = ' A1B\'K2L@CIF/MSP"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=';

const LETTER_OF = Object.fromEntries(Object.entries(LETTERS).map(([l, c]) => [c, l]));
const DIGIT_OF = Object.fromEntries(Object.entries(DIGITS).map(([d, c]) => [c, d]));
const PUNCT_OF = {};
for (const [ch, cells] of Object.entries(PUNCTUATION)) if (!(cells in PUNCT_OF)) PUNCT_OF[cells] = ch;
Object.assign(PUNCT_OF, { '⠠⠤': '—', '⠴': '"', '⠦': '?', '⠘⠦': '“', '⠘⠴': '”' });
const PUNCT_LENGTHS = [...new Set(Object.keys(PUNCT_OF).map((k) => Array.from(k).length))].sort((a, b) => b - a);

/** Turn Unicode braille and/or Braille ASCII into an array of cells, ' ' and '\n'. */
export function normalizeBraille(input) {
  return Array.from(String(input).normalize('NFC')).map((c) => {
    if (c === '\n') return '\n';
    if (c === '⠀' || /\s/.test(c)) return ' ';
    if (isBraille(c)) return c;
    const n = BRAILLE_ASCII.indexOf(c.toUpperCase());
    return n > 0 ? String.fromCodePoint(0x2800 + n) : c;
  });
}

/**
 * Convert braille back to text.
 * Accepts Unicode braille cells and Braille ASCII.
 * @returns {{ text: string, braille: string, tokens: Token[], cellCount: number, unknown: string[] }}
 *   tokens use the same shape as toBraille(): { src, type, parts: [{ cell, role }] },
 *   where `src` is the text a group of cells produced.
 */
export function fromBraille(input) {
  const cells = normalizeBraille(input);
  const tokens = [];
  const unknown = new Set();
  let pending = []; // indicator cells waiting to be attached to the next symbol
  let capsWord = false;
  let capNext = false;
  let numeric = false;
  let i = 0;

  const emit = (src, type, parts) => {
    tokens.push({ src, type, parts: [...pending, ...parts] });
    pending = [];
  };
  const atWordStart = () => {
    const prev = tokens[tokens.length - 1];
    return !prev || prev.type === 'space' || prev.type === 'newline' || /[([{“‘"]$/.test(prev.src);
  };
  const resetWord = () => {
    capsWord = capNext = numeric = false;
  };

  while (i < cells.length) {
    const c = cells[i];

    if (c === ' ' || c === '\n') {
      if (pending.length) emit('', 'char', []);
      tokens.push({ src: c, type: c === ' ' ? 'space' : 'newline', parts: [] });
      resetWord();
      i++;
      continue;
    }
    if (!isBraille(c)) {
      unknown.add(c);
      emit(c, 'unknown', []);
      i++;
      continue;
    }

    // Numbers: a–j read as 1–0; "." and "," between digits stay in the number.
    if (numeric) {
      if (DIGIT_OF[c]) {
        emit(DIGIT_OF[c], 'char', [{ cell: c, role: DIGIT_OF[c] }]);
        i++;
        continue;
      }
      if ((c === '⠲' || c === '⠂') && DIGIT_OF[cells[i + 1]]) {
        emit(c === '⠲' ? '.' : ',', 'char', [{ cell: c, role: c === '⠲' ? 'decimal point' : 'comma' }]);
        i++;
        continue;
      }
      numeric = false;
    }

    // Multi-cell punctuation first (so ⠠⠤ is a dash, not capital + hyphen).
    let matched = false;
    for (const len of PUNCT_LENGTHS) {
      if (len < 2) continue;
      const seq = cells.slice(i, i + len).join('');
      if (PUNCT_OF[seq]) {
        emit(PUNCT_OF[seq], 'char', [{ cell: seq, role: describe(PUNCT_OF[seq]) }]);
        capsWord = capNext = false;
        i += len;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Indicators
    if (c === '⠠' && cells[i + 1] === '⠄') {
      pending.push({ cell: '⠠⠄', role: 'capital end' });
      capsWord = false;
      i += 2;
      continue;
    }
    if (c === '⠠' && cells[i + 1] === '⠠') {
      const passage = cells[i + 2] === '⠠';
      pending.push({ cell: passage ? '⠠⠠⠠' : '⠠⠠', role: 'capital word' });
      capsWord = true;
      i += passage ? 3 : 2;
      continue;
    }
    if (c === '⠠') {
      pending.push({ cell: '⠠', role: 'capital' });
      capNext = true;
      i++;
      continue;
    }
    if (c === '⠼') {
      pending.push({ cell: '⠼', role: 'number' });
      numeric = true;
      i++;
      continue;
    }
    if (c === '⠰') {
      pending.push({ cell: '⠰', role: 'grade 1' });
      i++;
      continue;
    }

    if (LETTER_OF[c]) {
      const letter = LETTER_OF[c];
      const out = capNext || capsWord ? letter.toUpperCase() : letter;
      emit(out, 'char', [{ cell: c, role: letter }]);
      capNext = false;
      i++;
      continue;
    }

    // Single-cell punctuation. ⠦ opens a quote at the start of a word, otherwise it is "?".
    if (c === '⠦' && atWordStart()) {
      emit('"', 'char', [{ cell: c, role: 'open quote' }]);
    } else if (PUNCT_OF[c]) {
      const ch = PUNCT_OF[c];
      emit(ch, 'char', [{ cell: c, role: c === '⠴' ? 'close quote' : describe(ch) }]);
      if (ch !== "'") capsWord = false;
    } else {
      unknown.add(c);
      emit(c, 'unknown', [{ cell: c, role: 'unknown' }]);
    }
    capNext = false;
    i++;
  }
  if (pending.length) emit('', 'char', []);

  let text = '';
  let braille = '';
  let cellCount = 0;
  for (const t of tokens) {
    text += t.src;
    if (t.type === 'space' || t.type === 'newline') braille += t.src;
    else if (!t.parts.length) braille += t.src;
    for (const p of t.parts) {
      braille += p.cell;
      cellCount += Array.from(p.cell).length;
    }
  }
  return { text, braille, tokens, cellCount, unknown: [...unknown] };
}
