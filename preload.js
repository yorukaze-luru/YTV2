// YTV2 Desktop - preload bridge (renderer <-> main, data file only)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ytv2Desktop', {
  isDesktop: true,
  loadData: () => ipcRenderer.invoke('ytv2:load-data'),
  saveData: (data) => ipcRenderer.invoke('ytv2:save-data', data),
  dataPath: () => ipcRenderer.invoke('ytv2:data-path'),
});
