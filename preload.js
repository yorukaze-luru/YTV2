// YTV2 Desktop - preload bridge (renderer <-> main, data file only)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ytv2Desktop', {
  isDesktop: true,
  loadData: () => ipcRenderer.invoke('ytv2:load-data'),
  saveData: (data) => ipcRenderer.invoke('ytv2:save-data', data),
  dataPath: () => ipcRenderer.invoke('ytv2:data-path'),
  getVersion: () => ipcRenderer.invoke('ytv2:get-version'),
  checkUpdate: () => ipcRenderer.invoke('ytv2:check-update'),
  downloadUpdate: () => ipcRenderer.invoke('ytv2:download-update'),
  onUpdateStatus: (cb) => {
    const handler = (_event, status) => cb(status);
    ipcRenderer.on('ytv2:update-status', handler);
    return () => ipcRenderer.removeListener('ytv2:update-status', handler);
  },
});
