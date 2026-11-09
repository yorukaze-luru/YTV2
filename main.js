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
// the installer to finish and then starts the app normally. While it
// waits, the watcher shows a small progress window so the install phase
// has a moving gauge too (the app itself is closed during the install).

// Waits for the update installer to appear and finish, then relaunches the
// app. Never launches while the installer is still running (that could lock
// the files being replaced); if the installer never starts, it just brings
// the current app back.
function buildWatcherScript() {
  return `param([string]$Exe, [string]$Target, [string]$Log)
function Log([string]$m) { try { Add-Content -Path $Log -Value ('[' + (Get-Date -Format 'HH:mm:ss') + '] watcher: ' + $m) -Encoding UTF8 } catch {} }
Log "start target=$Target"
$script:prog = 0
$form = $null; $bar = $null; $pct = $null
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'YTV2 一覧生成ツール'
  $form.Size = New-Object System.Drawing.Size(430, 165)
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false; $form.MinimizeBox = $false; $form.ControlBox = $false
  $form.TopMost = $true
  $label = New-Object System.Windows.Forms.Label
  $label.Text = 'アップデートをインストールしています…'
  $label.Location = New-Object System.Drawing.Point(20, 18)
  $label.Size = New-Object System.Drawing.Size(380, 24)
  $form.Controls.Add($label)
  $bar = New-Object System.Windows.Forms.ProgressBar
  $bar.Location = New-Object System.Drawing.Point(20, 54)
  $bar.Size = New-Object System.Drawing.Size(325, 24)
  $bar.Minimum = 0; $bar.Maximum = 100
  $form.Controls.Add($bar)
  $pct = New-Object System.Windows.Forms.Label
  $pct.Location = New-Object System.Drawing.Point(355, 56)
  $pct.Size = New-Object System.Drawing.Size(50, 24)
  $pct.Text = '0%'
  $form.Controls.Add($pct)
  $form.Show()
  Log 'progress window shown'
} catch { Log "progress window failed: $_"; $form = $null }
function Pump([double]$cap) {
  if ($script:prog -lt $cap) { $script:prog = [Math]::Min($cap, $script:prog + 0.6) }
  if ($form) {
    $bar.Value = [int]$script:prog
    $pct.Text = ([int]$script:prog).ToString() + '%'
    [System.Windows.Forms.Application]::DoEvents()
  }
}
function Running() { return [bool](Get-Process | Where-Object { $_.ProcessName -like 'YTV2-Setup*' }) }
function Unlocked() {
  try { $f = [System.IO.File]::Open($Exe, 'Open', 'ReadWrite', 'None'); $f.Close(); return $true } catch { return $false }
}
$launched = $false
try {
  $m0 = (Get-Item $Exe).LastWriteTimeUtc
  $seen = $false
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    if (Running) { $seen = $true; Log 'installer detected (process)'; break }
    if ((Get-Item $Exe).LastWriteTimeUtc -ne $m0) { $seen = $true; Log 'installer detected (file changed)'; break }
    if ((Get-Item $Exe).VersionInfo.FileVersion -eq $Target) { $seen = $true; Log 'installer detected (version)'; break }
    Pump(30); Start-Sleep -Milliseconds 300
  }
  if (-not $seen) {
    Log 'installer never appeared; relaunching current app'
    Start-Process -FilePath $Exe; $launched = $true
  } else {
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
      if (-not (Running)) { break }
      Pump(80); Start-Sleep -Milliseconds 300
    }
    if (Running) { Log 'installer still running after 120s; continuing to final check anyway' }
    else { Log 'installer finished' }
    $okCount = 0
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
      $v = $null
      try { $v = (Get-Item $Exe).VersionInfo.FileVersion } catch {}
      if (($v -eq $Target) -and (Unlocked)) { $okCount++ } else { $okCount = 0 }
      if ($okCount -ge 3) { Log "new version in place (v$v)"; break }
      Pump(95); Start-Sleep -Milliseconds 400
    }
    if ($okCount -lt 3) { Log "version check timed out (last seen v$v)" }
    $script:prog = 100
    if ($form) { $bar.Value = 100; $pct.Text = '100%'; [System.Windows.Forms.Application]::DoEvents() }
    Start-Sleep -Milliseconds 700
    Log 'launching app'
    Start-Process -FilePath $Exe; $launched = $true
  }
} catch { Log "error: $_" }
if (-not $launched) {
  if (-not (Running)) { Log 'fallback launch'; try { Start-Process -FilePath $Exe } catch { Log "fallback failed: $_" } }
  else { Log 'gave up: installer still running' }
}
if ($form) { $form.Close() }
Log 'done'
`;
}

