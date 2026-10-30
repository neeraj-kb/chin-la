const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companionDesktop', {
  listCaptureSources: () => ipcRenderer.invoke('capture:list-sources'),
  captureFrame: (sourceId) => ipcRenderer.invoke('capture:frame', sourceId),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
});
