// Copies the parts of three.js the renderer imports into src/vendor/three, so
// the app serves them from src/ (electron-builder drops node_modules/*/examples).
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'node_modules', 'three');
const to = path.join(__dirname, '..', 'src', 'vendor', 'three');
const parts = ['build/three.module.js', 'build/three.core.js', 'examples/jsm/postprocessing', 'examples/jsm/shaders', 'LICENSE'];

fs.rmSync(to, { recursive: true, force: true });
for (const part of parts) {
  fs.cpSync(path.join(from, part), path.join(to, part), { recursive: true });
}
console.log(`vendored three.js into ${path.relative(process.cwd(), to)}`);
