// Universal translator reader (see src/core/translate.js): runes, hieroglyphs, Ogham, cuneiform, Greek, Latin.
import { decode, scriptById } from './scripts.js';
import { stripHidden } from '../../core/hidden.js';

export default function read(text) {
  const visible = stripHidden(text);
  const res = decode(text);
  const solid = Array.from(visible.replace(/\s/g, '')).length;
  if (!solid) return null;
  const signs = res.tokens.filter((t) => (t.kind === 'letter' || t.kind === 'number' || t.kind === 'mark') && t.script && t.script !== 'latin');
  const share = signs.reduce((n, t) => n + Array.from(t.src).length, 0) / solid;
  const name = res.script ? scriptById(res.script)?.name : 'Ancient script';
  if (share >= 0.5) return { text: res.text, style: name, confidence: 0.5 + 0.45 * share, exact: res.exact };
  // Latin inscriptions are plain capitals: only believable with the interpunct (·) or a hidden copy.
  if (res.script === 'latin' && (res.exact || /·/.test(visible))) return { text: res.text, style: name, confidence: res.exact ? 0.9 : 0.45, exact: res.exact };
  return null;
}
