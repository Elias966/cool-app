import { STYLES, encode, decode } from '../../../src/modules/japanese/japanese.js';

// Each style, decoded with style auto-detection.
export default {
  samples: ['Hello World', 'I love sushi and ramen!', 'ありがとう'],
  cases: Object.fromEntries(STYLES.map((s) => [s.id, (text) => decode(encode(text, s.id).text).text])),
};
