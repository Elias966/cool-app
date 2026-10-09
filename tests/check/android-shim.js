// Preload for the checker's phone and tablet windows: a stand-in for the
// native side of the Android app (window.AndroidBridge), recording what the
// page asks of it so the checker can report haptics, shares and copies.
const { contextBridge } = require('electron');

const log = { haptics: [], shared: [], copied: [], opened: [] };
contextBridge.exposeInMainWorld('AndroidBridge', {
  insets: () => JSON.stringify({ top: 24, right: 0, bottom: 20, left: 0 }),
  copyText: (text) => (log.copied.push(String(text).slice(0, 200)), true),
  shareFile: (name) => (log.shared.push(name), true),
  haptic: (kind) => log.haptics.push(kind),
  openUrl: (url) => log.opened.push(url),
  appVersion: () => 'check',
});
contextBridge.exposeInMainWorld('__checkBridgeLog', () => JSON.parse(JSON.stringify(log)));
