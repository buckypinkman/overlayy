const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  openFile: () => ipcRenderer.invoke('open-file'),
  getOpacity: () => ipcRenderer.invoke('get-opacity'),
  setOpacity: (value) => ipcRenderer.invoke('set-opacity', value),
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit'),
  resizeStart: () => ipcRenderer.send('resize-start'),
  resizeMove: (dx, dy) => ipcRenderer.send('resize-move', dx, dy),
  resizeEnd: () => ipcRenderer.send('resize-end'),
  onOpacityChanged: (cb) => ipcRenderer.on('opacity-changed', (_e, v) => cb(v)),
  onClickThroughChanged: (cb) => ipcRenderer.on('click-through-changed', (_e, on) => cb(on)),
});
