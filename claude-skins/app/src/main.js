// La finestra: trasparente, senza bordi, sempre in primo piano. La sua forma la decide il tema in uso; dove il tema
// non disegna nulla i clic passano alle finestre sotto, e si trascina dalla parte che il tema indica (data-drag).
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut, shell, dialog, Notification, clipboard, protocol, net } = require('electron')
const fs = require('fs')
const path = require('path')
const { ClaudeBridge, DEFAULT_CLAUDE, loadContextMax, savedContextMax } = require('./claude-bridge')
const { Updater } = require('./updater')
const i18n = require('./i18n')
const { tr } = i18n
const { ReleaseUpdater } = require('./release-updater')
const { listFiles, rankFiles } = require('./files')
const gitOps = require('./git')
const permissions = require('./permissions')
const { search: searchSessions, warm: warmSearch } = require('./search')
const memory = require('./memory')
const { plainSnippet } = require('./text')
const { listThemes, DEFAULT_THEME, userThemes, userThemeInfo, saveUserTheme, deleteUserTheme, installedThemes, bundleFor, checkBundle, installBundle } = require('./themes')
// I temi importati con codice si caricano da qui (skins-theme://<id>/theme.js), dalla cartella temi dei dati dell'app
protocol.registerSchemesAsPrivileged([{ scheme: 'skins-theme', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

// La misura di partenza, simile a quella dell'app desktop, e la minima, per i temi che non dicono le loro
// (campo window del theme.js). La finestra di partenza non supera mai il 92% dello schermo
const DEFAULT_WINDOW = { width: 1080, height: 760, minWidth: 360, minHeight: 480 }
const TOGGLE_SHORTCUT = 'Control+Alt+P'

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let win = null
let tray = null
// Il ponte di servizio: elenco dei comandi e dei modelli, annali (elenco, rinomina, archivia, elimina). Le
// conversazioni hanno ciascuna il proprio (vedi makeConv)
let bridge = null
// Le conversazioni aperte in questa sessione dell'app: un capitolo nuovo o una cronaca aperta, ognuna col suo
// ClaudeBridge e quindi il suo Claude Code acceso; possono lavorare insieme. activeConv è quella in vista
const convs = new Map()
let activeConv = null
let nextConv = 1
// L'aggiornamento dal repo sul PC (vedi updater.js)
let updater = null
let updateNotified = 0
// La versione è cambiata dall'ultimo avvio (un aggiornamento): { from, to }, per le novità nella finestra
let whatsNew = null
let configExisted = false
// L'ultimo utilizzo del piano saputo (sessione di 5 ore, settimana)
let lastUsage = null
let captureMode = false
let configFile = null
// workdir: la cartella in cui lavora Claude Code e di cui si elencano le cronache; vuota, la cartella utente
// theme: l'id del tema in uso (una cartella di src/renderer/themes); sizes: la misura scelta per ogni tema, perché un
// libro aperto e una finestra semplice non stanno bene alla stessa misura
// permissionMode: il modo dei permessi (auto, default, acceptEdits, plan)
let config = { workdir: '', position: null, sizes: {}, sessionId: null, scene: 'notte', chapter: 0, theme: DEFAULT_THEME, permissionMode: 'auto' }
let themes = []
// Il trascinamento o il ridimensionamento in corso: il processo principale segue il cursore
let gesture = null

// ------------------------------------------------------------------ avvio sicuro

// Se un tema (o la configurazione) impedisce all'app di partire, la finestra torna al tema di partenza e lo dice
// (safeStart, mostrato dalla pagina come un avviso con "Riprova"). I casi: config.json rovinato; due avvii di fila
// in cui la pagina non è arrivata a dire "pronta" (app:ready); la pagina che non finisce di partire entro 20 secondi
// o che si chiude da sola prima; un tema che dà errore mentre si monta (lo segnala la pagina); --avvio-sicuro sulla
// riga di comando. Gli errori finiscono anche in errori.log, nella cartella dei dati
let safeStart = null
let pageReady = false
let readyTimer = null
function logError(...parts) {
  try {
    const f = path.join(app.getPath('userData'), 'errori.log')
    // Non più di mezzo mega: oltre, si ricomincia
    if (fs.existsSync(f) && fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f + '.vecchio')
    fs.appendFileSync(f, `${new Date().toISOString()} ${parts.map((x) => String(x)).join(' ')}\n`)
  } catch {}
}
// Si torna al tema di partenza, ricordando quale non partiva
function fallBack(reason, error) {
  const bad = config.theme && config.theme !== DEFAULT_THEME ? config.theme : null
  logError(`avvio sicuro (${reason})`, bad || '', error || '')
  if (!bad) return false
  safeStart = { reason, theme: bad, themeName: (themes.find((t) => t.id === bad) || {}).name || bad, error: error || '' }
  config.theme = DEFAULT_THEME
  saveConfig()
  return true
}
function watchStart() {
  pageReady = false
  clearTimeout(readyTimer)
  readyTimer = setTimeout(() => {
    if (pageReady || !win || win.isDestroyed()) return
    if (fallBack('timeout')) win.reload()
  }, 20000)
}

// L'app si chiamava Claude Skins: la prima volta che parte come Claudeleon, i suoi dati (configurazione, temi
// importati, registri, elenchi in cache) passano dalla cartella di allora a quella nuova. Le cache di Chromium no
const CHROMIUM_DIRS = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad', 'blob_storage', 'Shared Dictionary', 'Service Worker', 'Partitions', 'logs', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'])
function migrateOldData() {
  try {
    const now = app.getPath('userData')
    if (fs.existsSync(path.join(now, 'config.json'))) return
    for (const name of ['claude-skins', 'Claude Skins']) {
      const old = path.join(app.getPath('appData'), name)
      if (path.resolve(old) === path.resolve(now) || !fs.existsSync(path.join(old, 'config.json'))) continue
      fs.mkdirSync(now, { recursive: true })
      for (const entry of fs.readdirSync(old)) {
        if (CHROMIUM_DIRS.has(entry)) continue
        try { fs.cpSync(path.join(old, entry), path.join(now, entry), { recursive: true, errorOnExist: false, force: false }) } catch {}
      }
      logError(`dati ripresi da ${old}`)
      return
    }
  } catch {}
}

function loadConfig() {
  configFile = path.join(app.getPath('userData'), 'config.json')
  try {
    Object.assign(config, JSON.parse(fs.readFileSync(configFile, 'utf8')))
    configExisted = true
  } catch (err) {
    // Un file che c'è ma non si legge: si mette da parte (config.rotto.json) e si riparte, dicendolo
    if (fs.existsSync(configFile)) {
      try { fs.copyFileSync(configFile, path.join(app.getPath('userData'), 'config.rotto.json')) } catch {}
      safeStart = { reason: 'config', error: err.message }
      logError('config.json non leggibile', err.message)
    }
    // Primo avvio o file non valido: si riprende la configurazione di quando l'app si chiamava Pergamena, se c'è
    // (cartella di lavoro, scena, tema, capitolo, conversazione, modo); posizione e misura no, sono cambiate
    try {
      const old = JSON.parse(fs.readFileSync(path.join(app.getPath('appData'), 'pergamena-app', 'config.json'), 'utf8'))
      for (const k of ['workdir', 'scene', 'theme', 'chapter', 'sessionId', 'sessionCwd', 'permissionMode', 'onTop']) if (old[k] !== undefined) config[k] = old[k]
      saveConfig()
    } catch {
      // Nemmeno quella: restano i valori di partenza
    }
  }
  // La misura unica delle versioni precedenti (460×720) non vale più: ogni tema ha la sua, più grande
  delete config.size
}

function saveConfig() {
  fs.mkdirSync(path.dirname(configFile), { recursive: true })
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
}

// Le misure del tema in uso: di partenza e minime
function themeWindow() {
  return Object.assign({}, DEFAULT_WINDOW, currentTheme().window || {})
}

function defaultSize() {
  const tw = themeWindow()
  const wa = screen.getPrimaryDisplay().workArea
  return {
    w: Math.max(tw.minWidth, Math.min(tw.width, Math.floor(wa.width * 0.92))),
    h: Math.max(tw.minHeight, Math.min(tw.height, Math.floor(wa.height * 0.92))),
  }
}

// La misura salvata per il tema in uso, se non è sotto la minima; altrimenti quella di partenza
function windowSize() {
  const tw = themeWindow()
  const s = config.sizes && config.sizes[currentTheme().id]
  return s && s.w >= tw.minWidth && s.h >= tw.minHeight ? { w: s.w, h: s.h } : defaultSize()
}

// Al centro dello schermo principale, come una finestra normale
function defaultPosition() {
  const wa = screen.getPrimaryDisplay().workArea
  const { w, h } = windowSize()
  return { x: Math.round(wa.x + (wa.width - w) / 2), y: Math.round(wa.y + (wa.height - h) / 2) }
}

// Una posizione salvata su un monitor ora scollegato lascerebbe la finestra fuori dallo schermo
function visiblePosition(pos) {
  if (!pos) return null
  const cx = pos.x + windowSize().w / 2
  const cy = pos.y + 40
  return screen.getAllDisplays().some(({ workArea: wa }) => cx >= wa.x && cx <= wa.x + wa.width && cy >= wa.y && cy <= wa.y + wa.height) ? pos : null
}

// Il tema in uso, o il predefinito se quello salvato non c'è più
// I temi del programma e, dopo, quelli fatti con l'editor (cartella temi nei dati dell'app)
const userThemesDir = () => path.join(app.getPath('userData'), 'temi')
function allThemes() {
  return [...listThemes(), ...installedThemes(userThemesDir()), ...userThemes(userThemesDir()).map(userThemeInfo)]
}

function currentTheme() {
  return themes.find((t) => t.id === config.theme) || themes.find((t) => t.id === DEFAULT_THEME) || themes[0] || { id: DEFAULT_THEME, name: DEFAULT_THEME, persona: '' }
}

// Cambia tema: la pagina lo applica sul posto, Claude riceve la nuova personalità dal messaggio successivo
function setTheme(id) {
  if (!themes.some((t) => t.id === id)) return
  config.theme = id
  saveConfig()
  for (const b of allBridges()) b.persona = i18n.pick(currentTheme().persona)
  // La finestra prende la misura del nuovo tema, attorno allo stesso centro e dentro lo schermo (se è ingrandita
  // resta ingrandita: cambia la misura a cui tornerà)
  if (winMode !== 'normal') {
    const b = win.getBounds()
    const { w, h } = windowSize()
    restoreBounds = { x: Math.round(b.x + (b.width - w) / 2), y: Math.round(b.y + (b.height - h) / 2), width: w, height: h }
    saveConfig()
    send('theme:apply', id)
    refreshTray()
    return
  }
  const [x, y] = win.getPosition()
  const [ow, oh] = win.getSize()
  const { w, h } = windowSize()
  const wa = screen.getDisplayNearestPoint({ x: x + ow / 2, y: y + oh / 2 }).workArea
  const nx = Math.max(wa.x, Math.min(Math.round(x + (ow - w) / 2), wa.x + wa.width - w))
  const ny = Math.max(wa.y, Math.min(Math.round(y + (oh - h) / 2), wa.y + wa.height - h))
  win.setBounds({ x: nx, y: ny, width: w, height: h })
  config.position = { x: nx, y: ny }
  saveConfig()
  send('theme:apply', id)
  refreshTray()
}

// Alla pagina; conv dice di quale conversazione è un evento (senza: vale per quella in vista)
function send(channel, payload, conv) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload, conv)
}

