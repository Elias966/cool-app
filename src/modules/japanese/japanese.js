// Japanese scripts: five ways to write Latin text with Japanese characters,
// each with a decoder. Pure functions only (no DOM), so Node can test them.
//
//   katakana   English sounded out the way Japanese borrows words (ハロー)
//   hiragana   letter-for-letter hiragana cipher (uppercase → katakana)
//   mixed      romaji syllables become kana, the rest stays Latin (へllお)
//   hankaku    halfwidth katakana cipher, the "code rain" look (ﾎｴﾗﾗｵ)
//   kanjilook  Latin letters drawn with look-alike kanji (廾乇乚乚口)
//
// Decoding kana that isn't one of the ciphers is romaji transliteration
// (Hepburn), so any kana text can be read back.

import { englishWords, isCommon, capitalsAt } from '../../core/english.js';
import { withHidden, reveal, stripHidden } from '../../core/hidden.js';

// ------------------------------------------------------------- kana tables
const ROMAJI = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  sa: 'さ', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  ta: 'た', chi: 'ち', tsu: 'つ', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wo: 'を',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  za: 'ざ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  da: 'だ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ', bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  // the extended syllables loanwords use
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', ti: 'てぃ', di: 'でぃ', tu: 'とぅ', du: 'どぅ',
  wi: 'うぃ', we: 'うぇ', she: 'しぇ', che: 'ちぇ', je: 'じぇ', ye: 'いぇ', tsa: 'つぁ',
};
// Kana → romaji: the inverse, plus spellings the encoder never writes.
const KANA = Object.fromEntries(Object.entries(ROMAJI).map(([r, k]) => [k, r]));
Object.assign(KANA, {
  'ぢ': 'ji', 'づ': 'zu', 'ゐ': 'wi', 'ゑ': 'we', 'ゔ': 'vu', 'ゎ': 'wa', 'ゕ': 'ka', 'ゖ': 'ke',
  'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo',
  'うぉ': 'wo', 'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo', 'ぢゃ': 'ja', 'ぢゅ': 'ju', 'ぢょ': 'jo',
  'ん': 'n',
});
const KATA_ONLY = { 'ヷ': 'va', 'ヸ': 'vi', 'ヹ': 've', 'ヺ': 'vo' };
const SMALL = new Set('ゃゅょぁぃぅぇぉゎ');
const MACRON = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };

const isHira = (c) => c >= 'ぁ' && c <= 'ゖ';
const isKata = (c) => (c >= 'ァ' && c <= 'ヺ') || c === 'ー';
const isKana = (c) => isHira(c) || isKata(c) || c === 'ー';
const toHira = (c) => (c >= 'ァ' && c <= 'ヶ' ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c);
export const toKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

/** One run of kana (no other characters) → Hepburn romaji. */
function runToRomaji(run, { macrons = true } = {}) {
  const chars = Array.from(run);
  let out = '';
  let double = false;
  for (let k = 0; k < chars.length; k++) {
    const c = chars[k];
    if (c === 'ー') {
      const last = out.at(-1);
      if (last && MACRON[last]) out = macrons ? out.slice(0, -1) + MACRON[last] : out + last;
      continue;
    }
    if (KATA_ONLY[c]) {
      out += KATA_ONLY[c];
      continue;
    }
    const h = toHira(c);
    if (h === 'っ') {
      double = true;
      continue;
    }
    const next = chars[k + 1] ? toHira(chars[k + 1]) : '';
    let r;
    if (next && SMALL.has(next) && KANA[h + next]) {
      r = KANA[h + next];
      k++;
    } else {
      r = KANA[h] ?? c;
    }
    // ん before a vowel or y is written n' so it can't be misread (kin'en).
    if (h === 'ん' && next && /^[aeiouy]/.test(KANA[next] ?? '')) r = "n'";
    if (double) {
      if (/^[bcdfghjkmprstvwz]/.test(r)) r = (r.startsWith('ch') ? 't' : r[0]) + r;
      double = false;
    }
    out += r;
  }
  return out;
}

// Japanese punctuation used by the encoders, and back.
const PUNCT = { '.': '。', ',': '、', '!': '！', '?': '？', ':': '：', ';': '；', '(': '（', ')': '）', '~': '〜' };
const PUNCT_BACK = Object.fromEntries(Object.entries(PUNCT).map(([a, b]) => [b, a]));

/**
 * Kana → romaji for any text. Kana runs become romaji; a katakana run that
 * starts a word is capitalised (that is how the mixed style marks capitals).
 * Everything else is kept, so kanji and Latin pass through untouched.
 */
