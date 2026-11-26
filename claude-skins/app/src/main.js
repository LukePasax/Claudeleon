// La finestra: trasparente, senza bordi, sempre in primo piano. La sua forma la decide il tema in uso; dove il tema
// non disegna nulla i clic passano alle finestre sotto, e si trascina dalla parte che il tema indica (data-drag).
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut } = require('electron')
const fs = require('fs')
const path = require('path')
const { ClaudeBridge } = require('./claude-bridge')
const { listThemes, DEFAULT_THEME } = require('./themes')

// La misura di partenza, simile a quella dell'app desktop, e la minima, per i temi che non dicono le loro
// (campo window del theme.js). La finestra di partenza non supera mai il 92% dello schermo
const DEFAULT_WINDOW = { width: 1080, height: 760, minWidth: 360, minHeight: 480 }
const TOGGLE_SHORTCUT = 'Control+Alt+P'

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let win = null
let tray = null
let bridge = null
let configFile = null
// workdir: la cartella in cui lavora Claude Code e di cui si elencano le cronache; vuota, la cartella utente
// theme: l'id del tema in uso (una cartella di src/renderer/themes); sizes: la misura scelta per ogni tema, perché un
// rotolo e un libro aperto non stanno bene alla stessa misura
let config = { workdir: '', position: null, sizes: {}, sessionId: null, scene: 'notte', chapter: 0, theme: DEFAULT_THEME }
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
function currentTheme() {
  return themes.find((t) => t.id === config.theme) || themes.find((t) => t.id === DEFAULT_THEME) || themes[0] || { id: DEFAULT_THEME, name: DEFAULT_THEME, persona: '' }
}

// Cambia tema: la pagina lo applica sul posto, Claude riceve la nuova personalità dal messaggio successivo
function setTheme(id) {
  if (!themes.some((t) => t.id === id)) return
  config.theme = id
  saveConfig()
  bridge.persona = currentTheme().persona
  // La finestra prende la misura del nuovo tema, attorno allo stesso centro e dentro lo schermo
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
    alwaysOnTop: config.onTop !== false,
    backgroundColor: '#00000000',
    title: 'Claude Skins',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (config.onTop !== false) win.setAlwaysOnTop(true, 'floating')
  // Finché il mouse non è sopra una parte disegnata del tema, i clic attraversano la finestra (lo segnala la pagina)
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
  // Su Windows con lo schermo ridimensionato (125%, 150%...) ogni setPosition su una finestra trasparente senza bordi
  // può allargarla di un pixel per l'arrotondamento fra pixel logici e fisici: chiamata 60 volte al secondo, la
  // finestra cresce da sola. Per questo si passa sempre la dimensione di partenza, e solo quando il cursore si muove
  let last = null
  const timer = setInterval(() => {
    const c = screen.getCursorScreenPoint()
    if (last && c.x === last.x && c.y === last.y) return
    last = c
    const dx = c.x - start.x
    const dy = c.y - start.y
    if (kind === 'move') {
      win.setBounds({ x: x + dx, y: y + dy, width: w, height: h })
    } else {
      const wa = screen.getDisplayNearestPoint(c).workArea
      const { minWidth, minHeight } = themeWindow()
      const nw = Math.max(minWidth, Math.min(w + dx, wa.x + wa.width - x))
      const nh = Math.max(minHeight, Math.min(h + dy, wa.y + wa.height - y))
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
    config.sizes = Object.assign({}, config.sizes, { [currentTheme().id]: { w, h } })
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
    { label: win && win.isVisible() ? 'Nascondi' : 'Mostra', click: toggleVisible },
    { label: 'Nuovo capitolo', click: () => send('chat:reset') },
    { label: 'Tema', submenu: themes.map((t) => ({ label: t.name, type: 'radio', checked: t.id === currentTheme().id, click: () => setTheme(t.id) })) },
    { label: 'Sempre in primo piano', type: 'checkbox', checked: config.onTop !== false, click: (item) => setOnTop(item.checked) },
    { label: 'Riporta al centro', click: () => { const p = defaultPosition(); const [w, h] = win.getSize(); win.setBounds({ x: p.x, y: p.y, width: w, height: h }); config.position = p; saveConfig() } },
    { label: 'Dimensione iniziale', click: () => {
      if (config.sizes) delete config.sizes[currentTheme().id]
      const { w, h } = defaultSize()
      const p = defaultPosition()
      win.setBounds({ x: p.x, y: p.y, width: w, height: h })
      config.position = p
      saveConfig()
    } },
    { type: 'separator' },
    { label: 'Esci', click: () => app.quit() },
  ])
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
    tray.setToolTip('Claude Skins')
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

app.whenReady().then(() => {
  loadConfig()
  const capture = captureArgs()
  if (capture) {
    // Le prove non toccano la configurazione vera
    configFile = path.join(app.getPath('temp'), 'claude-skins-prova.json')
    config = { workdir: config.workdir, position: { x: 20, y: 20 }, sizes: {}, sessionId: null, scene: capture.scene, chapter: 3, theme: capture.theme || config.theme }
  }
  themes = listThemes()
  if (capture && capture.size) config.sizes[currentTheme().id] = capture.size
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
