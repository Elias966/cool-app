// Builds the web part of the Android app into
// "android version/app/src/main/assets/www": the same src/ the desktop app
// runs, plus the Android bridge (window.prism), the AI worker bundle and the
// WebAssembly runtime it needs. Run it before Gradle: `npm run android:web`.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ANDROID = path.join(ROOT, 'android version');
const WEB = path.join(ANDROID, 'web');
const OUT = path.join(ANDROID, 'app', 'src', 'main', 'assets', 'www');
const pkg = require(path.join(ROOT, 'package.json'));

// 1. three.js into src/vendor (same as the desktop build).
execFileSync(process.execPath, [path.join(__dirname, 'vendor.js')], { stdio: 'inherit' });

// 2. A fresh copy of src/.
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true, filter: (p) => !p.endsWith('.map') });

// 3. The module list. The desktop app scans folders at run time; on Android
//    the modules are fixed, so the list is written once here.
const modules = [];
for (const dir of fs.readdirSync(path.join(SRC, 'modules'), { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const file = path.join(SRC, 'modules', dir.name, 'module.json');
  if (!fs.existsSync(file)) continue;
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  modules.push({ entry: 'index.js', order: 100, ...manifest, source: 'built-in', dir: dir.name });
}
modules.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
fs.writeFileSync(path.join(OUT, 'modules.json'), JSON.stringify(modules, null, 2));

// 4. The bridge and the AI worker (transformers.js + onnxruntime-web, bundled).
const androidDir = path.join(OUT, 'android');
fs.mkdirSync(path.join(androidDir, 'ort'), { recursive: true });
fs.copyFileSync(path.join(WEB, 'bridge.js'), path.join(androidDir, 'bridge.js'));
const esbuild = require('esbuild');
esbuild.buildSync({
  entryPoints: [path.join(WEB, 'ai-worker.js')],
  outfile: path.join(androidDir, 'ai-worker.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome111'],
  minify: true,
  legalComments: 'eof',
  logLevel: 'warning',
  absWorkingDir: ROOT,
  nodePaths: [path.join(ROOT, 'node_modules')],
});
// The CPU (WebAssembly) runtime, loaded by the worker from android/ort/.
const ortDist = path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
  fs.copyFileSync(path.join(ortDist, f), path.join(androidDir, 'ort', f));
}

// 5. index.html: the bridge goes first so window.prism exists before the app
//    starts, and the content security policy lets the AI download its model
//    from Hugging Face and run WebAssembly in a worker.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' blob: data: https://huggingface.co https://*.huggingface.co https://*.hf.co",
].join('; ');
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const replace = (from, to) => {
  if (!from.test(html)) throw new Error(`index.html: ${from} not found`);
  html = html.replace(from, to);
};
replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?\/>/, `<meta http-equiv="Content-Security-Policy"\n        content="${CSP}" />`);
replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />\n' +
    '  <meta name="theme-color" content="#05060a" />\n' +
    '  <link rel="icon" href="data:," />',
);
replace(/(\s*)<script type="importmap">/, `$1<script src="android/bridge.js"></script>$1<script type="importmap">`);
html = html.replace('<html lang="en">', `<html lang="en" data-version="${pkg.version}">`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);

const size = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => {
    const p = path.join(dir, e.name);
    return n + (e.isDirectory() ? size(p) : fs.statSync(p).size);
  }, 0);
console.log(`android web assets: ${modules.length} modules, ${(size(OUT) / 1e6).toFixed(1)} MB in ${path.relative(ROOT, OUT)}`);