export function kanaToRomaji(text, { macrons = true, capitalize = true } = {}) {
  const chars = Array.from(text);
  const tokens = [];
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (isKana(c) && !(c === 'ー' && !isKana(chars[i + 1] ?? '') && !isKana(chars[i - 1] ?? ''))) {
      let j = i;
      const kata = isKata(c) && c !== 'ー';
      while (j < chars.length && isKana(chars[j]) && (chars[j] === 'ー' || isKata(chars[j]) === kata || j === i)) j++;
      const run = chars.slice(i, j).join('');
      let out = runToRomaji(run, { macrons });
      const atStart = !/[A-Za-z]/.test(chars[i - 1] ?? '');
      if (capitalize && atStart && isKata(chars[i]) && chars[i] !== 'ー') out = out.charAt(0).toUpperCase() + out.slice(1);
      // Japanese has no spaces; a change of script (kanji, katakana, hiragana)
      // is the closest thing to a word break, so the reading gets one there.
      if (/[\u4e00-\u9fff]/.test(chars[i - 1] ?? '') || isKana(chars[i - 1] ?? '')) out = ` ${out}`;
      if (/[\u4e00-\u9fff]/.test(chars[j] ?? '')) out += ' ';
      tokens.push({ src: run, out, jp: true });
      i = j;
    } else {
      let out = c === '・' ? ' ' : PUNCT_BACK[c] ?? c;
      // 、。！？ carry their own spacing in Japanese; Latin needs a space after them.
      if (PUNCT_BACK[c] && /[、。！？：；]/.test(c) && chars[i + 1] && !/[\s、。！？：；）]/.test(chars[i + 1])) out += ' ';
      push(tokens, c, out);
      i++;
    }
  }
  return finish(tokens);
}

// Consecutive plain characters are merged into one token.
function push(tokens, src, out, jp = false) {
  const last = tokens.at(-1);
  if (!jp && last && !last.jp) {
    last.src += src;
    last.out += out;
  } else {
    tokens.push({ src, out, jp });
  }
}
const finish = (tokens) => ({ text: tokens.map((t) => t.out).join(''), tokens });

// ------------------------------------------------------- romaji → kana
const KEYS = Object.keys(ROMAJI).sort((a, b) => b.length - a.length);
const VOWEL = /[aeiou]/;

/** Lower-case romaji word → kana pieces; letters that fit no syllable stay Latin. */
function romajiPieces(word) {
  const pieces = [];
  let i = 0;
  const syllableAt = (k) => KEYS.find((key) => word.startsWith(key, k));
  while (i < word.length) {
    const c = word[i];
    // doubled consonant (kitte) or t before ch (matcha) → small tsu
    if (/[bcdfghjkmprstwz]/.test(c) && (word[i + 1] === c || (c === 't' && word.startsWith('ch', i + 1))) && syllableAt(i + 1)) {
      pieces.push({ src: c, kana: 'っ' });
      i++;
      continue;
    }
    const key = syllableAt(i);
    if (key) {
      pieces.push({ src: key, kana: ROMAJI[key] });
      i += key.length;
    } else if (c === 'n') {
      pieces.push({ src: 'n', kana: 'ん' });
      i++;
    } else {
      pieces.push({ src: c, kana: null });
      i++;
    }
  }
  return pieces;
}

// --------------------------------------------------------------- mixed
function mixedWord(word) {
  const lower = word.toLowerCase();
  const capital = word[0] !== lower[0] && word.slice(1) === lower.slice(1);
  if (word !== lower && !capital) return null; // ALL CAPS or camelCase: keep as is
  let out = '';
  const parts = [];
  for (const p of romajiPieces(lower)) {
    if (p.kana) {
      const k = capital ? toKata(p.kana) : p.kana;
      out += k;
      parts.push({ src: p.src, out: k, jp: true });
    } else {
      // Latin letters keep their original case (only the first can be upper).
      const ch = out === '' && capital ? word[0] : p.src;
      out += ch;
      parts.push({ src: ch, out: ch, jp: false });
    }
  }
  // Only keep the conversion if it reads back exactly.
  return kanaToRomaji(out).text === word ? parts : null;
}

function encodeMixed(text) {
  const tokens = [];
  for (const piece of text.split(/([A-Za-z]+)/)) {
    if (!piece) continue;
    const parts = /^[A-Za-z]+$/.test(piece) ? mixedWord(piece) : null;
    if (!parts) {
      push(tokens, piece, piece);
      continue;
    }
    // Group a word's kana into one ruby token per syllable run.
    for (const p of parts) {
      if (p.jp) tokens.push({ src: p.src, out: p.out, jp: true });
      else push(tokens, p.src, p.out);
    }
  }
  // Tokens here are written in the encode direction: out is Japanese.
  return finish(tokens);
}

