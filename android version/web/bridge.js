// window.prism for the Android app: the same API electron/preload.js gives the
// desktop app, backed by the WebView and the native AndroidBridge
// (MainActivity.java) instead of Electron.
//
// Kept to plain ES2015 on purpose: it must still run on the very old WebView
// some Android 7 phones ship with, so it can ask the user to update it.
(function () {
  'use strict';

  var native = window.AndroidBridge || null;
  var base = new URL('./', location.href);

  // ------------------------------------------------------------ WebView check
  // Prism uses CSS color-mix() and import maps (WebView/Chrome 111+). Android 7
  // devices get current WebView updates from the Play Store.
  function supported() {
    try {
      return CSS.supports('color', 'color-mix(in srgb, red 50%, blue)') &&
        typeof HTMLScriptElement.supports === 'function' && HTMLScriptElement.supports('importmap');
    } catch (e) {
      return false;
    }
  }
  if (!supported()) {
    var version = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1] || 'unknown';
    document.addEventListener('DOMContentLoaded', function () {
      document.body.innerHTML =
        '<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'padding:32px;text-align:center;background:#05060a;color:#eef0ff;font:16px/1.5 sans-serif;z-index:99">' +
        '<div style="font-weight:800;letter-spacing:.3em;font-size:22px;color:#a08cff;margin-bottom:18px">PRISM</div>' +
        '<p style="max-width:420px;margin:0 0 10px">Prism needs a newer <b>Android System WebView</b> (version 111 or later).</p>' +
        '<p style="max-width:420px;margin:0 0 24px;color:#8a90b8">This phone has version ' + version +
        '. Update “Android System WebView” and “Chrome” from the Play Store, then open Prism again.</p>' +
        '<button id="prism-update" style="padding:12px 22px;border-radius:12px;border:1px solid #7c5cff;background:#2a2150;color:#fff;font-size:16px">Open Play Store</button></div>';
      document.getElementById('prism-update').onclick = function () {
        if (native) native.openUrl('market://details?id=com.google.android.webview');
      };
    });
  }

  // ------------------------------------------------------------- safe areas
  // The app draws edge to edge (the 3D background runs under the status and
  // navigation bars); MainActivity reports the bar sizes so the UI can avoid them.
  window.prismInsets = function (top, right, bottom, left) {
    var s = document.documentElement.style;
    s.setProperty('--safe-top', top + 'px');
    s.setProperty('--safe-right', right + 'px');
    s.setProperty('--safe-bottom', bottom + 'px');
    s.setProperty('--safe-left', left + 'px');
  };
  if (native && native.insets) {
    try {
      var i = JSON.parse(native.insets());
      window.prismInsets(i.top, i.right, i.bottom, i.left);
    } catch (e) { /* reported again on the next layout */ }
  }

  // --------------------------------------------------------------- local AI
  // transformers.js runs in a worker (android/ai-worker.js), speaking the same
  // messages as the desktop's AI process.
  var worker = null;
  var listeners = [];
  function emit(msg) {
    listeners.slice().forEach(function (fn) { fn(msg); });
  }
  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('android/ai-worker.js', base), { type: 'module' });
    worker.onmessage = function (e) { emit(e.data); };
    worker.onerror = function (e) {
      if (e.preventDefault) e.preventDefault();
      console.error('[ai] worker failed:', e.message);
      worker = null;
      emit({ type: 'host-exit', code: 1 });
    };
    return worker;
  }

  // ---------------------------------------------------------------- files
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }
  /** Hand a file to Android's share sheet (send it to a chat, save it to Files…). */
  function shareFile(blob, name, title) {
    if (!native) return Promise.reject(new Error('Sharing is not available'));
    return blobToBase64(blob).then(function (b64) {
      if (!native.shareFile(name, blob.type || 'application/octet-stream', b64, title || name)) throw new Error('Could not share the file');
    });
  }

  // <a download href="blob:…">.click() does nothing in a WebView; share instead.
  var anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (native && this.hasAttribute('download') && /^(blob|data):/.test(this.href)) {
      var name = this.getAttribute('download') || 'prism-file';
      fetch(this.href)
        .then(function (r) { return r.blob(); })
        .then(function (blob) { return shareFile(blob, name); })
        .catch(function (err) { console.error('[share]', err); });
      return;
    }
    return anchorClick.call(this);
  };

  // Copying goes through Android's clipboard directly: the web clipboard API
  // depends on WebView version and focus.
  if (native && navigator.clipboard) {
    try {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: function (text) {
          return native.copyText(String(text)) ? Promise.resolve() : Promise.reject(new Error('Copy failed'));
        },
      });
    } catch (e) { /* keep the web clipboard */ }
  }

  function noop() {}

  window.prism = {
    platform: 'android',
    version: document.documentElement.dataset.version || '',
    listModules: function () {
      return fetch(new URL('modules.json', base))
        .then(function (r) { return r.json(); })
        .then(function (list) {
          return list.map(function (m) {
            var meta = Object.assign({}, m, { baseUrl: new URL('modules/' + encodeURIComponent(m.dir) + '/', base).href });
            delete meta.dir;
            return meta;
          });
        });
    },
    // No user modules folder on Android (the app shows no "add module" card).
    openModulesFolder: undefined,
    shareFile: shareFile,
    openUrl: function (url) {
      if (native) native.openUrl(String(url));
      else window.open(url, '_blank');
    },
    ai: {
      send: function (msg) { ensureWorker().postMessage(msg); },
      onEvent: function (fn) {
        listeners.push(fn);
        return function () {
          var i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      modelsDir: function () { return Promise.resolve('app storage'); },
    },
    // The system draws the window frame on Android.
    win: { minimize: noop, toggleMaximize: noop, close: noop, onState: noop },
  };
})();
