// YTV2 Desktop - Electron main process
// Data is stored as JSON in the OS user-data folder
// (e.g. %APPDATA%/ytv2-desktop/ytv2-data.json on Windows),
// so updating / reinstalling the app never loses registrations.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

// ---- Automatic updates (electron-updater + GitHub Releases) ----------------
// On launch (packaged builds only), check the latest GitHub release, download
// it in the background, and offer a restart to install. If the user postpones,
// the update is installed automatically when the app quits.
function setupAutoUpdate(win) {
  if (!app.isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (_) { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'アップデートの準備ができました',
      message: `新しいバージョン ${info.version} をダウンロードしました。`,
      detail: '今すぐ再起動すると更新が適用されます。「後で」を選んだ場合も、アプリ終了時に自動で更新されます。',
      buttons: ['今すぐ再起動して更新', '後で'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', () => { /* offline etc: stay silent, data is local */ });
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
