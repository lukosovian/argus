// ARGUS masaüstü uygulaması (Electron). Kullanıcı "uygulama gibi değil, uygulama olsun; Edge'de falan
// çalışmayacak, kendi başına bir uygulama" dedi — Discord / Spotify'ın masaüstü uygulamaları gibi.
// Bu süreç ARGUS'un sunucusunu (start.mjs: arayüzü paketler + API) kendisi başlatır, kendi penceresini
// açar; pencere kapanınca sunucuyu da kapatır. Başlatan: ARGUS.bat (bkz. :launch) ya da açılış
// penceresi (launcher/baslat.ps1). Masaüstü simgesine ikinci kez basılırsa açık pencere öne gelir.
const { app, BaseWindow, WebContentsView, shell, session, nativeTheme, Menu, screen, Tray, ipcMain, globalShortcut, Notification } = require('electron')
const { spawn, execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const net = require('node:net')

const APP_DIR = path.join(__dirname, '..')
const URL = 'http://localhost:5173/'
const ICON = path.join(APP_DIR, 'public', 'argus.ico')
const DEV_MACHINE = fs.existsSync(path.join(APP_DIR, '..', '.gelistirici'))
// Kendi başlık çubuğumuzun yüksekliği — kullanıcı "üstteki uygulama adının yazdığı yer biraz ince, kalınlaştır,
// sadece ARGUS yazsın" dedi. Windows'un standart çubuğu (~32 px, sayfa başlığını yazar) yerine 40 px, solda
// logo + "ARGUS" (desktop/titlebar.html); küçült / büyüt / kapat düğmelerini Windows kendisi çiziyor.
const TITLEBAR = 40

app.setAppUserModelId('ARGUS')
if (!app.requestSingleInstanceLock()) {
  app.quit()
  return
}

let win = null
let view = null // ARGUS'un sayfası (başlık çubuğunun altında)
let server = null
let tray = null
let quitting = false

// ---- Uygulama ayarları (Ayarlar › Uygulama Ayarları) -----------------------------------------------
// Kullanıcı "bilgisayar açılırken açılsın, kapatınca tepsiye küçülsün gibi Windows ayarları" istedi, sonra
// önerilen diğerlerini de ("hepsini beğendim"). Bu makineye özel oldukları için uygulamanın kendi klasöründe
// (userData = %APPDATA%\ARGUS\ayarlar.json) duruyorlar — ARGUS.exe de "guncelleme"yi buradan okuyor.
//   baslangic : Windows açılınca ARGUS da açılsın (ARGUS.exe başlangıç programlarına eklenir)
//   gizliBasla: başlangıçta pencereyi açmadan tepside başlasın (sadece tepsi açıkken anlamlı)
//   tepsi     : kapat düğmesi ARGUS'u kapatmasın, saatin yanındaki tepsiye küçültsün (arkada çalışmaya devam eder)
//   buyukBasla: pencere hep büyütülmüş (tam ekran) açılsın
//   bildirim  : yeni bölüm / sezon haberleri Windows bildirimi olarak da çıksın
//   zoom      : yazı ve arayüz boyutu (0.9 / 1 / 1.1 / 1.25)
//   kisayol   : Ctrl+Alt+A her yerden ARGUS'u öne getirsin
//   guncelleme: 'otomatik' (açılışta kendiliğinden) ya da 'sor' (ARGUS.exe açılışta sorar)
const settingsFile = path.join(app.getPath('userData'), 'ayarlar.json')
const DEFAULTS = {
  baslangic: false,
  gizliBasla: false,
  tepsi: false,
  buyukBasla: false,
  bildirim: true,
  zoom: 1,
  kisayol: false,
  guncelleme: 'otomatik',
  tepsiBilgisiGosterildi: false,
  sonProfil: null,
  bildirimSon: {},
}
const ZOOMS = [0.9, 1, 1.1, 1.25]
const HOTKEY = 'Control+Alt+A'
function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8').replace(/^\uFEFF/, '')) }
  } catch {
    return { ...DEFAULTS }
  }
}
let settings = loadSettings()
let hotkeyOk = true
function saveSettings() {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
  } catch {
    /* önemsiz */
  }
}
const LAUNCHER_EXE = path.join(APP_DIR, '..', 'ARGUS.exe')
function applyLoginItem() {
  if (process.platform !== 'win32' || !fs.existsSync(LAUNCHER_EXE)) return
  // Önceki kaydı (argümanı farklı olabilir) temizle, sonra istenen hali yaz
  for (const args of [[], ['--arka-plan']]) app.setLoginItemSettings({ openAtLogin: false, path: LAUNCHER_EXE, args, name: 'ARGUS' })
  if (settings.baslangic)
    app.setLoginItemSettings({ openAtLogin: true, path: LAUNCHER_EXE, args: settings.gizliBasla && settings.tepsi ? ['--arka-plan'] : [], name: 'ARGUS' })
}
function showWindow() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (view) view.webContents.focus()
}
// Sayfaya "şuraya git" / "Ne İzlesem'i aç" de (bkz. src/App.tsx'teki argus-git ve RandomPickerButton)
function openInApp(what) {
  showWindow()
  if (!view) return
  const js = what === 'ne-izlesem' ? "window.dispatchEvent(new Event('argus-ne-izlesem'))" : 'window.dispatchEvent(new CustomEvent("argus-git", { detail: ' + JSON.stringify(what) + ' }))'
  view.webContents.executeJavaScript(js).catch(() => {})
}
function todayIso() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function applyTray() {
  if (settings.tepsi && !tray) {
    tray = new Tray(ICON)
    tray.setToolTip('ARGUS')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "ARGUS'u aç", click: showWindow },
        { type: 'separator' },
        { label: 'Ne İzlesem?', click: () => openInApp('ne-izlesem') },
        { label: 'Takvim', click: () => openInApp('/takvim') },
        { label: 'Bugün izlediğimi ekle', click: () => openInApp('/takvim?ay=' + todayIso().slice(0, 7) + '&gun=' + todayIso()) },
        { type: 'separator' },
        {
          label: "ARGUS'u kapat",
          click: () => {
            quitting = true
            app.quit()
          },
        },
      ]),
    )
    tray.on('click', showWindow)
  } else if (!settings.tepsi && tray) {
    tray.destroy()
    tray = null
  }
}
function applyHotkey() {
  globalShortcut.unregister(HOTKEY)
  hotkeyOk = true
  if (settings.kisayol) hotkeyOk = globalShortcut.register(HOTKEY, showWindow)
}
function applyZoom() {
  if (view) view.webContents.setZoomFactor(settings.zoom || 1)
}
function publicSettings() {
  return {
    baslangic: settings.baslangic,
    gizliBasla: settings.gizliBasla,
    tepsi: settings.tepsi,
    buyukBasla: settings.buyukBasla,
    bildirim: settings.bildirim,
    zoom: settings.zoom,
    kisayol: settings.kisayol,
    kisayolCalisiyor: hotkeyOk,
    guncelleme: settings.guncelleme,
    exeVar: fs.existsSync(LAUNCHER_EXE),
  }
}
ipcMain.handle('ayarlar:al', () => publicSettings())
ipcMain.handle('ayarlar:yaz', (_e, patch) => {
  for (const k of ['baslangic', 'gizliBasla', 'tepsi', 'buyukBasla', 'bildirim', 'kisayol']) if (typeof patch?.[k] === 'boolean') settings[k] = patch[k]
  if (ZOOMS.includes(patch?.zoom)) settings.zoom = patch.zoom
  if (patch?.guncelleme === 'otomatik' || patch?.guncelleme === 'sor') settings.guncelleme = patch.guncelleme
  saveSettings()
  applyLoginItem()
  applyTray()
  applyHotkey()
  applyZoom()
  return publicSettings()
})
// Sayfa, seçili profili bildiriyor — Windows bildirimleri o profilin haberlerinden çıkar
ipcMain.on('profil', (_e, id) => {
  if (typeof id === 'string' && id !== settings.sonProfil) {
    settings.sonProfil = id
    saveSettings()
  }
})

