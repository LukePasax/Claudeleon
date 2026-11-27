// La finestra: trasparente, senza bordi, sempre in primo piano. La sua forma la decide il tema in uso; dove il tema
// non disegna nulla i clic passano alle finestre sotto, e si trascina dalla parte che il tema indica (data-drag).
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut, shell, dialog, Notification } = require('electron')
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
// libro aperto e una finestra semplice non stanno bene alla stessa misura
// permissionMode: il modo dei permessi (auto, default, acceptEdits, plan)
let config = { workdir: '', position: null, sizes: {}, sessionId: null, scene: 'notte', chapter: 0, theme: DEFAULT_THEME, permissionMode: 'auto' }
let themes = []
// Il trascinamento o il ridimensionamento in corso: il processo principale segue il cursore
let gesture = null

function loadConfig() {
  configFile = path.join(app.getPath('userData'), 'config.json')
  try {
    Object.assign(config, JSON.parse(fs.readFileSync(configFile, 'utf8')))
  } catch {
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
function currentTheme() {
  return themes.find((t) => t.id === config.theme) || themes.find((t) => t.id === DEFAULT_THEME) || themes[0] || { id: DEFAULT_THEME, name: DEFAULT_THEME, persona: '' }
}

// Cambia tema: la pagina lo applica sul posto, Claude riceve la nuova personalità dal messaggio successivo
function setTheme(id) {
  if (!themes.some((t) => t.id === id)) return
  config.theme = id
  saveConfig()
  bridge.persona = currentTheme().persona
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
    // Come un'app normale: nella barra delle applicazioni, non sopra le altre finestre (si accende dal vassoio)
    alwaysOnTop: config.onTop === true,
    skipTaskbar: false,
    minimizable: true,
    backgroundColor: '#00000000',
    title: 'Claude Skins',
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
  // Nessun link si apre dentro la finestra
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
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
    { label: win && shown() ? 'Riduci a icona' : 'Mostra', click: () => { if (shown()) win.minimize(); else bringBack(); refreshTray() } },
    { label: 'Nuovo capitolo', click: () => send('chat:reset') },
    { label: 'Tema', submenu: themes.map((t) => ({ label: t.name, type: 'radio', checked: t.id === currentTheme().id, click: () => setTheme(t.id) })) },
    { label: 'Cartella di lavoro…', click: chooseWorkdir },
    { label: 'Notifiche', type: 'checkbox', checked: config.notify !== false, click: (item) => { config.notify = item.checked; saveConfig() } },
    { label: 'Sempre in primo piano', type: 'checkbox', checked: config.onTop === true, click: (item) => setOnTop(item.checked) },
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

// La cartella in cui nascono le conversazioni nuove (quelle riprese restano nella loro)
async function chooseWorkdir() {
  const r = await dialog.showOpenDialog(win, { title: 'Cartella di lavoro di Claude', defaultPath: bridge.workdir, properties: ['openDirectory'] })
  if (r.canceled || !r.filePaths[0]) return null
  return setWorkdir(r.filePaths[0])
}

function setWorkdir(dir) {
  if (!dir || !fs.existsSync(dir)) return null
  config.workdir = dir
  bridge.workdir = dir.replace(/\\/g, '/')
  saveConfig()
  send('workdir:changed', bridge.workdir)
  return bridge.workdir
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
    themes: themes.map((t) => t.id),
    workdir: bridge.workdir,
    // Se la cartella l'ha scelta la persona (altrimenti è la cartella utente, e al primo messaggio la si chiede)
    workdirChosen: !!config.workdir,
    sessionCwd: config.sessionId ? (config.sessionCwd || bridge.workdir) : null,
    mode: bridge.mode,
  }))
  ipcMain.on('theme:set', (_e, id) => setTheme(String(id)))
  // La cartella delle conversazioni nuove, dalla finestra: dal dialogo di sistema o da una cartella recente
  ipcMain.handle('workdir:choose', () => chooseWorkdir())
  ipcMain.handle('workdir:set', (_e, dir) => setWorkdir(String(dir || '')))
  // Il modo dei permessi, scelto dalla finestra; il messaggero lo applica anche alla risposta in corso
  ipcMain.on('mode:set', (_e, mode) => bridge.setMode(String(mode)))
  // Un link di una risposta: nel browser di sistema, e solo se è http, https o mailto
  ipcMain.on('link:open', (_e, url) => {
    const u = String(url || '')
    if (/^(https?:\/\/|mailto:)/i.test(u)) shell.openExternal(u).catch(() => {})
  })
  ipcMain.on('scene:set', (_e, scene) => { config.scene = scene === 'giorno' ? 'giorno' : 'notte'; saveConfig() })
  // Un capitolo per conversazione: il numero cresce, la sessione di Claude Code ricomincia
  ipcMain.handle('chapter:new', () => {
    bridge.cancel()
    send('claude:context', null)
    bridge.resetTodos()
    config.chapter += 1
    config.sessionId = null
    config.sessionCwd = null
    bridge.sessionCwd = null
    saveConfig()
    return config.chapter
  })
  // Il messaggio: testo, o { text, images, files } con gli allegati
  ipcMain.on('chat:send', (_e, msg) => bridge.send(msg && typeof msg === 'object' ? msg : String(msg || '')))
  // Il pulsante "allega": file e immagini dal disco
  ipcMain.handle('files:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Allega file o immagini', defaultPath: bridge.sessionCwd || bridge.workdir, properties: ['openFile', 'multiSelections'] })
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
  ipcMain.on('chat:stop', () => { replyText = ''; bridge.stop() })
  ipcMain.on('perm:answer', (_e, { id, allow, always, answers }) => bridge.answer(id, !!allow, !!always, answers))
  // Modello e ragionamento, ricordati per le prossime volte
  ipcMain.on('model:set', (_e, { model, effort, ultracode }) => {
    config.model = model || null
    config.effort = effort || null
    config.ultracode = !!ultracode
    bridge.setModel(config.model)
    bridge.ultracode = config.ultracode
    bridge.setEffort(config.effort)
    saveConfig()
  })
  ipcMain.handle('models:get', () => {
    const cached = (() => { try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'models.json'), 'utf8')) } catch { return [] } })()
    return { models: bridge.modelList || cached, model: config.model || null, effort: config.effort || null, ultracode: !!config.ultracode }
  })
  ipcMain.handle('sessions:list', () => bridge.sessions())
  ipcMain.handle('commands:get', () => {
    if (bridge.commandList.length) return bridge.commandList
    try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'commands.json'), 'utf8')) } catch { return [] }
  })
  // Le azioni sugli annali. Eliminare chiede conferma; se era la conversazione in corso, si ricomincia da capo
  ipcMain.handle('session:rename', async (_e, id, title, cwd) => bridge.renameSessionTitle(id, title, cwd))
  ipcMain.handle('session:archive', async (_e, id, cwd, on) => { await bridge.archive(id, cwd, !!on); return true })
  ipcMain.handle('session:delete', async (_e, id, cwd, title) => {
    const r = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['Elimina', 'Annulla'], defaultId: 1, cancelId: 1, noLink: true,
      title: 'Eliminare la conversazione?',
      message: `Eliminare «${String(title || '').slice(0, 80)}»?`,
      detail: 'Il transcript di Claude Code viene cancellato dal disco e non si può recuperare, nemmeno dall\'app desktop. Per toglierla solo dall\'elenco c\'è "Archivia".',
    })
    if (r.response !== 0) return { deleted: false }
    const wasCurrent = config.sessionId === id
    await bridge.remove(id, cwd)
    if (wasCurrent) { config.sessionId = null; config.sessionCwd = null; bridge.sessionCwd = null; saveConfig() }
    return { deleted: true, wasCurrent }
  })
  // Apre una sessione di Claude Code, anche dell'app desktop: i messaggi dopo continuano quella, nella sua cartella
  ipcMain.handle('session:open', async (_e, id, cwd) => {
    bridge.cancel()
    send('claude:context', null)
    config.sessionId = id
    config.sessionCwd = cwd || null
    bridge.sessionCwd = config.sessionCwd
    saveConfig()
    return bridge.history(id, config.sessionCwd)
  })
  ipcMain.on('tray:icon', (_e, dataUrl) => {
    const img = nativeImage.createFromDataURL(dataUrl)
    trayImage = img
    // La stessa icona del tema va anche sulla finestra: è quella della barra delle applicazioni
    if (process.platform !== 'darwin') win.setIcon(img)
    if (tray) { tray.setImage(img); return }
    tray = new Tray(img)
    tray.setToolTip('Claude Skins')
    tray.on('click', toggleVisible)
    refreshTray()
  })

  bridge.on('delta', (t) => { replyText += t; send('claude:delta', t) })
  bridge.on('tool', (t) => send('claude:tool', t))
  bridge.on('thinkingStart', () => send('claude:thinkingStart'))
  bridge.on('thinking', (t) => send('claude:thinking', t))
  bridge.on('thinkingEnd', () => send('claude:thinkingEnd'))
  bridge.on('toolDone', (t) => send('claude:toolDone', t))
  bridge.on('done', (r) => {
    send('claude:done', r)
    const text = plainSnippet(replyText)
    replyText = ''
    notify('Claude ha finito', text || 'La risposta è pronta.')
  })
  bridge.on('error', (m) => {
    send('claude:error', m)
    replyText = ''
    notify('Claude si è fermato', plainSnippet(String(m || '')))
  })
  // Una domanda di permesso: se la finestra è ridotta a icona lampeggia nella barra, come le altre app, e arriva
  // una notifica
  bridge.on('ask', (q) => {
    if (!win.isVisible()) win.show()
    if (win.isMinimized() || !win.isFocused()) win.flashFrame(true)
    send('perm:ask', q)
    if (q.kind === 'plan') notify('Claude propone un piano', 'Da approvare per continuare.')
    else if (q.kind === 'question') notify('Claude ti fa una domanda', (q.questions[0] && q.questions[0].question) || '')
    else notify('Claude chiede il permesso', [q.title, q.detail].filter(Boolean).join(' · '))
  })
  bridge.on('askClosed', (q) => send('perm:closed', q))
  // Il modo cambia dalla finestra, dall'approvazione di un piano o da Claude Code stesso: si ricorda e si mostra
  // I comandi con /: si ricordano su disco, così ci sono subito al prossimo avvio
  bridge.on('commands', (list) => {
    try { fs.writeFileSync(path.join(app.getPath('userData'), 'commands.json'), JSON.stringify(list)) } catch {}
    send('commands:list', list)
  })
  bridge.on('commandsError', () => send('commands:error'))
  bridge.on('models', (list) => {
    bridge.modelList = list
    try { fs.writeFileSync(path.join(app.getPath('userData'), 'models.json'), JSON.stringify(list)) } catch {}
    send('models:list', list)
  })
  bridge.on('todos', (list) => send('claude:todos', list))
  bridge.on('context', (c) => send('claude:context', c))
  // Claude riprende a lavorare da sé (un messaggio entrato mentre il turno finiva)
  bridge.on('busy', (on) => send('claude:busy', on))
  bridge.on('commandOutput', (text) => send('claude:commandOutput', text))
  bridge.on('toolSummary', (x) => send('claude:toolSummary', x))
  bridge.on('compacted', (c) => send('claude:compacted', c))
  bridge.on('title', (x) => send('claude:title', x))
  bridge.on('status', (st) => send('claude:status', st))
  bridge.on('mode', (mode) => { config.permissionMode = mode; saveConfig(); send('mode:changed', mode) })
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

