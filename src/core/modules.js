// Module loading. A module is a folder with a module.json manifest and an ES
// module entry whose default export is `{ mount(root, ctx) }`. `mount` may
// return a cleanup function (or a promise of one); an optional `unmount()` on
// the export is also called when the user leaves.

export async function discoverModules() {
  return window.prism ? window.prism.listModules() : [];
}

function loadStylesheet(href) {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.moduleStyle = '';
    link.onload = () => resolve(link);
    link.onerror = () => {
      console.warn(`[modules] stylesheet failed to load: ${href}`);
      resolve(link);
    };
    document.head.appendChild(link);
  });
}

export async function mountModule(meta, root, ctx) {
  const styles = await Promise.all([].concat(meta.style || []).map((s) => loadStylesheet(new URL(s, meta.baseUrl).href)));
  try {
    const mod = await import(new URL(meta.entry, meta.baseUrl).href);
    const impl = mod.default || mod;
    if (typeof impl.mount !== 'function') throw new Error(`${meta.entry} must export default { mount(root, ctx) }`);
    const cleanup = await impl.mount(root, ctx);
    return async () => {
      try {
        if (typeof cleanup === 'function') await cleanup();
        if (typeof impl.unmount === 'function') await impl.unmount();
      } finally {
        styles.forEach((l) => l.remove());
      }
    };
  } catch (err) {
    styles.forEach((l) => l.remove());
    throw err;
  }
}