// ------------------------------------------------------------ ciphers
const HIRA_CIPHER = {
  a: 'あ', b: 'ぶ', c: 'ち', d: 'ど', e: 'え', f: 'ふ', g: 'ぐ', h: 'ほ', i: 'い', j: 'じ', k: 'く', l: 'ろ', m: 'む',
  n: 'ぬ', o: 'お', p: 'ぷ', q: 'け', r: 'る', s: 'す', t: 'と', u: 'う', v: 'べ', w: 'わ', x: 'ぞ', y: 'や', z: 'ず',
};
const KANJI_DIGITS = '〇一二三四五六七八九';
const HANKAKU_LOWER = 'ｱﾍｼﾃｴﾌｹﾎｲﾁｶﾗﾏﾅｵﾊｸﾙｻﾀｳﾇﾜｿﾔｽ';
const HANKAKU_UPPER = 'ｧﾋｷﾄｪﾆｺﾉｨﾂｾﾘﾐﾝｫﾑﾒﾚﾓﾕｩﾖｦｭｬｮ';
const HANKAKU_PUNCT = { '.': '｡', ',': '､' };
const KANJI_LOOK = '卂乃匚刀乇千厶廾工亅长乚爪几口卩勺尺丂丁凵丷山乂丫乙';
const ABC = 'abcdefghijklmnopqrstuvwxyz';

function cipher(encodeMap) {
  const back = new Map(Object.entries(encodeMap).map(([a, b]) => [b, a]));
  return {
    encode(text) {
      const tokens = [];
      for (const c of text) {
        const g = encodeMap[c];
        if (g) tokens.push({ src: c, out: g, jp: true });
        else push(tokens, c, c);
      }
      return finish(tokens);
    },
    decode(text) {
      const tokens = [];
      for (const c of text) {
        const l = back.get(c);
        if (l !== undefined) tokens.push({ src: c, out: l, jp: true });
        else push(tokens, c, c);
      }
      return finish(tokens);
    },
    glyphs: new Set(back.keys()),
  };
}

const hiraganaCipher = cipher({
  ...HIRA_CIPHER,
  ...Object.fromEntries(Object.entries(HIRA_CIPHER).map(([l, k]) => [l.toUpperCase(), toKata(k)])),
  ...Object.fromEntries(Array.from(KANJI_DIGITS, (k, d) => [String(d), k])),
  ...PUNCT,
});
const hankakuCipher = cipher({
  ...Object.fromEntries(Array.from(ABC, (l, i) => [l, HANKAKU_LOWER[i]])),
  ...Object.fromEntries(Array.from(ABC, (l, i) => [l.toUpperCase(), HANKAKU_UPPER[i]])),
  ...HANKAKU_PUNCT,
});
// Kanji-look has one glyph per letter, so case can't survive: both cases map
// to the same glyph and decode in sentence case.
const kanjiLookCipher = (() => {
  const lower = Object.fromEntries(Array.from(ABC, (l, i) => [l, KANJI_LOOK[i]]));
  const c = cipher(lower);
  const enc = cipher({ ...lower, ...Object.fromEntries(Array.from(ABC, (l, i) => [l.toUpperCase(), KANJI_LOOK[i]])) });
  return { ...c, encode: enc.encode };
})();