// Il nome con cui Windows raggruppa la finestra nella barra delle applicazioni e riconosce le sue notifiche
const APP_ID = 'Claude Skins'
if (process.platform === 'win32') app.setAppUserModelId(APP_ID)

// Il collegamento nel menu Start: Windows mostra le notifiche di un'app non installata solo se ne esiste uno con lo
// stesso AppUserModelId. Serve anche ad aprire Claude Skins dal menu Start. Si crea (o si aggiorna) all'avvio
function ensureStartMenuShortcut() {
  if (process.platform !== 'win32') return
  try {
    const link = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Claude Skins.lnk')
    const want = { target: process.execPath, args: `"${app.getAppPath()}"`, appUserModelId: APP_ID, description: 'Claude Skins', cwd: app.getAppPath() }
    let same = false
    try {
      const cur = shell.readShortcutLink(link)
      same = cur.target === want.target && cur.args === want.args && cur.appUserModelId === APP_ID
    } catch {}
    if (!same) shell.writeShortcutLink(link, fs.existsSync(link) ? 'replace' : 'create', want)
  } catch {}
}

// Le notifiche di Windows, quando la finestra non è davanti: Claude ha finito, chiede un permesso o una scelta, si è
// fermato. Il titolo dice anche quale conversazione; un clic riporta davanti la finestra. Si spengono dal vassoio
let trayImage = null
let replyText = ''
const shownNotes = new Set()
function away() {
  return !win || !win.isVisible() || win.isMinimized() || !win.isFocused()
}
// Il testo di una risposta in poche parole: senza markdown né blocchi di codice
function plainSnippet(text) {
  const s = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+\s]+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > 180 ? `${s.slice(0, 179)}…` : s
}
async function notify(title, body) {
  if (config.notify === false || !away() || !Notification.isSupported()) return
  const name = await bridge.currentTitle().catch(() => '')
  const short = name.length > 50 ? `${name.slice(0, 49)}…` : name
  const n = new Notification({ title: short ? `${title} · ${short}` : title, body: body || '', icon: trayImage || undefined })
  n.on('click', () => { bringBack(); n.close() })
  n.on('close', () => shownNotes.delete(n))
  shownNotes.add(n)
  n.show()
}

