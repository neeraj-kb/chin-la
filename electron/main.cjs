const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let mainWindow;

function createWindow() {
  const isDevelopment = !app.isPackaged && process.env.SCREENWISE_LOAD_DIST !== '1';
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
  const distPath = path.join(__dirname, '..', 'dist', 'index.html');
  mainWindow = new BrowserWindow({
    width: 430,
    height: 820,
    minWidth: 370,
    minHeight: 620,
    maxWidth: 560,
    title: 'Screenwise Companion',
    frame: false,
    transparent: false,
    backgroundColor: '#10171c',
    alwaysOnTop: true,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Keep the companion out of its own screen capture on Windows.
  if (process.platform === 'win32') mainWindow.setContentProtection(true);

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    let isAllowed = false;
    if (isDevelopment) {
      try { isAllowed = new URL(targetUrl).origin === new URL(devUrl).origin; } catch { /* Block malformed URLs. */ }
    } else {
      isAllowed = targetUrl === pathToFileURL(distPath).href;
    }
    if (!isAllowed) event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  if (isDevelopment) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(distPath);
}

ipcMain.handle('capture:list-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 800, height: 500 },
    fetchWindowIcons: false,
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    kind: source.id.startsWith('screen:') ? 'Screen' : 'Window',
    thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
  }));
});

ipcMain.handle('capture:frame', async (_event, sourceId) => {
  if (typeof sourceId !== 'string' || sourceId.length > 300) {
    throw new Error('Choose a valid screen or window first.');
  }
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 1280, height: 800 },
    fetchWindowIcons: false,
  });
  const source = sources.find((candidate) => candidate.id === sourceId);
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('That screen or window is no longer available. Select it again.');
  }
  return source.thumbnail.toDataURL();
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:close', () => mainWindow?.close());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
