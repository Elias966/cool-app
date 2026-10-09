// The universal translator on Home: paste anything a module made and every
// module's reader tries it; the most believable reading wins.
//
// A module joins by naming a reader in its module.json ("reader": "reader.js").
// The reader's default export is
//   read(text, { storage }) → null | { text, style?, confidence, exact?, note? }
// where confidence (0–1) says how sure it is that the text is its kind, and
// `storage` is the module's own ctx.storage (Cipher Pact needs its key ring).
// A result with `text: null` and a `note` explains why it can't be read yet.

import { isWord } from './english.js';
import { reveal } from './hidden.js';

/** Load the readers of all modules that have one: [{ meta, read }]. */
export async function loadReaders(modules, storageFor) {
  const loaded = await Promise.all(
    modules
      .filter((m) => m.reader)
      .map(async (meta) => {
        try {
          const mod = await import(new URL(meta.reader, meta.baseUrl).href);
          return { meta, read: mod.default, storage: storageFor(meta.id) };
        } catch (err) {
          console.warn(`[translate] ${meta.id}: reader failed to load`, err);
          return null;
        }
      })
  );
  return loaded.filter(Boolean);
}

/**
 * How much `s` reads like text a person wrote (0–1): printable characters and,
 * for Latin script, the share of real English words. Non-Latin scripts count
 * as readable (romaji, Japanese, Arabic… are all fine results).
 */
export function readability(s) {
  const t = String(s);
  if (!t.trim()) return 0;
  const chars = Array.from(t);
  const printable = chars.filter((c) => !/[\u0000-\u0008\u000e-\u001f\u007f-\u009f�]/.test(c)).length / chars.length;
  const latin = t.toLowerCase().match(/[a-z]+/g) || [];
  const letters = chars.filter((c) => /\p{L}/u.test(c)).length;
  const otherScripts = chars.filter((c) => /\p{L}/u.test(c) && !/[a-zA-ZÀ-ɏ]/.test(c)).length;
  const words = latin.length ? latin.filter((w) => w.length === 1 ? /^[ai]$/.test(w) : isWord(w)).length / latin.length : 0;
  const scriptShare = letters ? otherScripts / letters : 0;
  const language = Math.max(words, scriptShare * 0.8);
  // Symbol soup (no letters at all) isn't a reading.
  const lettery = letters / Math.max(1, chars.filter((c) => !/\s/.test(c)).length);
  return printable * (0.35 + 0.65 * language) * (0.4 + 0.6 * Math.min(1, lettery * 1.5));
}

/**
 * Every reading of `text`, best first: [{ meta, text, style, score, confidence, exact, note }].
 * The score is the reader's confidence times how readable the result is; a
 * reading backed by an invisible copy of the original (exact) scores 1.
 */
export function translate(text, readers) {
  const input = String(text);
  // (a Whitespace program is nothing but spaces, tabs and line breaks)
  if (!input.trim() && !/[\t\n]/.test(input)) return [];
  const hidden = reveal(input).original;
  const out = [];
  for (const r of readers) {
    let res;
    try {
      res = r.read(input, { storage: r.storage });
    } catch (err) {
      console.warn(`[translate] ${r.meta.id}: reader failed`, err);
      continue;
    }
    for (const one of [].concat(res || [])) {
      if (!one) continue;
      if (one.text === null || one.text === undefined) {
        if (one.note) out.push({ meta: r.meta, text: null, style: one.style || '', note: one.note, confidence: one.confidence || 0.3, score: (one.confidence || 0.3) * 0.5, exact: false });
        continue;
      }
      const decoded = String(one.text);
      if (!decoded.trim() || decoded === input) continue;
      const exact = Boolean(one.exact) || (hidden !== null && decoded === hidden);
      const confidence = Math.max(0, Math.min(1, one.confidence ?? 0.5));
      const score = exact ? 1 : confidence * (0.3 + 0.7 * readability(decoded));
      out.push({ meta: r.meta, text: decoded, style: one.style || '', note: one.note || '', confidence, score, exact });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
