// The universal translator on Home: whatever a module made, the translator
// must name that module and give back exactly the original text.
import { translate } from '../../../src/core/translate.js';
import * as B from '../../../src/modules/braille/braille.js';
import * as b64 from '../../../src/modules/base64/base64.js';
import * as D from '../../../src/modules/dingbats/dingbats.js';
import * as A from '../../../src/modules/ancient/scripts.js';
import * as E from '../../../src/modules/esolang/esolangs.js';
import * as L from '../../../src/modules/layers/layers.js';
import * as J from '../../../src/modules/japanese/japanese.js';
import * as C from '../../../src/modules/cipher/cipher.js';

const ids = ['braille', 'base64', 'dingbats', 'ancient', 'esolang', 'layers', 'japanese', 'cipher'];
const ring = [];
const storage = { get: (k, fallback) => (k === 'keys' ? ring : fallback) };
const readers = await Promise.all(ids.map(async (id) => ({ meta: { id }, read: (await import(`../../../src/modules/${id}/reader.js`)).default, storage })));

const makers = {
  braille: ['braille', (t) => B.toBraille(t).text],
  base64: ['base64', (t) => b64.encodeBase64(t).text],
  ...Object.fromEntries(D.FONTS.map((f) => [`dingbats ${f.id}`, ['dingbats', (t) => D.toDingbats(t, f.id).text]])),
  ...Object.fromEntries(A.SCRIPTS.map((s) => [`ancient ${s.id}`, ['ancient', (t) => A.convert(t, s.id).text]])),
  ...Object.fromEntries(['brainfuck', 'ook', 'whitespace', 'befunge', 'malbolge'].map((l) => [`esolang ${l}`, ['esolang', (t) => { const c = E.compile(t, l); return c.copy ?? c.code; }]])),
  'layers chain': ['layers', (t, rand) => L.encodeChain(t, L.randomChain(2, 5, rand)).output],
  ...Object.fromEntries(J.STYLES.map((s) => [`japanese ${s.id}`, ['japanese', (t) => J.encode(t, s.id).text]])),
  ...Object.fromEntries(C.PICKABLE.map((s) => [`cipher ${s.id}`, ['cipher', (t, rand) => {
    const code = C.newCode(rand, { alphabet: { boxes: 'boxes', emojis: 'emojis' }[s.id] });
    const key = C.keyFor(code);
    ring.push(code);
    return s.id === 'clues' ? C.composeMessage({ note: 'Hey friend!', key, secret: t, lesson: C.lessonFor(key, t, rand) }) : `Hey friend!\n\n${C.buildStyle(s.id, key, t, rand).body}`;
  }]])),
};

export default {
  samples: ['Hello World', 'Meet me at the park at 5pm', 'Prism is cool!'],
  fuzz: 25,
  generate: (rand) => {
    const words = ['Hello', 'world', 'meet', 'me', 'at', 'the', 'park', 'secret', 'plan', 'tonight', 'Sam', '5pm', 'cool', 'café'];
    return Array.from({ length: 2 + Math.floor(rand() * 5) }, () => words[Math.floor(rand() * words.length)]).join(' ');
  },
  cases: Object.fromEntries(Object.entries(makers).map(([name, [id, make]]) => [name, (text, rand) => {
    const top = translate(make(text, rand), readers)[0];
    return top?.meta.id === id ? top.text : `(read as ${top?.meta.id ?? 'nothing'}: ${top?.text})`;
  }])),
};
