// Universal translator reader (see src/core/translate.js): Unicode braille.
import { fromBraille } from './braille.js';
import { stripHidden } from '../../core/hidden.js';

export default function read(text) {
  const chars = Array.from(stripHidden(text).replace(/\s/g, ''));
  const cells = chars.filter((c) => c >= '⠀' && c <= '⣿').length;
  if (!chars.length || cells / chars.length < 0.6) return null;
  return { text: fromBraille(text).text, style: 'UEB Grade 1', confidence: 0.55 + 0.45 * (cells / chars.length) };
}
