// Universal translator reader (see src/core/translate.js): katakana, hiragana, romaji mix, hankaku, kanji-look.
import { decode, hasJapanese } from './japanese.js';
import { stripHidden } from '../../core/hidden.js';

export default function read(text) {
  if (!hasJapanese(text)) return null;
  const visible = Array.from(stripHidden(text).replace(/\s/g, ''));
  const jp = visible.filter((c) => /[぀-ヿ｡-ﾟ一-鿿]/.test(c)).length / Math.max(1, visible.length);
  const res = decode(text, 'auto');
  return { text: res.text, style: res.style.name, confidence: 0.45 + 0.5 * jp };
}
