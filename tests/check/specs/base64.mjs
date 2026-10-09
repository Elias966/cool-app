import { encodeBase64, decodeBase64 } from '../../../src/modules/base64/base64.js';

export default {
  samples: ['Hello, World!', 'Man', '😀 emoji too'],
  cases: {
    standard: (text) => decodeBase64(encodeBase64(text).text).text,
    'URL-safe, no padding': (text) => decodeBase64(encodeBase64(text, { urlSafe: true, pad: false }).text).text,
  },
};
