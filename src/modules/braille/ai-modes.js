// The two AI modes. The model never sees the user's text or braille: it only
// ever writes about a made-up word, "Glyph", and the braille is swapped in
// afterwards. That keeps the model from trying to translate or explain it.
//
// Each format pre-fills the start of the answer with the placeholder already
// in place, so even a tiny model reliably works the braille in.

export const AI_SPEC = { model: 'onnx-community/Qwen2.5-1.5B-Instruct', dtype: 'q4f16' };
export const AI_SIZE_MB = 1222;
/** Short display name, e.g. "Qwen2.5-1.5B", taken from AI_SPEC so the UI always shows the model actually in use. */
export const AI_LABEL = AI_SPEC.model.split('/').pop().replace(/-Instruct$/i, '');
export const SLOT = '⁣'; // invisible marker stored in history where the braille goes

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const num = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

const NAMES = ['Mira', 'Theo', 'Juno', 'Kai', 'Ines', 'Otto', 'Zara', 'Felix', 'Noor', 'Rook', 'Ada', 'Bram'];
const PLACES = ['Sunken City', 'Glass Desert', 'Clockwork Forest', 'Moon Library', 'Frozen Bazaar', 'Lantern Caves', 'Cloud Harbor', 'Velvet Swamp'];
const CITIES = ['Lisbon', 'Osaka', 'Reykjavik', 'Nairobi', 'Montreal', 'Oslo', 'Lima', 'Cairo'];
const SIGNS = ['ARIES', 'TAURUS', 'GEMINI', 'CANCER', 'LEO', 'VIRGO', 'LIBRA', 'SCORPIO', 'SAGITTARIUS', 'CAPRICORN', 'AQUARIUS', 'PISCES'];
const TONES = ['dramatic', 'funny', 'mysterious', 'cozy', 'over-the-top epic', 'deadpan', 'whimsical', 'tense'];

// Mode 1 — the braille is the goal, objective or prize.
const QUEST_FORMATS = [
  () => ({
    name: 'Adventure story',
    ask: 'Write a short adventure story in 5 sentences.',
    prefill: `For years, ${pick(NAMES)} had searched the ${pick(PLACES)} for the Glyph.`,
  }),
  () => {
    const place = pick(PLACES).toUpperCase();
    return {
      name: 'Game level briefing',
      ask: 'Write a short video game level briefing with an objective and 3 steps.',
      prefill: `LEVEL ${num(2, 99)}: THE ${place}\nOBJECTIVE: Retrieve the Glyph before the timer runs out.\n\n1.`,
    };
  },
  () => ({
    name: 'Letter to Santa',
    ask: 'Write a short letter to Santa from a child who wants one special gift.',
    prefill: `Dear Santa,\nThis year I only want one thing: the Glyph.`,
  }),
  () => ({
    name: 'Heist plan',
    ask: 'Write a short heist plan with a team and 4 steps.',
    prefill: `THE PLAN\nTarget: the Glyph, locked inside the vault of the ${pick(PLACES)}.\nTeam:`,
  }),
  () => ({
    name: 'Recipe',
    ask: 'Write a short recipe with ingredients and steps.',
    prefill: `Recipe: ${pick(['Midnight Soup', 'Thunder Pancakes', 'Galaxy Stew', 'Lucky Noodles'])}\nGoal: a dish that tastes exactly like the Glyph.\n\nIngredients:\n-`,
  }),
  () => ({
    name: "Captain's log",
    ask: "Write a short pirate captain's log entry.",
    prefill: `Captain's log, day ${num(3, 400)}. The crew grows restless, but we are close to the Glyph.`,
  }),
  () => ({
    name: 'Spy briefing',
    ask: 'Write a short top secret spy mission briefing.',
    prefill: `TOP SECRET — MISSION BRIEFING\nAgent ${pick(NAMES)}, your mission is to recover the Glyph from ${pick(CITIES)}.`,
  }),
  () => ({
    name: 'Poem',
    ask: `Write a short ${pick(['rhyming', 'dreamy', 'silly', 'heroic'])} poem of 8 lines.`,
    prefill: `Ode to the Glyph\n\n`,
  }),
  () => ({
    name: 'Lab notebook',
    ask: 'Write a short scientist lab notebook entry with an aim, method and result.',
    prefill: `LAB NOTEBOOK — Experiment ${num(2, 120)}\nAim: to finally create the Glyph.\nMethod:`,
  }),
  () => ({
    name: 'Sports commentary',
    ask: 'Write short, excited live sports commentary.',
    prefill: `And here they come down the final stretch, every runner chasing the Glyph!`,
  }),
  () => ({
    name: 'Treasure map',
    ask: 'Write short treasure map directions with 4 steps.',
    prefill: `TREASURE MAP\nX marks the spot where the Glyph is buried.\nStep 1:`,
  }),
  () => ({
    name: 'Prophecy',
    ask: 'Write a short ancient prophecy.',
    prefill: `THE ANCIENT PROPHECY\nWhen the ${pick(['moon', 'river', 'last bell', 'old king'])} falls silent, one shall rise to claim the Glyph.`,
  }),
  () => ({
    name: 'Job posting',
    ask: 'Write a short, funny job posting.',
    prefill: `NOW HIRING: Glyph Hunter\nAbout the role: your only goal is to find the Glyph.`,
  }),
  () => ({
    name: 'Diary entry',
    ask: 'Write a short diary entry.',
    prefill: `Dear diary,\nToday I got one step closer to the Glyph.`,
  }),
  () => ({
    name: 'Genie wish',
    ask: 'Write a short story about a wish granted by a genie.',
    prefill: `"Genie, I wish for the Glyph," said ${pick(NAMES)}.`,
  }),
  () => ({
    name: 'Quest log',
    ask: 'Write a short fantasy RPG quest log with a reward.',
    prefill: `NEW QUEST ACCEPTED\nQuest giver: ${pick(NAMES)} the ${pick(['Baker', 'Wizard', 'Blacksmith', 'Ghost'])}\nReward: the Glyph\n\nDetails:`,
  }),
];

