// Universal translator reader (see src/core/translate.js): Wingdings, Webdings, Symbol, Zapf Dingbats.
import { FONTS, fromDingbats } from './dingbats.js';

export default function read(text) {
  const r = fromDingbats(text, 'auto');
  if (!r.total || r.hits / r.total < 0.6) return null;
  const font = FONTS.find((f) => f.id === r.font);
  return { text: r.text, style: font ? font.name : r.font, confidence: 0.45 + 0.45 * (r.hits / r.total) };
}