// ---------------------------------------------------- katakana phonetics
// Common words with their real loanword spelling. Anything else goes
// through the spelling rules in englishToKana().
const WORDS = {
  hello: 'ハロー', hi: 'ハイ', hey: 'ヘイ', bye: 'バイ', goodbye: 'グッバイ', world: 'ワールド', love: 'ラブ',
  i: 'アイ', you: 'ユー', me: 'ミー', my: 'マイ', we: 'ウィー', they: 'ゼイ', he: 'ヒー', she: 'シー', it: 'イット',
  is: 'イズ', am: 'アム', are: 'アー', was: 'ワズ', be: 'ビー', the: 'ザ', a: 'ア', an: 'アン', and: 'アンド', or: 'オア',
  of: 'オブ', to: 'トゥー', in: 'イン', on: 'オン', at: 'アット', for: 'フォー', with: 'ウィズ', this: 'ディス', that: 'ザット',
  what: 'ワット', who: 'フー', how: 'ハウ', why: 'ワイ', where: 'ウェア', when: 'ウェン', yes: 'イエス', no: 'ノー',
  not: 'ノット', do: 'ドゥー', "don't": 'ドント', can: 'キャン', will: 'ウィル', your: 'ユア', our: 'アワー',
  good: 'グッド', bad: 'バッド', nice: 'ナイス', cool: 'クール', happy: 'ハッピー', day: 'デイ', night: 'ナイト',
  morning: 'モーニング', time: 'タイム', home: 'ホーム', house: 'ハウス', school: 'スクール', friend: 'フレンド',
  family: 'ファミリー', game: 'ゲーム', music: 'ミュージック', movie: 'ムービー', coffee: 'コーヒー', tea: 'ティー',
  water: 'ウォーター', milk: 'ミルク', bread: 'ブレッド', cake: 'ケーキ', ice: 'アイス', cream: 'クリーム', pizza: 'ピザ',
  chocolate: 'チョコレート', beer: 'ビール', computer: 'コンピューター', phone: 'フォン', internet: 'インターネット',
  camera: 'カメラ', television: 'テレビ', radio: 'ラジオ', car: 'カー', bus: 'バス', taxi: 'タクシー', train: 'トレイン',
  hotel: 'ホテル', restaurant: 'レストラン', shop: 'ショップ', park: 'パーク', city: 'シティ', street: 'ストリート',
  table: 'テーブル', door: 'ドア', window: 'ウィンドウ', book: 'ブック', pen: 'ペン', paper: 'ペーパー', card: 'カード',
  gift: 'ギフト', present: 'プレゼント', party: 'パーティー', dance: 'ダンス', song: 'ソング', star: 'スター', moon: 'ムーン',
  sun: 'サン', sky: 'スカイ', rain: 'レイン', snow: 'スノー', fire: 'ファイア', light: 'ライト', dark: 'ダーク',
  red: 'レッド', blue: 'ブルー', green: 'グリーン', white: 'ホワイト', black: 'ブラック', pink: 'ピンク', gold: 'ゴールド',
  dog: 'ドッグ', cat: 'キャット', bird: 'バード', fish: 'フィッシュ', lion: 'ライオン', tiger: 'タイガー', dragon: 'ドラゴン',
  monster: 'モンスター', robot: 'ロボット', hero: 'ヒーロー', king: 'キング', queen: 'クイーン', prince: 'プリンス',
  princess: 'プリンセス', magic: 'マジック', power: 'パワー', speed: 'スピード', secret: 'シークレット',
  message: 'メッセージ', code: 'コード', key: 'キー', password: 'パスワード', data: 'データ', system: 'システム',
  program: 'プログラム', apple: 'アップル', banana: 'バナナ', orange: 'オレンジ', lemon: 'レモン', tomato: 'トマト',
  potato: 'ポテト', salad: 'サラダ', soup: 'スープ', sandwich: 'サンドイッチ', hamburger: 'ハンバーガー', cheese: 'チーズ',
  juice: 'ジュース', team: 'チーム', sport: 'スポーツ', soccer: 'サッカー', tennis: 'テニス', ball: 'ボール', goal: 'ゴール',
  number: 'ナンバー', one: 'ワン', three: 'スリー', five: 'ファイブ', six: 'シックス', seven: 'セブン', eight: 'エイト',
  nine: 'ナイン', ten: 'テン', big: 'ビッグ', small: 'スモール', new: 'ニュー', old: 'オールド', hot: 'ホット', cold: 'コールド',
  fast: 'ファスト', slow: 'スロー', best: 'ベスト', first: 'ファースト', last: 'ラスト', free: 'フリー', open: 'オープン',
  start: 'スタート', stop: 'ストップ', play: 'プレイ', work: 'ワーク', help: 'ヘルプ', thanks: 'サンクス', thank: 'サンク',
  please: 'プリーズ', sorry: 'ソーリー', okay: 'オーケー', ok: 'オーケー', welcome: 'ウェルカム', man: 'マン', woman: 'ウーマン',
  boy: 'ボーイ', girl: 'ガール', baby: 'ベイビー', mother: 'マザー', father: 'ファーザー', brother: 'ブラザー', sister: 'シスター',
  teacher: 'ティーチャー', student: 'スチューデント', doctor: 'ドクター', japan: 'ジャパン', japanese: 'ジャパニーズ',
  english: 'イングリッシュ', america: 'アメリカ', tokyo: 'トーキョー', anime: 'アニメ', prism: 'プリズム', text: 'テキスト',
  letter: 'レター', word: 'ワード', language: 'ランゲージ', script: 'スクリプト', meet: 'ミート', bridge: 'ブリッジ',
  midnight: 'ミッドナイト', order: 'オーダー', keyboard: 'キーボード', mouse: 'マウス', screen: 'スクリーン', click: 'クリック',
  online: 'オンライン', video: 'ビデオ', photo: 'フォト', image: 'イメージ', design: 'デザイン', style: 'スタイル',
  beautiful: 'ビューティフル', cute: 'キュート', sweet: 'スイート', dream: 'ドリーム', future: 'フューチャー', life: 'ライフ',
  peace: 'ピース', smile: 'スマイル', heart: 'ハート', kiss: 'キス', christmas: 'クリスマス', birthday: 'バースデー',
  holiday: 'ホリデー', travel: 'トラベル', ticket: 'チケット', money: 'マネー', see: 'シー', go: 'ゴー', come: 'カム',
  get: 'ゲット', make: 'メイク', like: 'ライク', know: 'ノウ', want: 'ウォント', all: 'オール', so: 'ソー', up: 'アップ',
  out: 'アウト', now: 'ナウ', just: 'ジャスト', here: 'ヒア', there: 'ゼア', very: 'ベリー', match: 'マッチ', live: 'ライブ', people: 'ピープル', super: 'スーパー', create: 'クリエイト',
  fight: 'ファイト', ninja: 'ニンジャ', sushi: 'スシ', samurai: 'サムライ', sword: 'ソード', shadow: 'シャドウ',
};
const REVERSE = new Map();
for (const [en, kana] of Object.entries(WORDS)) if (!REVERSE.has(kana)) REVERSE.set(kana, en);