// Mode 2 — braille turns up somewhere it has no business being.
const ANYWHERE_FORMATS = [
  () => ({
    name: 'Pizza menu',
    ask: 'Write a short pizza restaurant menu with 4 dishes and prices.',
    prefill: `${pick(["LUIGI'S", "MAMA ROSA'S", 'SLICE CITY', 'THE DOUGH LAB'])} PIZZERIA\n1. Margherita with fresh Glyph — $${num(9, 16)}\n2.`,
  }),
  () => ({
    name: 'Weather forecast',
    ask: 'Write a short weather forecast for tomorrow.',
    prefill: `TOMORROW'S FORECAST — ${pick(CITIES)}\nMorning: light rain with a chance of Glyph.\nAfternoon:`,
  }),
  () => ({
    name: 'Parking ticket',
    ask: 'Write a short parking ticket notice.',
    prefill: `PARKING VIOLATION NOTICE\nVehicle plate: Glyph\nViolation:`,
  }),
  () => ({
    name: 'Horoscope',
    ask: 'Write a short daily horoscope.',
    prefill: `${pick(SIGNS)} — TODAY\nThe stars say: expect Glyph in your love life.`,
  }),
  () => ({
    name: 'Shampoo bottle',
    ask: 'Write short directions from the back of a shampoo bottle.',
    prefill: `DIRECTIONS\n1. Apply a generous amount of Glyph to wet hair.\n2.`,
  }),
  () => ({
    name: 'Airport announcement',
    ask: 'Write a short airport announcement.',
    prefill: `Attention passengers: flight Glyph to ${pick(CITIES)} is now boarding at gate ${num(1, 60)}.`,
  }),
  () => ({
    name: 'Product review',
    ask: 'Write a short online product review of a kitchen gadget.',
    prefill: `★★★★☆ "Works great, but the Glyph button is confusing"\n`,
  }),
  () => ({
    name: 'Error log',
    ask: 'Write a short computer error log.',
    prefill: `[ERROR] ${String(num(0, 23)).padStart(2, '0')}:${String(num(0, 59)).padStart(2, '0')} Kernel panic: unexpected Glyph in memory sector ${num(2, 999)}.\n[WARN]`,
  }),
  () => ({
    name: 'Fortune cookie',
    ask: 'Write a short fortune cookie message with lucky numbers.',
    prefill: `Your fortune: a Glyph will soon change your life.\nLucky numbers:`,
  }),
  () => ({
    name: 'Dating profile',
    ask: 'Write a short dating app profile.',
    prefill: `${pick(NAMES)}, ${num(22, 61)}\nAbout me: I love long walks, coffee, and Glyph.`,
  }),
  () => ({
    name: 'Shop receipt',
    ask: 'Write a short supermarket receipt with items and prices.',
    prefill: `${pick(['FRESHMART', 'QUICKSTOP', 'GREEN BASKET'])} RECEIPT\nMilk 2.49\nGlyph 4.99\n`,
  }),
  () => ({
    name: 'Traffic report',
    ask: 'Write a short radio traffic report.',
    prefill: `Traffic update: heavy Glyph on the ${pick(['ring road', 'bridge', 'highway', 'tunnel'])} northbound this morning.`,
  }),
  () => ({
    name: 'Nutrition label',
    ask: 'Write a short nutrition facts label.',
    prefill: `NUTRITION FACTS\nServing size: 1 Glyph\nCalories:`,
  }),
  () => ({
    name: 'Wedding invitation',
    ask: 'Write a short wedding invitation.',
    prefill: `Together with their families,\n${pick(NAMES)} and ${pick(NAMES)}\nrequest the pleasure of your Glyph`,
  }),
  () => ({
    name: 'Lost pet poster',
    ask: 'Write a short lost pet poster.',
    prefill: `LOST ${pick(['CAT', 'DOG', 'PARROT', 'TORTOISE'])}\nAnswers to the name Glyph.`,
  }),
  () => ({
    name: 'Phone notifications',
    ask: 'Write a short list of phone notifications.',
    prefill: `🔔 Mom: did you remember the Glyph?\n🔔`,
  }),
  () => ({
    name: 'Furniture manual',
    ask: 'Write short flat-pack furniture assembly instructions.',
    prefill: `STEP 4\nInsert the Glyph into slot B and tighten gently.\nSTEP 5`,
  }),
  () => ({
    name: 'Scoreboard',
    ask: 'Write a short sports match report.',
    prefill: `FINAL SCORE: ${pick(CITIES)} ${num(0, 4)} — Glyph ${num(0, 4)}\n`,
  }),
];

