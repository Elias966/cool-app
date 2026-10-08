// Text -> Base64 (RFC 4648). Text is encoded as UTF-8 first, so any language
// and emoji work. Besides the result, it returns every 3-byte group with its
// four 6-bit values, which the page uses to draw the encoding step by step.

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export const URL_ALPHABET = `${ALPHABET.slice(0, 62)}-_`;

/**
 * @param {string} text
 * @param {{ urlSafe?: boolean, pad?: boolean }} options
 * @returns {{ text: string, bytes: Uint8Array, groups: Group[] }}
 *   groups: { bytes: number[], sextets: number[], chars: string, padding: number }
 *   - bytes:   the 1–3 input bytes of this group
 *   - sextets: their 2–4 six-bit values
 *   - chars:   the output characters (including '=' padding when enabled)
 *   - padding: how many '=' this group needs (0–2)
 */
export function encodeBase64(text, options) {
  return encodeBytes(new TextEncoder().encode(String(text)), options);
}

/** Same as encodeBase64, for raw bytes. */
export function encodeBytes(bytes, { urlSafe = false, pad = true } = {}) {
  const abc = urlSafe ? URL_ALPHABET : ALPHABET;
  const groups = [];
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const count = Math.min(3, bytes.length - i);
    const b0 = bytes[i];
    const b1 = count > 1 ? bytes[i + 1] : 0;
    const b2 = count > 2 ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    const sextets = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63].slice(0, count + 1);
    const padding = 3 - count;
    const chars = sextets.map((s) => abc[s]).join('') + (pad ? '='.repeat(padding) : '');
    out += chars;
    groups.push({ bytes: Array.from(bytes.subarray(i, i + count)), sextets, chars, padding });
  }
  return { text: out, bytes, groups };
}

/**
 * Base64 -> text. Accepts standard and URL-safe alphabets, missing padding,
 * spaces and line breaks, and "data:…;base64," URIs.
 * @returns {{ ok: true, bytes: Uint8Array, text: string, utf8: boolean, urlSafe: boolean, pad: boolean }
 *          | { ok: false, error: string }}
 *   utf8 is false when the bytes aren't valid UTF-8 text (binary data).
 */
export function decodeBase64(input) {
  let raw = String(input).trim();
  const uri = /^data:[^,]*;base64,/i.exec(raw);
  if (uri) raw = raw.slice(uri[0].length);
  raw = raw.replace(/\s+/g, '');
  const urlSafe = /[-_]/.test(raw);
  const pad = /=$/.test(raw);
  const body = raw.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const bad = [...new Set(body.match(/[^A-Za-z0-9+/]/g) || [])];
  if (bad.length) return { ok: false, error: `These characters aren't Base64: ${bad.slice(0, 8).join(' ')}` };
  if (body.length % 4 === 1) return { ok: false, error: 'The length is off by one character, so this can’t be complete Base64' };
  const bytes = [];
  let buf = 0;
  let bits = 0;
  for (const ch of body) {
    buf = ((buf << 6) | ALPHABET.indexOf(ch)) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 255);
    }
  }
  const u8 = Uint8Array.from(bytes);
  let text = '';
  let utf8 = true;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch {
    utf8 = false;
  }
  return { ok: true, bytes: u8, text, utf8, urlSafe, pad };
}
