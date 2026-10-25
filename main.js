const { app, BrowserWindow, dialog, globalShortcut, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
const MIN_OPACITY = 0.1;

let win = null;
let clickThrough = false;
let resizeOrigin = null;

function createWindow() {
  win = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#1e1f22',
    title: 'Overlayy',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The important bit: excludes the window from screen capture.
  // Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
  // macOS:   NSWindow.sharingType = NSWindowSharingNone
  win.setContentProtection(true);

  // Stay above fullscreen apps / presentations too.
  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function setOpacity(value) {
  const v = Math.min(1, Math.max(MIN_OPACITY, Number(value) || 1));
  win.setOpacity(v);
  send('opacity-changed', v);
  return v;
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
  }
}

function toggleClickThrough() {
  if (!win) return;
  clickThrough = !clickThrough;
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
  send('click-through-changed', clickThrough);
}

function registerShortcuts() {
  const shortcuts = {
    'CommandOrControl+Alt+O': toggleVisible,
    'CommandOrControl+Alt+L': toggleClickThrough,
    'CommandOrControl+Alt+]': () => win && setOpacity(win.getOpacity() + 0.1),
    'CommandOrControl+Alt+[': () => win && setOpacity(win.getOpacity() - 0.1),
    'CommandOrControl+Alt+Q': () => app.quit(),
  };
  for (const [accel, fn] of Object.entries(shortcuts)) {
    if (!globalShortcut.register(accel, fn)) {
      console.warn(`Could not register global shortcut ${accel}`);
    }
  }
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'];

ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'PDF or image', extensions: ['pdf', ...IMAGE_EXTENSIONS] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (canceled || filePaths.length === 0) return null;
  const filePath = filePaths[0];
  const data = await fs.readFile(filePath);
  return { name: path.basename(filePath), data: new Uint8Array(data) };
});

ipcMain.handle('get-opacity', () => win.getOpacity());
ipcMain.handle('set-opacity', (_e, value) => setOpacity(value));
ipcMain.on('hide', () => win && win.hide());
ipcMain.on('quit', () => app.quit());

ipcMain.on('resize-start', () => {
  if (win) resizeOrigin = win.getBounds();
});
ipcMain.on('resize-move', (_e, dx, dy) => {
  if (!win || !resizeOrigin) return;
  win.setBounds({
    x: resizeOrigin.x,
    y: resizeOrigin.y,
    width: Math.max(MIN_WIDTH, Math.round(resizeOrigin.width + dx)),
    height: Math.max(MIN_HEIGHT, Math.round(resizeOrigin.height + dy)),
  });
});
ipcMain.on('resize-end', () => { resizeOrigin = null; });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) win.show();
  });

  app.whenReady().then(() => {
    createWindow();
    registerShortcuts();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
