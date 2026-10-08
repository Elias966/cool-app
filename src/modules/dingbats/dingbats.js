// Text -> symbol fonts. Fonts like Wingdings work by drawing a picture where a
// letter would be: "A" in Wingdings is ✌. Those fonts aren't on most systems,
// so each character is swapped for the Unicode symbol the font would draw.
// The result is ordinary text that looks the same anywhere and can be pasted.

import { MAPS } from './maps.js';

export const FONTS = [
  {
    id: 'wingdings',
    name: 'Wingdings',
    maker: 'Microsoft, 1990',
    blurb: 'Hands, mail, computers, crosses and the zodiac. Designed by Charles Bigelow and Kris Holmes.',
    fact: 'Ever seen a stray “J” in an email? Outlook turns :) into the Wingdings J, a ☺ that shows up as a plain J everywhere else.',
    sample: 'JQN',
  },
  {
    id: 'webdings',
    name: 'Webdings',
    maker: 'Microsoft, 1997',
    blurb: 'Buildings, transport, media controls and little web icons.',
    fact: 'Webdings let early web pages show small pictures using nothing but text.',
    sample: 'Hbe',
  },
  {
    id: 'symbol',
    name: 'Symbol',
    maker: 'Adobe, 1980s',
    blurb: 'Greek letters and math signs. Type “a” and you get α, “p” gives π.',
    fact: 'One of the core PostScript fonts built into laser printers, it put Greek and math on paper for decades.',
    sample: 'abp',
  },
  {
    id: 'zapf',
    name: 'Zapf Dingbats',
    maker: 'Hermann Zapf, 1978',
    blurb: 'Stars, flowers, ticks, crosses and arrows.',
    fact: 'Unicode’s whole Dingbats block (U+2700) was laid out to match this font.',
    sample: 'H4v',
  },
];

const hex = (cp) => cp.toString(16).toUpperCase().padStart(2, '0');

/** "WHITE SMILING FACE" -> "White smiling face" */
export function prettyName(name) {
  return name ? name.charAt(0) + name.slice(1).toLowerCase() : '';
}

/** What one character becomes in a font: { glyph, name, code, mapped }. */
export function glyphFor(ch, fontId) {
  const cp = ch.codePointAt(0);
  const key = cp <= 0xff ? hex(cp) : null;
  const hit = key && MAPS[fontId][key];
  if (hit) return { glyph: hit[0], name: prettyName(hit[1]), code: `0x${key}`, mapped: true };
  return {
    glyph: ch,
    name: cp >= 0x21 && cp <= 0x7e ? 'Unchanged in this font' : 'Not in this font, kept as is',
    code: key ? `0x${key}` : `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
    mapped: false,
  };
}

// Symbol -> key, per font, for turning symbols back into text.
const REVERSE = Object.fromEntries(
  Object.entries(MAPS).map(([font, map]) => {
    const back = new Map();
    for (const [key, [glyph, name]] of Object.entries(map)) {
      if (!back.has(glyph)) back.set(glyph, { ch: String.fromCharCode(parseInt(key, 16)), name: prettyName(name), code: `0x${key}` });
    }
    return [font, back];
  })
);

/**
 * Symbols -> text. With fontId 'auto', the font whose map matches the most
 * symbols is used.
 * @returns {{ text, font, auto, hits, total, scores, tokens: Array<{src, type, out, name?, code?, mapped?}> }}
 */
export function fromDingbats(input, fontId = 'auto') {
  const clean = String(input).replace(/[︎️]/g, '');
  const symbols = Array.from(clean).filter((c) => !/\s/.test(c));
  const scores = FONTS.map((f) => ({ id: f.id, hits: symbols.filter((c) => REVERSE[f.id].has(c)).length }));
  const best = [...scores].sort((a, b) => b.hits - a.hits)[0];
  const font = fontId === 'auto' ? best.id : fontId;
  const tokens = Array.from(clean, (c) => {
    if (c === '\n' || c === ' ' || c === '\t') return { src: c, out: c, type: c === '\n' ? 'newline' : 'space' };
    const hit = REVERSE[font].get(c);
    return hit
      ? { src: c, out: hit.ch, type: 'glyph', name: hit.name, code: hit.code, mapped: true }
      : { src: c, out: c, type: 'glyph', name: 'Not in this font, kept as is', code: '', mapped: false };
  });
  return {
    text: tokens.map((t) => t.out).join(''),
    font,
    auto: fontId === 'auto',
    hits: scores.find((s) => s.id === font).hits,
    total: symbols.length,
    scores,
    tokens,
  };
}

/**
 * @returns {{ text: string, tokens: Array<{src, type, glyph?, name?, code?, mapped?}> }}
 *   type is 'glyph' | 'space' | 'newline'
 */
export function toDingbats(text, fontId) {
  const tokens = [];
  let out = '';
  for (const ch of String(text)) {
    if (ch === '\n' || ch === ' ' || ch === '\t') {
      tokens.push({ src: ch, type: ch === '\n' ? 'newline' : 'space' });
      out += ch;
      continue;
    }
    const g = glyphFor(ch, fontId);
    tokens.push({ src: ch, type: 'glyph', ...g });
    out += g.glyph;
  }
  return { text: out, tokens };
}
