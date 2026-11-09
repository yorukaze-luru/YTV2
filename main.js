// YTV2 Desktop - Electron main process
// Data is stored as JSON in the OS user-data folder
// (e.g. %APPDATA%/ytv2-desktop/ytv2-data.json on Windows),
// so updating / reinstalling the app never loses registrations.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_FILE = () => path.join(app.getPath('userData'), 'ytv2-data.json');

function readDataFile() {
  try {
    const raw = fs.readFileSync(DATA_FILE(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) return parsed;
  } catch (_) { /* first launch or unreadable file -> start empty */ }
  return { version: 2, entries: [] };
}

function writeDataFile(data) {
  const dir = path.dirname(DATA_FILE());
  fs.mkdirSync(dir, { recursive: true });
  const tmp = DATA_FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE()); // atomic replace
  return true;
}

ipcMain.handle('ytv2:load-data', () => readDataFile());
ipcMain.handle('ytv2:save-data', (_event, data) => {
  if (!data || !Array.isArray(data.entries)) return false;
  return writeDataFile({ version: 2, entries: data.entries });
});
ipcMain.handle('ytv2:data-path', () => DATA_FILE());

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1020,
    minHeight: 640,
    title: 'YTV2 一覧生成ツール',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#f4f6fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => { win.focus(); win.webContents.focus(); });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

// ---- Updates (electron-updater + GitHub Releases) --------------------------
// The current version is shown at the top of the window. When a newer release
// is found, the renderer shows an "アップデートをする" button; the download
// starts only when the user presses it. Progress is streamed to the renderer
// (gauge), and when the download finishes the update installs automatically
// but the app is NOT relaunched by the
// installer: an installer-launched instance can come up unable to receive
// input (fixed only by a manual restart), so the user starts the app again
// themselves after the install finishes.
function setupAutoUpdate(win) {
  ipcMain.handle('ytv2:get-version', () => app.getVersion());
  if (!app.isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (_) { return; }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  const send = payload => { if (!win.isDestroyed()) win.webContents.send('ytv2:update-status', payload); };
  autoUpdater.on('update-available', info => send({ state: 'available', version: info.version }));
  autoUpdater.on('download-progress', p => send({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', info => {
    send({ state: 'installing', version: info.version });
    setTimeout(() => autoUpdater.quitAndInstall(false, false), 1500);
  });
  autoUpdater.on('error', () => send({ state: 'error' }));
  ipcMain.handle('ytv2:check-update', async () => {
    try { await autoUpdater.checkForUpdates(); return true; } catch (_) { return false; }
  });
  ipcMain.handle('ytv2:download-update', async () => {
    try { await autoUpdater.downloadUpdate(); return true; } catch (_) { return false; }
  });
  const check = () => { autoUpdater.checkForUpdates().catch(() => {}); };
  check();
  setInterval(check, 4 * 60 * 60 * 1000); // re-check every 4 hours
}

app.whenReady().then(() => {
  const win = createWindow();
  setupAutoUpdate(win);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
