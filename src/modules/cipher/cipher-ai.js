// The lesson note the local AI writes for every new cipher.
//
// The model never sees the alphabet, the key code or the secret: it only
// writes the friendly part of the message (a spy briefing, a wizard's letter…)
// telling the friend that a new code has arrived. The clues and the sealed
// secret are added by the module afterwards, so a small model can't leak or
// garble them. Each format pre-fills the first line so the 1.5B model stays in
// character.

// The model is configured in one place only: the Braille module's AI_SPEC.
export { AI_SPEC, AI_SIZE_MB, AI_LABEL } from '../braille/ai-modes.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const num = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const TONES = ['dramatic', 'funny', 'mysterious', 'cozy', 'over-the-top epic', 'deadpan', 'whimsical', 'tense'];

// Each format: an icon, a request, the forced first line, and a ready-made
// note for when the AI isn't available.
const FORMATS = [
  {
    name: 'Spy briefing', icon: '🕶',
    ask: 'Write a short top secret spy briefing telling an agent that a new secret code starts today and they must learn it.',
    prefill: (to) => `TOP SECRET — for ${to}'s eyes only.\nAgent, as of tonight we switch to a brand-new code.`,
    fallback: (to) => `TOP SECRET — for ${to}'s eyes only.\nAgent, as of tonight we switch to a brand-new code. Study the clues, crack the warm-up, then read the sealed line. Burn this note after reading.`,
  },
  {
    name: "Wizard's letter", icon: '🧙',
    ask: 'Write a short letter from a wizard to an apprentice about a new magic alphabet they must study.',
    prefill: (to) => `My dear apprentice ${to},\nThe old runes have faded, so I have forged us a new alphabet.`,
    fallback: (to) => `My dear apprentice ${to},\nThe old runes have faded, so I have forged us a new alphabet. Learn the signs I have revealed below, and the sealed words will open to you.`,
  },
  {
    name: 'Pirate note', icon: '🏴‍☠️',
    ask: 'Write a short pirate note to a crewmate about a new secret code the captain made.',
    prefill: (to) => `Ahoy ${to}!\nThe captain has drawn up a fresh secret code for the crew.`,
    fallback: (to) => `Ahoy ${to}!\nThe captain has drawn up a fresh secret code for the crew. Learn the marks below, matey, or walk the plank. The treasure is in the sealed line.`,
  },
  {
    name: 'Mission log', icon: '🚀',
    ask: 'Write a short space mission log entry where command sends a new encryption code to a crew member.',
    prefill: (to) => `MISSION LOG — stardate ${num(1000, 9999)}.${num(1, 9)}\nCommand has issued a new cipher for crew member ${to}.`,
    fallback: (to) => `MISSION LOG — stardate ${num(1000, 9999)}.${num(1, 9)}\nCommand has issued a new cipher for crew member ${to}. Decode the calibration signals first, then the sealed transmission.`,
  },
  {
    name: 'Detective memo', icon: '🕵',
    ask: 'Write a short detective memo to a partner about switching to a new secret code because someone is listening.',
    prefill: (to) => `MEMO — to Detective ${to}.\nSomeone has been reading our notes, so we change the code today.`,
    fallback: (to) => `MEMO — to Detective ${to}.\nSomeone has been reading our notes, so we change the code today. The clues below are your only lead. Trust no one.`,
  },
  {
    name: 'Ninja scroll', icon: '🥷',
    ask: 'Write a short ninja scroll from a master to a student about a new secret writing they must memorise.',
    prefill: (to) => `Scroll of the Hidden Leaf, for ${to}.\nA new secret writing has been chosen, as quiet as falling snow.`,
    fallback: (to) => `Scroll of the Hidden Leaf, for ${to}.\nA new secret writing has been chosen, as quiet as falling snow. Memorise the signs, then let the scroll burn.`,
  },
  {
    name: 'Hacker terminal', icon: '💻',
    ask: 'Write a short hacker terminal message to a friend saying a new encryption key is now active.',
    prefill: (to) => `> incoming transmission for ${to}\n> new cipher loaded. handshake complete.`,
    fallback: (to) => `> incoming transmission for ${to}\n> new cipher loaded. handshake complete.\n> run the calibration clues, then decrypt the sealed payload. this channel self-destructs.`,
  },
  {
    name: 'Ancient prophecy', icon: '📜',
    ask: 'Write a short ancient prophecy about a chosen one who must learn a new secret alphabet.',
    prefill: (to) => `Hear the prophecy, ${to}:\nWhen the old letters fall silent, a new alphabet shall rise.`,
    fallback: (to) => `Hear the prophecy, ${to}:\nWhen the old letters fall silent, a new alphabet shall rise. Only the one who reads the signs below shall know the sealed words.`,
  },
  {
    name: 'Secret club note', icon: '🗝',
    ask: 'Write a short note to a best friend about the secret club getting a brand-new secret alphabet.',
    prefill: (to) => `Hey ${to}!\nClub news: we have a brand-new secret alphabet, and nobody else can read it.`,
    fallback: (to) => `Hey ${to}!\nClub news: we have a brand-new secret alphabet, and nobody else can read it. Use the clues to learn it, then crack my message!`,
  },
  {
    name: 'Treasure map', icon: '🗺',
    ask: 'Write short treasure map directions telling a friend to learn a new code to find the hidden message.',
    prefill: (to) => `TO ${to.toUpperCase()}: THIS MAP IS WRITTEN IN OUR NEW CODE.\nStart where the old alphabet ends.`,
    fallback: (to) => `TO ${to.toUpperCase()}: THIS MAP IS WRITTEN IN OUR NEW CODE.\nStart where the old alphabet ends. Learn three signs, solve the warm-up, and the X marks the sealed line.`,
  },
];

