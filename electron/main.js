'use strict';

const { app, BrowserWindow, protocol, ipcMain, shell, Menu, nativeImage, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

// Everything the renderer loads is served from a single privileged origin:
//   app://prism/<path>      -> src/<path>                (the shell, bundled modules, vendored three.js)
//   app://prism/user/<path> -> <userData>/modules/<path> (modules installed by the user)
const SCHEME = 'app';
const HOST = 'prism';
const ORIGIN = `${SCHEME}://${HOST}`;

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
]);

const SRC_DIR = path.join(__dirname, '..', 'src');
const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.png');
const userModulesDir = () => path.join(app.getPath('userData'), 'modules');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
};

// Resolve a request path inside `root`, refusing anything that escapes it.
function safeJoin(root, rel) {
  const target = path.normalize(path.join(root, rel));
  return target === root || target.startsWith(root + path.sep) ? target : null;
}

function resolveRequest(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel.startsWith('user/')) return safeJoin(userModulesDir(), rel.slice('user/'.length));
  return safeJoin(SRC_DIR, rel || 'index.html');
}

async function handleRequest(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Not found', { status: 404 });
  const file = resolveRequest(url.pathname);
  if (!file) return new Response('Forbidden', { status: 403 });
  try {
    const body = await fsp.readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    return new Response(body, { headers: { 'content-type': type, 'cache-control': 'no-cache' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

// ---------------------------------------------------------------------------
// Module discovery: every folder containing a module.json is a module.
// ---------------------------------------------------------------------------
async function scanModules(dir, urlBase, source) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(dir, entry.name, 'module.json');
    try {
      const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
      if (!manifest.id || !manifest.name) throw new Error('module.json needs "id" and "name"');
      found.push({
        entry: 'index.js',
        order: 100,
        ...manifest,
        source,
        baseUrl: `${ORIGIN}/${urlBase}/${encodeURIComponent(entry.name)}/`,
      });
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[modules] skipping ${manifestPath}: ${err.message}`);
    }
  }
  return found;
}

async function listModules() {
  const builtIn = await scanModules(path.join(SRC_DIR, 'modules'), 'modules', 'built-in');
  const user = await scanModules(userModulesDir(), 'user', 'user');
  // A user module with the same id replaces the built-in one.
  const byId = new Map();
  for (const mod of [...builtIn, ...user]) byId.set(mod.id, mod);
  return [...byId.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Desktop integration (Linux AppImage)
// ---------------------------------------------------------------------------
// An AppImage installs nothing, so docks have no .desktop entry to match the
// window (WM_CLASS / Wayland app_id "prism") against and show a generic gear.
// Register an entry and icon for the current user, and keep the Exec path
// pointing at wherever the AppImage was last launched from.
async function integrateDesktop() {
  const appImage = process.env.APPIMAGE;
  if (process.platform !== 'linux' || !appImage) return;
  const share = process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local', 'share');
  const iconFile = path.join(share, 'icons', 'hicolor', '512x512', 'apps', 'prism.png');
  const desktopFile = path.join(share, 'applications', 'prism.desktop');
  const entry = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Prism',
    'Comment=Modular 3D workspace',
    `Exec="${appImage.replace(/(["`$\\])/g, '\\$1')}" %U`,
    // An absolute path, so a stale icon-theme.cache can't hide the icon.
    `Icon=${iconFile}`,
    'Terminal=false',
    'Categories=Utility;',
    'StartupWMClass=prism',
    'StartupNotify=true',
    '',
  ].join('\n');
  try {
    const current = await fsp.readFile(desktopFile, 'utf8').catch(() => '');
    if (current === entry && fs.existsSync(iconFile)) return;
    await fsp.mkdir(path.dirname(iconFile), { recursive: true });
    await fsp.mkdir(path.dirname(desktopFile), { recursive: true });
    await fsp.writeFile(iconFile, await fsp.readFile(ICON_PATH));
    await fsp.writeFile(desktopFile, entry, { mode: 0o755 });
  } catch (err) {
    console.warn('[desktop] could not register desktop entry:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 900,
    minHeight: 620,
    frame: false,
    backgroundColor: '#05060a',
    show: false,
    title: 'Prism',
    icon: nativeImage.createFromPath(ICON_PATH),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Sound effects play from the start (intros run before the first click).
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => win.webContents.send('win:state', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('win:state', { maximized: false }));

  // Keep navigation inside the app; open external links in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) event.preventDefault();
  });

  // No menu bar, so wire up the usual developer shortcuts by hand.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'f12' || (input.control && input.shift && key === 'i')) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (input.control && key === 'r') {
      win.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
  });

  win.loadURL(`${ORIGIN}/index.html`);
}

// ---------------------------------------------------------------------------
// Local AI: one shared utility process, started on first use
// ---------------------------------------------------------------------------
// Only Hugging Face model ids and known quantizations are accepted, so a page
// can't make the host download from arbitrary places.
const MODEL_ID = /^[\w.-]+\/[\w.-]+$/;
const DTYPES = new Set(['int8', 'q8', 'uint8', 'q4', 'q4f16', 'fp16', 'fp32', 'bnb4']);
let aiHost = null;

function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload);
}

function ensureAiHost() {
  if (aiHost) return aiHost;
  aiHost = utilityProcess.fork(path.join(__dirname, 'ai-host.mjs'), [], {
    serviceName: 'Prism AI',
    env: { ...process.env, PRISM_MODELS_DIR: path.join(app.getPath('userData'), 'models') },
    stdio: 'inherit',
  });
  aiHost.on('message', (msg) => broadcast('ai:event', msg));
  aiHost.on('exit', (code) => {
    aiHost = null;
    broadcast('ai:event', { type: 'host-exit', code });
  });
  return aiHost;
}

ipcMain.on('ai', (_event, msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.spec && (!MODEL_ID.test(msg.spec.model) || !DTYPES.has(msg.spec.dtype))) {
    broadcast('ai:event', { type: 'error', id: msg.id, message: 'Unsupported model spec' });
    return;
  }
  ensureAiHost().postMessage(msg);
});
ipcMain.handle('ai:modelsDir', () => path.join(app.getPath('userData'), 'models'));

ipcMain.handle('modules:list', () => listModules());
ipcMain.handle('modules:openFolder', async () => {
  const dir = userModulesDir();
  await fsp.mkdir(dir, { recursive: true });
  await shell.openPath(dir);
  return dir;
});
ipcMain.on('win', (event, action) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w) return;
  if (action === 'minimize') w.minimize();
  else if (action === 'toggleMaximize') (w.isMaximized() ? w.unmaximize() : w.maximize());
  else if (action === 'close') w.close();
});

app.whenReady().then(async () => {
  await integrateDesktop();
  Menu.setApplicationMenu(null);
  protocol.handle(SCHEME, handleRequest);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
