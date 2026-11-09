// YTV2 Desktop - Electron main process
// Data is stored as JSON in the OS user-data folder
// (e.g. %APPDATA%/ytv2-desktop/ytv2-data.json on Windows),
// so updating / reinstalling the app never loses registrations.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
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
// (gauge). When the download finishes, the install runs silently (no setup
// wizard) and the app restarts itself -- but NOT via the installer: an
// installer-launched instance can come up unable to receive input (only a
// manual restart fixes it). Instead, a detached watcher process waits for
// the installer to finish and then starts the app normally.

// Waits for the update installer to appear and finish, then relaunches the
// app. Never launches while the installer is still running (that could lock
// the files being replaced); if the installer never starts, it just brings
// the current app back.
function spawnRelaunchWatcher(targetVersion) {
  const exe = process.execPath.replace(/'/g, "''");
  const ver = String(targetVersion || '').replace(/'/g, "''");
  const ps = [
    `$exe = '${exe}'`,
    `$target = '${ver}'`,
    `$m0 = (Get-Item $exe).LastWriteTimeUtc`,
    `$seen = $false`,
    `$deadline = (Get-Date).AddSeconds(90)`,
    `while ((Get-Date) -lt $deadline) {`,
    `  if (Get-Process | Where-Object { $_.ProcessName -like 'YTV2-Setup*' }) { $seen = $true; break }`,
    `  if ((Get-Item $exe).LastWriteTimeUtc -ne $m0) { $seen = $true; break }`,
    `  if ((Get-Item $exe).VersionInfo.FileVersion -eq $target) { $seen = $true; break }`,
    `  Start-Sleep -Milliseconds 500`,
    `}`,
    `if (-not $seen) { Start-Process -FilePath $exe; exit }`,
    `$deadline = (Get-Date).AddMinutes(6)`,
    `while ((Get-Date) -lt $deadline) {`,
    `  if (-not (Get-Process | Where-Object { $_.ProcessName -like 'YTV2-Setup*' })) { break }`,
    `  Start-Sleep -Seconds 1`,
    `}`,
    `if (Get-Process | Where-Object { $_.ProcessName -like 'YTV2-Setup*' }) { exit }`,
    `$deadline = (Get-Date).AddSeconds(60)`,
    `while ((Get-Date) -lt $deadline) {`,
    `  try {`,
    `    $v = (Get-Item $exe).VersionInfo.FileVersion`,
    `    $f = [System.IO.File]::Open($exe, 'Open', 'ReadWrite', 'None'); $f.Close()`,
    `    if ($v -eq $target) { break }`,
    `  } catch {}`,
    `  Start-Sleep -Seconds 1`,
    `}`,
    `Start-Sleep -Seconds 2`,
    `Start-Process -FilePath $exe`,
  ].join('; ');
  try {
    spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps],
      { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch (_) { /* if the watcher cannot start, quitAndInstall still proceeds */ }
}
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
    spawnRelaunchWatcher(info.version);
    setTimeout(() => autoUpdater.quitAndInstall(true, false), 1500);
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
