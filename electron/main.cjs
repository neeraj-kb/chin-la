const { app, BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let mainWindow;

function createWindow() {
  const isDevelopment = !app.isPackaged && process.env.SCREENWISE_LOAD_DIST !== '1';
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
  const distPath = path.join(__dirname, '..', 'dist', 'index.html');
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = Math.min(560, Math.max(380, workAreaWidth - 32));
  const windowHeight = Math.min(820, Math.max(560, workAreaHeight - 24));
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: Math.min(420, windowWidth),
    minHeight: Math.min(600, windowHeight),
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
    thumbnailSize: { width: 480, height: 300 },
    fetchWindowIcons: false,
  });
  return sources.flatMap((source) => {
    // Some Windows sources (for example minimized or protected windows) are
    // returned without a usable frame. Don't offer a source that cannot scan.
    if (source.thumbnail.isEmpty()) return [];
    return [{
      id: source.id,
      name: source.name,
      kind: source.id.startsWith('screen:') ? 'Screen' : 'Window',
      thumbnail: source.thumbnail.toDataURL(),
    }];
  });
});

ipcMain.handle('capture:frame', async (_event, sourceId) => {
  if (typeof sourceId !== 'string' || sourceId.length > 300) {
    throw new Error('Choose a valid screen or window first.');
  }
  const sourceType = sourceId.startsWith('screen:') ? 'screen' : 'window';
  const sources = await desktopCapturer.getSources({
    // Avoid enumerating/capturing every app window when the user selected a
    // display. That path can otherwise stall on minimized Windows windows.
    types: [sourceType],
    // Keep screen text legible for visual analysis. Electron scales the
    // thumbnail to fit this bound while preserving the source aspect ratio.
    thumbnailSize: { width: 1920, height: 1200 },
    fetchWindowIcons: false,
  });
  const source = sources.find((candidate) => candidate.id === sourceId);
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('That source is not producing a screen image. Bring the window to the front or choose the entire screen.');
  }
  const maxDataUrlLength = 8_500_000;
  const pngDataUrl = `data:image/png;base64,${source.thumbnail.toPNG().toString('base64')}`;
  if (pngDataUrl.length <= maxDataUrlLength) return pngDataUrl;

  // Keep high-resolution captures under the local API's request size limit.
  const jpegDataUrl = `data:image/jpeg;base64,${source.thumbnail.toJPEG(90).toString('base64')}`;
  if (jpegDataUrl.length > maxDataUrlLength) {
    throw new Error('This screen image is too large to analyze. Choose a single app window instead.');
  }
  return jpegDataUrl;
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:close', () => mainWindow?.close());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
