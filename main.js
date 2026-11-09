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
    icon: path.join(__dirname, 'tools', 'icon-192.png'),
    backgroundColor: '#f4f6fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
