import { compile, detectLanguage, loadProgram, runToEnd, hiddenText } from '../../../src/modules/esolang/esolangs.js';

// Compile, detect the language from the program alone, run it (as Program → text does).
const run = (lang) => (text) => {
  const c = compile(text, lang);
  const program = c.copy ?? c.code;
  const l = detectLanguage(program) || lang;
  return hiddenText(program, l) ?? runToEnd(l, loadProgram(program, l), 20_000_000);
};

export default {
  samples: ['Hello, World!', 'café ✓'],
  fuzz: 40,
  cases: Object.fromEntries(['brainfuck', 'ook', 'whitespace', 'befunge', 'malbolge'].map((l) => [l, run(l)])),
};
