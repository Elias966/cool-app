import { STYLES, keyFor, newCode, buildStyle, parseInline, composeMessage, lessonFor, decodeWith, secretLine, findKey } from '../../../src/modules/cipher/cipher.js';

// Seal a secret in every message style and read it back like Read mode does:
// key-inside styles parse the message, Clues finds the key in a key ring.
const ring = Array.from({ length: 6 }, (_, i) => `RING-KEY-${100 + i}`);
const alphabetFor = { boxes: 'boxes', emojis: 'emojis' };
const seal = (style) => (secret, rand) => {
  const code = newCode(rand, { alphabet: alphabetFor[style] });
  const key = keyFor(code);
  if (style === 'clues') {
    const msg = composeMessage({ note: 'Hey friend! A new code.', key, secret, lesson: lessonFor(key, secret, rand) });
    const found = findKey(msg, [...ring, code]);
    if (found?.key.code !== key.code) throw new Error('key not found in the ring');
    return decodeWith(found.key, secretLine(msg)).text;
  }
  return parseInline(`Hey friend! A new code.\n\n${buildStyle(style, key, secret, rand).body}`)?.secret;
};

export default {
  samples: ['meet me at the park', 'Hello World 😀', "Don't tell Sam, ok?", 'the 🍕 is at 5', 'line one\nline two'],
  generate: (rand) => {
    const pool = ['Hello', 'world', 'I', 'meet', 'Sam', "Don't", 'café', 'ÉCOLE', '5pm', '42-17', '!', '?', ',', '  ', '\n', '😀', '🍕', '🟥', 'Hi', 'hi', 'the', 'a/b'];
    const n = 1 + Math.floor(rand() * 7);
    return Array.from({ length: n }, () => pool[Math.floor(rand() * pool.length)]).join(rand() < 0.7 ? ' ' : '').trim() || 'x';
  },
  cases: Object.fromEntries(STYLES.map((s) => [s.id, seal(s.id)])),
};
