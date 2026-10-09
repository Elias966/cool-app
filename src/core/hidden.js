// An invisible copy of the original text, carried inside an encoded result so
// that decoding gives back exactly what was typed, even for styles that lose
// information on screen (katakana sound-alikes, runes that share one sign for
// c, k and q, letters without case).
//
// It is written with Unicode variation selectors (U+E0100–U+E01EF): characters
// that fonts never draw and that survive copy and paste. A marker comes first,
// then one selector per UTF-8 byte (bytes 238–255 take two). Decoders only trust
// it when encoding it again gives the visible text, and fall back to reading the
// visible text when an app stripped it.

const BASE = 0xe0100;
const MARK = 0xe01ef;
const ESC = 0xe01ee;
const SELECTOR = /[\u{E0100}-\u{E01EF}]/u;

/** The invisible copy of `text`. */
export function hide(text) {
  let out = String.fromCodePoint(MARK);
  for (const b of new TextEncoder().encode(text)) {
    out += b < 238 ? String.fromCodePoint(BASE + b) : String.fromCodePoint(ESC, BASE + b - 238);
  }
  return out;
}

/**
 * `visible` with the invisible copy of `original` tucked in after its first
 * character (and after any selectors already attached to it, such as Cipher
 * Pact's case marks, so they stay with their symbol).
 */
export function withHidden(visible, original) {
  const chars = Array.from(visible);
  let i = Math.min(1, chars.length);
  while (i < chars.length && SELECTOR.test(chars[i])) i++;
  return chars.slice(0, i).join('') + hide(original) + chars.slice(i).join('');
}

/** Remove the invisible copy (for counting characters or reading the visible text). */
export const stripHidden = (text) => text.replace(/\u{E01EF}[\u{E0100}-\u{E01EE}]*/gu, '');

/** { visible, original } where original is the hidden text, or null when there is none. */
export function reveal(text) {
  const visible = stripHidden(text);
  const chars = Array.from(text);
  const at = chars.findIndex((c) => c.codePointAt(0) === MARK);
  if (at < 0) return { visible, original: null };
  const bytes = [];
  for (let i = at + 1; i < chars.length && SELECTOR.test(chars[i]); i++) {
    const v = chars[i].codePointAt(0);
    if (v === MARK) break;
    if (v === ESC) bytes.push(238 + (chars[++i]?.codePointAt(0) ?? BASE) - BASE);
    else bytes.push(v - BASE);
  }
  try {
    return { visible, original: new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)) };
  } catch {
    return { visible, original: null };
  }
}