// Writes the watcher as a .ps1 file in userData and runs it detached with
// -File (a file is far more reliable than one giant -Command string, and it
// leaves a log behind — ytv2-update.log — for diagnosing relaunch problems).
function spawnRelaunchWatcher(targetVersion) {
  try {
    const dir = app.getPath('userData');
    const logPath = path.join(dir, 'ytv2-update.log');
    const scriptPath = path.join(dir, 'ytv2-relaunch.ps1');
    fs.writeFileSync(scriptPath, '\ufeff' + buildWatcherScript(), 'utf-8');
    try {
      fs.appendFileSync(logPath,
        `[${new Date().toISOString()}] app: watcher spawned for v${targetVersion}\n`, 'utf-8');
    } catch (_) { /* log is best effort */ }
    spawn('powershell.exe',
      ['-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
       '-File', scriptPath, process.execPath, String(targetVersion || ''), logPath],
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

// ---- What's New window -------------------------------------------------------
// On the first launch after an update (the stored version differs from the
// running one), a separate modal window shows the release notes of the new
// version, fetched from the GitHub release. The last-run version is kept in
// a small state file in userData.
function appStatePath() { return path.join(app.getPath('userData'), 'ytv2-app-state.json'); }
function readLastVersion() {
  try { return JSON.parse(fs.readFileSync(appStatePath(), 'utf-8')).lastVersion || null; }
  catch (_) { return null; }
}
function writeLastVersion(v) {
  try { fs.writeFileSync(appStatePath(), JSON.stringify({ lastVersion: v }, null, 2), 'utf-8'); }
  catch (_) { /* best effort */ }
}
function notesToPlainText(md) {
  return String(md || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .trim();
}
async function fetchReleaseNotes(version) {
  const fallback = `v${version} にアップデートしました。\n変更点はリリースページで確認できます：\nhttps://github.com/yorukaze-luru/YTV2/releases/tag/v${version}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.github.com/repos/yorukaze-luru/YTV2/releases/tags/v${version}`,
      { headers: { 'User-Agent': 'YTV2-Desktop' }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    const json = await res.json();
    const text = notesToPlainText(json.body);
    return text || fallback;
  } catch (_) { return fallback; }
}
async function maybeShowWhatsNew(win) {
  if (!app.isPackaged) return;
  const current = app.getVersion();
  const prev = readLastVersion();
  writeLastVersion(current);
  if (!prev || prev === current) return;
  const notes = await fetchReleaseNotes(current);
  if (win.isDestroyed()) return;
  const wn = new BrowserWindow({
    width: 600, height: 620, parent: win, modal: true,
    title: `アップデート内容 - v${current}`,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#f4f6fb',
    webPreferences: {
      preload: path.join(__dirname, 'whatsnew-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wn.setMenuBarVisibility(false);
  wn.loadFile(path.join(__dirname, 'whatsnew.html'));
  wn.webContents.once('did-finish-load', () => {
    if (!wn.isDestroyed()) wn.webContents.send('ytv2:whatsnew', { version: current, notes });
  });
}

ipcMain.on('ytv2:whatsnew-close', ev => {
  const w = BrowserWindow.fromWebContents(ev.sender);
  if (w) w.close();
});

app.whenReady().then(() => {
  const win = createWindow();
  setupAutoUpdate(win);
  maybeShowWhatsNew(win);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
