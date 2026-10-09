// Local AI for the Android app: the same job as electron/ai-host.mjs, but in a
// Web Worker inside the WebView, running transformers.js on onnxruntime-web
// (WASM, CPU). Bundled by scripts/android.js into assets/www/android/ai-worker.js.
//
// Messages in:  load | generate | cancel | status   (same protocol as the desktop)
// Messages out: progress | ready | token | done | error | status
//
// Models download from Hugging Face once and stay in the WebView's Cache
// Storage, so later launches load them offline.

import { pipeline, env, TextStreamer, InterruptableStoppingCriteria } from '@huggingface/transformers';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
// The WASM runtime ships inside the app (no CDN).
env.backends.onnx.wasm.wasmPaths = new URL('./ort/', self.location.href).href;
// Use every core when the page is cross-origin isolated (threads need SharedArrayBuffer).
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;

let current = null; // { key, generator }
let loading = null; // { key, promise }
const stoppers = new Map();
const send = (msg) => self.postMessage(msg);
const keyOf = ({ model, dtype }) => `${model}@${dtype}`;

async function isInstalled(spec) {
  // transformers.js stores downloads in Cache Storage under their URLs.
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    const want = `${spec.model}/resolve/main/onnx/model_${spec.dtype === 'q8' ? 'quantized' : spec.dtype}.onnx`;
    return keys.some((r) => r.url.includes(want));
  } catch {
    return false;
  }
}

async function load(spec) {
  const key = keyOf(spec);
  if (current?.key === key) return current.generator;
  if (loading?.key !== key) {
    const promise = pipeline('text-generation', spec.model, {
      dtype: spec.dtype,
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress' || p.status === 'initiate' || p.status === 'done') {
          send({ type: 'progress', model: spec.model, status: p.status, file: p.file, loaded: p.loaded, total: p.total });
        }
      },
    });
    loading = { key, promise };
    promise.catch(() => {
      if (loading?.key === key) loading = null;
    });
  }
  const generator = await loading.promise;
  if (current && current.key !== key) await current.generator.dispose?.();
  current = { key, generator };
  loading = null;
  return generator;
}

async function generate({ id, spec, messages, prefill = '', options = {} }) {
  const generator = await load(spec);
  const tokenizer = generator.tokenizer;
  const prompt = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, tokenize: false }) + prefill;
  const stopper = new InterruptableStoppingCriteria();
  stoppers.set(id, stopper);
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => send({ type: 'token', id, text }),
  });
  try {
    const out = await generator(prompt, {
      max_new_tokens: 120,
      do_sample: true,
      temperature: 0.8,
      top_p: 0.9,
      repetition_penalty: 1.15,
      ...options,
      return_full_text: false,
      streamer,
      stopping_criteria: stopper,
    });
    send({ type: 'done', id, text: out[0].generated_text, interrupted: stopper.interrupted });
  } finally {
    stoppers.delete(id);
  }
}

self.onmessage = async ({ data: msg }) => {
  try {
    if (msg.type === 'status') {
      send({ type: 'status', id: msg.id, installed: await isInstalled(msg.spec), loaded: current?.key === keyOf(msg.spec) });
    } else if (msg.type === 'load') {
      await load(msg.spec);
      send({ type: 'ready', id: msg.id, model: msg.spec.model });
    } else if (msg.type === 'generate') {
      await generate(msg);
    } else if (msg.type === 'cancel') {
      stoppers.get(msg.id)?.interrupt();
    }
  } catch (err) {
    send({ type: 'error', id: msg.id, message: String(err?.message || err) });
  }
};
