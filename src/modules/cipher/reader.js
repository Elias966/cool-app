// Universal translator reader (see src/core/translate.js): Cipher Pact messages.
// Key-inside styles read themselves; sealed (🔑 Clues) messages need a key from
// the key ring this module keeps in its storage.
import { parseInline, findKey, decodeWith, secretLine, styleById } from './cipher.js';

export default function read(text, { storage } = {}) {
  const inline = parseInline(text);
  if (inline) return { text: inline.secret, style: styleById(inline.style).name, confidence: 0.95 };
  const keys = storage?.get('keys', []) || [];
  const found = findKey(text, keys);
  if (found) {
    return { text: decodeWith(found.key, secretLine(text)).text.trim(), style: `key ${found.key.code}`, confidence: 0.5 + 0.35 * found.coverage + (found.clueMatch ? 0.12 : 0) };
  }
  if (/🔒/u.test(text)) return { text: null, style: 'sealed message', confidence: 0.6, note: 'Sealed with a Cipher Pact key that is not in your key ring: open Cipher Pact, Read, and type the key code your friend sent.' };
  return null;
}
