// La finestra a rotolo: trasparente, senza bordi, sempre in primo piano. Dove non c'è il rotolo i clic passano
// alle finestre sotto; il rotolo si trascina dal capo alto.
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut } = require('electron')
const fs = require('fs')
const path = require('path')
const { ClaudeBridge } = require('./claude-bridge')
const { listThemes, DEFAULT_THEME } = require('./themes')

const WIN_W = 460
const WIN_H = 720
// Più stretto o più basso di così il rotolo non ha posto per la penna e i pulsanti
const MIN_W = 360
const MIN_H = 480
const TOGGLE_SHORTCUT = 'Control+Alt+P'

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let win = null
let tray = null
let bridge = null
let configFile = null
// workdir: la cartella in cui lavora Claude Code e di cui si elencano le cronache; vuota, la cartella utente
// theme: l'id del tema in uso (una cartella di src/renderer/themes)
let config = { workdir: '', position: null, size: null, sessionId: null, scene: 'notte', chapter: 0, theme: DEFAULT_THEME }
let themes = []
// Il trascinamento o il ridimensionamento in corso: il processo principale segue il cursore
let gesture = null

function loadConfig() {
  configFile = path.join(app.getPath('userData'), 'config.json')
  try {
    Object.assign(config, JSON.parse(fs.readFileSync(configFile, 'utf8')))
  } catch {
    // Primo avvio o file non valido: restano i valori di partenza
  }
}

function saveConfig() {
  fs.mkdirSync(path.dirname(configFile), { recursive: true })
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
}

function windowSize() {
  const s = config.size
  return s && s.w >= MIN_W && s.h >= MIN_H ? { w: s.w, h: s.h } : { w: WIN_W, h: WIN_H }
}

function defaultPosition() {
  const wa = screen.getPrimaryDisplay().workArea
  const { w, h } = windowSize()
  return { x: wa.x + wa.width - w - 12, y: wa.y + wa.height - h }
}

// Una posizione salvata su un monitor ora scollegato lascerebbe la finestra fuori dallo schermo
function visiblePosition(pos) {
  if (!pos) return null
  const cx = pos.x + windowSize().w / 2
  const cy = pos.y + 40
  return screen.getAllDisplays().some(({ workArea: wa }) => cx >= wa.x && cx <= wa.x + wa.width && cy >= wa.y && cy <= wa.y + wa.height) ? pos : null
}

// Il tema in uso, o il predefinito se quello salvato non c'è più
function currentTheme() {
  return themes.find((t) => t.id === config.theme) || themes.find((t) => t.id === DEFAULT_THEME) || themes[0] || { id: DEFAULT_THEME, name: DEFAULT_THEME, persona: '' }
}

// Cambia tema: la pagina lo applica sul posto, Claude riceve la nuova personalità dal messaggio successivo
function setTheme(id) {
  if (!themes.some((t) => t.id === id)) return
  config.theme = id
  saveConfig()
  bridge.persona = currentTheme().persona
  send('theme:apply', id)
  refreshTray()
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
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
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    title: 'Pergamena',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.setAlwaysOnTop(true, 'floating')
  // Finché il mouse non è sul rotolo, i clic attraversano la finestra (lo segnala la pagina)
  win.setIgnoreMouseEvents(true, { forward: true })
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  // Nessun link si apre dentro la finestra
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
}

// Spostare ('move') o ridimensionare ('resize'): dal clic sulla pagina si segue il cursore sullo schermo, così il
// gesto non si perde quando il mouse esce dalla finestra in un movimento veloce
function startGesture(kind) {
  stopGesture()
  const start = screen.getCursorScreenPoint()
  const [x, y] = win.getPosition()
  const [w, h] = win.getSize()
  const timer = setInterval(() => {
    const c = screen.getCursorScreenPoint()
    const dx = c.x - start.x
    const dy = c.y - start.y
    if (kind === 'move') {
      win.setPosition(x + dx, y + dy)
    } else {
      const wa = screen.getDisplayNearestPoint(c).workArea
      const nw = Math.max(MIN_W, Math.min(w + dx, wa.x + wa.width - x))
      const nh = Math.max(MIN_H, Math.min(h + dy, wa.y + wa.height - y))
      win.setBounds({ x, y, width: nw, height: nh })
    }
  }, 1000 / 60)
  gesture = { kind, timer }
}

function stopGesture() {
  if (!gesture) return
  clearInterval(gesture.timer)
  const kind = gesture.kind
  gesture = null
  const [x, y] = win.getPosition()
  config.position = { x, y }
  if (kind === 'resize') {
    const [w, h] = win.getSize()
    config.size = { w, h }
  }
  saveConfig()
}

function toggleVisible() {
  if (win.isVisible()) win.hide()
  else win.show()
  refreshTray()
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: win && win.isVisible() ? 'Nascondi il rotolo' : 'Mostra il rotolo', click: toggleVisible },
    { label: 'Nuovo capitolo', click: () => send('chat:reset') },
    { label: 'Tema', submenu: themes.map((t) => ({ label: t.name, type: 'radio', checked: t.id === currentTheme().id, click: () => setTheme(t.id) })) },
    { label: 'Riporta in basso a destra', click: () => { const p = defaultPosition(); win.setPosition(p.x, p.y); config.position = p; saveConfig() } },
    { label: 'Dimensione iniziale', click: () => { win.setSize(WIN_W, WIN_H); config.size = null; saveConfig() } },
    { type: 'separator' },
    { label: 'Esci', click: () => app.quit() },
  ])
}

