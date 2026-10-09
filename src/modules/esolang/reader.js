// Universal translator reader (see src/core/translate.js): runs a pasted esoteric program and reads its output.
import { detectLanguage, loadProgram, runToEnd, hiddenText, LANGS } from './esolangs.js';
import { stripHidden } from '../../core/hidden.js';

export default function read(text) {
  const code = stripHidden(text);
  const lang = detectLanguage(code);
  if (!lang) return null;
  // The detector is generous (any text with a few of + - < > . , counts as Brainfuck),
  // so ask for code that is mostly program characters.
  const body = code.replace(/\s/g, '');
  const bf = (body.match(/[+\-<>[\].,]/g) || []).length / Math.max(1, body.length);
  if (lang === 'brainfuck' && bf < 0.85) return null;
  if (lang === 'unary' && body.length < 12) return null;
  let out;
  try {
    out = hiddenText(text, lang) ?? runToEnd(lang, loadProgram(text, lang), 3_000_000);
  } catch {
    return null;
  }
  const name = LANGS.find((l) => l.id === lang)?.name || lang;
  return { text: out, style: name, confidence: lang === 'unary' ? 0.4 : 0.9 };
}