/** A random prompt for the given mode ('quest' | 'anywhere'). */
export function randomPrompt(mode) {
  const format = pick(mode === 'quest' ? QUEST_FORMATS : ANYWHERE_FORMATS)();
  const tone = pick(TONES);
  return {
    format: format.name,
    prefill: format.prefill,
    messages: [
      {
        role: 'system',
        content: 'You are a creative writer. Keep it short. Treat the word Glyph as an ordinary word and never explain it.',
      },
      { role: 'user', content: `${format.ask} Make it ${tone}.` },
    ],
  };
}

const PLACEHOLDER = /glyph\w*/gi;

/** Swap every placeholder word for the slot marker. */
export function markSlots(text) {
  return text.replace(PLACEHOLDER, SLOT);
}

/** While streaming, hide a half-written placeholder at the very end ("Gly…"). */
export function hidePartialPlaceholder(text) {
  const m = /g(l(y(p(h)?)?)?)?$/i.exec(text);
  return m ? text.slice(0, m.index) : text;
}

/**
 * Final clean-up: drop an unfinished last sentence, then make sure the braille
 * appears at least `minSlots` times by splicing it over random words.
 */
// Where a tiny model tends to drift from the piece into chatbot talk.
const DRIFT = [
  /\n\s*#{1,6}\s/,
  /\n\s*-{3,}/,
  /\n\s*\*\*[^*\n]{2,40}:\*\*/,
  /\b(I hope (this|you)|Let me know|Feel free to|Please,? (share|let)|What (sparks|do you think)|As an AI|I am (willing|happy) to|Here (is|are) (a|the|your))\b/i,
  /\n\s*(Note|Explanation|Response|Answer)\s*:/i,
];

export function finalize(text, { minSlots = 1, protectChars = 0 } = {}) {
  let out = text;
  for (const re of DRIFT) {
    const m = re.exec(out.slice(protectChars));
    if (m) out = out.slice(0, protectChars + m.index);
  }
  out = out
    .replace(/\*\*|__/g, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(\n\s*(\d+[.)]|[-*•]|Step \d+:?|STEP \d+))+\s*$/i, '')
    .replace(/\s+$/, '');
  const lastStop = Math.max(out.lastIndexOf('.'), out.lastIndexOf('!'), out.lastIndexOf('?'), out.lastIndexOf('\n'));
  if (!/[.!?)"”»*\n]$/.test(out) && lastStop > out.length * 0.5) out = out.slice(0, lastStop + 1).replace(/\s+$/, '');

  let count = out.split(SLOT).length - 1;
  for (let tries = 0; count < minSlots && tries < 6; tries++) {
    const words = [...out.matchAll(/\b[A-Za-z]{4,}\b/g)].filter((m) => m.index >= protectChars);
    if (!words.length) break;
    const w = pick(words);
    out = out.slice(0, w.index) + SLOT + out.slice(w.index + w[0].length);
    count++;
  }
  if (!out.includes(SLOT)) out += ` ${SLOT}`;
  return out;
}

/** A surprise payload when the user leaves the box empty. */
export function randomWord() {
  return pick(['hello', 'treasure', 'moonlight', 'pizza', 'secret', 'dream', 'thunder', 'cookie', 'echo', 'galaxy', 'friend', 'magic']);
}
