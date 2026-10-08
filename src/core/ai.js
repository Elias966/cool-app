// Local AI service handed to modules as `ctx.ai`.
//
//   const spec = { model: 'onnx-community/Qwen2.5-1.5B-Instruct', dtype: 'q4f16' };
//   await ctx.ai.load(spec, { onProgress: ({ loaded, total }) => … });
//   const job = ctx.ai.generate(spec, { messages, prefill }, { onToken: (t) => … });
//   const text = await job.done;   // job.cancel() stops early
//
// The model is downloaded once into the app's data folder and runs on the CPU
// in a background process; nothing is sent anywhere.

const bridge = window.prism?.ai;
const listeners = new Set();
bridge?.onEvent((msg) => listeners.forEach((fn) => fn(msg)));

let seq = 0;
const nextId = () => `ai-${Date.now().toString(36)}-${++seq}`;

/** Creates the per-module API. `dispose()` cancels anything still running. */
export function createAI() {
  const active = new Map(); // id -> { cancel }
  const subs = new Set();

  function listen(fn) {
    listeners.add(fn);
    subs.add(fn);
    return () => {
      listeners.delete(fn);
      subs.delete(fn);
    };
  }

  function request(msg, onEvent, id = nextId()) {
    return new Promise((resolve, reject) => {
      const off = listen((ev) => {
        if (ev.type === 'host-exit') {
          finish();
          reject(new Error('The AI process stopped unexpectedly'));
          return;
        }
        if (ev.id !== id && ev.type !== 'progress') return;
        if (ev.type === 'error') {
          finish();
          reject(new Error(ev.message));
        } else if (onEvent(ev, resolve) === true) {
          finish();
        }
      });
      const finish = () => {
        off();
        active.delete(id);
      };
      active.set(id, { cancel: () => bridge.send({ type: 'cancel', id }) });
      bridge.send({ ...msg, id });
    });
  }

  // Per-file progress is folded into one overall number.
  function progressTracker(model, onProgress) {
    const files = new Map();
    return (ev) => {
      if (ev.type !== 'progress' || ev.model !== model || !ev.file) return;
      const prev = files.get(ev.file) || { loaded: 0, total: 0 };
      files.set(ev.file, {
        loaded: ev.status === 'done' ? Math.max(prev.total, ev.loaded || 0) : ev.loaded ?? prev.loaded,
        total: ev.total ?? prev.total,
      });
      let loaded = 0;
      let total = 0;
      files.forEach((f) => {
        loaded += f.loaded || 0;
        total += f.total || 0;
      });
      onProgress?.({ loaded, total, file: ev.file });
    };
  }

  return {
    available: Boolean(bridge),

    /** { installed, loaded } — installed means the model is already on disk. */
    status(spec) {
      if (!bridge) return Promise.resolve({ installed: false, loaded: false });
      return request({ type: 'status', spec }, (ev, resolve) => {
        if (ev.type !== 'status') return false;
        resolve({ installed: ev.installed, loaded: ev.loaded });
        return true;
      });
    },

    /** Download (first time) and load a model. */
    load(spec, { onProgress } = {}) {
      if (!bridge) return Promise.reject(new Error('Local AI is not available'));
      const track = progressTracker(spec.model, onProgress);
      return request({ type: 'load', spec }, (ev, resolve) => {
        track(ev);
        if (ev.type !== 'ready') return false;
        resolve();
        return true;
      });
    },

    /**
     * Generate text from chat `messages`. `prefill` is text the answer is forced
     * to start with (it is not repeated in the result).
     */
    generate(spec, { messages, prefill = '', options = {} }, { onToken, onProgress } = {}) {
      if (!bridge) return { done: Promise.reject(new Error('Local AI is not available')), cancel() {} };
      const track = progressTracker(spec.model, onProgress);
      const id = nextId();
      const done = request({ type: 'generate', spec, messages, prefill, options }, (ev, resolve) => {
        track(ev);
        if (ev.type === 'token') onToken?.(ev.text);
        if (ev.type !== 'done') return false;
        resolve(ev.text);
        return true;
      }, id);
      return { done, cancel: () => active.get(id)?.cancel() };
    },

    dispose() {
      active.forEach((job) => job.cancel());
      active.clear();
      subs.forEach((fn) => listeners.delete(fn));
      subs.clear();
    },
  };
}