// Una conversazione nuova, vuota o per una sessione da riprendere: il suo ponte prende le impostazioni comuni
// (cartella, tono del tema, modo, modello, ragionamento) e i suoi eventi vanno alla pagina con il suo id
function makeConv(sessionId, cwd) {
  const c = { id: `c${nextConv++}`, sessionId: sessionId || null, cwd: cwd || null, replyText: '' }
  c.bridge = new ClaudeBridge({
    getSession: () => c.sessionId,
    setSession: (id, dir) => {
      const fresh = c.sessionId !== id
      c.sessionId = id
      c.cwd = dir || null
      if (activeConv === c.id) { config.sessionId = id; config.sessionCwd = c.cwd; saveConfig() }
      if (fresh) send('conv:session', { id, cwd: c.cwd }, c.id)
    },
  }, config.workdir, i18n.pick(currentTheme().persona), config.permissionMode)
  const b = c.bridge
  b.entrypoint = config.entrypoint || 'cli'
  b.claudePath = claudePath()
  b.themesDir = userThemesDir()
  b.setModel(config.model || null)
  b.ultracode = !!config.ultracode
  b.setEffort(config.effort || null)
  b.sessionCwd = c.cwd
  if (captureMode) b.send = () => {}
  wireConv(c)
  convs.set(c.id, c)
  return c
}
function convOf(id) {
  return convs.get(id) || convs.get(activeConv)
}
function allBridges() {
  return [...convs.values()].map((c) => c.bridge)
}
// Le conversazioni ferme da tempo, non in vista e senza un Claude Code acceso si lasciano andare (la pagina tiene la
// sua copia; riaprendole dagli annali si riprendono)
function dropConv(c) {
  c.bridge.cancel()
  c.bridge.removeAllListeners()
  convs.delete(c.id)
}

function createWindow() {
  const pos = visiblePosition(config.position) || defaultPosition()
  const size = windowSize()
  win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: size.w,
    height: size.h,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    // Come un'app normale: nella barra delle applicazioni, non sopra le altre finestre (si accende dal vassoio)
    alwaysOnTop: config.onTop === true,
    skipTaskbar: false,
    minimizable: true,
    backgroundColor: '#00000000',
    title: 'Claudeleon',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (config.onTop === true) win.setAlwaysOnTop(true, 'floating')
  // Finché il mouse non è sopra una parte disegnata del tema, i clic attraversano la finestra (lo segnala la pagina)
  win.setIgnoreMouseEvents(true, { forward: true })
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  // La pagina deve dire "pronta" entro 20 secondi; se si chiude da sola prima, si riparte col tema di partenza
  watchStart()
  win.webContents.on('render-process-gone', (_e, details) => {
    logError('pagina chiusa', details && details.reason)
    if (!pageReady) fallBack('crash', details && details.reason)
    else safeStart = safeStart || { reason: 'gone', error: details && details.reason }
    if (!win.isDestroyed()) { watchStart(); win.reload() }
  })
  win.on('unresponsive', () => { logError('pagina bloccata', pageReady ? 'dopo l\'avvio' : 'all\'avvio'); if (!pageReady && fallBack('timeout')) { watchStart(); win.webContents.forcefullyCrashRenderer() } })
  // Tornata davanti, smette di lampeggiare; il menu del vassoio segue lo stato (Mostra / Riduci a icona)
  // Tornata davanti: niente più lampeggio, e le notifiche ancora aperte non servono più
  win.on('focus', () => {
    win.flashFrame(false)
    for (const n of shownNotes) n.close()
    shownNotes.clear()
    refreshTray()
  })
  win.on('blur', () => { lastBlur = Date.now() })
  win.on('minimize', refreshTray)
  win.on('restore', refreshTray)
  // Nessun link si apre dentro la finestra; quelli che l'anteprima vuole aprire in una finestra nuova vanno nel browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  // L'anteprima di un server locale sta in un riquadro della pagina: i server che vietano di farsi incorniciare
  // (X-Frame-Options, frame-ancestors) lo permettono qui, solo per i loro indirizzi locali
  win.webContents.session.webRequest.onHeadersReceived((details, done) => {
    let local = false
    try { local = details.resourceType === 'subFrame' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(details.url).hostname) } catch {}
    if (!local) return done({})
    const headers = {}
    for (const [k, v] of Object.entries(details.responseHeaders || {})) {
      const key = k.toLowerCase()
      if (key === 'x-frame-options') continue
      if (key === 'content-security-policy') headers[k] = v.map((x) => x.split(';').filter((d) => !/^\s*frame-ancestors\b/i.test(d)).join(';'))
      else headers[k] = v
    }
    done({ responseHeaders: headers })
  })
}

// Spostare ('move') o ridimensionare ('resize'): dal clic sulla pagina si segue il cursore sullo schermo, così il
// gesto non si perde quando il mouse esce dalla finestra in un movimento veloce
// La finestra: 'normale', 'ingrandita' (l'area di lavoro, la barra di Windows resta) o 'schermo intero' (tutto lo
// schermo). Una finestra trasparente non si ingrandisce coi comandi di Windows: si fa a mano, ricordando la misura
// di prima per ripristinarla
let winMode = 'normal'
let restoreBounds = null

function setWinMode(mode) {
  if (!['normal', 'max', 'full'].includes(mode) || mode === winMode) return
  if (winMode === 'normal') restoreBounds = win.getBounds()
  if (mode === 'normal') {
    win.setBounds(restoreBounds || Object.assign(defaultPosition(), { width: windowSize().w, height: windowSize().h }))
  } else {
    const d = screen.getDisplayMatching(win.getBounds())
    win.setBounds(mode === 'full' ? d.bounds : d.workArea)
  }
  winMode = mode
  send('window:state', winMode)
}

