// YTV2 What's New window - preload (exposes only the data receiver + close).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('whatsnew', {
  onData: cb => ipcRenderer.on('ytv2:whatsnew', (_event, data) => cb(data)),
  close: () => ipcRenderer.send('ytv2:whatsnew-close'),
});