// Extra syllables the spelling rules produce (si → シ, ti → ティ …).
const PHONETIC = { ...ROMAJI, si: 'し', zi: 'じ', hu: 'ふ', yi: 'い', wu: 'う', wo: 'うぉ' };
const PHONETIC_KEYS = Object.keys(PHONETIC).sort((a, b) => b.length - a.length);
// The same keys grouped by first letter (longest first), so a lookup only scans a few.
const PHONETIC_BY_FIRST = new Map();
for (const k of PHONETIC_KEYS) (PHONETIC_BY_FIRST.get(k[0]) ?? PHONETIC_BY_FIRST.set(k[0], []).get(k[0])).push(k);

/** English spelling → a rough romaji-like pronunciation. */
function englishToPseudo(word) {
  let s = word.toLowerCase().replace(/'/g, '');
  // Spelled-out long vowels first: later rules write oo and ee themselves.
  s = s.replace(/oo/g, 'uu').replace(/ee|ea/g, 'ii');
  // Endings with a fixed sound go next, before silent e can touch them.
  const endings = [
    // ower → aWaa: the capital W hides it from the aw rule below; lower-cased at the end.
    [/ower/g, 'aWaa'], [/ation/g, 'eeshon'], [/tion/g, 'shon'], [/sion/g, 'jon'], [/ture/g, 'chaa'], [/dge/g, 'j'],
    [/ough/g, 'oo'], [/augh/g, 'oo'], [/igh/g, 'ai'], [/([^aeiou])le$/g, '$1ru'],
  ];
  for (const [re, rep] of endings) s = s.replace(re, rep);
  // Silent e makes the vowel before it long: make → meik, time → taim, cute → kyuut.
  const m = s.match(/^(.*?)([^aeiou]*)([aeiou])([^aeiouvwxy])e(s?)$/);
  if (m && s.length > 3 && !(m[2] === '' && /[aeiou]$/.test(m[1]))) {
    const long = { a: 'ei', e: 'ii', i: 'ai', o: 'oo', u: 'yuu' }[m[3]];
    s = m[1] + m[2] + long + m[4] + m[5];
  } else if (s.length > 2 && /[^aeiou]e$/.test(s)) {
    s = s.slice(0, -1);
  }
  const rules = [
    [/ph/g, 'f'], [/ck$/g, 'kk'], [/ck/g, 'k'], [/wh/g, 'w'], [/qu/g, 'kw'], [/([aeiou])x$/g, '$1kks'], [/x/g, 'ks'], [/th/g, 's'],
    [/c(?=[eiy])/g, 's'], [/c(?!h)/g, 'k'], [/g(?=[eiy])/g, 'j'], [/wor/g, 'waa'],
    [/([bcfghkmnpv])u([^aeiou][aeiouy])/g, '$1yuu$2'],
    [/([^aeiou])u([^aeiou])(?=[^aeiou]|$)/g, '$1a$2'],
    [/(ar|er|ir|ur)(?=[^aeiou]|$)/g, 'aa'], [/or(?=[^aeiou]|$)/g, 'oo'],
    // au → oo must run before ou → au, or it would undo it (brown → broon).
    [/au|aw/g, 'oo'], [/ou|ow/g, 'au'], [/ai|ay/g, 'ei'], [/oa/g, 'oo'], [/oy|oi/g, 'oi'], [/ew/g, 'yuu'],
    [/(^|[^aeiou])a([^aeiou])y$/g, '$1ei$2ii'], [/([^aeiou])y$/g, '$1ii'], [/([^aeiou])y(?=[^aeiou])/g, '$1i'],
    [/l/g, 'r'], [/v/g, 'b'], [/([rmsfzn])\1/g, '$1'], [/m(?=[bp])/g, 'n'],
    // A short vowel before a final stop doubles it: cat → katto, bridge → brijji.
    [/(^|[^aeiou])([aeiou])(k|p|t|d|g|j)$/g, '$1$2$3$3'], [/(^|[^aeiou])([aeiou])(ch|sh)$/g, (x, a, v, c) => `${a}${v}${c === 'ch' ? 'tch' : 'ssh'}`],
  ];
  for (const [re, rep] of rules) s = s.replace(re, rep);
  return s.toLowerCase();
}

/** Pseudo-romaji → katakana, adding the vowel Japanese needs after a lone consonant. */
function pseudoToKana(p) {
  let out = '';
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (VOWEL.test(c)) {
      out += ROMAJI[c];
      i++;
      if (p[i] === c) {
        out += 'ー';
        i++;
      }
      continue;
    }
    if (c !== 'n' && !VOWEL.test(c) && (p[i + 1] === c || (c === 't' && p.startsWith('ch', i + 1)))) {
      out += 'っ';
      i++;
      continue;
    }
    const key = PHONETIC_BY_FIRST.get(c)?.find((k) => p.startsWith(k, i));
    if (key) {
      out += PHONETIC[key];
      i += key.length;
      const v = key.at(-1);
      if (p[i] === v) {
        out += 'ー';
        i++;
      }
      continue;
    }
    if (c === 'n') {
      out += 'ん';
      i++;
      continue;
    }
    // Lone consonant: t and d take o, ch and j take i, the rest take u.
    const unit = ['sh', 'ch', 'ts'].find((u) => p.startsWith(u, i)) || c;
    const vowel = unit === 't' || unit === 'd' ? 'o' : unit === 'ch' || unit === 'j' ? 'i' : 'u';
    out += PHONETIC[unit + vowel] ?? PHONETIC[`${unit}u`] ?? '';
    i += unit.length;
  }
  return toKata(out);
}