function refreshTray() {
  if (tray) tray.setContextMenu(trayMenu())
}

function registerIpc() {
  ipcMain.on('mouse:interactive', (_e, on) => { if (!gesture) win.setIgnoreMouseEvents(!on, { forward: true }) })
  ipcMain.on('gesture:start', (_e, kind) => { win.setIgnoreMouseEvents(false); startGesture(kind === 'resize' ? 'resize' : 'move') })
  ipcMain.on('gesture:end', stopGesture)
  ipcMain.on('window:hide', () => { win.hide(); refreshTray() })
  ipcMain.on('app:quit', () => app.quit())
  ipcMain.handle('app:info', () => ({
    scene: config.scene,
    chapter: config.chapter,
    shortcut: TOGGLE_SHORTCUT.replace('Control', 'Ctrl'),
    theme: currentTheme().id,
    themes: themes.map((t) => t.id),
    workdir: bridge.workdir,
  }))
  ipcMain.on('theme:set', (_e, id) => setTheme(String(id)))
  ipcMain.on('scene:set', (_e, scene) => { config.scene = scene === 'giorno' ? 'giorno' : 'notte'; saveConfig() })
  // Un capitolo per conversazione: il numero cresce, la sessione di Claude Code ricomincia
  ipcMain.handle('chapter:new', () => {
    bridge.cancel()
    config.chapter += 1
    config.sessionId = null
    saveConfig()
    return config.chapter
  })
  ipcMain.on('chat:send', (_e, text) => bridge.send(String(text || '')))
  ipcMain.on('chat:stop', () => bridge.cancel())
  ipcMain.on('perm:answer', (_e, { id, allow, always }) => bridge.answer(id, !!allow, !!always))
  ipcMain.handle('sessions:list', () => bridge.sessions())
  // Apre una sessione di Claude Code, anche dell'app desktop: i messaggi dopo continuano quella
  ipcMain.handle('session:open', async (_e, id) => {
    bridge.cancel()
    config.sessionId = id
    saveConfig()
    return bridge.history(id)
  })
  ipcMain.on('tray:icon', (_e, dataUrl) => {
    const img = nativeImage.createFromDataURL(dataUrl)
    if (tray) { tray.setImage(img); return }
    tray = new Tray(img)
    tray.setToolTip('Pergamena')
    tray.on('click', toggleVisible)
    refreshTray()
  })

  bridge.on('delta', (t) => send('claude:delta', t))
  bridge.on('tool', (t) => send('claude:tool', t))
  bridge.on('toolDone', (t) => send('claude:toolDone', t))
  bridge.on('done', (r) => send('claude:done', r))
  bridge.on('error', (m) => send('claude:error', m))
  bridge.on('ask', (q) => { if (!win.isVisible()) win.show(); send('perm:ask', q) })
  bridge.on('askClosed', (q) => send('perm:closed', q))
}

app.on('second-instance', () => {
  if (win) { win.show(); win.focus() }
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
    win.webContents.executeJavaScript(`document.getElementById('btn-sessions').click()`)
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
    ['claude:tool', { id: 't3', name: 'Bash', summary: 'git log --oneline -5' }],
    ['claude:toolDone', { id: 't3', error: true }],
    ['claude:delta', 'Il progetto ha tre parti principali. Comincerei dalla vista della mappa, che è il punto dove si incrociano le altre:\n\n- **MapView.cpp**: il disegno della mappa\n- `RouteFinder`: il calcolo dei sentieri\n\n```cpp\nm_pRouteFinder->FindPath(start, goal);\n```\n\nSe vuoi, apro il primo file e ti mostro la funzione.'],
    ['claude:done', { durationMs: 18400 }],
    ['perm:ask', { id: 1, title: 'Claude vuole eseguire un comando', description: 'Il comando scrive fuori dalla cartella di lavoro.', detail: 'git push origin feature/sentieri', canAlways: true }],
  ]
  win.webContents.executeJavaScript(`document.getElementById('input').value = 'Mostrami i file del progetto e dimmi da dove cominceresti'; document.getElementById('btn-send').click()`)
  ev.forEach(([ch, payload], i) => setTimeout(() => send(ch, payload), 300 + i * 120))
  setTimeout(async () => {
    const image = await win.webContents.capturePage()
    fs.writeFileSync(capture.file, image.toPNG())
    app.quit()
  }, 2500)
}

app.whenReady().then(() => {
  loadConfig()
  const capture = captureArgs()
  if (capture) {
    // Le prove non toccano la configurazione vera
    configFile = path.join(app.getPath('temp'), 'pergamena-prova.json')
    config = { workdir: config.workdir, position: { x: 20, y: 20 }, size: capture.size, sessionId: null, scene: capture.scene, chapter: 3, theme: capture.theme || config.theme }
  }
  themes = listThemes()
  if (!config.chapter) { config.chapter = 1; saveConfig() }
  bridge = new ClaudeBridge({
    getSession: () => config.sessionId,
    setSession: (id) => { config.sessionId = id; saveConfig() },
  }, config.workdir, currentTheme().persona)
  if (capture) bridge.send = () => {}
  registerIpc()
  createWindow()
  if (capture) {
    win.webContents.once('did-finish-load', () => setTimeout(() => fakeConversation(capture), 600))
    return
  }
  globalShortcut.register(TOGGLE_SHORTCUT, toggleVisible)
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (bridge) bridge.cancel()
})

app.on('window-all-closed', () => app.quit())