app.whenReady().then(() => {
  loadConfig()
  const capture = captureArgs()
  if (capture) {
    // Le prove non toccano la configurazione vera
    configFile = path.join(app.getPath('temp'), 'claude-skins-prova.json')
    config = { workdir: config.workdir, position: { x: 20, y: 20 }, sizes: {}, sessionId: null, scene: capture.scene, chapter: 3, theme: capture.theme || config.theme, permissionMode: 'auto' }
  }
  themes = listThemes()
  if (capture && capture.size) config.sizes[currentTheme().id] = capture.size
  if (!config.chapter) { config.chapter = 1; saveConfig() }
  bridge = new ClaudeBridge({
    getSession: () => config.sessionId,
    setSession: (id, cwd) => { config.sessionId = id; config.sessionCwd = cwd || null; saveConfig() },
  }, config.workdir, currentTheme().persona, config.permissionMode)
  // Come si presentano le sessioni a Claude Code (cli: visibili nel /resume e nelle altre app). Si può cambiare in
  // config.json, ad esempio "claude-desktop"
  bridge.entrypoint = config.entrypoint || 'cli'
  bridge.setModel(config.model || null)
  bridge.ultracode = !!config.ultracode
  bridge.setEffort(config.effort || null)
  bridge.sessionCwd = config.sessionCwd || null
  if (capture) bridge.send = () => {}
  registerIpc()
  createWindow()
  if (!capture) ensureStartMenuShortcut()
  if (capture) {
    win.webContents.once('did-finish-load', () => setTimeout(() => fakeConversation(capture), 600))
    return
  }
  globalShortcut.register(TOGGLE_SHORTCUT, toggleVisible)
  // L'elenco aggiornato dei comandi, senza aspettare il primo messaggio (Claude Code si avvia e si chiude, nessun costo)
  win.webContents.once('did-finish-load', () => setTimeout(() => bridge.loadCommands(), 1500))
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (bridge) bridge.cancel()
})

app.on('window-all-closed', () => app.quit())
