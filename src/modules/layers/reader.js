// Universal translator reader (see src/core/translate.js): peels a stack of encodings.
import { autoPeel } from './layers.js';

export default function read(text) {
  const res = autoPeel(text);
  if (!res.steps.length) return null;
  const recipe = res.steps.map((s) => s.layer.name).reverse().join(' → ');
  // One plain layer is better told by its own module (Base64…); a stack is this module's.
  const confidence = res.chain ? 1 : Math.min(0.88, 0.45 + 0.12 * res.steps.length);
  return { text: res.output, style: recipe, confidence, exact: Boolean(res.chain) };
}
