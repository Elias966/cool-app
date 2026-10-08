'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prism', {
  listModules: () => ipcRenderer.invoke('modules:list'),
  openModulesFolder: () => ipcRenderer.invoke('modules:openFolder'),
  ai: {
    send: (msg) => ipcRenderer.send('ai', msg),
    onEvent: (fn) => {
      const listener = (_e, msg) => fn(msg);
      ipcRenderer.on('ai:event', listener);
      return () => ipcRenderer.removeListener('ai:event', listener);
    },
    modelsDir: () => ipcRenderer.invoke('ai:modelsDir'),
  },
  win: {
    minimize: () => ipcRenderer.send('win', 'minimize'),
    toggleMaximize: () => ipcRenderer.send('win', 'toggleMaximize'),
    close: () => ipcRenderer.send('win', 'close'),
    onState: (fn) => ipcRenderer.on('win:state', (_e, state) => fn(state)),
  },
});
