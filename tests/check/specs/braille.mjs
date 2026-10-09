// Text → braille → text must give back exactly what was typed.
import { toBraille, fromBraille } from '../../../src/modules/braille/braille.js';

export default {
  samples: ['Hello World', 'UEB grade 1: 3a, 4.5 and CAPS', 'café\tnaïve'],
  cases: {
    'text → braille → text': (text) => fromBraille(toBraille(text).text).text,
  },
};