// Spostare ('move') o ridimensionare ('resize:<lati>', es. 'resize:se', 'resize:n'): dal clic sulla pagina si segue il
// cursore sullo schermo, così il gesto non si perde quando il mouse esce dalla finestra in un movimento veloce
function startGesture(kind) {
  stopGesture()
  // Spostare una finestra ingrandita la riporta alla sua misura, sotto il cursore come fa Windows
  if (kind === 'move' && winMode !== 'normal' && restoreBounds) {
    const c = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const ratio = (c.x - b.x) / b.width
    const rb = restoreBounds
    winMode = 'normal'
    win.setBounds({ x: Math.round(c.x - rb.width * ratio), y: Math.max(b.y, c.y - 20), width: rb.width, height: rb.height })
    send('window:state', winMode)
  }
  if (kind !== 'move' && winMode !== 'normal') return
  const sides = kind.startsWith('resize') ? (kind.split(':')[1] || 'se') : ''
  const start = screen.getCursorScreenPoint()
  const [x, y] = win.getPosition()
  // Su Windows con lo schermo ridimensionato (125%, 150%...) ogni setPosition o setBounds su una finestra trasparente
  // senza bordi può allargarla di un pixel per l'arrotondamento fra pixel logici e fisici. Per questo: la misura è
  // sempre quella voluta (ricordata), non quella letta dalla finestra, che può essere già cresciuta di un pixel; e la
  // finestra si tocca solo quando il cursore si muove davvero, oltre una piccola soglia come in Windows (un semplice
  // clic sulla testata non la tocca)
  const want = windowSize()
  const [gw, gh] = win.getSize()
  const w = Math.abs(gw - want.w) <= 2 ? want.w : gw
  const h = Math.abs(gh - want.h) <= 2 ? want.h : gh
  const THRESHOLD = 4
  let moving = false
  let last = start
  const timer = setInterval(() => {
    const c = screen.getCursorScreenPoint()
    if (c.x === last.x && c.y === last.y) return
    last = c
    const dx = c.x - start.x
    const dy = c.y - start.y
    if (!moving && Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return
    moving = true
    if (!sides) {
      win.setBounds({ x: x + dx, y: y + dy, width: w, height: h })
      return
    }
    // Il lato opposto a quello trascinato resta fermo; mai sotto la misura minima del tema né fuori dall'area di lavoro
    const wa = screen.getDisplayNearestPoint(c).workArea
    const { minWidth, minHeight } = themeWindow()
    let nx = x
    let ny = y
    let nw = w
    let nh = h
    if (sides.includes('e')) nw = Math.max(minWidth, Math.min(w + dx, wa.x + wa.width - x))
    if (sides.includes('s')) nh = Math.max(minHeight, Math.min(h + dy, wa.y + wa.height - y))
    if (sides.includes('w')) { nw = Math.max(minWidth, Math.min(w - dx, x + w - wa.x)); nx = x + w - nw }
    if (sides.includes('n')) { nh = Math.max(minHeight, Math.min(h - dy, y + h - wa.y)); ny = y + h - nh }
    win.setBounds({ x: nx, y: ny, width: nw, height: nh })
  }, 1000 / 60)
  gesture = { kind: sides ? 'resize' : 'move', timer, moved: () => moving }
}

function stopGesture() {
  if (!gesture) return
  clearInterval(gesture.timer)
  const kind = gesture.kind
  const moved = gesture.moved()
  gesture = null
  if (winMode !== 'normal' || !moved) return
  const [x, y] = win.getPosition()
  config.position = { x, y }
  if (kind === 'resize') {
    const [w, h] = win.getSize()
    config.sizes = Object.assign({}, config.sizes, { [currentTheme().id]: { w, h } })
  }
  saveConfig()
}

// Vassoio e scorciatoia: se la finestra è in vista la riducono a icona (resta nella barra delle applicazioni),
// altrimenti la riportano davanti
function shown() {
  return win.isVisible() && !win.isMinimized()
}
function bringBack() {
  if (!win.isVisible()) win.show()
  if (win.isMinimized()) win.restore()
  win.focus()
}
// Un clic sull'icona del vassoio toglie prima il fuoco alla finestra: se l'aveva un attimo fa, conta come davanti
let lastBlur = 0
function toggleVisible() {
  if (shown() && (win.isFocused() || Date.now() - lastBlur < 400)) win.minimize()
  else bringBack()
  refreshTray()
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: win && shown() ? tr('Riduci a icona') : tr('Mostra'), click: () => { if (shown()) win.minimize(); else bringBack(); refreshTray() } },
    { label: tr('Nuova conversazione'), click: () => send('chat:reset') },
    { label: tr('Tema'), submenu: themes.map((t) => ({ label: i18n.pick(t.names) || t.name, type: 'radio', checked: t.id === currentTheme().id, click: () => setTheme(t.id) })) },
    { label: tr('Cartella di lavoro…'), click: chooseWorkdir },
    { label: tr('Notifiche'), type: 'checkbox', checked: config.notify !== false, click: (item) => { config.notify = item.checked; saveConfig() } },
    { label: tr('Sempre in primo piano'), type: 'checkbox', checked: config.onTop === true, click: (item) => setOnTop(item.checked) },
    { label: tr('Riporta al centro'), click: centerWindow },
    { label: tr('Dimensione iniziale'), click: resetWindowSize },
    { label: tr('Impostazioni…'), click: () => { bringBack(); send('settings:open') } },
    { type: 'separator' },
    { label: tr('Esci'), click: () => app.quit() },
  ])
}

function centerWindow() {
  const p = defaultPosition()
  const [w, h] = win.getSize()
  win.setBounds({ x: p.x, y: p.y, width: w, height: h })
  config.position = p
  saveConfig()
}
function resetWindowSize() {
  if (config.sizes) delete config.sizes[currentTheme().id]
  const { w, h } = defaultSize()
  const p = defaultPosition()
  win.setBounds({ x: p.x, y: p.y, width: w, height: h })
  config.position = p
  saveConfig()
}

// ------------------------------------------------------------------ impostazioni

// Avvio con Windows: l'app installata parte da sola; quella dal repo con electron.exe e la cartella dell'app
function loginArgs() {
  return app.isPackaged ? { path: process.execPath, args: [] } : { path: process.execPath, args: [app.getAppPath()] }
}
// Claude Code: quello indicato nelle impostazioni o quello di partenza, e la sua versione (claude --version)
function claudePath() {
  if (config.claudePath) return config.claudePath
  if (fs.existsSync(DEFAULT_CLAUDE)) return DEFAULT_CLAUDE
  return claudeOnPath() || DEFAULT_CLAUDE
}
// Claude Code installato altrove (winget, un'altra cartella nel PATH): il primo claude.exe (o claude) del PATH
let pathClaude
function claudeOnPath() {
  if (pathClaude !== undefined) return pathClaude
  pathClaude = null
  try {
    const out = require('child_process').execFileSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
    pathClaude = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l && (process.platform !== 'win32' || /\.exe$/i.test(l))) || null
  } catch {}
  return pathClaude
}
// Il login di Claude Code: una chiave nelle variabili d'ambiente, il file delle credenziali o l'account in
// ~/.claude.json. È una stima (sul Mac le credenziali stanno nel portachiavi): la finestra lascia andare avanti lo stesso
function claudeLoggedIn() {
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN) return true
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(app.getPath('home'), '.claude')
  if (fs.existsSync(path.join(dir, '.credentials.json'))) return true
  for (const f of [path.join(app.getPath('home'), '.claude.json'), path.join(dir, '.claude.json')]) {
    try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (j.oauthAccount || j.primaryApiKey) return true } catch {}
  }
  return false
}
async function claudeStatus() {
  pathClaude = undefined
  const p = claudePath()
  const found = fs.existsSync(p)
  // Installato adesso, mentre l'app era aperta: le conversazioni lo usano dal prossimo avvio di Claude Code
  if (found) for (const b of [bridge, ...allBridges()]) b.claudePath = p
  return { found, path: p, version: found ? await claudeVersion() : null, loggedIn: found ? claudeLoggedIn() : false, platform: process.platform, custom: !!config.claudePath }
}
function claudeVersion() {
  return new Promise((resolve) => {
    if (!fs.existsSync(claudePath())) return resolve(null)
    require('child_process').execFile(claudePath(), ['--version'], { timeout: 15000, windowsHide: true }, (err, out) => resolve(err ? null : String(out || '').trim().split(/\s+/)[0] || null))
  })
}
async function settingsState() {
  let openAtLogin = false
  try { openAtLogin = app.getLoginItemSettings(loginArgs()).openAtLogin } catch {}
  return {
    onTop: config.onTop === true,
    notify: config.notify !== false,
    openAtLogin,
    workdir: config.workdir || '',
    mode: config.permissionMode || 'auto',
    entrypoint: config.entrypoint || 'cli',
    claudePath: claudePath(),
    claudeDefault: !config.claudePath,
    claudeFound: fs.existsSync(claudePath()),
    claudeVersion: await claudeVersion(),
    version: app.getVersion(),
    installed: app.isPackaged,
    dataDir: app.getPath('userData'),
    shortcut: TOGGLE_SHORTCUT.replace('Control', 'Ctrl'),
    autoUpdate: config.autoUpdate !== false,
    worktree: config.worktree === true,
    language: i18n.language(),
    updateSource: updateSource(),
    updateSources: updateSources(),
  }
}
// Una scelta del pannello: si applica subito e si ricorda
async function applySetting(key, value) {
  if (key === 'onTop') setOnTop(!!value)
  else if (key === 'notify') { config.notify = !!value; saveConfig() }
  else if (key === 'autoUpdate') { config.autoUpdate = !!value; saveConfig() }
  else if (key === 'worktree') { config.worktree = !!value; saveConfig() }
  else if (key === 'welcomed') { config.welcomed = true; saveConfig() }
  else if (key === 'language') {
    // La lingua: per il processo principale (vassoio, finestre di dialogo, messaggi), per la finestra e per la
    // personalità che il tema dà a Claude (dal prossimo messaggio)
    config.language = value === 'it' ? 'it' : 'en'
    saveConfig()
    i18n.setLanguage(config.language)
    for (const b of [bridge, ...allBridges()]) b.persona = i18n.pick(currentTheme().persona)
    send('language:set', config.language)
  }
  else if (key === 'updateSource' && updateSources().includes(value)) {
    config.updateSource = value
    saveConfig()
    if (updater) { makeUpdater(); send('update:state', updater.state); updater.check() }
  }
  else if (key === 'openAtLogin') { try { app.setLoginItemSettings(Object.assign({ openAtLogin: !!value }, loginArgs())) } catch {} }
  else if (key === 'entrypoint') {
    config.entrypoint = value === 'claude-desktop' ? 'claude-desktop' : 'cli'
    saveConfig()
    for (const b of [bridge, ...allBridges()]) b.entrypoint = config.entrypoint
  } else if (key === 'claudePath') {
    // Vuoto: quello di partenza (~/.local/bin/claude)
    config.claudePath = value ? String(value) : null
    saveConfig()
    for (const b of [bridge, ...allBridges()]) b.claudePath = claudePath()
    bridge.loadCommands()
  } else if (key === 'chooseClaude') {
    const r = await dialog.showOpenDialog(win, { title: tr('Dov\'è Claude Code'), defaultPath: path.dirname(claudePath()), properties: ['openFile'], filters: process.platform === 'win32' ? [{ name: 'Claude Code', extensions: ['exe', 'cmd'] }] : [] })
    if (!r.canceled && r.filePaths[0]) return applySetting('claudePath', r.filePaths[0])
  } else if (key === 'workdir') await chooseWorkdir()
  else if (key === 'center') centerWindow()
  else if (key === 'resetSize') resetWindowSize()
  else if (key === 'openData') shell.openPath(app.getPath('userData'))
  refreshTray()
  return settingsState()
}