function englishToKana(word) {
  const w = word.toLowerCase();
  if (Object.hasOwn(WORDS, w)) return WORDS[w];
  // Plurals of known words: cats → キャッツ, dogs → ドッグズ.
  if (/s$/.test(w) && Object.hasOwn(WORDS, w.slice(0, -1))) {
    const base = WORDS[w.slice(0, -1)];
    return base.endsWith('ト') ? `${base.slice(0, -1)}ツ` : /[クプフ]$/.test(base) ? `${base}ス` : `${base}ズ`;
  }
  return pseudoToKana(englishToPseudo(w));
}

function encodeKatakana(text) {
  const tokens = [];
  const parts = text.split(/([A-Za-z]+(?:'[A-Za-z]+)?)/);
  parts.forEach((piece, k) => {
    if (!piece) return;
    if (/^[A-Za-z]/.test(piece)) {
      tokens.push({ src: piece, out: englishToKana(piece), jp: true });
      return;
    }
    // A single space between two words becomes the katakana word dot ・.
    const between = piece === ' ' && /^[A-Za-z]/.test(parts[k - 1] ?? '') && /^[A-Za-z]/.test(parts[k + 1] ?? '');
    const out = between ? '・' : Array.from(piece, (c) => PUNCT[c] ?? c).join('');
    push(tokens, piece, out);
  });
  return finish(tokens);
}

// Katakana → the English words the spelling rules write that way, so words that
// aren't in WORDS read back too (フロム → from). Building it runs every English
// word through the rules (about half a second on a PC), so warmUp() does it a
// slice at a time while the page is idle; a decode before then finishes it.
const SPELLED = new Map();
let spellQueue = null;
let spelledReady = false;
let quickDecode = false; // set by decode({ quick }): don't wait for the index
let spelledMissed = false;
function buildSpelled(budgetMs = Infinity) {
  spellQueue ??= [...englishWords()];
  const end = performance.now() + budgetMs;
  while (spellQueue.length) {
    for (let n = 0; n < 250 && spellQueue.length; n++) {
      const w = spellQueue.pop();
      const kana = englishToKana(w);
      (SPELLED.get(kana) ?? SPELLED.set(kana, []).get(kana)).push(w);
    }
    if (performance.now() > end) return false;
  }
  return true;
}
/** Builds the katakana index in the background (the page calls this on open); resolves when ready. */
let warming = null;
export function warmUp() {
  warming ??= new Promise((resolve) => {
    const step = () => {
      if (!spelledReady) spelledReady = buildSpelled(8);
      if (spelledReady) resolve();
      else setTimeout(step, 16);
    };
    setTimeout(step, 300);
  });
  return warming;
}
/**
 * The likeliest English word written as `kana`: common words first, then the one
 * sharing the most letters with the romaji reading (ブラウン buraun: brown, not
 * blown), then the shortest.
 */
function spelledAs(kana, romaji = '') {
  if (!spelledReady && quickDecode) {
    spelledMissed = true;
    return null;
  }
  if (!spelledReady) spelledReady = buildSpelled();
  const words = SPELLED.get(kana);
  if (!words) return null;
  const shared = (w) => Array.from(w).filter((c) => romaji.includes(c)).length;
  return [...words].sort((a, b) => isCommon(b) - isCommon(a) || shared(b) - shared(a) || a.length - b.length || a.localeCompare(b))[0];
}

/** Decoded English reads as sentences: a capital at the start and after . ! ?, and I on its own. */
function sentenceCase(res) {
  const caps = capitalsAt(res.tokens.map((t) => t.out).join(''));
  let at = 0;
  for (const t of res.tokens) {
    const n = t.out.length;
    if (n && [...caps].some((c) => c >= at && c < at + n)) t.out = Array.from(t.out, (ch, k) => (caps.has(at + k) ? ch.toUpperCase() : ch)).join('');
    at += n;
  }
  return finish(res.tokens);
}

function decodeKatakana(text) {
  // Loanwords from WORDS turn back into English, then any word the spelling
  // rules make; anything else is read as romaji.
  const res = kanaToRomaji(text);
  for (const t of res.tokens) {
    if (!t.jp) continue;
    const plural = /[ツスズ]$/.test(t.src) && (REVERSE.get(t.src.slice(0, -1)) ?? REVERSE.get(`${t.src.slice(0, -1)}ト`));
    const en = REVERSE.get(t.src) ?? (plural ? `${plural}s` : null) ?? spelledAs(t.src, t.out.toLowerCase());
    if (en) t.out = en;
  }
  return sentenceCase(res);
}

// --------------------------------------------------------------- styles
export const STYLES = [
  {
    id: 'katakana', name: 'Katakana', jp: 'カタカナ',
    blurb: 'English sounded out the way Japanese borrows words',
    encode: encodeKatakana, decode: decodeKatakana, exact: false,
  },
  {
    id: 'hiragana', name: 'Hiragana', jp: 'ひらがな',
    blurb: 'every letter swapped for a hiragana character',
    encode: hiraganaCipher.encode, decode: hiraganaCipher.decode, exact: true,
  },
  {
    id: 'mixed', name: 'Romaji mix', jp: '混ぜ書き',
    blurb: 'romaji syllables turn into kana, the rest stays Latin',
    encode: encodeMixed, decode: (t) => kanaToRomaji(t), exact: true,
  },
  {
    id: 'hankaku', name: 'Hankaku', jp: 'ﾊﾝｶｸ',
    blurb: 'halfwidth katakana, the falling code rain look',
    encode: hankakuCipher.encode, decode: hankakuCipher.decode, exact: true,
  },
  {
    id: 'kanjilook', name: 'Kanji-look', jp: '漢字風',
    blurb: 'Latin letters drawn with look-alike kanji',
    encode: kanjiLookCipher.encode, decode: (t) => sentenceCase(kanjiLookCipher.decode(t)), exact: false,
  },
];
export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];

/** The mapping tables, for the chart panel: [{ key (Latin), glyph }] */
export function chartFor(id) {
  if (id === 'hiragana') return Array.from(ABC, (l) => ({ key: l, glyph: HIRA_CIPHER[l] }));
  if (id === 'hankaku') return Array.from(ABC, (l, i) => ({ key: l, glyph: HANKAKU_LOWER[i] }));
  if (id === 'kanjilook') return Array.from(ABC, (l, i) => ({ key: l, glyph: KANJI_LOOK[i] }));
  // Gojūon chart for the kana styles.
  const rows = ['', 'k', 's', 't', 'n', 'h', 'm', 'y', 'r', 'w', 'g', 'z', 'd', 'b', 'p'];
  const special = { si: 'shi', ti: 'chi', tu: 'tsu', hu: 'fu', zi: 'ji', di: null, du: null, yi: null, ye: null, wi: null, wu: null, we: null };
  const cells = [];
  for (const r of rows) {
    for (const v of 'aiueo') {
      let key = r + v;
      if (key in special) key = special[key];
      if (r === 'w' && v === 'o') key = 'wo';
      cells.push(key && ROMAJI[key] ? { key, glyph: id === 'katakana' ? toKata(ROMAJI[key]) : ROMAJI[key] } : null);
    }
  }
  cells.push({ key: 'n', glyph: id === 'katakana' ? 'ン' : 'ん' });
  return cells;
}

/** Guess which style a piece of Japanese text was written in. */
export function detectStyle(text) {
  const chars = Array.from(text);
  let kanji = 0;
  let hankaku = 0;
  let hira = 0;
  let kata = 0;
  let latin = 0;
  let cipherHits = 0;
  for (const c of chars) {
    if (kanjiLookCipher.glyphs.has(c)) kanji++;
    if (hankakuCipher.glyphs.has(c) && !(c in PUNCT_BACK)) hankaku++;
    if (/[A-Za-z]/.test(c)) latin++;
    if (isHira(c)) hira++;
    if (isKata(c)) kata++;
    if ((isHira(c) || isKata(c)) && hiraganaCipher.glyphs.has(c)) cipherHits++;
  }
  const kana = hira + kata;
  if (kanji && kanji >= kana && kanji >= hankaku) return 'kanjilook';
  if (hankaku && hankaku >= kana) return 'hankaku';
  if (!kana) return 'mixed';
  if (latin) return 'mixed';
  // Cipher text is mostly hiragana (katakana only marks capitals).
  if (cipherHits === kana && hira > 0 && !chars.includes('ー')) return 'hiragana';
  return kata > hira ? 'katakana' : 'mixed';
}

/** Does the text contain anything a decoder can read? */
export function hasJapanese(text) {
  return /[ぁ-ヿ｡-ﾟ]/.test(text) || Array.from(text).some((c) => kanjiLookCipher.glyphs.has(c));
}

export function encode(text, styleId) {
  const style = styleById(styleId);
  const res = style.encode(text);
  // The read-back only decides whether the hidden copy is needed, so it never
  // waits for the katakana index.
  const back = withQuick(true, () => style.decode(res.text)).res.text;
  const exact = back === text && detectStyle(res.text) === style.id;
  // Results that lose something on screen (sound-alikes, case), or that would be
  // read as another style, carry an invisible copy of the original, so decoding
  // gives back exactly what was typed.
  return { ...res, text: exact ? res.text : withHidden(res.text, text), style, exact, hidden: !exact, back };
}

/**
 * @param {{ quick?: boolean }} options quick: don't build the katakana index now if it
 *   isn't ready; the result then has `pending: true` (decode again after warmUp()).
 */
export function decode(input, styleId = 'auto', { quick = false } = {}) {
  const { visible: text, original } = reveal(input);
  const kanji = (text.match(/[一-鿿]/g) || []).filter((c) => !kanjiLookCipher.glyphs.has(c)).length;
  const auto = styleId === 'auto';
  // The invisible copy wins when encoding it again gives exactly the visible text.
  if (original !== null) {
    for (const style of auto ? [styleById(detectStyle(text)), ...STYLES] : [styleById(styleId)]) {
      const again = style.encode(original);
      if (again.text !== text) continue;
      const tokens = again.tokens.map((t) => ({ ...t, src: t.out, out: t.src }));
      return { text: original, tokens, style, auto, kanji, pending: false, exact: true };
    }
  }
  const style = styleById(auto ? detectStyle(text) : styleId);
  const { res, missed } = withQuick(quick, () => style.decode(text));
  return { ...res, style, auto, kanji, pending: missed, exact: style.exact };
}

function withQuick(quick, fn) {
  quickDecode = quick;
  spelledMissed = false;
  try {
    return { res: fn(), missed: spelledMissed };
  } finally {
    quickDecode = false;
  }
}

/** Romaji reading of any Japanese text (for "Copy romaji"). */
export const romajiOf = (text) => kanaToRomaji(stripHidden(text), { capitalize: false }).text;