// For the key-inside styles the built-in note ends with one of these instead
// (their own endings talk about clues and a warm-up, which those styles don't have).
const KEY_INSIDE_ENDINGS = [
  'The key is written right below. Read it, then crack the message.',
  'Everything you need is right here: the key first, then the message.',
  'Study the key below and the words will speak to you.',
  'No code book needed this time: the key comes with the message.',
];

/** A random lesson prompt for a friend called `to`. `keyInside`: the key is written into the message. */
export function lessonPrompt(to = 'friend', { keyInside = false } = {}) {
  const f = pick(FORMATS);
  const name = to.trim() || 'friend';
  const prefill = f.prefill(name);
  return {
    format: f.name,
    icon: f.icon,
    prefill,
    fallback: keyInside ? `${prefill} ${pick(KEY_INSIDE_ENDINGS)}` : f.fallback(name),
    messages: [
      {
        role: 'system',
        content:
          'You write short, fun notes between two friends who share secret codes. Keep it under 70 words. ' +
          'Never write the code itself, never list letters or symbols, and never explain how ciphers work.',
      },
      { role: 'user', content: `${f.ask}${keyInside ? ' Tell them the key is written right below the note.' : ''} Make it ${pick(TONES)}.` },
    ],
  };
}

// Where a tiny model drifts out of the note into chatbot talk, or starts
// inventing a code of its own.
const DRIFT = [
  /\n\s*#{1,6}\s/,
  /\n\s*-{3,}/,
  /\n\s*\*\*[^*\n]{2,40}:\*\*/,
  /\b(I hope (this|you)|Let me know|Feel free to|As an AI|Here (is|are) (a|the|your)|Note:)\b/i,
  /\n[^\n]*\b[A-Za-z0-9]\s*[=:→-]\s*\S\s*[,;·]/, // "A = 1, B = 2…": a made-up code
  /\n\s*(Code|Cipher|Key|Alphabet|Clue|Clues)\s*:/i,
];

/** Trim the streamed note: cut drift, markdown and an unfinished last sentence. */
export function finalizeNote(text, prefillLength = 0) {
  let out = text;
  for (const re of DRIFT) {
    const m = re.exec(out.slice(prefillLength));
    if (m) out = out.slice(0, prefillLength + m.index);
  }
  out = out
    .replace(/\*\*|__/g, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '');
  const lastStop = Math.max(out.lastIndexOf('.'), out.lastIndexOf('!'), out.lastIndexOf('?'), out.lastIndexOf('\n'));
  if (!/[.!?)"”»\n]$/.test(out) && lastStop > prefillLength * 0.8) out = out.slice(0, lastStop + 1).replace(/\s+$/, '');
  return out.length > 700 ? `${out.slice(0, 700).replace(/\s+\S*$/, '')}…` : out;
}
