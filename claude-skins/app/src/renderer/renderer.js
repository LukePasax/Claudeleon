// La pagina: monta il layout del tema in uso, mostra la conversazione e passa i messaggi al processo principale.
// Il motore non conosce la forma della finestra: trova i pezzi che gli servono per attributo, ovunque il tema li
// metta (data-part="log", data-action="send", data-drag, data-art...; elenco in themes/LEGGIMI.md). Gli eventi sono
// delegati al documento, così un cambio di tema sostituisce tutto l'HTML senza perdere la conversazione.
// Senza Electron (aperta in un browser) la chat risponde con un'eco finta, per guardare la grafica.
(function () {
  const api = window.skins || fakeApi()
  const app = document.getElementById('app')
  const t = Theming.t
  const MONTHS = Theming.MONTHS
  const part = (name) => app.querySelector(`[data-part="${name}"]`)
  const all = (sel) => app.querySelectorAll(sel)

  let scene = 'notte'
  let busy = false
  let reply = null
  let pending = false
  let chapter = 1
  let workdir = ''
  // La cronaca aperta, se c'è: { id, title, lastModified }
  let currentSession = null
  // Il modo dei permessi
  let mode = 'auto'
  const MODES = [['auto', 'modeAuto'], ['default', 'modeDefault'], ['acceptEdits', 'modeAcceptEdits'], ['plan', 'modePlan']]
  const tools = new Map()

  function craftOf(tool) {
    if (/^(Read|NotebookRead)$/.test(tool)) return 'leggere'
    if (/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(tool)) return 'scrivere'
    if (/^(Bash|PowerShell|BashOutput|KillShell|Monitor)$/.test(tool)) return 'forgiare'
    if (/^(Grep|Glob|ToolSearch|LS)$/.test(tool)) return 'cercare'
    if (/^(WebFetch|WebSearch|SendMessage)$/.test(tool) || /browser|chrome/i.test(tool)) return 'messaggi'
    if (/^(Agent|Task|Workflow)$/.test(tool)) return 'compagnia'
    if (/plan|Todo/i.test(tool)) return 'mappa'
    return 'altro'
  }

  function roman(n) {
    const r = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
    let out = ''
    for (const [v, s] of r) while (n >= v) { out += s; n -= v }
    return out
  }

  function esc(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }

  // Il markdown delle risposte è in markdown.js
  const markdown = (src) => Markdown.render(src)

  // Il testo di una risposta. long-start dice se il primo paragrafo è abbastanza lungo per un capolettera (i temi
  // che ne hanno uno lo mettono solo lì: su una frase breve staccherebbe la prima lettera dalla parola)
  function setReplyText(textEl, src) {
    textEl.innerHTML = markdown(src)
    const first = textEl.firstElementChild
    textEl.classList.toggle('long-start', !!first && first.tagName === 'P' && first.textContent.length >= 160)
  }

  // ------------------------------------------------------------------ la conversazione nel log

  function scrollDown() { const l = part('log'); if (l) l.scrollTop = l.scrollHeight }

  // Le voci della conversazione hanno la classe "item": sono le sole che si spostano da un layout all'altro e che
  // un nuovo capitolo cancella (il resto del log, se il tema ci mette qualcosa, resta)
  function add(cls, html) {
    const d = document.createElement('div')
    d.className = `item ${cls}`
    d.innerHTML = html
    part('log').appendChild(d)
    scrollDown()
    return d
  }
  function clearLog() {
    for (const el of all('[data-part="log"] > .item')) el.remove()
    tools.clear()
  }

  // Un elemento con una scritta del tema: la chiave resta nell'attributo, così al cambio di tema si riscrive
  function label(el, key, vars) {
    el.dataset.s = key
    if (vars) el.dataset.sVars = JSON.stringify(vars)
    el.textContent = t(key, vars)
    return el
  }
  function labelled(cls, key, vars) {
    return label(add(cls, ''), key, vars)
  }
  function entry(who) {
    const d = add(`entry ${who}`, '<div class="who"></div><div class="text"></div>')
    label(d.querySelector('.who'), who === 'you' ? 'you' : 'claude')
    return d
  }

  function applyStrings() {
    for (const el of document.querySelectorAll('[data-s]')) el.textContent = t(el.dataset.s, el.dataset.sVars ? JSON.parse(el.dataset.sVars) : undefined)
    for (const el of document.querySelectorAll('[data-s-placeholder]')) el.placeholder = t(el.dataset.sPlaceholder)
    for (const el of document.querySelectorAll('[data-s-title]')) el.title = t(el.dataset.sTitle)
    for (const el of document.querySelectorAll('[data-status-key]')) el.dataset.status = t(el.dataset.statusKey)
    // Il pulsante della scena porta il nome dell'altra
    for (const el of all('[data-action="scene"]')) if (!el.children.length) el.textContent = t(scene === 'notte' ? 'giorno' : 'notte')
    for (const el of all('[data-part="hint"]')) el.textContent = t(busy ? 'busyHint' : 'hint')
    document.title = t('title')
  }

  // ------------------------------------------------------------------ disegni

  // Copia un disegno nel suo canvas; la misura a schermo la decide il CSS, o il disegno stesso (× scala) con
  // data-art-fit="natural"
  function blit(target, drawn, natural, scale = Pixel.SCALE) {
    if (target.width !== drawn.width || target.height !== drawn.height) {
      target.width = drawn.width
      target.height = drawn.height
    }
    if (natural) {
      target.style.width = `${drawn.width * scale}px`
      target.style.height = `${drawn.height * scale}px`
    }
    const ctx = target.getContext('2d')
    ctx.clearRect(0, 0, target.width, target.height)
    ctx.drawImage(drawn, 0, 0)
  }

  let frame = 0
  // La scala di un disegno: data-art-scale sull'elemento, o quella del tema (artScale), o 3. Con data-art-smooth il
  // disegno si ingrandisce sfumato invece che a pixel pieni (per disegni a piena risoluzione, scala 1)
  function scaleOf(el) {
    return Number(el.dataset.artScale) || Theming.artScale()
  }
  function artOptions(el) {
    const width = el.clientWidth
    const height = el.clientHeight
    const sc = scaleOf(el)
    return { width, height, w: Math.floor(width / sc), h: Math.floor(height / sc), scale: sc, pal: Theming.palette(scene), scene, frame, busy, el, arg: el.dataset.artArg }
  }

  // Al cambio di misura della finestra: solo i canvas la cui misura è cambiata davvero (capi, dorso, divisori). Gli
  // sfondi ripetuti non dipendono dalla misura e non si ridisegnano: rifarli a ogni fotogramma rendeva il
  // ridimensionamento lento (data-art-bg-resize su un elemento lo ridisegna anche qui)
  function repaintSized() {
    for (const el of all('canvas[data-art]')) {
      if (el.dataset.artFit === 'natural') continue
      if (el._size !== `${el.clientWidth}x${el.clientHeight}`) drawArt(el)
    }
    for (const el of all('[data-art-bg-resize]')) drawBackground(el)
  }

  // <canvas data-art="nome">: il disegno del tema, nel canvas
  function drawArt(el) {
    el._size = `${el.clientWidth}x${el.clientHeight}`
    const drawn = Theming.art(el.dataset.art, artOptions(el))
    if (!drawn) return
    blit(el, drawn, el.dataset.artFit === 'natural', scaleOf(el))
    el.style.imageRendering = el.dataset.artSmooth != null ? 'auto' : 'pixelated'
  }
  // data-art-bg="nome" su qualunque elemento: il disegno come sfondo ripetuto, ingrandito della sua scala
  function drawBackground(el) {
    const drawn = Theming.art(el.dataset.artBg, artOptions(el))
    if (!drawn) return
    const sc = scaleOf(el)
    el.style.backgroundImage = `url(${drawn.toDataURL()})`
    el.style.backgroundSize = `${drawn.width * sc}px ${drawn.height * sc}px`
    el.style.imageRendering = el.dataset.artSmooth != null ? 'auto' : 'pixelated'
  }

  // L'icona di un mestiere in un <img>: a pixel pieni solo se è una bitmap
  function setIcon(img, craft) {
    const ic = Theming.icon(craft, Theming.palette(scene), scene)
    img.src = ic.src
    img.style.imageRendering = ic.pixel ? 'pixelated' : 'auto'
  }

  // Gli agganci del tema ricevono questo: la radice del layout, i suoi pezzi, lo stato, i file del tema
  function hookContext() {
    return {
      root: app, part, all, scene, busy, theme: Theming.current, asset: (p) => Theming.asset(p), t, Pixel,
      // Ridisegna i disegni del tema (dopo che un aggancio ha cambiato qualcosa che usano, per esempio un data-*)
      redraw: () => { for (const el of all('canvas[data-art]')) drawArt(el) },
    }
  }
  function hook(name, ...args) {
    Theming.hook(name, hookContext(), ...args)
  }

  // Tutto: colori, sfondi, disegni, icone, scritte (al montaggio, al cambio di tema o di scena)
  function paint() {
    Theming.applyScene(scene)
    for (const el of all('[data-art-bg]')) drawBackground(el)
    for (const el of all('canvas[data-art]')) drawArt(el)
    for (const row of all('.tool')) setIcon(row.querySelector('img'), row.dataset.craft)
    applyStrings()
  }

  // I disegni animati (data-art-anim) avanzano di un fotogramma ogni 180 ms
  setInterval(() => {
    frame++
    for (const el of all('canvas[data-art][data-art-anim]')) drawArt(el)
  }, 180)

  // ------------------------------------------------------------------ il modo dei permessi

  // data-part="modes": il motore ci mette l'etichetta e un pulsante per modo (data-perm-mode), quello attivo con la
  // classe active. body[data-perm-mode] dice il modo anche al CSS del tema
  function renderModes() {
    for (const box of all('[data-part="modes"]')) {
      // data-style="menu": un solo pulsante col modo attivo, che apre il menu dei modi (come nell'app desktop)
      if (box.dataset.style === 'menu') {
        let b = box.querySelector('.mode-btn')
        if (!b) {
          b = document.createElement('button')
          b.className = 'mode-btn'
          b.addEventListener('click', () => openModeMenu(b))
          box.appendChild(b)
        }
        const key = (MODES.find(([m]) => m === mode) || MODES[0])[1]
        label(b, key)
        b.dataset.sTitle = `${key}Tip`
        b.title = t(`${key}Tip`)
        continue
      }
      if (!box.querySelector('[data-perm-mode]')) {
        box.appendChild(label(Object.assign(document.createElement('span'), { className: 'modes-label' }), 'modesLabel'))
        for (const [m, key] of MODES) {
          const b = document.createElement('button')
          b.className = 'mode'
          b.dataset.permMode = m
          b.dataset.sTitle = `${key}Tip`
          b.title = t(`${key}Tip`)
          box.appendChild(label(b, key))
        }
      }
      for (const b of box.querySelectorAll('[data-perm-mode]')) b.classList.toggle('active', b.dataset.permMode === mode)
    }
    document.body.dataset.permMode = mode
  }

  // Il menu dei modi: nome e spiegazione di ciascuno; un clic sceglie (lo gestisce il clic su [data-perm-mode])
  function openModeMenu(anchor) {
    closeFolderMenu()
    const menu = document.createElement('div')
    menu.className = 'folder-menu mode-menu'
    const head = document.createElement('div')
    head.className = 'folder-head'
    menu.appendChild(label(head, 'modesTitle'))
    for (const [m, key] of MODES) {
      const it = document.createElement('div')
      it.className = 'folder-item' + (m === mode ? ' current' : '')
      it.dataset.permMode = m
      it.innerHTML = '<span class="fi-name"></span><span class="fi-path fi-wrap"></span>'
      label(it.children[0], key)
      label(it.children[1], `${key}Tip`)
      menu.appendChild(it)
    }
    placeMenu(menu, anchor)
  }
  // Un menu sopra o sotto il suo pulsante, a seconda dello spazio
  function placeMenu(menu, anchor) {
    const host = app.querySelector('[data-solid]') || app
    host.appendChild(menu)
    const r = anchor.getBoundingClientRect()
    const hr = host.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(r.left - hr.left, hr.width - menu.offsetWidth - 8))}px`
    if (r.top - hr.top > menu.offsetHeight + 12) menu.style.bottom = `${hr.bottom - r.top + 6}px`
    else menu.style.top = `${r.bottom - hr.top + 6}px`
  }

  function chooseMode(m) {
    closeFolderMenu()
    if (m === mode) return
    mode = m
    renderModes()
    api.setMode(m)
  }
  api.onMode((m) => { mode = m; renderModes() })
  // Dal vassoio o dalla finestra: vale per le conversazioni nuove (e per questa, se non è ancora cominciata)
  api.onWorkdir((dir) => {
    workdir = dir
    workdirChosen = true
    if (!chapterHasMessages() && !currentSession) convoDir = dir
    renderFolder()
  })

  // ------------------------------------------------------------------ la cartella della conversazione

  // data-part="folder": dove lavora Claude in questa conversazione (una cronaca ripresa resta nella sua cartella, un
  // capitolo nuovo nasce nella cartella di lavoro). Un clic apre le cartelle recenti, prese dalle cronache, e il
  // dialogo per sceglierne un'altra. Se la persona non ne ha mai scelta una, il primo messaggio la chiede
  let convoDir = ''
  let workdirChosen = true
  let pendingSend = false
  const baseName = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p || '')

  function renderFolder() {
    for (const box of all('[data-part="folder"]')) {
      let b = box.querySelector('.folder-btn')
      if (!b) {
        b = document.createElement('button')
        b.className = 'folder-btn'
        b.addEventListener('click', () => openFolderMenu(b))
        box.appendChild(b)
      }
      const unset = !workdirChosen && !currentSession && !chapterHasMessages()
      b.classList.toggle('unset', unset)
      b.textContent = unset ? t('folderPick') : baseName(convoDir || workdir)
      b.title = unset ? t('folderPick') : (convoDir || workdir)
    }
  }

  // ------------------------------------------------------------------ attività

  // La lista delle attività di Claude (TodoWrite, TaskCreate/TaskUpdate): un riquadro sopra la penna, come nell'app
  // desktop. Chiuso mostra solo il conto e l'attività in corso; un clic sulla testata lo apre. Sta in
  // data-part="todos" se il tema lo mette, altrimenti il motore lo crea subito sopra il contenitore della penna
  let todos = []
  let todosOpen = true
  function todosBox() {
    let box = part('todos')
    if (box) return box
    const input = part('input')
    if (!input) return null
    const holder = input.parentElement
    box = holder.parentElement && [...holder.parentElement.children].find((c) => c.classList.contains('todos'))
    if (!box) {
      box = document.createElement('div')
      box.className = 'todos'
      holder.before(box)
    }
    return box
  }
  function renderTodos() {
    const box = todosBox()
    if (!box) return
    box.hidden = !todos.length
    box.innerHTML = ''
    if (!todos.length) return
    const done = todos.filter((x) => x.status === 'completed').length
    const doing = todos.find((x) => x.status === 'in_progress')
    box.classList.toggle('open', todosOpen)
    const head = document.createElement('div')
    head.className = 'todos-head'
    head.innerHTML = '<span class="caret"></span><span class="todos-title"></span><span class="todos-now"></span>'
    head.querySelector('.todos-title').textContent = t('todosTitle', { done, total: todos.length })
    head.querySelector('.todos-now').textContent = !todosOpen && doing ? doing.activeForm || doing.content : ''
    head.addEventListener('click', () => { todosOpen = !todosOpen; renderTodos() })
    box.appendChild(head)
    if (!todosOpen) return
    const list = document.createElement('div')
    list.className = 'todos-list'
    for (const x of todos) {
      const row = document.createElement('div')
      row.className = `todo ${x.status}`
      row.innerHTML = '<span class="todo-mark"></span><span class="todo-text"></span>'
      row.querySelector('.todo-text').textContent = x.status === 'in_progress' ? x.activeForm || x.content : x.content
      list.appendChild(row)
    }
    box.appendChild(list)
  }
  if (api.onTodos) api.onTodos((list) => {
    const before = todos.length
    todos = Array.isArray(list) ? list : []
    // Una lista nuova si apre; una lista finita si chiude da sola
    if (!before && todos.length) todosOpen = true
    if (todos.length && todos.every((x) => x.status === 'completed')) todosOpen = false
    renderTodos()
  })

  // ------------------------------------------------------------------ modello e ragionamento

  // Il pulsante del modello (in data-part="model"): il nome del modello scelto e il ragionamento; un clic apre il
  // menu con i modelli che Claude Code dà (supportedModels) e i livelli di ragionamento del modello scelto
  let models = []
  let model = null
  let effort = null
  const modelInfo = () => models.find((m) => m.value === model) || null
  function renderModel() {
    for (const box of all('[data-part="model"]')) {
      let b = box.querySelector('.model-btn')
      if (!b) {
        b = document.createElement('button')
        b.className = 'model-btn'
        b.addEventListener('click', () => openModelMenu(b))
        box.appendChild(b)
      }
      const m = modelInfo()
      const name = m ? m.name : model || t('modelDefault')
      b.textContent = effort ? `${name} · ${t(`effort_${effort}`)}` : name
      b.title = m && m.description ? m.description : name
    }
  }
  function openModelMenu(anchor) {
    closeFolderMenu()
    const menu = document.createElement('div')
    menu.className = 'folder-menu model-menu'
    const head = (key) => { const h = document.createElement('div'); h.className = 'folder-head'; menu.appendChild(label(h, key)) }
    head('modelTitle')
    const list = document.createElement('div')
    list.className = 'folder-list'
    const item = (value, name, desc) => {
      const it = document.createElement('div')
      it.className = 'folder-item' + ((value || null) === model ? ' current' : '')
      it.innerHTML = '<span class="fi-name"></span><span class="fi-path"></span>'
      it.children[0].textContent = name
      it.children[1].textContent = desc
      it.addEventListener('click', () => {
        model = value || null
        const m = modelInfo()
        if (effort && m && !m.efforts.includes(effort)) effort = null
        api.setModel(model, effort)
        renderModel()
        closeFolderMenu()
      })
      list.appendChild(it)
    }
    item(null, t('modelDefault'), t('modelDefaultDesc'))
    for (const m of models) if (m.value !== 'default') item(m.value, m.name, m.description)
    menu.appendChild(list)
    if (!models.length) { const n = document.createElement('div'); n.className = 'folder-note'; menu.appendChild(label(n, 'modelNone')) }
    // Il ragionamento: i livelli del modello scelto (per il predefinito, quelli più comuni)
    const m = modelInfo()
    const levels = m ? m.efforts : ['low', 'medium', 'high', 'xhigh', 'max']
    if (levels.length) {
      head('effortTitle')
      const row = document.createElement('div')
      row.className = 'effort-row'
      for (const lv of [null, ...levels]) {
        const b = document.createElement('button')
        b.className = 'mode' + (lv === effort ? ' active' : '')
        label(b, lv ? `effort_${lv}` : 'effortAuto')
        b.addEventListener('click', () => { effort = lv; api.setModel(model, effort); renderModel(); closeFolderMenu() })
        row.appendChild(b)
      }
      menu.appendChild(row)
    }
    const note = document.createElement('div')
    note.className = 'folder-note'
    menu.appendChild(label(note, 'modelNote'))
    placeMenu(menu, anchor)
  }
  if (api.models) api.models().then((x) => { models = x.models || []; model = x.model || null; effort = x.effort || null; renderModel() }).catch(() => {})
  if (api.onModels) api.onModels((list) => { models = list || []; renderModel() })

  function chapterHasMessages() {
    return all('[data-part="log"] .entry.you').length > 0
  }

  function closeFolderMenu() {
    for (const m of document.querySelectorAll('.folder-menu')) m.remove()
    pendingSend = false
  }

  // Il menu, sopra o sotto il pulsante a seconda dello spazio; first: è il primo messaggio e la cartella non c'è
  async function openFolderMenu(anchor, first) {
    const wasPending = first || pendingSend
    closeFolderMenu()
    pendingSend = !!wasPending
    const menu = document.createElement('div')
    menu.className = 'folder-menu'
    const note = (key) => { const n = document.createElement('div'); n.className = 'folder-note'; menu.appendChild(label(n, key)) }
    const headEl = document.createElement('div')
    headEl.className = 'folder-head'
    menu.appendChild(label(headEl, 'folderTitle'))
    if (first) note('folderFirst')
    else if (chapterHasMessages() || currentSession) note('folderNew')
    const list = document.createElement('div')
    list.className = 'folder-list'
    menu.appendChild(list)
    const other = document.createElement('div')
    other.className = 'folder-item other'
    menu.appendChild(label(other, 'folderOther'))
    other.addEventListener('click', () => chooseFolder(null))
    const host = app.querySelector('[data-solid]') || app
    host.appendChild(menu)
    // Posizione: allineato al pulsante, sopra se sotto non c'è posto
    const r = anchor.getBoundingClientRect()
    const hr = host.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(r.left - hr.left, hr.width - menu.offsetWidth - 8))}px`
    if (r.top - hr.top > menu.offsetHeight + 12) menu.style.bottom = `${hr.bottom - r.top + 6}px`
    else menu.style.top = `${r.bottom - hr.top + 6}px`
    // Le cartelle recenti: quelle delle cronache, la più recente prima, senza doppioni
    try {
      const sessions = await api.sessions()
      const seen = new Set()
      const dirs = []
      for (const x of [{ cwd: convoDir || workdir }, ...sessions]) {
        const d = x.cwd
        if (!d || seen.has(d.toLowerCase())) continue
        seen.add(d.toLowerCase())
        dirs.push(d)
        if (dirs.length >= 8) break
      }
      for (const d of dirs) {
        const it = document.createElement('div')
        it.className = 'folder-item' + (d === (convoDir || workdir) && !(first) ? ' current' : '')
        it.innerHTML = '<span class="fi-name"></span><span class="fi-path"></span>'
        it.children[0].textContent = baseName(d)
        it.children[1].textContent = d
        it.addEventListener('click', () => chooseFolder(d))
        list.appendChild(it)
      }
    } catch {}
  }

  async function chooseFolder(dir) {
    const send = pendingSend
    for (const m of document.querySelectorAll('.folder-menu')) m.remove()
    pendingSend = false
    // Una cartella diversa a conversazione iniziata: capitolo nuovo (una conversazione resta nella sua cartella)
    const same = dir && dir === (convoDir || workdir) && workdirChosen
    if (same) return send && sendMessage()
    const res = dir ? await api.setWorkdir(dir) : await api.chooseWorkdir()
    if (!res) return
    workdir = res
    workdirChosen = true
    if (chapterHasMessages() || currentSession) await newChapter()
    convoDir = res
    renderFolder()
    if (send) sendMessage()
  }

  document.addEventListener('mousedown', (e) => {
    if (document.querySelector('.folder-menu') && !e.target.closest('.folder-menu, .folder-btn, .model-btn, .mode-btn')) closeFolderMenu()
  }, true)

  // ------------------------------------------------------------------ comandi con /

  // L'elenco viene da Claude Code (skill, plugin, comandi del progetto e i suoi): all'avvio dalla cache, poi
  // aggiornato. Scrivendo / all'inizio della penna si apre il menu sopra di essa
  let commands = []
  const menu = { el: null, items: [], index: 0 }
  // Se Claude Code non risponde (non installato, senza login) il menu lo dice invece di aspettare per sempre
  let commandsFailed = false
  api.onCommands((list) => { commands = list || []; commandsFailed = false; if (menu.el) updateMenu() })
  api.onCommandsError(() => { commandsFailed = true; if (menu.el) updateMenu() })

  // Il nome che si sta scrivendo, se la penna comincia con / e il cursore è ancora sul nome
  function typedCommand() {
    const input = part('input')
    if (!input) return null
    const m = /^\/([^\s]*)$/.exec(input.value.slice(0, input.selectionStart))
    return m && !/\s/.test(input.value.slice(0, input.selectionStart)) ? m[1].toLowerCase() : null
  }

  // Prima i comandi il cui nome comincia con quello scritto, poi quelli che lo contengono nel nome o nella descrizione
  function matchCommands(q) {
    const names = (c) => [c.name, ...(c.aliases || [])].map((n) => n.toLowerCase())
    const starts = commands.filter((c) => names(c).some((n) => n.startsWith(q)))
    const contains = commands.filter((c) => !starts.includes(c) && (names(c).some((n) => n.includes(q)) || c.description.toLowerCase().includes(q)))
    return [...starts.sort((a, b) => a.name.localeCompare(b.name)), ...contains].slice(0, 50)
  }

  function updateMenu() {
    const q = typedCommand()
    if (q == null) return closeMenu()
    const input = part('input')
    if (!menu.el || !menu.el.isConnected) {
      menu.el = document.createElement('div')
      menu.el.className = 'cmd-menu'
      const host = input.parentElement
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
      host.appendChild(menu.el)
    }
    // Sopra la penna, largo come lei
    menu.el.style.left = `${input.offsetLeft}px`
    menu.el.style.width = `${input.offsetWidth}px`
    menu.el.style.bottom = `${input.offsetParent === menu.el.offsetParent ? menu.el.parentElement.clientHeight - input.offsetTop + 6 : 6}px`
    menu.items = matchCommands(q)
    menu.index = Math.min(menu.index, Math.max(0, menu.items.length - 1))
    menu.el.innerHTML = ''
    if (!menu.items.length) {
      const empty = document.createElement('div')
      empty.className = 'cmd-empty'
      menu.el.appendChild(label(empty, commands.length ? 'cmdNone' : commandsFailed ? 'cmdUnavailable' : 'cmdLoading'))
      return
    }
    menu.items.forEach((c, i) => {
      const row = document.createElement('div')
      row.className = 'cmd' + (i === menu.index ? ' active' : '')
      row.innerHTML = '<span class="cmd-name"></span><span class="cmd-args"></span><span class="cmd-desc"></span>'
      row.children[0].textContent = `/${c.name}`
      row.children[1].textContent = c.argumentHint
      row.children[2].textContent = c.description
      if (!c.builtin) row.classList.add('custom')
      row.addEventListener('mousedown', (e) => { e.preventDefault(); completeCommand(c) })
      menu.el.appendChild(row)
    })
    menu.el.children[menu.index]?.scrollIntoView({ block: 'nearest' })
  }

  function closeMenu() {
    if (menu.el) menu.el.remove()
    menu.el = null
    menu.items = []
    menu.index = 0
  }

  // Completa il nome nella penna, con uno spazio per gli argomenti
  function completeCommand(c) {
    const input = part('input')
    const rest = input.value.slice(input.selectionStart).replace(/^\S*/, '')
    input.value = `/${c.name} ${rest.trimStart()}`
    const pos = c.name.length + 2
    input.setSelectionRange(pos, pos)
    input.focus()
    closeMenu()
  }

  // I tasti del menu: frecce per scegliere, Tab o Invio per completare, Esc per chiudere. Invio su un nome già
  // scritto per intero spedisce il comando
  function menuKey(e) {
    if (!menu.el || !menu.items.length) {
      if (e.key === 'Escape' && menu.el) { closeMenu(); return true }
      return false
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      menu.index = (menu.index + (e.key === 'ArrowDown' ? 1 : -1) + menu.items.length) % menu.items.length
      updateMenu()
      return true
    }
    if (e.key === 'Escape') { closeMenu(); return true }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      const c = menu.items[menu.index]
      if (e.key === 'Enter' && typedCommand() === c.name.toLowerCase()) { closeMenu(); return false }
      completeCommand(c)
      return true
    }
    return false
  }

  // L'uscita di un comando locale (/usage, /context...): un riquadro a parte, nel carattere del codice
  api.onCommandOutput((text) => {
    renderReply()
    reply = null
    if (!text) return
    const box = add('cmd-output', '')
    box.textContent = text
  })
  // Claude ha dato un titolo alla conversazione: le cronache si ricaricano, se sono a vista
  if (api.onTitle) api.onTitle(() => { if (part('sessions-list')) refreshSessions() })

  api.onCompacted(({ pre, post }) => {
    // Il punto delle migliaia sempre, anche sotto i 10.000 (toLocaleString in italiano lo toglie)
    const n = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    labelled('footnote', post ? 'cmdCompacted' : 'cmdCompactedShort', { pre: n(pre), post: n(post) })
  })
  api.onStatus((st) => {
    for (const el of all('[data-part="hint"]')) el.textContent = t(st === 'compacting' ? 'cmdCompacting' : busy ? 'busyHint' : 'hint')
  })

  // ------------------------------------------------------------------ il selettore dei temi

  // data-action="themes" apre un pannello sopra il layout (dentro il suo primo elemento data-solid): una scheda per
  // tema con l'anteprima a pixel nei suoi colori, il nome e la descrizione. Un clic cambia tema come dal vassoio
  function openThemes() {
    closeThemes()
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const panel = document.createElement('div')
    panel.className = 'theme-picker'
    panel.innerHTML = '<div class="theme-picker-box"><div class="theme-picker-head"><span></span><button class="btn small"></button></div><div class="theme-cards"></div></div>'
    label(panel.querySelector('.theme-picker-head span'), 'themesTitle')
    const close = panel.querySelector('.theme-picker-head button')
    label(close, 'themesClose')
    close.addEventListener('click', closeThemes)
    // Un clic fuori dal riquadro chiude
    panel.addEventListener('mousedown', (e) => { if (e.target === panel) closeThemes() })
    const cards = panel.querySelector('.theme-cards')
    for (const th of Theming.list()) {
      const card = document.createElement('button')
      card.className = 'theme-card' + (th.id === Theming.current.id ? ' current' : '')
      card.innerHTML = '<canvas></canvas><span class="theme-name"></span><span class="theme-desc"></span>'
      const drawn = Theming.preview(th.id, scene)
      if (drawn) {
        const cv = card.querySelector('canvas')
        blit(cv, drawn, false)
        // Le anteprime piccole sono pixel art: si ingrandiscono a pixel pieni
        cv.style.imageRendering = drawn.width < 144 ? 'pixelated' : 'auto'
      }
      card.querySelector('.theme-name').textContent = th.name
      card.querySelector('.theme-desc').textContent = th.description
      if (th.id === Theming.current.id) card.appendChild(label(Object.assign(document.createElement('span'), { className: 'theme-current' }), 'themesCurrent'))
      card.addEventListener('click', () => {
        closeThemes()
        if (th.id !== Theming.current.id) api.setTheme(th.id)
      })
      cards.appendChild(card)
    }
    host.appendChild(panel)
  }

  function closeThemes() {
    for (const el of document.querySelectorAll('.theme-picker')) el.remove()
  }

  // ------------------------------------------------------------------ la finestra: bordi, ingrandire

  // Le maniglie invisibili sui lati e sugli angoli della forma del tema (il suo primo elemento data-solid), per
  // ridimensionare come una finestra normale. Un tema può non volerle con edges: false
  function addEdges() {
    if (Theming.current.edges === false) return
    const host = app.querySelector('[data-solid]')
    if (!host) return
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    for (const side of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const h = document.createElement('div')
      h.className = `edge edge-${side}`
      h.dataset.resize = side
      host.appendChild(h)
    }
  }

  let winMode = 'normal'
  function setWindowState(mode) {
    winMode = mode
    document.body.classList.toggle('maximized', mode === 'max')
    document.body.classList.toggle('fullscreen', mode === 'full')
    for (const el of all('[data-action="maximize"]')) {
      el.dataset.sTitle = mode === 'normal' ? 'maxTip' : 'restoreTip'
      el.title = t(el.dataset.sTitle)
    }
  }
  api.onWindowState(setWindowState)

  // ------------------------------------------------------------------ il layout del tema

  // Monta il tema: il suo HTML prende il posto del precedente, la conversazione, la bozza e lo stato passano al nuovo
  async function mount(id) {
    closeMenu()
    const items = [...all('[data-part="log"] > .item')]
    const draft = part('input') ? part('input').value : ''
    if (app.children.length) hook('unmount')
    const theme = await Theming.use(id)
    app.innerHTML = theme.layout || '<div data-solid style="background:#000;color:#fff;padding:20px">Questo tema non ha un layout.</div>'
    addEdges()
    const log = part('log')
    if (log) for (const it of items) log.appendChild(it)
    if (part('input')) part('input').value = draft
    setBusy(busy)
    setWindowState(winMode)
    renderModes()
    renderFolder()
    renderAttachments()
    renderTodos()
    renderModel()
    renderChapterHead()
    paint()
    scrollDown()
    if (sessionsPinned()) refreshSessions()
    api.setTrayIcon(Theming.trayIcon(Theming.palette('notte')))
    hook('mount')
  }

  // ------------------------------------------------------------------ modifiche ai file

  // Quante righe di una modifica si vedono subito; le altre dietro "mostra altre N righe"
  const DIFF_LIMIT = 16

  // Il riquadro delle differenze di una modifica (change dal messaggero: { file, created, whole, tooBig, hunks }).
  // Restituisce il riquadro e il conto delle righe aggiunte e tolte
  function changeView(change) {
    const box = document.createElement('div')
    box.className = 'diff'
    const notes = []
    if (change.created) notes.push('diffNew')
    if (change.whole) notes.push('diffWhole')
    if (change.then) notes.push('diffThen')
    if (change.hunks.some((h) => h.all)) notes.push('diffAll')
    if (change.tooBig) notes.push('diffTooBig')
    for (const key of notes) {
      const n = document.createElement('div')
      n.className = 'diff-note'
      box.appendChild(label(n, key))
    }
    let added = 0
    let removed = 0
    const body = document.createElement('div')
    body.className = 'diff-body'
    let count = 0
    const line = (cls, ln, sign, text) => {
      const d = document.createElement('div')
      d.className = `dl ${cls}${count >= DIFF_LIMIT ? ' more' : ''}`
      d.innerHTML = '<span class="ln"></span><span class="sg"></span><span class="tx"></span>'
      d.children[0].textContent = ln
      d.children[1].textContent = sign
      d.children[2].textContent = text
      body.appendChild(d)
      count++
      return d
    }
    change.hunks.forEach((h, i) => {
      const ops = Diff.lines(h.before, h.after)
      const st = Diff.stats(ops)
      added += st.added
      removed += st.removed
      const off = h.line ? h.line - 1 : null
      if (i > 0) line('sep', '', '', '')
      for (const op of Diff.hunks(ops)) {
        if (op.t === 'gap') { label(line('gap', '', '', '').children[2], 'diffGap', { n: op.count }); continue }
        const n = off == null ? '' : String((op.t === '-' ? op.a : op.b) + off)
        line(op.t === '+' ? 'add' : op.t === '-' ? 'del' : 'ctx', n, op.t === ' ' ? '' : op.t === '-' ? '−' : '+', op.text)
      }
    })
    if (!change.tooBig && !count) {
      const n = document.createElement('div')
      n.className = 'diff-note'
      box.appendChild(label(n, 'diffSame'))
    }
    if (count) box.appendChild(body)
    if (count > DIFF_LIMIT) {
      const more = document.createElement('button')
      more.className = 'diff-more'
      const hiddenLines = count - DIFF_LIMIT
      label(more, 'diffMore', { n: hiddenLines })
      more.addEventListener('click', () => {
        const open = box.classList.toggle('open')
        if (open) label(more, 'diffLess')
        else label(more, 'diffMore', { n: hiddenLines })
      })
      box.appendChild(more)
    }
    return { box, added, removed }
  }

  // ------------------------------------------------------------------ conversazione

  function startReply() {
    if (!reply) {
      reply = entry('claude')
      reply.raw = ''
      hook('reply')
    }
    return reply
  }

  // Il testo arriva a pezzi: si ridisegna al più una volta per fotogramma
  function renderReply() {
    pending = false
    if (reply) { setReplyText(reply.querySelector('.text'), reply.raw); scrollDown() }
  }

  function setBusy(on) {
    const changed = busy !== on
    busy = on
    for (const el of all('[data-action="send"]')) el.hidden = on
    for (const el of all('[data-action="stop"]')) el.hidden = !on
    for (const el of all('[data-part="hint"]')) el.textContent = t(on ? 'busyHint' : 'hint')
    document.body.classList.toggle('busy', on)
    // Dopo, così l'aggancio può cambiare anche il suggerimento
    if (changed) hook('busy', on)
  }

  function sendMessage() {
    const input = part('input')
    const text = input ? input.value.trim() : ''
    if ((!text && !attachments.length) || busy) return
    closeMenu()
    // Prima conversazione senza una cartella scelta: prima la cartella, poi il messaggio parte da sé
    const folderBtn = app.querySelector('[data-part="folder"] .folder-btn')
    if (folderBtn && !workdirChosen && !currentSession && !chapterHasMessages() && !text.startsWith('/')) {
      openFolderMenu(folderBtn, true)
      return
    }
    // /clear e /new: un nuovo capitolo, come il pulsante
    if (/^\/(clear|new)\s*$/i.test(text)) { input.value = ''; newChapter(); return }
    input.value = ''
    reply = null
    const sent = attachments
    attachments = []
    renderAttachments()
    const images = sent.filter((a) => a.kind === 'image')
    const files = sent.filter((a) => a.kind === 'file').map((a) => a.path)
    fillYou(entry('you'), text, images.map((a) => a.url), files)
    renderFolder()
    setBusy(true)
    api.send(sent.length ? { text, images: images.map((a) => ({ mediaType: a.mediaType, data: a.data })), files } : text)
  }

  // Una domanda della persona nel log, con le miniature delle immagini e le etichette dei file. I file stanno anche
  // in fondo al testo, in <attached_files> (così li trova Claude): lì si tolgono e diventano etichette
  function fillYou(d, text, images = [], files = []) {
    const m = /\s*<attached_files>\n([\s\S]*?)\n?<\/attached_files>\s*$/.exec(text || '')
    if (m) {
      files = files.length ? files : m[1].split('\n').map((x) => x.trim()).filter(Boolean)
      text = text.slice(0, m.index)
    }
    const el = d.querySelector('.text')
    el.textContent = ''
    if (images.length || files.length) {
      const box = document.createElement('div')
      box.className = 'sent-attachments'
      for (const u of images) {
        const img = document.createElement('img')
        img.src = u
        img.alt = ''
        box.appendChild(img)
      }
      for (const f of files) box.appendChild(fileChip(f))
      el.appendChild(box)
    }
    if (text) el.appendChild(document.createTextNode(text))
  }
  function fileChip(p) {
    const chip = document.createElement('span')
    chip.className = 'attachment file'
    chip.title = p
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = String(p).split(/[\\/]/).filter(Boolean).pop() || p
    chip.appendChild(name)
    return chip
  }

  // ------------------------------------------------------------------ allegati

  // Immagini (incollate, trascinate, scelte dal disco) e file (per percorso: Claude li apre da sé) che partono col
  // prossimo messaggio. La striscia sta in data-part="attachments" se il tema la mette, altrimenti il motore la crea
  // subito sopra la penna
  let attachments = []
  const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp)$/
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i
  // Oltre questo lato il modello rimpicciolisce comunque le immagini: si risparmia peso prima
  const MAX_SIDE = 1568
  const MAX_DATA = 4_500_000

  function attachBox() {
    let box = part('attachments')
    if (box) return box
    const input = part('input')
    if (!input) return null
    box = [...input.parentElement.children].find((c) => c.classList.contains('attachments'))
    if (!box) {
      box = document.createElement('div')
      box.className = 'attachments'
      input.parentElement.insertBefore(box, input)
    }
    return box
  }
  function renderAttachments() {
    const box = attachBox()
    if (!box) return
    box.innerHTML = ''
    box.hidden = !attachments.length
    for (const a of attachments) {
      let chip
      if (a.kind === 'image') {
        chip = document.createElement('span')
        chip.className = 'attachment image'
        const img = document.createElement('img')
        img.src = a.url
        img.alt = ''
        chip.appendChild(img)
        chip.title = a.name
      } else chip = fileChip(a.path)
      const x = document.createElement('button')
      x.className = 'attachment-remove'
      x.textContent = '×'
      x.title = t('attachRemove')
      x.addEventListener('click', () => { attachments = attachments.filter((b) => b !== a); renderAttachments() })
      chip.appendChild(x)
      box.appendChild(chip)
    }
  }

  const readDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
  // Un'immagine pronta per Claude: tipo e dati in base64, rimpicciolita se è molto grande o pesante
  async function prepareImage(dataUrl, mediaType) {
    const img = await loadImage(dataUrl)
    let url = dataUrl
    let type = mediaType
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    if (k < 1 || url.length > MAX_DATA || !IMAGE_TYPES.test(type)) {
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(img.naturalWidth * k))
      c.height = Math.max(1, Math.round(img.naturalHeight * k))
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      type = type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
      url = c.toDataURL(type, 0.9)
      if (url.length > MAX_DATA) { type = 'image/jpeg'; url = c.toDataURL(type, 0.85) }
    }
    return { url, mediaType: type, data: url.slice(url.indexOf(',') + 1) }
  }
  async function addImage(dataUrl, mediaType, name) {
    try {
      attachments.push(Object.assign({ kind: 'image', name }, await prepareImage(dataUrl, mediaType)))
      renderAttachments()
    } catch {
      labelled('error', 'attachFailed', { name })
    }
  }
  function addPath(p) {
    if (!p || attachments.some((a) => a.path === p)) return
    attachments.push({ kind: 'file', path: p })
    renderAttachments()
  }
  // File trascinati o incollati: le immagini come immagini, il resto per percorso
  async function addFiles(files) {
    for (const f of files) {
      if (f.type && f.type.startsWith('image/')) await addImage(await readDataUrl(f), f.type, f.name || 'immagine')
      else {
        const p = api.pathForFile ? api.pathForFile(f) : ''
        if (p) addPath(p)
        else labelled('error', 'attachNoPath', { name: f.name || '?' })
      }
    }
    if (part('input')) part('input').focus()
  }
  // Percorsi scelti dal disco: le immagini si leggono per mandarle come immagini
  async function addPaths(paths) {
    for (const p of paths || []) {
      const img = IMAGE_EXT.test(p) && api.readImage ? await api.readImage(p) : null
      if (img) await addImage(`data:${img.mediaType};base64,${img.data}`, img.mediaType, String(p).split(/[\\/]/).pop())
      else addPath(p)
    }
    if (part('input')) part('input').focus()
  }

  // Incollare un'immagine (uno screenshot) o dei file copiati in Esplora file; il testo si incolla come sempre
  document.addEventListener('paste', (e) => {
    if (!e.target.matches || !e.target.matches('[data-part="input"]')) return
    const files = [...((e.clipboardData && e.clipboardData.files) || [])]
    if (!files.length) return
    e.preventDefault()
    addFiles(files)
  })
  // Trascinare file sulla finestra
  const dragsFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files')
  document.addEventListener('dragover', (e) => {
    if (!dragsFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    document.body.classList.add('dropping')
  })
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping') })
  document.addEventListener('drop', (e) => {
    document.body.classList.remove('dropping')
    if (!dragsFiles(e)) return
    e.preventDefault()
    addFiles([...e.dataTransfer.files])
  })

  api.onDelta((d) => {
    const r = startReply()
    r.raw += d
    if (!pending) { pending = true; requestAnimationFrame(renderReply) }
  })
  api.onTool(({ id, name, summary, change, intent }) => {
    renderReply()
    reply = null
    const row = addTool(id, name, summary, change, intent)
    hook('tool', { name, craft: craftOf(name), summary, change, intent: row.querySelector('.doing').textContent })
  })

  // Un'azione di Claude: icona del mestiere, nome, su che cosa; per le modifiche ai file il conto delle righe e le
  // differenze sotto (un clic sulla riga le chiude e le riapre). La usano la conversazione e le cronache riaperte
  // La riga dice a parole che cosa fa Claude ("Legge MapView.cpp", o la descrizione che ha scritto lui), e accanto, più
  // tenue, il dettaglio tecnico: lo strumento e il suo argomento
  function addTool(id, name, summary, change, intent) {
    const craft = craftOf(name)
    const row = add('tool', `<img alt=""><span class="doing"></span><span class="what"></span>`)
    const doing = row.querySelector('.doing')
    if (intent && intent.text) doing.textContent = intent.text
    else if (intent && intent.verb) label(doing, `tool_${intent.verb}`, { x: intent.target || name })
    else doing.textContent = name
    row.querySelector('.what').textContent = [name, summary].filter(Boolean).join(' · ')
    row.dataset.craft = craft
    setIcon(row.querySelector('img'), craft)
    tools.set(id, row)
    // Le modifiche ai file: il conto delle righe nella riga dello strumento, le differenze sotto; un clic sulla
    // riga le chiude e le riapre
    if (change) {
      const view = changeView(change)
      row.dataset.added = view.added
      row.dataset.removed = view.removed
      if (view.added || view.removed) {
        const counts = document.createElement('span')
        counts.className = 'counts'
        counts.innerHTML = `<span class="plus">+${view.added}</span> <span class="minus">−${view.removed}</span>`
        row.insertBefore(counts, row.querySelector('.what').nextSibling)
      }
      const item = add('change', '')
      item.appendChild(view.box)
      row.classList.add('has-change')
      row.addEventListener('click', () => { item.hidden = !item.hidden })
      scrollDown()
    }
    return row
  }

  function toolDone(id, error) {
    const row = tools.get(id)
    if (!row) return
    row.classList.add(error ? 'fail' : 'done')
    row.dataset.statusKey = error ? 'toolFail' : 'toolOk'
    row.dataset.status = t(row.dataset.statusKey)
  }
  api.onToolDone(({ id, error }) => { toolDone(id, error); hook('toolDone', { error: !!error }) })

  // La frase che riassume un gruppo di azioni (come nell'app desktop): le loro righe, con le differenze, vanno dentro
  // un gruppo chiuso sotto quella frase; un clic lo apre. Nel titolo, il conto delle righe cambiate
  api.onToolSummary(({ summary, ids }) => {
    const rows = (ids || []).map((id) => tools.get(id)).filter((r) => r && r.isConnected && r.parentElement === part('log'))
    if (!rows.length || !summary) return
    const group = document.createElement('div')
    group.className = 'item tool-group'
    group.innerHTML = '<div class="tool-group-head"><span class="caret"></span><span class="tg-text"></span></div><div class="tool-group-body" hidden></div>'
    group.querySelector('.tg-text').textContent = summary
    rows[0].before(group)
    const body = group.querySelector('.tool-group-body')
    let added = 0
    let removed = 0
    for (const row of rows) {
      const follow = []
      let n = row.nextElementSibling
      while (n && n.classList.contains('change')) { follow.push(n); n = n.nextElementSibling }
      body.appendChild(row)
      for (const f of follow) body.appendChild(f)
      added += Number(row.dataset.added || 0)
      removed += Number(row.dataset.removed || 0)
      if (row.classList.contains('fail')) group.classList.add('fail')
    }
    const head = group.querySelector('.tool-group-head')
    if (added || removed) head.insertAdjacentHTML('beforeend', `<span class="counts"><span class="plus">+${added}</span> <span class="minus">−${removed}</span></span>`)
    head.addEventListener('click', () => { body.hidden = !body.hidden; group.classList.toggle('open', !body.hidden) })
    scrollDown()
  })
  api.onDone(({ durationMs }) => {
    renderReply()
    labelled('footnote', 'took', { s: Math.round((durationMs || 0) / 1000) })
    hook('done', { durationMs })
    reply = null
    setBusy(false)
    // Una conversazione nuova compare negli annali
    if (sessionsPinned()) refreshSessions()
  })
  api.onError((msg) => {
    hook('error', String(msg))
    renderReply()
    add('error', esc(String(msg)))
    reply = null
    setBusy(false)
  })

  async function newChapter() {
    const n = await api.newChapter()
    clearLog()
    reply = null
    currentSession = null
    setBusy(false)
    setChapter(n)
    markCurrentSession()
    convoDir = workdir
    renderFolder()
    hook('chapter')
    if (part('input')) part('input').focus()
  }

  // Il titolo del capitolo: "Capitolo" e la data vengono dal tema. Con una cronaca aperta il titolo è il suo
  function setChapter(n) {
    chapter = n || 1
    renderChapterHead()
  }
  function renderChapterHead() {
    const title = part('chapter-title')
    const date = part('chapter-date')
    if (currentSession) {
      const s = currentSession
      if (title) title.textContent = s.title.length > 34 ? s.title.slice(0, 33) + '…' : s.title
      if (date) date.textContent = formatWhen(s.lastModified)
      return
    }
    if (title) {
      title.textContent = t('chapter')
      const num = document.createElement('span')
      num.className = 'num'
      num.textContent = roman(chapter)
      title.appendChild(num)
    }
    if (date) date.textContent = Theming.chapterDate(new Date())
  }

  // ------------------------------------------------------------------ permessi

  const asks = new Map()

  api.onAsk((q) => {
    renderReply()
    reply = null
    hook('ask', q)
    if (q.kind === 'plan') return askPlan(q)
    if (q.kind === 'question') return askQuestions(q)
    const { id, title, description, detail, change, canAlways } = q
    const card = add('ask', '<div class="ask-title"></div><div class="ask-desc"></div><div class="ask-detail"></div><div class="ask-buttons"></div>')
    card.querySelector('.ask-title').textContent = title
    card.querySelector('.ask-desc').textContent = description
    card.querySelector('.ask-detail').textContent = detail
    if (!description) card.querySelector('.ask-desc').remove()
    if (!detail) card.querySelector('.ask-detail').remove()
    // Per una modifica a un file, la domanda mostra che cosa cambierà
    if (change) card.insertBefore(changeView(change).box, card.querySelector('.ask-buttons'))
    scrollDown()
    const buttons = card.querySelector('.ask-buttons')
    const choice = (key, cls, allow, always, outcome) => {
      const b = document.createElement('button')
      label(b, key)
      b.className = `btn small ${cls}`
      b.addEventListener('click', () => {
        api.answer(id, allow, always)
        closeAsk(buttons, outcome)
        asks.delete(id)
      })
      buttons.appendChild(b)
    }
    choice('allow', '', true, false, 'granted')
    if (canAlways) choice('always', '', true, true, 'grantedAlways')
    choice('deny', 'deny', false, false, 'denied')
    asks.set(id, card)
  })

  // La fine del modo piano: il piano proposto, da approvare (Claude procede, nel modo di prima) o no (continua a
  // pianificare)
  function askPlan({ id, plan }) {
    const card = add('ask plan', '<div class="ask-title"></div><div class="text plan-body"></div><div class="ask-buttons"></div>')
    label(card.querySelector('.ask-title'), 'planTitle')
    const body = card.querySelector('.plan-body')
    if (plan && plan.trim()) body.innerHTML = markdown(plan)
    else label(body, 'planEmpty')
    const buttons = card.querySelector('.ask-buttons')
    for (const [key, cls, allow, outcome] of [['planApprove', '', true, 'planApproved'], ['planKeep', 'deny', false, 'planKept']]) {
      const b = document.createElement('button')
      label(b, key)
      b.className = `btn small ${cls}`
      b.addEventListener('click', () => {
        api.answer(id, allow, false)
        closeAsk(buttons, outcome)
        asks.delete(id)
      })
      buttons.appendChild(b)
    }
    asks.set(id, card)
    scrollDown()
  }

  // Le domande di Claude con le opzioni (AskUserQuestion), come nell'app desktop: per ogni domanda l'etichetta, il
  // testo, le opzioni da cliccare (una, o più se è a scelta multipla) e una risposta libera. Con una sola domanda a
  // scelta singola basta un clic; altrimenti "Rispondi" quando tutte hanno una risposta. Le risposte tornano a Claude
  // come { domanda: risposta } (le scelte multiple separate da virgole)
  function askQuestions({ id, questions }) {
    const card = add('ask question', '')
    const state = questions.map(() => ({ picked: new Set(), other: '' }))
    const quick = questions.length === 1 && !questions[0].multiSelect
    const answers = () => {
      const out = {}
      questions.forEach((q, k) => {
        const parts = q.options.filter((o) => state[k].picked.has(o.label)).map((o) => o.label)
        if (state[k].other.trim()) parts.push(state[k].other.trim())
        if (parts.length) out[q.question] = parts.join(', ')
      })
      return out
    }
    const finish = (allow) => {
      if (!asks.has(id)) return
      const a = allow ? answers() : null
      api.answer(id, allow, false, a)
      for (const el of card.querySelectorAll('button, input')) el.disabled = true
      closeAsk(buttons, allow ? 'qAnswered' : 'qSkipped')
      asks.delete(id)
    }
    questions.forEach((q, k) => {
      const box = document.createElement('div')
      box.className = 'q'
      box.innerHTML = '<div class="q-head"><span class="q-tag"></span><span class="q-text"></span></div><div class="q-options"></div><div class="q-preview" hidden></div>'
      box.querySelector('.q-tag').textContent = q.header
      if (!q.header) box.querySelector('.q-tag').remove()
      box.querySelector('.q-text').textContent = q.question
      const opts = box.querySelector('.q-options')
      const preview = box.querySelector('.q-preview')
      const refresh = () => {
        for (const b of opts.querySelectorAll('.q-opt')) b.classList.toggle('picked', state[k].picked.has(b.dataset.label))
        const shown = q.options.find((o) => o.preview && state[k].picked.has(o.label))
        preview.hidden = !shown
        if (shown) preview.textContent = shown.preview
        submit.disabled = !questions.every((qq, j) => state[j].picked.size || state[j].other.trim())
      }
      for (const o of q.options) {
        const b = document.createElement('button')
        b.className = `q-opt${q.multiSelect ? ' multi' : ''}`
        b.dataset.label = o.label
        b.innerHTML = '<span class="q-mark"></span><span class="q-body"><span class="q-label"></span><span class="q-desc"></span></span>'
        b.querySelector('.q-label').textContent = o.label
        b.querySelector('.q-desc').textContent = o.description
        b.addEventListener('click', () => {
          if (q.multiSelect) { if (state[k].picked.has(o.label)) state[k].picked.delete(o.label); else state[k].picked.add(o.label) }
          else { state[k].picked = new Set([o.label]); state[k].other = ''; other.value = '' }
          refresh()
          if (quick) finish(true)
        })
        opts.appendChild(b)
      }
      const other = document.createElement('input')
      other.className = 'q-other'
      other.placeholder = t('qOther')
      other.addEventListener('input', () => {
        state[k].other = other.value
        if (!q.multiSelect && other.value.trim()) state[k].picked.clear()
        refresh()
      })
      other.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !submit.disabled) { e.preventDefault(); finish(true) } })
      opts.appendChild(other)
      box.refresh = refresh
      card.appendChild(box)
    })
    const buttons = document.createElement('div')
    buttons.className = 'ask-buttons'
    const submit = document.createElement('button')
    submit.className = 'btn small'
    label(submit, 'qSubmit')
    submit.disabled = true
    submit.addEventListener('click', () => finish(true))
    const skip = document.createElement('button')
    skip.className = 'btn small deny'
    label(skip, 'qSkip')
    skip.addEventListener('click', () => finish(false))
    buttons.append(submit, skip)
    card.appendChild(buttons)
    asks.set(id, card)
    scrollDown()
  }

  // Al posto dei pulsanti resta l'esito
  function closeAsk(buttons, outcome) {
    const out = document.createElement('div')
    out.className = 'ask-outcome'
    label(out, outcome)
    buttons.replaceWith(out)
  }

  api.onAskClosed(({ id }) => {
    const card = asks.get(id)
    if (!card) return
    const buttons = card.querySelector('.ask-buttons')
    if (buttons) closeAsk(buttons, 'cancelled')
    asks.delete(id)
  })

  // ------------------------------------------------------------------ cronache: le sessioni di Claude Code

  function formatWhen(ms) {
    const d = new Date(ms)
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // Il pannello delle cronache: in sovrimpressione (si apre col pulsante, hidden altrimenti) o fisso nel layout, con
  // data-mode="always" (come la barra laterale dell'app desktop)
  function sessionsPinned() {
    const p = part('sessions')
    return !!p && p.dataset.mode === 'always'
  }

  function sessionNote(list, key, vars) {
    list.innerHTML = '<div class="session-row note"><span class="when"></span></div>'
    list.querySelector('.when').textContent = t(key, vars)
  }

  let sessionsLoad = 0
  async function refreshSessions() {
    const list = part('sessions-list')
    if (!list) return
    const mine = ++sessionsLoad
    if (!list.children.length) sessionNote(list, 'sessionsLoading')
    try {
      const sessions = await api.sessions()
      if (mine !== sessionsLoad || !list.isConnected) return
      list.innerHTML = ''
      for (const s of sessions) {
        const row = document.createElement('div')
        row.className = 'session-row'
        row.dataset.id = s.id
        row.innerHTML = '<div class="title"></div><div class="when"></div>'
        row.querySelector('.title').textContent = s.title
        // Quando e in che cartella: le cronache sono di tutte le cartelle, come nella barra dell'app desktop
        const folder = s.cwd ? s.cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : ''
        row.querySelector('.when').textContent = formatWhen(s.lastModified) + (folder ? ` · ${folder}` : '')
        if (s.cwd) row.title = s.cwd
        row.addEventListener('click', () => openSession(s))
        list.appendChild(row)
      }
      if (!sessions.length) sessionNote(list, 'sessionsEmpty', { dir: workdir || 'cartella di lavoro' })
      markCurrentSession()
    } catch (err) {
      list.innerHTML = `<div class="error">${esc(String(err.message || err))}</div>`
    }
  }

  function markCurrentSession() {
    for (const row of all('.session-row[data-id]')) row.classList.toggle('current', !!currentSession && row.dataset.id === currentSession.id)
  }

  function showSessions() {
    const p = part('sessions')
    if (!p) return
    if (!sessionsPinned()) {
      if (busy) return
      const list = part('sessions-list')
      if (list) list.innerHTML = ''
      p.hidden = false
    }
    refreshSessions()
  }

  async function openSession(s) {
    if (!sessionsPinned() && part('sessions')) part('sessions').hidden = true
    // Aprire una cronaca ferma la risposta in corso (lo fa anche il processo principale)
    if (busy) setBusy(false)
    clearLog()
    reply = null
    currentSession = s
    convoDir = s.cwd || workdir
    renderFolder()
    renderChapterHead()
    markCurrentSession()
    const loading = labelled('footnote', 'copying')
    try {
      const history = await api.openSession(s.id, s.cwd || null)
      loading.remove()
      // Delle cronache lunghe bastano gli ultimi 40 messaggi, con le azioni che stanno in mezzo
      let from = 0
      let texts = 0
      for (let k = history.length - 1; k >= 0; k--) {
        if (history[k].role !== 'tool' && ++texts === 40) { from = k; break }
      }
      for (const m of history.slice(from)) {
        if (m.role === 'user') fillYou(entry('you'), m.text, m.images || [])
        else if (m.role === 'assistant') setReplyText(entry('claude').querySelector('.text'), m.text)
        else if (m.role === 'output') add('cmd-output', '').textContent = m.text
        else if (m.role === 'tool') {
          addTool(m.id, m.name, m.summary, m.change, m.intent)
          if (m.error !== null) toolDone(m.id, m.error)
        }
      }
      // Le differenze delle cronache restano chiuse: si aprono con un clic sulla riga dell'azione
      for (const el of all('[data-part="log"] > .item.change')) el.hidden = true
      hook('chapter')
      labelled('footnote', 'continueHere')
    } catch (err) {
      loading.remove()
      add('error', esc(String(err.message || err)))
    }
    if (part('input')) part('input').focus()
  }

  // ------------------------------------------------------------------ comandi, delegati al documento

  const actions = {
    send: sendMessage,
    stop: () => { api.stop(); labelled('error', 'stopped'); reply = null; setBusy(false) },
    hide: () => api.hide(),
    attach: async () => addPaths(await api.chooseFiles()),
    quit: () => api.quit(),
    new: newChapter,
    sessions: showSessions,
    'sessions-close': () => { if (part('sessions') && !sessionsPinned()) part('sessions').hidden = true },
    themes: openThemes,
    maximize: () => api.windowMode('max'),
    fullscreen: () => api.windowMode('full'),
    scene: () => { scene = scene === 'notte' ? 'giorno' : 'notte'; api.setScene(scene); paint(); hook('scene', scene) },
  }
  document.addEventListener('click', (e) => {
    // I link delle risposte si aprono nel browser di sistema
    const a = e.target.closest('a[data-href]')
    if (a) { e.preventDefault(); api.openLink(a.dataset.href); return }
    const m = e.target.closest('[data-perm-mode]')
    if (m && app.contains(m)) return chooseMode(m.dataset.permMode)
    const b = e.target.closest('[data-action]')
    if (b && app.contains(b) && actions[b.dataset.action]) actions[b.dataset.action](e)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.querySelector('.theme-picker')) { closeThemes(); return }
    if (e.key === 'Escape' && document.querySelector('.folder-menu')) { closeFolderMenu(); return }
    // F11: schermo intero, e di nuovo per tornare
    if (e.key === 'F11') { e.preventDefault(); api.windowMode('full'); return }
    if (!e.target.matches('[data-part="input"]')) return
    if (menuKey(e)) { e.preventDefault(); return }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  })
  // Il menu dei comandi segue quello che si scrive e dove sta il cursore
  document.addEventListener('input', (e) => { if (e.target.matches('[data-part="input"]')) updateMenu() })
  document.addEventListener('keyup', (e) => { if (e.target.matches('[data-part="input"]') && /^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) updateMenu() })
  document.addEventListener('focusout', (e) => { if (e.target.matches('[data-part="input"]')) setTimeout(closeMenu, 100) })
  api.onReset(newChapter)
  // Il tema scelto dal vassoio: si rimonta sul posto, la conversazione resta
  api.onTheme((id) => mount(id))

  // Spostare da data-drag (non dai suoi pulsanti e campi) e ridimensionare da data-grip: il gesto lo segue il
  // processo principale, la pagina dice solo quando comincia e quando finisce
  let gesturing = null
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    const edge = e.target.closest('[data-resize]')
    const grip = e.target.closest('[data-grip]')
    const drag = e.target.closest('[data-drag]')
    let kind = null
    if (edge) kind = `resize:${edge.dataset.resize}`
    else if (grip) kind = 'resize:se'
    else if (drag && !e.target.closest('button, input, textarea, select, a, [data-action], [data-no-drag], .session-row')) kind = 'move'
    if (!kind) return
    // Doppio clic sulla testata: ingrandisce o ripristina
    if (kind === 'move' && e.detail === 2) { e.preventDefault(); api.windowMode('max'); return }
    e.preventDefault()
    gesturing = edge || grip || drag
    gesturing.classList.add('dragging')
    api.gestureStart(kind)
  })
  function endGesture() {
    if (!gesturing) return
    gesturing.classList.remove('dragging')
    gesturing = null
    api.gestureEnd()
  }
  window.addEventListener('mouseup', endGesture)
  window.addEventListener('blur', endGesture)

  // A ogni cambio di misura i disegni si rifanno, al più una volta per fotogramma
  let repaintQueued = false
  window.addEventListener('resize', () => {
    if (repaintQueued) return
    repaintQueued = true
    requestAnimationFrame(() => { repaintQueued = false; repaintSized() })
  })

  // I clic attraversano la finestra tranne sopra gli elementi data-solid del layout
  let interactive = null
  document.addEventListener('mousemove', (e) => {
    const over = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-solid]')
    if (over !== interactive) { interactive = over; api.setInteractive(over) }
  })
  document.addEventListener('mouseleave', () => { interactive = false; api.setInteractive(false) })

  api.info().then(async (info) => {
    scene = info.scene === 'giorno' ? 'giorno' : 'notte'
    workdir = info.workdir || ''
    chapter = info.chapter || 1
    mode = info.mode || 'auto'
    workdirChosen = info.workdirChosen !== false
    convoDir = info.sessionCwd || info.workdir || ''
    api.windowState().then(setWindowState).catch(() => {})
    // I comandi della cache; l'elenco aggiornato arriva poi da onCommands
    api.commands().then((list) => { if (!commands.length) commands = list || [] }).catch(() => {})
    await Theming.load(info.themes || [])
    await mount(info.theme)
    if (part('input')) part('input').focus()
  })

  // ------------------------------------------------------------------ anteprima senza Electron

  // Due modifiche finte per l'anteprima: un Edit con il suo contesto e un file nuovo lungo
  const FAKE_EDIT = {
    file: 'src/MapView.cpp',
    hunks: [{
      line: 41,
      before: 'void MapView::Draw()\n{\n    DrawTerrain();\n    DrawRoads();\n}',
      after: 'void MapView::Draw()\n{\n    DrawTerrain();\n    DrawRivers();\n    DrawRoads(m_showPaths);\n}',
    }],
  }
  const FAKE_WRITE = {
    file: 'src/RouteFinder.h',
    created: true,
    hunks: [{ line: 1, before: '', after: ['#pragma once', '', '#include <vector>', '', 'class RouteFinder', '{', 'public:', '    explicit RouteFinder(const Map& map);', '', '    // Il sentiero più breve fra due punti, o vuoto', '    std::vector<Point> FindPath(Point start, Point goal) const;', '', 'private:', '    const Map& m_map;', '    float Cost(Point a, Point b) const;', '    float Heuristic(Point a, Point b) const;', '    bool Walkable(Point p) const;', '};', ''].join('\n') }],
  }

  // Comandi finti per l'anteprima
  const FAKE_COMMANDS = [
    { name: 'compact', description: 'Riassume la conversazione per liberare contesto', argumentHint: '[istruzioni]', builtin: true },
    { name: 'context', description: 'Mostra quanto contesto è in uso', argumentHint: '', builtin: true },
    { name: 'init', description: 'Crea un CLAUDE.md con la documentazione del progetto', argumentHint: '', builtin: true },
    { name: 'review', description: 'Rivede una pull request', argumentHint: '[numero]', builtin: true },
    { name: 'usage', description: 'Mostra uso e costi della sessione', argumentHint: '', aliases: ['cost'], builtin: true },
    { name: 'archivio-personale-drive', description: 'Classifica e carica documenti personali su Google Drive', argumentHint: '', builtin: false },
    { name: 'catalogo-to-excel', description: 'Converte cataloghi PDF di ricambi in Excel', argumentHint: '<file.pdf>', builtin: false },
    { name: 'deploy', description: 'Comando del progetto: compila e pubblica', argumentHint: '<ambiente>', builtin: false },
  ]

  // Una risposta finta che usa tutto il markdown
  const FAKE_ANSWER = [
    'Ecco quanto mi chiedi: "{text}". La risposta arriva a pezzi, con **grassetto**, *corsivo*, ~~barrato~~ e `codice`.',
    '## Il piano',
    '1. Leggere `MapView.cpp`',
    '2. Aggiungere i fiumi:',
    '   - `DrawRivers()` prima delle strade',
    '   - un interruttore nel menu **Vista**',
    '3. Provare con la [guida di Qt](https://doc.qt.io/qt-6/qpainter.html)',
    '',
    '### File toccati',
    '| File | Righe | Stato |',
    '|:-----|------:|:-----:|',
    '| `MapView.cpp` | +12 −3 | fatto |',
    '| `MapLoader.cpp` | +40 | da fare |',
    '',
    '> Nota: i fiumi vanno disegnati **sotto** le strade, o le coprono.',
    '',
    '- [x] lettura del codice',
    '- [ ] modifica',
    '',
    '---',
    '',
    '```cpp',
    'void MapView::Draw()',
    '{',
    '    DrawRivers(); // prima',
    '    DrawRoads();',
    '}',
    '```',
  ].join('\n')

  function fakeApi() {
    const handlers = {}
    const on = (name) => (cb) => { handlers[name] = cb }
    const fire = (name, v, ms) => setTimeout(() => handlers[name] && handlers[name](v), ms)
    let n = 1
    let fakeWin = 'normal'
    // Dalla console dell'anteprima: anteprima.tema('moderno'), anteprima.permesso(), anteprima.piano(),
    // anteprima.risposta('testo in markdown')
    window.anteprima = {
      tema: (id) => fire('onTheme', id, 0),
      // Una risposta di Claude con il testo dato, come se arrivasse adesso
      risposta: (text) => { fire('onDelta', String(text), 0); fire('onDone', { durationMs: 1000 }, 10) },
      piano: () => fire('onAsk', { id: Date.now(), kind: 'plan', plan: '## Fiumi sulla mappa\n\n1. Aggiungere `DrawRivers()` in **MapView.cpp**, prima delle strade\n2. Leggere i fiumi dal file della mappa in `MapLoader`\n3. Un interruttore `m_showRivers` nel menu Vista\n\nNessun file cambia finché non approvi.' }, 0),
      domande: () => fire('onAsk', { id: Date.now(), kind: 'question', questions: [
        { question: 'Dove disegno i fiumi rispetto alle strade?', header: 'Ordine', multiSelect: false, options: [{ label: 'Sotto le strade', description: 'Le strade passano sopra i fiumi, come ponti' }, { label: 'Sopra le strade', description: 'I fiumi coprono le strade dove si incrociano' }] },
        { question: 'Quali elementi aggiungo anche?', header: 'Extra', multiSelect: true, options: [{ label: 'Guadi', description: 'Dove un sentiero attraversa un fiume' }, { label: 'Ponti', description: 'Sulle strade principali' }, { label: 'Laghi', description: 'Alle sorgenti' }] },
      ] }, 0),
      attivita: () => {
        const list = [{ id: '1', content: 'Leggere MapView.cpp', activeForm: 'Legge MapView.cpp', status: 'completed' }, { id: '2', content: 'Aggiungere DrawRivers()', activeForm: 'Aggiunge DrawRivers()', status: 'in_progress' }, { id: '3', content: 'Compilare e provare la mappa', activeForm: 'Compila e prova la mappa', status: 'pending' }]
        fire('onTodos', list, 0)
      },
      permesso: () => fire('onAsk', { id: Date.now(), title: 'Claude vuole modificare un file', description: '', detail: 'src/MapView.cpp', canAlways: true }, 0),
    }
    const day = 86400000
    return {
      // ?tema=<id>&scena=giorno nell'indirizzo per guardare un tema
      info: async () => {
        const q = new URLSearchParams(location.search)
        return { scene: q.get('scena') || 'notte', chapter: n, theme: q.get('tema') || 'terra-di-mezzo', themes: ['terra-di-mezzo', 'moderno'], workdir: 'C:/Workspace', workdirChosen: q.get('cartella') !== 'no', mode: q.get('modo') || 'auto' }
      },
      setInteractive() {}, hide() {}, quit() {}, setScene() {}, stop() {}, setTrayIcon() {}, answer() {}, gestureStart() {}, gestureEnd() {},
      setMode: (m) => fire('onMode', m, 0),
      setTheme: (id) => fire('onTheme', id, 0),
      windowMode: (m) => { fakeWin = fakeWin === m ? 'normal' : m; fire('onWindowState', fakeWin, 0) },
      windowState: async () => fakeWin,
      chooseWorkdir: async () => 'C:/Workspace/Nuovo progetto',
      setWorkdir: async (d) => d,
      openLink: (url) => window.open(url, '_blank', 'noopener'),
      commands: async () => FAKE_COMMANDS,
      sessions: async () => [
        { id: 's1', title: 'Temi per Claude Skins', lastModified: Date.now() - 3600000, cwd: 'C:/Workspace/Progetti/Claude-desktop-skins' },
        { id: 's2', title: 'Il calcolo dei sentieri in RouteFinder', lastModified: Date.now() - day, cwd: 'C:/Workspace/MapEditor' },
        { id: 's3', title: 'Mod desktop Signore degli Anelli', lastModified: Date.now() - 4 * day, cwd: 'C:/Workspace' },
        { id: 's4', title: 'Profilo di Windows Terminal', lastModified: Date.now() - 9 * day, cwd: 'C:/Users/luca' },
      ],
      openSession: async () => [
        { role: 'user', text: 'Aggiungi i fiumi alla mappa' },
        { role: 'assistant', text: 'Guardo prima come si disegna la mappa.' },
        { role: 'tool', id: 'h1', name: 'Read', summary: 'src/MapView.cpp', change: null, error: false },
        { role: 'tool', id: 'h2', name: 'Edit', summary: 'src/MapView.cpp', change: FAKE_EDIT, error: false },
        { role: 'tool', id: 'h3', name: 'Bash', summary: 'cmake --build build', change: null, error: true },
        { role: 'assistant', text: 'Fatto: i fiumi ora si disegnano **prima** delle strade. La compilazione però si è fermata su un errore di `MapLoader`.' },
        { role: 'user', text: '/usage' },
        { role: 'output', text: 'Sessione corrente\n  Token in ingresso   12.408\n  Costo stimato       0,21 $' },
      ],
      onAsk: on('onAsk'), onAskClosed: on('onAskClosed'),
      newChapter: async () => ++n,
      pathForFile: (f) => `C:/Workspace/${f.name}`,
      chooseFiles: async () => ['C:/Workspace/MapEditor/docs/specifiche.pdf', 'C:/Workspace/MapEditor/src/MapView.cpp'],
      readImage: async () => null,
      models: async () => ({ models: [
        { value: 'default', name: 'Predefinito', description: 'Il modello consigliato', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
        { value: 'opus', name: 'Opus', description: 'Il più capace, per il lavoro complesso', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
        { value: 'sonnet', name: 'Sonnet', description: 'Veloce e capace, per l\'uso di tutti i giorni', efforts: ['low', 'medium', 'high'] },
        { value: 'haiku', name: 'Haiku', description: 'Il più rapido, per le risposte brevi', efforts: [] },
      ], model: null, effort: null }),
      setModel() {},
      onModels: on('onModels'), onTodos: on('onTodos'),
      send(msg) {
        const text = typeof msg === 'string' ? msg : msg.text || '(allegati)'
        if (text.startsWith('/')) {
          // I comandi finti: uno locale con la sua uscita, gli altri come una risposta
          if (/^\/usage/.test(text)) fire('onCommandOutput', 'Sessione corrente\n  Token in ingresso   12.408\n  Token in uscita     3.215\n  Costo stimato       0,21 $', 400)
          else if (/^\/compact/.test(text)) fire('onCompacted', { pre: 48210, post: 6120 }, 600)
          else fire('onDelta', `Eseguo ${text.split(' ')[0]}.`, 400)
          fire('onDone', { durationMs: 900 }, 800)
          return
        }
        fire('onTool', { id: 't0', name: 'Grep', summary: 'DrawRoads', intent: { verb: 'grep', target: 'DrawRoads' } }, 200)
        fire('onToolDone', { id: 't0', error: false }, 260)
        fire('onTool', { id: 't1', name: 'Read', summary: 'src/MapView.cpp', intent: { verb: 'read', target: 'MapView.cpp' } }, 300)
        fire('onToolDone', { id: 't1', error: false }, 380)
        fire('onToolSummary', { summary: 'Ha trovato dove si disegnano le strade', ids: ['t0', 't1'] }, 420)
        fire('onTool', { id: 't2', name: 'Edit', summary: 'src/MapView.cpp', intent: { verb: 'edit', target: 'MapView.cpp' }, change: FAKE_EDIT }, 600)
        fire('onToolDone', { id: 't2', error: false }, 800)
        const answer = FAKE_ANSWER.replace('{text}', text)
        ;[...answer].forEach((ch, i) => fire('onDelta', ch, 900 + i * 15))
        fire('onDone', { durationMs: 2400 }, 900 + answer.length * 15 + 100)
        fire('onAsk', { id: 1, title: 'Claude vuole creare un file', description: '', detail: 'src/RouteFinder.h', change: FAKE_WRITE, canAlways: true }, 900 + answer.length * 15 + 200)
      },
      onDelta: on('onDelta'), onTool: on('onTool'), onToolDone: on('onToolDone'), onDone: on('onDone'), onError: on('onError'), onReset: on('onReset'), onTheme: on('onTheme'), onMode: on('onMode'), onToolSummary: on('onToolSummary'), onWindowState: on('onWindowState'), onWorkdir: on('onWorkdir'), onCommands: on('onCommands'), onCommandsError: on('onCommandsError'), onCommandOutput: on('onCommandOutput'), onCompacted: on('onCompacted'), onTitle: on('onTitle'), onStatus: on('onStatus'),
    }
  }
})()
