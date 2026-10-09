import { SCRIPTS, convert, decode } from '../../../src/modules/ancient/scripts.js';

export default {
  samples: ['Hello World', 'Veni vidi vici', 'The quick brown fox, why?'],
  cases: Object.fromEntries(SCRIPTS.map((s) => [s.id, (text) => decode(convert(text, s.id).text).text])),
};
