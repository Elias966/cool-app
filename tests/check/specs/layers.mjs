import { encodeChain, decodeChain, autoPeel, randomChain } from '../../../src/modules/layers/layers.js';

export default {
  samples: ['Hello World', '100%'],
  fuzz: 150,
  cases: {
    'my chain': (text, rand) => {
      const chain = randomChain(1, 5, rand);
      return decodeChain(encodeChain(text, chain).output, chain).output;
    },
    'auto-peel': (text, rand) => autoPeel(encodeChain(text, randomChain(1, 5, rand)).output).output,
  },
};