// ---- Windows bildirimleri --------------------------------------------------------------------------
// ARGUS'un zilindeki yeni haberler (dizi bitti, yeni bölüm, yeni sezon…) Windows bildirimi olarak da çıkar —
// pencere kapalıyken (tepside) bile. Dakikada bir, son seçilen profilin bildirimlerine bakılır.
async function checkNotifications() {
  if (!settings.bildirim || !settings.sonProfil || !Notification.isSupported()) return
  let items
  try {
    const r = await fetch('http://127.0.0.1:4000/api/profiles/' + settings.sonProfil + '/notifications')
    if (!r.ok) return
    items = (await r.json()).items || []
  } catch {
    return
  }
  const last = settings.bildirimSon[settings.sonProfil]
  const newest = items.reduce((m, x) => Math.max(m, x.t || 0), 0)
  // İlk kez bakılıyorsa eskileri bildirme, sadece bundan sonrakileri
  if (last === undefined) {
    settings.bildirimSon[settings.sonProfil] = newest || Date.now()
    saveSettings()
    return
  }
  const fresh = items.filter((x) => x.t > last && !x.read).sort((x, y) => x.t - y.t).slice(-3)
  for (const n of fresh) {
    const note = new Notification({ title: n.title || 'ARGUS', body: n.text || '', icon: ICON, silent: false })
    note.on('click', () => {
      if (n.boardId && n.rowId) openInApp('/board/' + n.boardId + '?detay=' + n.rowId)
      else if (n.link) openInApp(n.link)
      else showWindow()
    })
    note.show()
  }
  if (newest > last) {
    settings.bildirimSon[settings.sonProfil] = newest
    saveSettings()
  }
}

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
  win = new BaseWindow({
    ...st,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'ARGUS',
    icon: ICON,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0b0e', symbolColor: '#d4d4d4', height: TITLEBAR },
  })
  // Görev çubuğuna sabitlenince electron.exe değil ARGUS sabitlensin (kullanıcı "sabitle deyince uygulamayı
  // değil Electron'u sabitliyor" dedi): adı ARGUS, simgesi ve tıklanınca açılacak olan ARGUS.exe.
  const exe = path.join(APP_DIR, '..', 'ARGUS.exe')
  if (process.platform === 'win32') {
    const hasExe = fs.existsSync(exe)
    win.setAppDetails({
      appId: 'ARGUS',
      appIconPath: hasExe ? exe : ICON,
      appIconIndex: 0,
      relaunchCommand: hasExe ? '"' + exe + '"' : '"' + process.execPath + '" "' + __dirname + '"',
      relaunchDisplayName: 'ARGUS',
    })
  }
  const bar = new WebContentsView({ webPreferences: { sandbox: true } })
  bar.setBackgroundColor('#0b0b0e')
  bar.webContents.loadFile(path.join(__dirname, 'titlebar.html'))
  view = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.cjs') } })
  view.setBackgroundColor('#0a0a0a')
  win.contentView.addChildView(bar)
  win.contentView.addChildView(view)
  const layout = () => {
    if (!win) return
    const [w, h] = win.getContentSize()
    bar.setBounds({ x: 0, y: 0, width: w, height: TITLEBAR })
    view.setBounds({ x: 0, y: TITLEBAR, width: w, height: Math.max(0, h - TITLEBAR) })
  }
  layout()
  win.on('resize', layout)
  win.on('maximize', layout)
  win.on('unmaximize', layout)
  if (st.maximized || settings.buyukBasla) win.maximize()
  // Bilgisayar açılırken "tepside başla" seçildiyse (ARGUS.exe --arka-plan) pencere gösterilmez
  const hidden = process.env.ARGUS_ARKA_PLAN === '1' && settings.tepsi
  // Yazı ve arayüz boyutu her sayfa yüklemesinde uygulansın
  view.webContents.on('did-finish-load', applyZoom)
  view.webContents.once('did-finish-load', () => {
    layout()
    if (hidden) return
    win.show()
    win.focus()
    view.webContents.focus()
  })
  win.on('focus', () => view && view.webContents.focus())
  win.on('close', (e) => {
    saveState()
    // Tepsi açıksa kapat düğmesi ARGUS'u kapatmaz, gizler (tepsideki simgeden geri açılır / kapatılır)
    if (settings.tepsi && !quitting) {
      e.preventDefault()
      win.hide()
      if (!settings.tepsiBilgisiGosterildi && tray) {
        tray.displayBalloon({ title: 'ARGUS arka planda çalışıyor', content: 'Tekrar açmak için bu simgeye tıkla. Tamamen kapatmak için sağ tıkla › ARGUS\'u kapat.', iconType: 'info' })
        settings.tepsiBilgisiGosterildi = true
        saveSettings()
      }
    }
  })
  win.on('closed', () => {
    win = null
    view = null
    app.quit()
  })

  // Dış bağlantılar (YouTube, TMDB, IMDb…) kullanıcının normal tarayıcısında açılır
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
  view.webContents.on('will-navigate', (e, url) => {
    if (isLocal(url)) return
    e.preventDefault()
    // Pencereye sürüklenip boş bir yere bırakılan dosya: açmaya kalkma (sembol ekleme gibi yerler kendi işler)
    if (!url.startsWith('file:')) shell.openExternal(url)
  })

  // Kısayollar: F5 / Ctrl+R yenile, Ctrl +/- / 0 yakınlaştır, Alt+← → geri/ileri (menü çubuğu yok)
  view.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return
    const wc = view.webContents
    const ctrl = i.control || i.meta
    if (i.key === 'F5' || (ctrl && i.key.toLowerCase() === 'r')) wc.reload()
    // Ctrl +/- : Uygulama Ayarları'ndaki "yazı ve arayüz boyutu" adımları arasında gezer ve kalıcı olur
    else if (ctrl && (i.key === '+' || i.key === '=' || i.key === '-' || i.key === '0')) {
      const cur = ZOOMS.indexOf(settings.zoom)
      const idx = i.key === '0' ? 1 : Math.max(0, Math.min(ZOOMS.length - 1, (cur < 0 ? 1 : cur) + (i.key === '-' ? -1 : 1)))
      settings.zoom = ZOOMS[idx]
      saveSettings()
      applyZoom()
    }
    else if (i.alt && i.key === 'ArrowLeft' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
    else if (i.alt && i.key === 'ArrowRight' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
    else if (i.key === 'F12' && DEV_MACHINE) wc.toggleDevTools()
    else return
    e.preventDefault()
  })
  // Farenin geri / ileri tuşları
  win.on('app-command', (_e, cmd) => {
    const h = view.webContents.navigationHistory
    if (cmd === 'browser-backward' && h.canGoBack()) h.goBack()
    if (cmd === 'browser-forward' && h.canGoForward()) h.goForward()
  })

  view.webContents.loadURL(URL)
  // Sunucu henüz hazır değilken yüklenemediyse (ör. ağır açılış) biraz sonra tekrar dene
  view.webContents.on('did-fail-load', (_e, code) => {
    if (code === -3) return // iptal (yönlendirme)
    setTimeout(() => view && view.webContents.loadURL(URL), 1000)
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

app.on('second-instance', showWindow)

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark'
  Menu.setApplicationMenu(null)
  // İndirilenler (Flashback görselleri vb.) sormadan İndirilenler klasörüne kaydedilsin
  session.defaultSession.on('will-download', (_e, item) => {
    item.setSavePath(path.join(app.getPath('downloads'), item.getFilename()))
  })
  applyTray()
  applyLoginItem()
  applyHotkey()
  setInterval(checkNotifications, 60 * 1000)
  await startServer()
  await waitForServer(10 * 60 * 1000)
  await migrateBrowserPrefs()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  quitting = true
  stopServer()
})
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopServer()
})
