// Local AI host. Runs in an Electron utility process so text generation never
// blocks the window. Models are fetched from Hugging Face once, stored under
// <userData>/models, and loaded from there on every later run.
//
// Messages in (from main):  load | generate | cancel | status
// Messages out (to main):   progress | ready | token | done | error | status

import fs from 'node:fs';
import path from 'node:path';
import { pipeline, env, TextStreamer, InterruptableStoppingCriteria } from '@huggingface/transformers';

const port = process.parentPort;
const MODELS_DIR = process.env.PRISM_MODELS_DIR;

env.cacheDir = MODELS_DIR;
env.allowLocalModels = false;
env.allowRemoteModels = true;

let current = null; // { key, generator }
let loading = null; // { key, promise }
const stoppers = new Map();

const send = (msg) => port.postMessage(msg);
const keyOf = ({ model, dtype }) => `${model}@${dtype}`;
const modelFile = ({ model, dtype }) => path.join(MODELS_DIR, model, 'onnx', `model_${dtype}.onnx`);

async function load(spec) {
  const key = keyOf(spec);
  if (current?.key === key) return current.generator;
  if (loading?.key !== key) {
    const promise = pipeline('text-generation', spec.model, {
      dtype: spec.dtype,
      device: 'cpu',
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

port.on('message', async ({ data: msg }) => {
  try {
    if (msg.type === 'status') {
      send({ type: 'status', id: msg.id, installed: fs.existsSync(modelFile(msg.spec)), loaded: current?.key === keyOf(msg.spec) });
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
});
