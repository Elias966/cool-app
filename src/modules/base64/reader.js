// Universal translator reader (see src/core/translate.js): Base64 (also URL-safe and data: URIs).
import { decodeBase64 } from './base64.js';
import { stripHidden } from '../../core/hidden.js';

export default function read(text) {
  const t = stripHidden(text).trim();
  if (t.length < 4 || !/^(data:[^,]*,)?[A-Za-z0-9+/_=\s-]+$/.test(t)) return null;
  const r = decodeBase64(t);
  if (!r.ok || !r.utf8 || !r.text) return null;
  // Short plain words are valid Base64 too ("Test"), so short input is less likely to be it.
  const confidence = /[=+/]$|^data:/.test(t) || t.length >= 12 ? 0.85 : 0.45;
  return { text: r.text, style: r.urlSafe ? 'URL-safe Base64' : 'Base64', confidence };
}
