// ARGUS masaüstü uygulaması (Electron). Kullanıcı "uygulama gibi değil, uygulama olsun; Edge'de falan
// çalışmayacak, kendi başına bir uygulama" dedi — Discord / Spotify'ın masaüstü uygulamaları gibi.
// Bu süreç ARGUS'un sunucusunu (start.mjs: arayüzü paketler + API) kendisi başlatır, kendi penceresini
// açar; pencere kapanınca sunucuyu da kapatır. Başlatan: ARGUS.bat (bkz. :launch) ya da açılış
// penceresi (launcher/baslat.ps1). Masaüstü simgesine ikinci kez basılırsa açık pencere öne gelir.
const { app, BrowserWindow, shell, session, nativeTheme, Menu, screen } = require('electron')
const { spawn, execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const net = require('node:net')

const APP_DIR = path.join(__dirname, '..')
const URL = 'http://localhost:5173/'
const ICON = path.join(APP_DIR, 'public', 'argus.ico')
const DEV_MACHINE = fs.existsSync(path.join(APP_DIR, '..', '.gelistirici'))

app.setAppUserModelId('ARGUS')
if (!app.requestSingleInstanceLock()) {
  app.quit()
  return
}

let win = null
let server = null

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => {
      s.destroy()
      resolve(true)
    })
    s.once('error', () => resolve(false))
    s.setTimeout(400, () => {
      s.destroy()
      resolve(false)
    })
  })
}

async function waitForServer(ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await portOpen(5173)) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

// Sunucu zaten çalışıyorsa (ör. eski usul başlatılmışsa) yenisini açma
async function startServer() {
  if (await portOpen(5173)) return
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  server = spawn(process.platform === 'win32' ? 'node.exe' : 'node', ['start.mjs'], {
    cwd: APP_DIR,
    env,
    stdio: 'ignore',
    windowsHide: true,
  })
}

function stopServer() {
  if (!server || server.stopped) return
  server.stopped = true
  // start.mjs kendi alt süreçlerini (sunucu, paketleyici) başlatıyor — hepsi birlikte kapansın. Bitmesi
  // BEKLENİYOR: beklemeden çıkınca uygulama kapanırken start.mjs gidip altındaki sunucu açık kalıyordu.
  try {
    execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 8000 })
  } catch {
    try {
      server.kill()
    } catch {
      /* zaten kapanmış */
    }
  }
}

// Pencerenin boyutu / konumu hatırlanır
const stateFile = path.join(app.getPath('userData'), 'pencere.json')
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return s.x < a.x + a.width - 100 && s.x + s.width > a.x + 100 && s.y >= a.y - 20 && s.y < a.y + a.height - 100
    })
    return onScreen ? s : { width: s.width, height: s.height, maximized: s.maximized }
  } catch {
    return { width: 1440, height: 900, maximized: false }
  }
}
function saveState() {
  if (!win) return
  try {
    const b = win.getNormalBounds()
    fs.writeFileSync(stateFile, JSON.stringify({ ...b, maximized: win.isMaximized() }))
  } catch {
    /* önemsiz */
  }
}

function isLocal(url) {
  return url.startsWith('http://localhost:5173') || url.startsWith('http://127.0.0.1:5173')
}

function createWindow() {
  const st = loadState()
  win = new BrowserWindow({
    ...st,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'ARGUS',
    icon: ICON,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  })
  if (st.maximized) win.maximize()
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
  win.on('close', saveState)
  win.on('closed', () => {
    win = null
  })

  // Dış bağlantılar (YouTube, TMDB, IMDb…) kullanıcının normal tarayıcısında açılır
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (isLocal(url)) return
    e.preventDefault()
    // Pencereye sürüklenip boş bir yere bırakılan dosya: açmaya kalkma (sembol ekleme gibi yerler kendi işler)
    if (!url.startsWith('file:')) shell.openExternal(url)
  })

  // Kısayollar: F5 / Ctrl+R yenile, Ctrl +/- / 0 yakınlaştır, Alt+← → geri/ileri (menü çubuğu yok)
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return
    const wc = win.webContents
    const ctrl = i.control || i.meta
    if (i.key === 'F5' || (ctrl && i.key.toLowerCase() === 'r')) wc.reload()
    else if (ctrl && (i.key === '+' || i.key === '=')) wc.setZoomLevel(wc.getZoomLevel() + 0.5)
    else if (ctrl && i.key === '-') wc.setZoomLevel(wc.getZoomLevel() - 0.5)
    else if (ctrl && i.key === '0') wc.setZoomLevel(0)
    else if (i.alt && i.key === 'ArrowLeft' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
    else if (i.alt && i.key === 'ArrowRight' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
    else if (i.key === 'F12' && DEV_MACHINE) wc.toggleDevTools()
    else return
    e.preventDefault()
  })
  // Farenin geri / ileri tuşları
  win.on('app-command', (_e, cmd) => {
    const h = win.webContents.navigationHistory
    if (cmd === 'browser-backward' && h.canGoBack()) h.goBack()
    if (cmd === 'browser-forward' && h.canGoForward()) h.goForward()
  })

  win.loadURL(URL)
  // Sunucu henüz hazır değilken yüklenemediyse (ör. ağır açılış) biraz sonra tekrar dene
  win.webContents.on('did-fail-load', (_e, code) => {
    if (code === -3) return // iptal (yönlendirme)
    setTimeout(() => win && win.loadURL(URL), 1000)
  })
}

// İlk açılışta tarayıcıdaki eski arayüz tercihlerini (kapatılan sütunlar, tema…) uygulamaya taşı: uygulamanın
// hafızası tarayıcınınkinden ayrı. ARGUS eskiden hep varsayılan tarayıcıda açıldığı için o tarayıcıda bir kez
// "ayar-tasi" sayfası açılır; sayfa tercihleri sunucuya gönderir (bkz. src/lib/uiPrefs.ts), uygulama onları alır.
async function migrateBrowserPrefs() {
  const getPrefs = async () => {
    try {
      return await (await fetch('http://127.0.0.1:4000/api/ui-prefs')).json()
    } catch {
      return null
    }
  }
  const first = await getPrefs()
  if (!first || first.migratedAt) return
  shell.openExternal(URL + '?ayar-tasi=1')
  const until = Date.now() + 15000
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 500))
    const p = await getPrefs()
    if (p && p.migratedAt) return
  }
}

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark'
  Menu.setApplicationMenu(null)
  // İndirilenler (Flashback görselleri vb.) sormadan İndirilenler klasörüne kaydedilsin
  session.defaultSession.on('will-download', (_e, item) => {
    item.setSavePath(path.join(app.getPath('downloads'), item.getFilename()))
  })
  await startServer()
  await waitForServer(10 * 60 * 1000)
  await migrateBrowserPrefs()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', stopServer)
app.on('will-quit', stopServer)
