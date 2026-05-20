// preload.js
const { contextBridge } = require('electron');

// Expose the __IS_ELECTRON__ flag to the frontend window object
contextBridge.exposeInMainWorld('__IS_ELECTRON__', true);

// Also expose general environment info
contextBridge.exposeInMainWorld('__ELECTRON_ENV__', {
  platform: process.platform,
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron
});