// La cartella in cui nascono le conversazioni nuove (quelle riprese restano nella loro)
async function chooseWorkdir() {
  const r = await dialog.showOpenDialog(win, { title: tr('Cartella di lavoro di Claude'), defaultPath: config.workdir || app.getPath('home'), properties: ['openDirectory'] })
  if (r.canceled || !r.filePaths[0]) return null
  return setWorkdir(r.filePaths[0])
}

function setWorkdir(dir) {
  if (!dir || !fs.existsSync(dir)) return null
  config.workdir = dir
  const w = dir.replace(/\\/g, '/')
  // Vale per le conversazioni che non sono ancora cominciate (quelle cominciate restano nella loro cartella)
  bridge.workdir = w
  for (const c of convs.values()) if (!c.sessionId && !c.worktree) c.bridge.workdir = w
  saveConfig()
  send('workdir:changed', w)
  return w
}

// Con una finestra grande come l'app desktop, stare sempre sopra le altre può dare fastidio: si sceglie dal vassoio
function setOnTop(on) {
  config.onTop = !!on
  saveConfig()
  win.setAlwaysOnTop(config.onTop, 'floating')
}

function refreshTray() {
  if (tray) tray.setContextMenu(trayMenu())
}

function registerIpc() {
  ipcMain.on('mouse:interactive', (_e, on) => { if (!gesture) win.setIgnoreMouseEvents(!on, { forward: true }) })
  ipcMain.on('gesture:start', (_e, kind) => {
    win.setIgnoreMouseEvents(false)
    const k = String(kind || '')
    startGesture(/^resize(:[nsew]{1,2})?$/.test(k) ? k : 'move')
  })
  // Ingrandire, schermo intero, ripristinare: toggle torna normale se la finestra è già in quel modo
  ipcMain.on('window:mode', (_e, mode) => setWinMode(mode === winMode ? 'normal' : String(mode)))
  ipcMain.handle('window:state', () => winMode)
  ipcMain.on('gesture:end', stopGesture)
  ipcMain.on('window:hide', () => { win.minimize(); refreshTray() })
  ipcMain.on('app:quit', () => app.quit())
  ipcMain.handle('app:info', () => ({
    scene: config.scene,
    chapter: config.chapter,
    shortcut: TOGGLE_SHORTCUT.replace('Control', 'Ctrl'),
    theme: currentTheme().id,
    // Quelli del programma per id, quelli importati con codice con l'indirizzo da cui caricarli
    themes: themes.filter((t) => !t.custom || t.code).map((t) => (t.code ? { id: t.id, base: `skins-theme://${t.id}/`, stamp: themeStamp(path.join(userThemesDir(), t.id)) } : t.id)),
    // I temi dell'editor: la pagina li costruisce dai colori
    userThemes: userThemes(userThemesDir()),
    workdir: bridge.workdir,
    conv: activeConv,
    sessionId: config.sessionId || null,
    // Se la cartella l'ha scelta la persona (altrimenti è la cartella utente, e al primo messaggio la si chiede)
    workdirChosen: !!config.workdir,
    sessionCwd: config.sessionId ? (config.sessionCwd || bridge.workdir) : null,
    mode: config.permissionMode || bridge.mode,
    language: i18n.language(),
    // Il benvenuto del primo avvio è già stato visto
    welcomed: !!config.welcomed,
  }))
  ipcMain.on('theme:set', (_e, id) => setTheme(String(id)))
  // L'avvio sicuro: la pagina è partita; un tema non si è montato; l'avviso letto o "Riprova"; gli errori della pagina
  ipcMain.on('app:ready', () => {
    pageReady = true
    clearTimeout(readyTimer)
    if (config.startAttempts) { config.startAttempts = 0; saveConfig() }
  })
  ipcMain.on('theme:failed', (_e, id, message) => {
    logError('tema non montato', id, message)
    if (String(id) === config.theme && fallBack('error', String(message || ''))) send('safe:state', safeStart)
  })
  ipcMain.handle('safe:get', () => safeStart)
  ipcMain.on('safe:dismiss', () => { safeStart = null })
  ipcMain.on('safe:retry', () => {
    const id = safeStart && safeStart.theme
    safeStart = null
    if (id && themes.some((t) => t.id === id)) setTheme(id)
  })
  ipcMain.on('log:error', (_e, text) => logError('pagina:', String(text || '').slice(0, 2000)))
  ipcMain.on('log:open', () => { const f = path.join(app.getPath('userData'), 'errori.log'); if (fs.existsSync(f)) shell.openPath(f); else shell.openPath(app.getPath('userData')) })
  // L'editor dei temi: salva (nuovo o modificato) e lo mette in uso; elimina (e se era in uso, torna a quello di
  // partenza)
  ipcMain.handle('theme:save', (_e, spec) => {
    try {
      const saved = saveUserTheme(userThemesDir(), spec)
      themes = allThemes()
      refreshTray()
      return { ok: true, spec: saved }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
  // Esporta un tema in un file .skin (in Documenti, di solito)
  ipcMain.handle('theme:export', async (_e, id) => {
    try {
      const b = bundleFor(String(id || ''), userThemesDir())
      if (!b) return { ok: false, error: tr('Tema sconosciuto') }
      const name = (b.kind === 'colors' ? b.spec.name : b.manifest.name) || String(id)
      const safe = name.replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').trim().slice(0, 60) || 'tema'
      const r = await dialog.showSaveDialog(win, { title: tr('Esporta il tema'), defaultPath: path.join(app.getPath('documents'), `${safe}.skin`), filters: [{ name: tr('Tema di Claudeleon'), extensions: ['skin'] }] })
      if (r.canceled || !r.filePath) return { ok: false, canceled: true }
      fs.writeFileSync(r.filePath, JSON.stringify(b))
      return { ok: true, file: r.filePath }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
  // Importa un tema da un file .skin: uno con codice chiede conferma (il suo codice girerà nella finestra); uno che
  // c'è già chiede se sostituirlo. Restituisce come caricarlo nella pagina
  ipcMain.handle('theme:import', async () => {
    try {
      const pick = await dialog.showOpenDialog(win, { title: tr('Importa un tema'), properties: ['openFile'], filters: [{ name: tr('Tema di Claudeleon'), extensions: ['skin', 'json'] }] })
      if (pick.canceled || !pick.filePaths[0]) return { ok: false, canceled: true }
      const file = pick.filePaths[0]
      if (fs.statSync(file).size > 40 * 1024 * 1024) return { ok: false, error: tr('Il file è troppo grande') }
      let b
      try { b = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return { ok: false, error: tr('Il file non è un tema di Claudeleon') } }
      const c = checkBundle(b)
      if (!c.ok) return c
      if (c.kind === 'code') {
        const ok = await dialog.showMessageBox(win, {
          type: 'warning', buttons: [tr('Installa'), tr('Annulla')], defaultId: 1, cancelId: 1, noLink: true,
          title: tr('Installare il tema?'), message: tr('Installare il tema «{x}»?', { x: c.name }),
          detail: tr('Questo tema contiene codice che girerà nella finestra di Claudeleon (può leggere le conversazioni e mandare messaggi a Claude). Installalo solo se viene da qualcuno di cui ti fidi.'),
        })
        if (ok.response !== 0) return { ok: false, canceled: true }
      }
      let r = installBundle(userThemesDir(), b, false)
      if (!r.ok && r.exists) {
        const again = await dialog.showMessageBox(win, { type: 'question', buttons: [tr('Sostituisci'), tr('Annulla')], defaultId: 0, cancelId: 1, noLink: true, title: tr('Tema già installato'), message: tr('Il tema «{x}» c\'è già. Sostituirlo con quello del file?', { x: r.name }) })
        if (again.response !== 0) return { ok: false, canceled: true }
        r = installBundle(userThemesDir(), b, true)
      }
      if (!r.ok) return r
      themes = allThemes()
      refreshTray()
      return Object.assign(r, r.kind === 'code' ? { base: `skins-theme://${r.id}/` } : {})
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
  ipcMain.handle('theme:delete', (_e, id) => {
    const ok = deleteUserTheme(userThemesDir(), String(id || ''))
    themes = allThemes()
    if (ok && config.theme === id) setTheme(DEFAULT_THEME)
    refreshTray()
    return ok
  })
  ipcMain.handle('settings:get', () => settingsState())
  // Le novità della versione appena installata: le note della sua release su GitHub, una volta sola
  ipcMain.handle('whatsnew:get', async () => {
    if (!whatsNew) return null
    const w = whatsNew
    whatsNew = null
    const repo = (String(appMeta().repository || '').match(/github:([\w.-]+\/[\w.-]+)/) || [])[1] || 'LukePasax/Claudeleon'
    w.url = `https://github.com/${repo}/releases/tag/v${w.to}`
    try {
      const res = await net.fetch(`https://api.github.com/repos/${repo}/releases/tags/v${w.to}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Claudeleon' } })
      if (res.ok) { const j = await res.json(); w.notes = String(j.body || ''); w.url = j.html_url || w.url }
    } catch {}
    return w
  })
  // Il primo avvio guidato: Claude Code c'è? il login è fatto?
  ipcMain.handle('claude:status', () => claudeStatus())
  // L'aggiornamento: lo stato, un controllo adesso, l'aggiornamento vero
  ipcMain.handle('update:get', () => (updater ? updater.state : { state: 'unavailable' }))
  ipcMain.handle('update:check', () => (updater ? updater.check() : null))
  ipcMain.on('update:apply', () => { if (updater) updater.update() })
  // Le estensioni (server MCP e plugin): si chiede al Claude Code della conversazione in vista, o a uno temporaneo
  const extBridge = () => { const c = convOf(activeConv); return c && c.bridge.live && !c.bridge.live.ended ? c.bridge : bridge }
  ipcMain.handle('ext:get', async () => { try { return await extBridge().extensions() } catch (err) { return { ok: false, error: err.message, mcp: [], plugins: [], errors: [], enabled: {} } } })
  ipcMain.handle('ext:mcp', async (_e, name, on) => {
    try {
      await extBridge().toggleMcp(String(name), !!on)
      // Anche nelle altre conversazioni accese
      for (const c of convs.values()) if (c.bridge !== extBridge() && c.bridge.live && !c.bridge.live.ended) c.bridge.toggleMcp(String(name), !!on).catch(() => {})
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })
  ipcMain.handle('ext:reconnect', async (_e, name) => { try { await extBridge().reconnectMcp(String(name)); return { ok: true } } catch (err) { return { ok: false, error: err.message } } })
  ipcMain.handle('ext:plugin', async (_e, key, on) => {
    try {
      const b = extBridge()
      await b.togglePlugin(String(key), !!on)
      for (const c of convs.values()) if (c.bridge !== b) c.bridge.reloadPluginsLive()
      bridge.loadCommands()
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })
  ipcMain.handle('settings:set', (_e, key, value) => applySetting(String(key), value))
  ipcMain.on('app:icon', (_e, dataUrl) => { if (!captureMode) setAppIcon(String(dataUrl || '')); else if (process.platform !== 'darwin') win.setIcon(nativeImage.createFromDataURL(String(dataUrl || ''))) })
  // Copiare negli appunti (i pulsanti "copia" di codice e risposte)
  // La dettatura: la digitazione vocale di Windows (Win+H) nella casella, che la pagina ha appena messo a fuoco
  ipcMain.handle('dictate:start', () => dictate())
  // Una foto dell'anteprima (il rettangolo del riquadro nella pagina), da allegare per Claude
  ipcMain.handle('preview:capture', async (_e, r) => {
    try {
      const rect = { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) }
      const img = await win.webContents.capturePage(rect)
      return img.isEmpty() ? null : img.toDataURL()
    } catch { return null }
  })
  ipcMain.on('clipboard:write', (_e, text) => clipboard.writeText(String(text || '')))
  // La cartella delle conversazioni nuove, dalla finestra: dal dialogo di sistema o da una cartella recente
  ipcMain.handle('workdir:choose', () => chooseWorkdir())
  ipcMain.handle('workdir:set', (_e, dir) => setWorkdir(String(dir || '')))
  // Il modo dei permessi, scelto dalla finestra; il messaggero lo applica anche alla risposta in corso
  ipcMain.on('mode:set', (_e, mode) => { for (const b of allBridges()) b.setMode(String(mode)) })
  // La conversazione in vista: si ricorda la sua sessione, per riprenderla al prossimo avvio
  ipcMain.on('conv:active', (_e, id) => {
    const c = convs.get(id)
    if (!c) return
    activeConv = c.id
    config.sessionId = c.sessionId
    config.sessionCwd = c.cwd
    saveConfig()
  })
  // Un link di una risposta: nel browser di sistema, e solo se è http, https o mailto
  ipcMain.on('link:open', (_e, url) => {
    const u = String(url || '')
    if (/^(https?:\/\/|mailto:)/i.test(u)) shell.openExternal(u).catch(() => {})
  })
  ipcMain.on('scene:set', (_e, scene) => { config.scene = scene === 'giorno' ? 'giorno' : 'notte'; saveConfig() })
  // Un capitolo per conversazione: il numero cresce, la sessione di Claude Code ricomincia
  // Un capitolo nuovo è una conversazione nuova: quelle di prima restano accese e continuano a lavorare
  ipcMain.handle('chapter:new', () => {
    // Una conversazione ancora vuota non serve più: si lascia andare
    for (const c of [...convs.values()]) if (!c.sessionId && !(c.bridge.live && c.bridge.live.turn.open)) dropConv(c)
    const c = makeConv(null, null)
    activeConv = c.id
    config.chapter += 1
    config.sessionId = null
    config.sessionCwd = null
    saveConfig()
    return { chapter: config.chapter, conv: c.id }
  })
  // Il messaggio: testo, o { text, images, files } con gli allegati
  // Il primo messaggio di una conversazione nuova, con i worktree accesi e la cartella in un repo: prima la copia
  // separata (Claude parte lì), poi il messaggio. I messaggi seguenti aspettano in fila che sia pronta
  ipcMain.on('chat:send', (_e, msg, conv) => {
    const c = convOf(conv)
    if (!c) return
    const payload = msg && typeof msg === 'object' ? msg : String(msg || '')
    if (config.worktree && !c.sessionId && !c.worktree && !c.worktreeTried) {
      c.worktreeTried = true
      const text = typeof payload === 'string' ? payload : payload.text
      c.ready = gitOps.createWorktree(c.bridge.workdir, text).then((r) => {
        if (r.ok) {
          c.worktree = r
          c.bridge.workdir = r.path
          send('conv:worktree', r, c.id)
        } else if (r.error !== tr('Non è un repo git')) send('conv:worktree', { ok: false, error: r.error }, c.id)
      }).catch(() => {})
    }
    ;(c.ready || Promise.resolve()).then(() => c.bridge.send(payload))
  })
  // Il pulsante "allega": file e immagini dal disco
  ipcMain.handle('files:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: tr('Allega file o immagini'), defaultPath: (convOf(activeConv) && convOf(activeConv).cwd) || bridge.workdir, properties: ['openFile', 'multiSelections'] })
    return r.canceled ? [] : r.filePaths
  })
  // Un'immagine dal disco, per mandarla a Claude come immagine e non come percorso
  ipcMain.handle('file:image', (_e, p) => {
    const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }
    const mediaType = types[path.extname(String(p || '')).toLowerCase()]
    try {
      if (!mediaType || fs.statSync(p).size > 30 * 1024 * 1024) return null
      return { mediaType, data: fs.readFileSync(p).toString('base64') }
    } catch { return null }
  })
  // Un file toccato da Claude: aprirlo col programma di sistema, o mostrarlo nella sua cartella
  const fileIn = (p, conv) => {
    const c = convOf(conv)
    const base = (c && c.cwd) || config.workdir || app.getPath('home')
    return path.isAbsolute(String(p)) ? String(p) : path.join(base, String(p))
  }
  ipcMain.handle('file:open', async (_e, p, conv) => { const f = fileIn(p, conv); return fs.existsSync(f) ? (await shell.openPath(f)) || true : false })
  ipcMain.handle('file:reveal', (_e, p, conv) => { const f = fileIn(p, conv); if (!fs.existsSync(f)) return false; shell.showItemInFolder(f); return true })
  // Git nella cartella della conversazione: stato, differenze, branch, commit, push, pull request
  const cwdOf = (conv) => { const c = convOf(conv); return (c && (c.cwd || c.bridge.workdir)) || config.workdir || app.getPath('home') }
  const gitCall = (fn) => async (_e, conv, ...args) => { try { return await fn(cwdOf(conv), ...args) } catch (err) { return { ok: false, error: err.message } } }
  ipcMain.handle('git:status', gitCall((cwd) => gitOps.status(cwd)))
  ipcMain.handle('git:diff', gitCall((cwd, file) => gitOps.diff(cwd, String(file || ''))))
  ipcMain.handle('git:branches', gitCall((cwd) => gitOps.branches(cwd)))
  ipcMain.handle('git:checkout', gitCall((cwd, name, create) => gitOps.checkout(cwd, String(name || ''), !!create)))
  ipcMain.handle('git:commit', gitCall((cwd, message, andPush) => gitOps.commit(cwd, String(message || ''), !!andPush)))
  ipcMain.handle('git:push', gitCall((cwd) => gitOps.push(cwd)))
  ipcMain.handle('git:pr-info', gitCall((cwd) => gitOps.prInfo(cwd)))
  ipcMain.handle('git:pr', gitCall((cwd, opts) => gitOps.createPr(cwd, opts && typeof opts === 'object' ? opts : {})))
  // Le regole dei permessi: lette e scritte nei file delle impostazioni di Claude Code; dopo una modifica le
  // conversazioni ripartono con quelle nuove
  ipcMain.handle('perms:get', (_e, conv) => { try { return permissions.read(cwdOf(conv)) } catch (err) { return { error: err.message, scopes: [] } } })
  ipcMain.handle('perms:change', (_e, conv, scope, op) => {
    const r = permissions.change(cwdOf(conv), String(scope || ''), op)
    if (r.ok) for (const b of allBridges()) b.refreshSettings()
    return r
  })
  // La memoria (i CLAUDE.md): dopo una modifica le conversazioni la rileggono al prossimo messaggio
  ipcMain.handle('memory:list', (_e, conv) => { try { return memory.list(cwdOf(conv)) } catch (err) { return { files: [], error: err.message } } })
  ipcMain.handle('memory:read', (_e, conv, file) => memory.read(cwdOf(conv), String(file || '')))
  ipcMain.handle('memory:write', (_e, conv, file, text) => {
    const r = memory.write(cwdOf(conv), String(file || ''), text)
    if (r.ok) for (const b of allBridges()) b.refreshSettings()
    return r
  })
  ipcMain.handle('memory:open', async (_e, conv, file) => {
    const f = String(file || '')
    if (!memory.read(cwdOf(conv), f).ok) return false
    if (!fs.existsSync(f)) memory.write(cwdOf(conv), f, '')
    return !(await shell.openPath(f))
  })
  ipcMain.handle('git:wt-merge', gitCall((cwd) => gitOps.mergeWorktree(cwd)))
  ipcMain.handle('git:wt-remove', gitCall((cwd, force) => gitOps.removeWorktree(cwd, !!force)))
  // I file da citare con @, nella cartella della conversazione
  ipcMain.handle('files:suggest', async (_e, query, conv) => {
    const c = convOf(conv)
    const cwd = (c && c.cwd) || config.workdir || app.getPath('home')
    try { return rankFiles(await listFiles(cwd), String(query || '')) } catch { return [] }
  })
  // Un messaggio già mandato, modificato: la conversazione riparte da lì (e i file, se chiesto)
  ipcMain.on('chat:edit', (_e, { uuid, msg, restoreFiles }, conv) => { const c = convOf(conv); if (c) c.bridge.edit(String(uuid || ''), msg, !!restoreFiles) })
  // Le attività in background: fermarne una, mandare in background quello che Claude sta facendo
  ipcMain.handle('task:stop', async (_e, id, conv) => { const c = convOf(conv); try { return c ? await c.bridge.stopTask(String(id)) : false } catch { return false } })
  ipcMain.handle('task:background', async (_e, conv) => { const c = convOf(conv); try { return c ? await c.bridge.backgroundNow() : false } catch { return false } })
  ipcMain.on('chat:stop', (_e, conv) => { const c = convOf(conv); if (c) { c.replyText = ''; c.bridge.stop() } })
  ipcMain.on('perm:answer', (_e, { id, allow, always, answers, conv }) => { const c = convOf(conv); if (c) c.bridge.answer(id, !!allow, !!always, answers) })
  // Modello e ragionamento, ricordati per le prossime volte
  ipcMain.on('model:set', (_e, { model, effort, ultracode }) => {
    config.model = model || null
    config.effort = effort || null
    config.ultracode = !!ultracode
    for (const b of [bridge, ...allBridges()]) {
      b.setModel(config.model)
      b.ultracode = config.ultracode
      b.setEffort(config.effort)
    }
    saveConfig()
  })
  ipcMain.handle('models:get', () => {
    const cached = (() => { try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'models.json'), 'utf8')) } catch { return [] } })()
    return { models: bridge.modelList || cached, model: config.model || null, effort: config.effort || null, ultracode: !!config.ultracode }
  })
  // Le cronache, con quelle fissate in cima (si ricordano nella configurazione)
  ipcMain.handle('sessions:list', async () => {
    const pinned = new Set(Array.isArray(config.pinned) ? config.pinned : [])
    return (await bridge.sessions()).map((s) => (pinned.has(s.id) ? Object.assign(s, { pinned: true }) : s))
  })
  // La ricerca dentro le conversazioni (le parole nei messaggi, non solo nei titoli)
  ipcMain.handle('sessions:search', (_e, q) => { try { return searchSessions(String(q || '')).slice(0, 200) } catch { return [] } })
  ipcMain.handle('session:pin', (_e, id, on) => {
    const list = (Array.isArray(config.pinned) ? config.pinned : []).filter((x) => x !== id)
    if (on) list.unshift(String(id))
    config.pinned = list.slice(0, 50)
    saveConfig()
    return true
  })
  // Una conversazione in Markdown, salvata dove si sceglie (di solito Documenti)
  ipcMain.handle('session:export', async (_e, id, cwd, title) => {
    try {
      const md = await bridge.exportMarkdown(String(id), cwd || null, String(title || ''))
      const name = (String(title || tr('Conversazione')).replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || tr('Conversazione')) + '.md'
      const r = await dialog.showSaveDialog(win, { title: tr('Esporta la conversazione'), defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'Markdown', extensions: ['md'] }] })
      if (r.canceled || !r.filePath) return { ok: false, canceled: true }
      fs.writeFileSync(r.filePath, md)
      return { ok: true, file: r.filePath }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
  ipcMain.handle('commands:get', () => {
    if (bridge.commandList.length) return bridge.commandList
    try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'commands.json'), 'utf8')) } catch { return [] }
  })
  // Le azioni sugli annali. Eliminare chiede conferma; se era la conversazione in corso, si ricomincia da capo
  ipcMain.handle('session:rename', async (_e, id, title, cwd) => bridge.renameSessionTitle(id, title, cwd))
  ipcMain.handle('session:archive', async (_e, id, cwd, on) => { await bridge.archive(id, cwd, !!on); return true })
  ipcMain.handle('session:delete', async (_e, id, cwd, title) => {
    const r = await dialog.showMessageBox(win, {
      type: 'warning', buttons: [tr('Elimina'), tr('Annulla')], defaultId: 1, cancelId: 1, noLink: true,
      title: tr('Eliminare la conversazione?'),
      message: tr('Eliminare «{x}»?', { x: String(title || '').slice(0, 80) }),
      detail: tr('Il transcript di Claude Code viene cancellato dal disco e non si può recuperare, nemmeno dall\'app desktop. Per toglierla solo dall\'elenco c\'è "Archivia".'),
    })
    if (r.response !== 0) return { deleted: false }
    const wasCurrent = config.sessionId === id
    // La conversazione aperta su quella sessione si spegne e se ne va
    for (const c of [...convs.values()]) if (c.sessionId === id) dropConv(c)
    await bridge.remove(id, cwd)
    if (wasCurrent) { config.sessionId = null; config.sessionCwd = null; saveConfig() }
    return { deleted: true, wasCurrent }
  })
  // Apre una sessione di Claude Code, anche dell'app desktop: i messaggi dopo continuano quella, nella sua cartella
  // Se una conversazione su quella sessione è già aperta (magari sta lavorando) si torna a lei; altrimenti se ne apre
  // una nuova. Le altre restano come sono
  ipcMain.handle('session:open', async (_e, id, cwd) => {
    let c = [...convs.values()].find((x) => x.sessionId === id)
    const existing = !!c
    if (!c) c = makeConv(id, cwd || null)
    activeConv = c.id
    config.sessionId = id
    config.sessionCwd = c.cwd
    saveConfig()
    const history = await c.bridge.history(id, c.cwd)
    return { conv: c.id, existing, history }
  })
  ipcMain.on('tray:icon', (_e, dataUrl) => {
    const img = nativeImage.createFromDataURL(dataUrl)
    trayImage = img
    if (tray) { tray.setImage(img); return }
    tray = new Tray(img)
    tray.setToolTip('Claudeleon')
    tray.on('click', toggleVisible)
    refreshTray()
  })

  // Il ponte di servizio: i comandi, i modelli
  // I comandi con /: si ricordano su disco, così ci sono subito al prossimo avvio
  bridge.on('commands', (list) => {
    try { fs.writeFileSync(path.join(app.getPath('userData'), 'commands.json'), JSON.stringify(list)) } catch {}
    send('commands:list', list)
  })
  bridge.on('commandsError', () => send('commands:error'))
  bridge.on('usage', (u) => { lastUsage = u; send('claude:usage', u) })
  ipcMain.handle('usage:get', () => lastUsage)
  bridge.on('models', (list) => {
    bridge.modelList = list
    try { fs.writeFileSync(path.join(app.getPath('userData'), 'models.json'), JSON.stringify(list)) } catch {}
    send('models:list', list)
  })
}

// Gli eventi di una conversazione vanno alla pagina col suo id. Le notifiche dicono quale conversazione: arrivano
// se la finestra non è davanti, o se la conversazione non è quella in vista
function wireConv(c) {
  const b = c.bridge
  const fwd = (ev, channel) => b.on(ev, (x) => send(channel, x, c.id))
  b.on('delta', (t) => { c.replyText += t; send('claude:delta', t, c.id) })
  fwd('tool', 'claude:tool')
  fwd('thinkingStart', 'claude:thinkingStart')
  fwd('thinking', 'claude:thinking')
  fwd('thinkingEnd', 'claude:thinkingEnd')
  fwd('toolDone', 'claude:toolDone')
  b.on('done', (r) => {
    send('claude:done', r, c.id)
    const text = plainSnippet(c.replyText)
    c.replyText = ''
    notify(tr('Claude ha finito'), text || tr('La risposta è pronta.'), c)
  })
  b.on('error', (m) => {
    send('claude:error', m, c.id)
    c.replyText = ''
    notify(tr('Claude si è fermato'), plainSnippet(String(m || '')), c)
  })
  // Una domanda di permesso: se la finestra è ridotta a icona lampeggia nella barra, come le altre app, e arriva
  // una notifica
  b.on('ask', (q) => {
    if (!win.isVisible()) win.show()
    if (win.isMinimized() || !win.isFocused()) win.flashFrame(true)
    send('perm:ask', q, c.id)
    if (q.kind === 'plan') notify(tr('Claude propone un piano'), tr('Da approvare per continuare.'), c)
    else if (q.kind === 'question') notify(tr('Claude ti fa una domanda'), (q.questions[0] && q.questions[0].question) || '', c)
    else notify(tr('Claude chiede il permesso'), [q.title, q.detail].filter(Boolean).join(' · '), c)
  })
  fwd('askClosed', 'perm:closed')
  fwd('todos', 'claude:todos')
  fwd('suggestion', 'claude:suggestion')
  fwd('rewound', 'claude:rewound')
  fwd('tasks', 'claude:tasks')
  b.on('usage', (u) => { lastUsage = u; send('claude:usage', u) })
  b.on('context', (x) => {
    send('claude:context', x, c.id)
    // Un conto vero: la finestra del contesto di quel modello si ricorda per le stime delle cronache riaperte
    if (x && !x.estimate) {
      const saved = savedContextMax()
      if (JSON.stringify(saved) !== JSON.stringify(config.contextMax || {})) { config.contextMax = saved; saveConfig() }
    }
  })
  // Claude riprende a lavorare da sé (un messaggio entrato mentre il turno finiva)
  fwd('busy', 'claude:busy')
  fwd('commandOutput', 'claude:commandOutput')
  fwd('toolSummary', 'claude:toolSummary')
  fwd('compacted', 'claude:compacted')
  fwd('status', 'claude:status')
  // Il titolo dato da Claude e i comandi della conversazione valgono per tutta la finestra
  b.on('title', (x) => send('claude:title', x))
  b.on('commands', (list) => send('commands:list', list))
  // Il modo cambia dalla finestra, dall'approvazione di un piano o da Claude Code stesso: si ricorda e si mostra
  b.on('mode', (mode) => {
    config.permissionMode = mode
    saveConfig()
    for (const o of allBridges()) if (o !== b) o.mode = mode
    send('mode:changed', mode)
  })
}

app.on('second-instance', () => {
  if (win) bringBack()
})

// --cattura <file.png> [notte|giorno] [chat|cronache] [LxA] [--tema <id>]: per le prove, una conversazione finta, uno
// screenshot della finestra e uscita. Claude non viene chiamato.
function captureArgs() {
  const i = process.argv.indexOf('--cattura')
  if (i < 0) return null
  const ti = process.argv.indexOf('--tema')
  // Quinto argomento facoltativo: la dimensione, es. 760x820
  const [w, h] = String(process.argv[i + 4] || '').split('x').map(Number)
  return {
    file: process.argv[i + 1],
    scene: process.argv[i + 2] === 'giorno' ? 'giorno' : 'notte',
    view: process.argv[i + 3] || 'chat',
    size: w && h ? { w, h } : null,
    theme: ti > 0 ? process.argv[ti + 1] : null,
  }
}

function fakeConversation(capture) {
  if (capture.view === 'cronache') {
    // Le cronache vere, lette dal disco: nessuna chiamata a Claude
    win.webContents.executeJavaScript(`document.querySelector('[data-action="sessions"]')?.click()`)
    setTimeout(async () => {
      fs.writeFileSync(capture.file, (await win.webContents.capturePage()).toPNG())
      app.quit()
    }, 3500)
    return
  }
  const ev = [
    ['claude:tool', { id: 't1', name: 'Glob', summary: '**/*.cpp' }],
    ['claude:toolDone', { id: 't1', error: false }],
    ['claude:tool', { id: 't2', name: 'Read', summary: 'src/MapView.cpp' }],
    ['claude:toolDone', { id: 't2', error: false }],
    ['claude:tool', { id: 't4', name: 'Edit', summary: 'src/MapView.cpp', change: { file: 'src/MapView.cpp', hunks: [{ line: 41, before: 'void MapView::Draw()\n{\n    DrawTerrain();\n    DrawRoads();\n}', after: 'void MapView::Draw()\n{\n    DrawTerrain();\n    DrawRivers();\n    DrawRoads(m_showPaths);\n}' }] } }],
    ['claude:toolDone', { id: 't4', error: false }],
    ['claude:tool', { id: 't3', name: 'Bash', summary: 'git log --oneline -5' }],
    ['claude:toolDone', { id: 't3', error: true }],
    ['claude:delta', 'Il progetto ha tre parti principali. Comincerei dalla vista della mappa, che è il punto dove si incrociano le altre:\n\n- **MapView.cpp**: il disegno della mappa\n- `RouteFinder`: il calcolo dei sentieri\n\n```cpp\nm_pRouteFinder->FindPath(start, goal);\n```\n\nSe vuoi, apro il primo file e ti mostro la funzione.'],
    ['claude:done', { durationMs: 18400 }],
    ['perm:ask', { id: 1, title: 'Claude vuole eseguire un comando', description: 'Il comando scrive fuori dalla cartella di lavoro.', detail: 'git push origin feature/sentieri', canAlways: true }],
  ]
  win.webContents.executeJavaScript(`document.querySelector('[data-part="input"]').value = 'Mostrami i file del progetto e dimmi da dove cominceresti'; document.querySelector('[data-action="send"]').click()`)
  ev.forEach(([ch, payload], i) => setTimeout(() => send(ch, payload), 300 + i * 120))
  setTimeout(async () => {
    const image = await win.webContents.capturePage()
    fs.writeFileSync(capture.file, image.toPNG())
    app.quit()
  }, 2500)
}

// Il nome con cui Windows raggruppa la finestra nella barra delle applicazioni e riconosce le sue notifiche. Era
// 'Claude Skins': Windows gli aveva già legato l'icona di Electron (il primo collegamento era nato senza icona) e la
// teneva in memoria; con un nome nuovo ricomincia da capo
// La versione lanciata dal repo (electron.exe) ne ha un altro: con lo stesso, Windows mescolava le due e mostrava
// l'icona di electron.exe anche per l'app installata
// Gli identificativi restano quelli di quando l'app si chiamava Claude Skins: per Windows è la stessa app (notifiche,
// gruppo nella barra delle applicazioni), anche dopo il cambio di nome
const APP_ID = app.isPackaged ? 'ClaudeSkins.App' : 'ClaudeSkins.Dev'
if (process.platform === 'win32') app.setAppUserModelId(APP_ID)

// Le icone. Quella dell'app (menu Start, barra delle applicazioni, eseguibile, installer) è di Claudeleon e non
// cambia col tema: build/icon.ico, che nell'app installata sta nell'eseguibile. Quella del tema va solo sulla finestra
// (Alt+Tab) e nel vassoio
function appIconFile() {
  return app.isPackaged ? process.execPath : path.join(app.getAppPath(), 'build', 'icon.ico')
}
// Un diario di quello che l'app fa con icona e collegamento (userData/icona.log), per capire che cosa non va se
// Windows mostra l'icona sbagliata
function iconLog(...parts) {
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'icona.log'), `${new Date().toISOString()} ${parts.join(' ')}\n`) } catch {}
}
function setAppIcon(dataUrl) {
  const img = nativeImage.createFromDataURL(dataUrl)
  if (!img.isEmpty() && process.platform !== 'darwin') win.setIcon(img)
  if (process.platform !== 'win32') return
  try {
    // Le proprietà della finestra che la barra delle applicazioni legge per l'icona (anche quando l'app è fissata)
    win.setAppDetails({
      appId: APP_ID,
      appIconPath: appIconFile(),
      appIconIndex: 0,
      relaunchCommand: app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${app.getAppPath()}"`,
      relaunchDisplayName: 'Claudeleon',
    })
    iconLog('setAppDetails fatto, appId', APP_ID, 'icona', appIconFile())
  } catch (err) { iconLog('errore:', err && err.message) }
}

// Da dove arrivano gli aggiornamenti: dalle release di GitHub (l'app installata dall'installer di una release) o dal
// repo sul PC (quella lanciata dal repo, o installata da un installer fatto dal repo, che sa da quale clone viene).
// L'app installata dal repo può scegliere anche le release (impostazioni, "Aggiornamenti da")
let releaseUpdater = null
function appMeta() {
  try { return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) } catch { return {} }
}
function updateSources() {
  const list = []
  if (app.isPackaged) list.push('github')
  if (!app.isPackaged || appMeta().skinsRepo) list.push('repo')
  return list
}
function updateSource() {
  const list = updateSources()
  if (list.includes(config.updateSource)) return config.updateSource
  return app.isPackaged && !appMeta().skinsRepo ? 'github' : 'repo'
}
function makeUpdater() {
  if (updater) updater.removeAllListeners('state')
  if (updateSource() === 'github') updater = releaseUpdater = releaseUpdater || new ReleaseUpdater(app)
  else updater = new Updater(app)
  updater.on('state', (s) => {
    send('update:state', s)
    // Una novità la dice anche una notifica, una volta sola per versione (o per numero di novità nel repo)
    const key = s.version || s.count
    if (s.state === 'available' && key !== updateNotified && config.notify !== false && Notification.isSupported()) {
      updateNotified = key
      const body = s.version ? tr('È uscita la versione {v}', { v: s.version }) + (s.commits && s.commits[0] ? `: ${s.commits[0]}` : '') : s.commits && s.commits[0] ? tr('{n} novità, fra cui: {x}', { n: s.count, x: s.commits[0] }) : tr('{n} novità', { n: s.count })
      const n = new Notification({ title: tr('Claudeleon: aggiornamento disponibile'), body, icon: trayImage || undefined })
      n.on('click', () => { bringBack(); send('settings:open') })
      n.show()
    }
  })
}

// Il collegamento nel menu Start: Windows mostra le notifiche di un'app non installata solo se ne esiste uno con lo
// stesso AppUserModelId. Serve anche ad aprire Claudeleon dal menu Start. Ha l'icona dell'app, così Windows non le
// lega mai quella di Electron
function ensureStartMenuShortcut() {
  // L'app installata ha già il suo collegamento, fatto dall'installer con lo stesso AppUserModelId (appId); e la
  // versione dal repo non ne fa un secondo se l'app è installata (nella cartella di partenza dell'installer)
  if (app.isPackaged) return
  const local = process.env.LOCALAPPDATA || ''
  // (anche col nome di prima, Claude Skins)
  const dirs = ['claudeleon', 'Claudeleon', 'claude-skins', 'Claude Skins']
  if (local && dirs.some((d) => ['Claudeleon.exe', 'Claude Skins.exe'].some((exe) => fs.existsSync(path.join(local, 'Programs', d, exe))))) {
    iconLog('app installata: nessun collegamento dalla versione del repo')
    return
  }
  if (process.platform !== 'win32' || !fs.existsSync(appIconFile())) return
  try {
    const menu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    // Il collegamento della versione dal repo col nome di prima se ne va (solo se è suo: punta a electron.exe)
    try { const old = path.join(menu, 'Claude Skins.lnk'); if (/electron\.exe$/i.test(shell.readShortcutLink(old).target || '')) fs.unlinkSync(old) } catch {}
    const link = path.join(menu, 'Claudeleon.lnk')
    const want = { target: process.execPath, args: `"${app.getAppPath()}"`, appUserModelId: APP_ID, description: 'Claudeleon', cwd: app.getAppPath(), icon: appIconFile(), iconIndex: 0 }
    let same = false
    try {
      const cur = shell.readShortcutLink(link)
      // Il collegamento dell'app installata (punta al suo .exe, non a electron.exe): la versione di sviluppo non lo tocca
      if (cur.target && cur.target !== process.execPath && !/electron\.exe$/i.test(cur.target)) { iconLog('collegamento dell\'app installata: lasciato com\'è'); return }
      same = cur.target === want.target && cur.args === want.args && cur.appUserModelId === APP_ID && (cur.icon || '') === want.icon
    } catch {}
    let ok = true
    if (!same) ok = shell.writeShortcutLink(link, fs.existsSync(link) ? 'replace' : 'create', want)
    let back = null
    try { back = shell.readShortcutLink(link) } catch {}
    iconLog('collegamento:', link, same ? 'già giusto' : ok ? 'scritto' : 'NON scritto', back ? `icona=${back.icon} appId=${back.appUserModelId}` : 'illeggibile')
  } catch (err) { iconLog('errore collegamento:', err && err.message) }
}

// Le notifiche di Windows, quando la finestra non è davanti: Claude ha finito, chiede un permesso o una scelta, si è
// fermato. Il titolo dice anche quale conversazione; un clic riporta davanti la finestra. Si spengono dal vassoio
let trayImage = null
const shownNotes = new Set()
function away() {
  return !win || !win.isVisible() || win.isMinimized() || !win.isFocused()
}
async function notify(title, body, c) {
  if (config.notify === false || !Notification.isSupported()) return
  if (!away() && (!c || c.id === activeConv)) return
  const name = c ? await c.bridge.currentTitle().catch(() => '') : ''
  const short = name.length > 50 ? `${name.slice(0, 49)}…` : name
  const n = new Notification({ title: short ? `${title} · ${short}` : title, body: body || '', icon: trayImage || undefined })
  // Un clic riporta davanti la finestra, sulla conversazione della notifica
  n.on('click', () => { bringBack(); if (c && convs.has(c.id)) send('conv:show', null, c.id); n.close() })
  n.on('close', () => shownNotes.delete(n))
  shownNotes.add(n)
  n.show()
}

// I temi cambiati sul disco (scritti da Claude con la skill dei temi, o a mano): la cartella si tiene d'occhio e la
// finestra riceve l'elenco aggiornato, con un "timbro" per tema (l'ultima modifica dei suoi file) per ricaricare solo
// quelli cambiati
function themeStamp(dir) {
  let max = 0
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else max = Math.max(max, fs.statSync(f).mtimeMs) } }
  try { walk(dir) } catch {}
  return Math.round(max)
}
function themesSnapshot() {
  const dir = userThemesDir()
  return {
    code: installedThemes(dir).map((t) => ({ id: t.id, base: `skins-theme://${t.id}/`, stamp: themeStamp(path.join(dir, t.id)) })),
    colors: userThemes(dir),
  }
}
let themesTimer = null
function watchThemes() {
  const dir = userThemesDir()
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  try {
    fs.watch(dir, { recursive: true }, () => {
      clearTimeout(themesTimer)
      themesTimer = setTimeout(() => {
        themes = allThemes()
        refreshTray()
        send('themes:changed', themesSnapshot())
      }, 300)
    })
  } catch (err) { logError('cartella dei temi non osservata', err.message) }
}

// I file dei temi importati con codice: solo dentro temi/<id>/
function serveThemes() {
  protocol.handle('skins-theme', async (req) => {
    try {
      const u = new URL(req.url)
      const dir = path.join(userThemesDir(), u.hostname)
      const file = path.join(dir, ...decodeURIComponent(u.pathname).split('/').filter(Boolean))
      if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(u.hostname) || path.relative(dir, file).startsWith('..') || !fs.existsSync(file)) return new Response('', { status: 404 })
      // La pagina è file://: caratteri e immagini del tema passano solo col permesso esplicito
      const res = await net.fetch(require('url').pathToFileURL(file).href)
      const headers = new Headers(res.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      // Un tema che cambia (la skill dei temi) si rilegge sempre dal disco
      headers.set('Cache-Control', 'no-store')
      return new Response(res.body, { status: res.status, headers })
    } catch {
      return new Response('', { status: 404 })
    }
  })
}

process.on('uncaughtException', (err) => { logError('errore nel processo principale:', err && err.stack || err); console.error(err) })

app.whenReady().then(() => {
  serveThemes()
  migrateOldData()
  loadConfig()
  i18n.setLanguage(config.language || 'en')
  const capture = captureArgs()
  if (capture) {
    // Le prove non toccano la configurazione vera
    configFile = path.join(app.getPath('temp'), 'claudeleon-prova.json')
    config = { workdir: config.workdir, position: { x: 20, y: 20 }, sizes: {}, sessionId: null, scene: capture.scene, chapter: 3, theme: capture.theme || config.theme, permissionMode: 'auto' }
  }
  // Un aggiornamento appena installato: la finestra mostra le novità (la prima installazione no)
  if (!capture) {
    const v = app.getVersion()
    // (una configurazione di prima della 1.1, che non ricordava la versione, vale come aggiornamento)
    if (config.lastVersion ? config.lastVersion !== v : configExisted) whatsNew = { from: config.lastVersion || null, to: v }
    if (config.lastVersion !== v) { config.lastVersion = v; saveConfig() }
  }
  themes = allThemes()
  // Avvio sicuro: chiesto, o dopo due avvii di fila andati male
  if (!capture) {
    const attempts = (Number(config.startAttempts) || 0) + 1
    if (process.argv.includes('--avvio-sicuro')) {
      if (!fallBack('manual')) safeStart = safeStart || { reason: 'manual' }
    } else if (attempts >= 3) fallBack('crash')
    config.startAttempts = safeStart ? 1 : attempts
    saveConfig()
  }
  if (capture && capture.size) config.sizes[currentTheme().id] = capture.size
  if (!config.chapter) { config.chapter = 1; saveConfig() }
  bridge = new ClaudeBridge({
    getSession: () => config.sessionId,
    setSession: (id, cwd) => { config.sessionId = id; config.sessionCwd = cwd || null; saveConfig() },
  }, config.workdir, i18n.pick(currentTheme().persona), config.permissionMode)
  // Come si presentano le sessioni a Claude Code (cli: visibili nel /resume e nelle altre app). Si può cambiare in
  // config.json, ad esempio "claude-desktop"
  bridge.entrypoint = config.entrypoint || 'cli'
  bridge.claudePath = claudePath()
  bridge.themesDir = userThemesDir()
  bridge.setModel(config.model || null)
  captureMode = !!capture
  loadContextMax(config.contextMax)
  registerIpc()
  // All'avvio una conversazione nuova, come l'app desktop: quella dell'ultima volta resta negli annali (se c'era, il
  // capitolo va avanti di uno)
  if (config.sessionId && !capture) {
    config.chapter += 1
    config.sessionId = null
    config.sessionCwd = null
    saveConfig()
  }
  activeConv = makeConv(null, null).id
  createWindow()
  if (!capture) watchThemes()
  if (!capture) {
    try { fs.writeFileSync(path.join(app.getPath('userData'), 'icona.log'), '') } catch {}
    ensureStartMenuShortcut()
    // Gli aggiornamenti: un controllo poco dopo l'avvio e poi ogni 6 ore (si spengono dalle impostazioni). Una novità
    // la dice anche una notifica, una volta sola per numero di novità
    makeUpdater()
    // La ricerca nelle conversazioni legge i file in anticipo, così la prima è subito pronta
    setTimeout(warmSearch, 20000)
    const autoCheck = () => { if (config.autoUpdate !== false && updater) updater.check() }
    setTimeout(autoCheck, 30000)
    setInterval(autoCheck, 6 * 3600 * 1000)
  }
  if (capture) {
    win.webContents.once('did-finish-load', () => setTimeout(() => fakeConversation(capture), 600))
    return
  }
  globalShortcut.register(TOGGLE_SHORTCUT, toggleVisible)
  // L'elenco aggiornato dei comandi, senza aspettare il primo messaggio (Claude Code si avvia e si chiude, nessun costo)
  win.webContents.once('did-finish-load', () => setTimeout(() => bridge.loadCommands(), 1500))
})

// Win+H da qui: Electron non preme tasti del sistema, quindi un PowerShell resta aperto (nascosto) con la funzione
// che li preme (user32 keybd_event); si avvia alla prima dettatura e le volte dopo risponde subito
let dictator = null
function dictate() {
  if (process.platform !== 'win32') return false
  try {
    if (!dictator || dictator.exitCode !== null || dictator.killed) {
      dictator = require('child_process').spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] })
      dictator.on('error', () => { dictator = null })
      dictator.stdin.on('error', () => {})
      dictator.stdin.write("Add-Type -Namespace SkinsVoice -Name Keys -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte v, byte s, uint f, System.UIntPtr e); public static void WinH() { keybd_event(0x5B,0,0,System.UIntPtr.Zero); keybd_event(0x48,0,0,System.UIntPtr.Zero); keybd_event(0x48,0,2,System.UIntPtr.Zero); keybd_event(0x5B,0,2,System.UIntPtr.Zero); }'\n")
    }
    dictator.stdin.write('[SkinsVoice.Keys]::WinH()\n')
    return true
  } catch {
    dictator = null
    return false
  }
}

app.on('will-quit', () => {
  if (dictator) { try { dictator.kill() } catch {} }
  globalShortcut.unregisterAll()
  for (const c of convs.values()) c.bridge.cancel()
})

app.on('window-all-closed', () => app.quit())
