import { FONTS, toDingbats, fromDingbats } from '../../../src/modules/dingbats/dingbats.js';

// Every font, read back with font auto-detection (as a friend would paste it).
export default {
  samples: ['Hello World', '!', 'pi = 3.14'],
  cases: Object.fromEntries(FONTS.map((f) => [`${f.id} (auto-detect)`, (text) => fromDingbats(toDingbats(text, f.id).text).text])),
};
