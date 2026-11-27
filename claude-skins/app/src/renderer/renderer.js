// La pagina: monta il layout del tema in uso, mostra la conversazione e passa i messaggi al processo principale.
// Il motore non conosce la forma della finestra: trova i pezzi che gli servono per attributo, ovunque il tema li
// metta (data-part="log", data-action="send", data-drag, data-art...; elenco in themes/LEGGIMI.md). Gli eventi sono
// delegati al documento, così un cambio di tema sostituisce tutto l'HTML senza perdere la conversazione.
// Senza Electron (aperta in un browser) la chat risponde con un'eco finta, per guardare la grafica.
(function () {
  // Gli eventi di una conversazione arrivano con il suo id: passano da dispatch, che li applica alla conversazione
  // giusta anche se non è quella in vista (vedi "conversazioni")
  const base = window.skins || fakeApi()
  const api = Object.assign({}, base)
  const CONV_EVENTS = ['onDelta', 'onTool', 'onToolDone', 'onDone', 'onError', 'onAsk', 'onAskClosed', 'onCommandOutput', 'onToolSummary', 'onCompacted', 'onStatus', 'onTodos', 'onBusy', 'onContext', 'onThinkingStart', 'onThinking', 'onThinkingEnd', 'onSuggestion', 'onRewound', 'onTasks', 'onWorktree']
  for (const n of CONV_EVENTS) if (base[n]) api[n] = (fn) => base[n]((payload, id) => dispatch(id, n, () => fn(payload)))
  const app = document.getElementById('app')
  const t = Theming.t
  // Gli errori della pagina finiscono in errori.log (cartella dei dati), per capire cosa non va
  window.addEventListener('error', (e) => { if (api.logError) api.logError(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})${e.error && e.error.stack ? `\n${e.error.stack}` : ''}`) })
  window.addEventListener('unhandledrejection', (e) => { if (api.logError) api.logError(`promessa: ${(e.reason && e.reason.stack) || e.reason}`) })
  const MONTHS = Theming.MONTHS
  const part = (name) => app.querySelector(`[data-part="${name}"]`)
  const all = (sel) => app.querySelectorAll(sel)

  let scene = 'notte'
  let busy = false
  let reply = null
  // La risposta suggerita da Claude Code per il prossimo messaggio
  let suggestion = ''
  let pending = false
  let chapter = 1
  let workdir = ''
  // La cronaca aperta, se c'è: { id, title, lastModified }
  let currentSession = null
  // Il modo dei permessi
  let mode = 'auto'
  const MODES = [['auto', 'modeAuto'], ['default', 'modeDefault'], ['acceptEdits', 'modeAcceptEdits'], ['plan', 'modePlan']]
  let tools = new Map()
  // I file toccati da Claude nella conversazione: percorso → modifiche (id dell'azione → { change, added, removed })
  let changed = new Map()
  // Le attività in background della conversazione (comandi, sotto-agenti), dal ponte
  let bgTasks = []
  let reviews = []
  // Le conversazioni nuove nei repo partono in un worktree (impostazione)
  let worktreeOn = false

  // ------------------------------------------------------------------ conversazioni

  // Più conversazioni insieme, come nell'app desktop: ognuna ha il suo Claude Code acceso (nel processo principale) e
  // qui il suo stato e il suo contenitore nel log (.convo; si vede solo quello della conversazione in vista). Le
  // variabili della conversazione (reply, tools, busy, todos, context...) contengono quella "di turno" (cur), di
  // solito quella in vista (active). Un evento di un'altra le scambia per il tempo che serve (run); intanto quiet
  // zittisce tutto quello che si vede fuori dal log: pulsanti, attività, contesto, cartella, titolo, agganci del tema
  const convs = new Map()
  let active = null
  let cur = null
  let quiet = false
  function logEl() {
    return (cur && cur.el) || part('log')
  }
  function newConv(id) {
    const el = document.createElement('div')
    el.className = 'convo'
    el.dataset.conv = id
    el.hidden = true
    if (part('log')) part('log').appendChild(el)
    const c = {
      id, el, reply: null, pending: false, tools: new Map(), busy: false, thinking: null, todos: [], todosOpen: true,
      context: null, currentSession: null, convoDir: workdir, chapter, asks: new Map(), stick: true, suggestion: '', changed: new Map(), bgTasks: [], reviews: [],
      sessionId: null, unread: false, attention: false,
    }
    convs.set(id, c)
    return c
  }
  function save(c) {
    if (c) Object.assign(c, { reply, pending, tools, busy, thinking, todos, todosOpen, context, currentSession, convoDir, chapter, asks, stick, suggestion, changed, bgTasks, reviews })
  }
  function load(c) {
    ;({ reply, pending, tools, busy, thinking, todos, todosOpen, context, currentSession, convoDir, chapter, asks, stick, suggestion, changed, bgTasks, reviews } = c)
  }
  function run(c, fn) {
    if (!c || c === cur) return fn()
    const prev = cur
    save(prev)
    load(c)
    cur = c
    quiet = c !== active
    try {
      return fn()
    } finally {
      save(c)
      if (prev) load(prev)
      cur = prev
      quiet = !!prev && prev !== active
    }
  }
  // Un evento dal processo principale: alla sua conversazione. Una che non è in vista segna negli annali che ha una
  // domanda aperta o una risposta nuova
  function dispatch(id, name, fn) {
    const c = (id && convs.get(id)) || active
    if (!c) return
    run(c, fn)
    if (c === active) return
    if (name === 'onDone' || name === 'onError') c.unread = true
    if (name === 'onAsk') c.attention = true
    if (name === 'onAskClosed' || name === 'onDone') c.attention = false
    if (/^on(Done|Error|Ask|AskClosed|Busy|Delta)$/.test(name)) markCurrentSession()
  }
  const isBusy = (c) => (c === cur ? busy : c.busy)
  // Passa a un'altra conversazione: la sua pagina, i suoi pulsanti, le sue attività, il suo contesto
  function switchTo(c) {
    if (!c || c === active) return
    closeMenu()
    closeFind()
    save(cur)
    if (active) active.el.hidden = true
    active = c
    cur = c
    quiet = false
    load(c)
    c.el.hidden = false
    c.unread = false
    c.attention = false
    if (api.setActive) api.setActive(c.id)
    const b = busy
    busy = !b
    setBusy(b)
    renderTodos()
    renderContext()
    renderChanged()
    renderTasks()
    renderPreviewBtn()
    renderAttachments()
    renderFolder()
    renderGit()
    refreshGit()
    renderChapterHead()
    renderGhost()
    markCurrentSession()
    scrollDown(true)
    hook('chapter')
  }
  // Le conversazioni rimaste vuote (nessun messaggio, nessuna sessione) se ne vanno quando se ne apre un'altra
  function pruneEmpty() {
    for (const c of [...convs.values()]) {
      if (c === active || c.sessionId || isBusy(c) || c.el.querySelector('.entry.you')) continue
      c.el.remove()
      convs.delete(c.id)
    }
  }
  function dropConv(c) {
    if (!c || c === active) return
    c.el.remove()
    convs.delete(c.id)
  }

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
    // Ogni blocco di codice ha il suo "copia"; la risposta intera ne ha uno sotto (il testo markdown com'è arrivato)
    for (const pre of textEl.querySelectorAll('pre')) pre.appendChild(copyButton('copyCode', () => pre.querySelector('code') ? pre.querySelector('code').textContent : pre.textContent))
    const entryEl = textEl.closest('.entry')
    if (entryEl) {
      entryEl.rawText = src
      if (!entryEl.querySelector('.entry-actions')) entryEl.appendChild(entryActions('copyReply', () => entryEl.rawText || ''))
    }
  }

  // ------------------------------------------------------------------ copiare

  // Un pulsante "copia": il testo lo dà get al momento del clic; per un attimo dice "Copiato"
  function copyButton(key, get, withText) {
    const b = document.createElement('button')
    b.className = 'copy-btn'
    b.dataset.sTitle = key
    b.title = t(key)
    if (withText) label(b, 'copy')
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      copyText(get())
      b.classList.add('done')
      if (withText) label(b, 'copied')
      clearTimeout(b.timer)
      b.timer = setTimeout(() => { b.classList.remove('done'); if (withText) label(b, 'copy') }, 1500)
    })
    return b
  }
  function entryActions(key, get) {
    const row = document.createElement('div')
    row.className = 'entry-actions'
    row.appendChild(copyButton(key, get, true))
    return row
  }
  function copyText(text) {
    if (api.copy) api.copy(text)
    else if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {})
  }

  // ------------------------------------------------------------------ la conversazione nel log

  // Il log resta agganciato al fondo finché chi legge non risale: ogni cambiamento (testo che arriva, una domanda
  // riempita dopo, miniature che si caricano, la penna o le attività che cambiano misura) lo riporta giù. Risalendo
  // si sgancia; tornando in fondo, o spedendo un messaggio, si riaggancia
  let stick = true
  // Dove l'app ha portato il log: l'evento di scorrimento arriva un fotogramma dopo, quando il contenuto può essere già
  // cresciuto, e non va scambiato per chi legge che risale
  let ownTop = -1
  function toBottom(l) {
    l.scrollTop = l.scrollHeight
    ownTop = l.scrollTop
  }
  function scrollDown(force) {
    const l = part('log')
    if (!l || quiet) return
    if (force) stick = true
    if (stick) toBottom(l)
  }
  let logWatch = []
  function watchLog() {
    for (const o of logWatch) o.disconnect()
    logWatch = []
    const log = part('log')
    if (!log) return
    let frame = 0
    const follow = () => {
      if (frame) return
      frame = requestAnimationFrame(() => { frame = 0; if (stick) toBottom(log) })
    }
    log.addEventListener('scroll', () => {
      if (Math.abs(log.scrollTop - ownTop) < 2) return
      stick = log.scrollHeight - log.scrollTop - log.clientHeight < 32
      ownTop = -1
    })
    log.addEventListener('load', follow, true)
    const ro = new ResizeObserver(follow)
    ro.observe(log)
    const mo = new MutationObserver(follow)
    mo.observe(log, { childList: true, subtree: true, characterData: true })
    logWatch.push(ro, mo)
  }

  // Le voci della conversazione hanno la classe "item": sono le sole che si spostano da un layout all'altro e che
  // un nuovo capitolo cancella (il resto del log, se il tema ci mette qualcosa, resta)
  function add(cls, html) {
    const d = document.createElement('div')
    d.className = `item ${cls}`
    d.innerHTML = html
    const log = logEl()
    const working = [...log.children].find((x) => x.classList.contains('working'))
    if (working) log.insertBefore(d, working)
    else log.appendChild(d)
    scrollDown()
    return d
  }
  function clearLog() {
    for (const el of [...logEl().children]) if (el.classList.contains('item')) el.remove()
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
    if (quiet) return
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
  // Una cartella dentro <repo>/.claude/worktrees/<nome>: la copia separata di una conversazione
  const wtOf = (p) => { const s = String(p || '').replace(/\\/g, '/'); const m = /\/\.claude\/worktrees\/([^/]+)\/?$/.exec(s); return m ? { main: s.slice(0, m.index), name: m[1] } : null }

  function renderFolder() {
    if (quiet) return
    for (const box of all('[data-part="folder"]')) {
      let b = box.querySelector('.folder-btn')
      if (!b) {
        b = document.createElement('button')
        b.className = 'folder-btn'
        b.addEventListener('click', () => openFolderMenu(b))
        box.appendChild(b)
      }
      const unset = !workdirChosen && !currentSession && !chapterHasMessages()
      const dir = convoDir || workdir
      const wt = wtOf(dir)
      b.classList.toggle('unset', unset)
      b.textContent = ''
      const nameEl = document.createElement('span')
      nameEl.className = 'fb-name'
      nameEl.textContent = unset ? t('folderPick') : baseName(wt ? wt.main : dir)
      b.appendChild(nameEl)
      b.title = unset ? t('folderPick') : dir
      // In un worktree, o in una conversazione che ci partirà
      const fresh = !currentSession && !chapterHasMessages()
      // (in una copia già fatta lo dice il pulsante del branch, che ha il colore del worktree)
      if (!unset && !wt && worktreeOn && fresh && active && active.git && !active.git.worktree) {
        const tag = document.createElement('span')
        tag.className = 'wt-tag pending'
        tag.textContent = t('wtTagNew')
        b.title = t('wtPendingTip')
        b.appendChild(tag)
      }
    }
    // Un'altra cartella: un altro repo (o nessuno)
    if (active && active.gitDir !== (convoDir || workdir)) refreshGit()
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
    if (quiet) return
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
  if (api.onBusy) api.onBusy((on) => setBusy(!!on))
  if (api.onTodos) api.onTodos((list) => {
    const before = todos.length
    todos = Array.isArray(list) ? list : []
    // Una lista nuova si apre; una lista finita si chiude da sola
    if (!before && todos.length) todosOpen = true
    if (todos.length && todos.every((x) => x.status === 'completed')) todosOpen = false
    renderTodos()
  })

  // ------------------------------------------------------------------ contesto

  // Quanto è pieno il contesto: un anello (in data-part="context") che si riempie, più acceso oltre l'80%; un clic
  // apre il dettaglio per categoria e "Compatta ora" (/compact)
  let context = null
  const kTok = (n) => n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace('.', ',')}k` : String(n)
  function renderContext() {
    if (quiet) return
    for (const box of all('[data-part="context"]')) {
      let b = box.querySelector('.context-btn')
      if (!b) {
        b = document.createElement('button')
        b.className = 'context-btn'
        b.innerHTML = '<svg viewBox="0 0 20 20"><circle class="track" cx="10" cy="10" r="7.5"/><circle class="fill" cx="10" cy="10" r="7.5"/></svg>'
        b.addEventListener('click', () => openContextMenu(b))
        box.appendChild(b)
      }
      const p = context ? Math.max(0, Math.min(100, context.percentage)) : 0
      const C = 2 * Math.PI * 7.5
      b.querySelector('.fill').style.strokeDasharray = `${(C * p) / 100} ${C}`
      b.classList.toggle('empty', !context)
      b.classList.toggle('warn', !!context && p >= 80)
      b.title = context ? t('contextTip', { p, used: kTok(context.used), max: kTok(context.max) }) : t('contextNone')
    }
  }
  // L'utilizzo del piano (sessione di 5 ore, settimana), come nell'app desktop: una barra per finestra, con quando
  // si azzera. Arriva da Claude Code all'avvio e dopo le risposte
  let usage = null
  if (api.onUsage) api.onUsage((u) => { usage = u })
  if (api.usage) api.usage().then((u) => { if (u && !usage) usage = u }).catch(() => {})
  function resetWhen(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d)) return ''
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return t('usageAt', { when: hm })
    const days = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
    return t('usageAt', { when: `${days[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}, ${hm}` })
  }
  function usageSection(menu) {
    const head = document.createElement('div')
    head.className = 'folder-head usage-head'
    menu.appendChild(label(head, 'usageTitle'))
    const rows = usage ? [['usage5h', usage.fiveHour], ['usageWeek', usage.week], ['usageWeekOpus', usage.weekOpus], ['usageWeekSonnet', usage.weekSonnet]].filter(([, w]) => w) : []
    if (!rows.length) {
      const n = document.createElement('div')
      n.className = 'folder-note'
      menu.appendChild(label(n, 'usageNone'))
      return
    }
    for (const [key, w] of rows) {
      const row = document.createElement('div')
      row.className = 'usage-row' + (w.used >= 80 ? ' warn' : '')
      row.innerHTML = '<div class="u-line"><span class="u-name"></span><span class="u-pct"></span></div><div class="u-bar"><span></span></div><div class="u-reset"></div>'
      label(row.querySelector('.u-name'), key)
      row.querySelector('.u-pct').textContent = `${w.used}%`
      row.querySelector('.u-bar span').style.width = `${Math.max(1, Math.min(100, w.used))}%`
      row.querySelector('.u-reset').textContent = resetWhen(w.resetsAt)
      menu.appendChild(row)
    }
  }

  function openContextMenu(anchor) {
    closeFolderMenu()
    const menu = document.createElement('div')
    menu.className = 'folder-menu context-menu'
    const head = document.createElement('div')
    head.className = 'folder-head'
    if (!context) {
      menu.appendChild(label(head, 'contextEmpty'))
      usageSection(menu)
      placeMenu(menu, anchor)
      return
    }
    menu.appendChild(label(head, 'contextTitle', { p: context.percentage }))
    const of = document.createElement('div')
    of.className = 'folder-note'
    menu.appendChild(label(of, context.estimate ? 'contextEstimate' : 'contextOf', { used: kTok(context.used), max: kTok(context.max) }))
    // La barra: una fetta per categoria usata, il resto libero (una stima senza categorie: una fetta sola)
    const bar = document.createElement('div')
    bar.className = 'context-bar'
    const used = context.categories.length ? context.categories.filter((c) => c.kind === 'used') : [{ name: t('ctx_messages'), tokens: context.used, kind: 'used' }]
    used.forEach((c, k) => {
      const seg = document.createElement('span')
      seg.style.width = `${Math.max(0.5, (c.tokens / Math.max(1, context.max)) * 100)}%`
      seg.style.opacity = String(1 - (k % 4) * 0.18)
      seg.title = `${c.name}: ${kTok(c.tokens)}`
      bar.appendChild(seg)
    })
    menu.appendChild(bar)
    const list = document.createElement('div')
    list.className = 'context-list'
    for (const c of context.categories.filter((x) => x.kind !== 'deferred')) {
      const row = document.createElement('div')
      row.className = `context-row ${c.kind}`
      row.innerHTML = '<span class="cr-name"></span><span class="cr-tokens"></span>'
      // Il nome della categoria in italiano se la si conosce, altrimenti quello di Claude Code
      const key = `ctx_${c.id}`
      row.children[0].textContent = c.id && t(key) !== key ? t(key) : c.name
      row.children[1].textContent = kTok(c.tokens)
      list.appendChild(row)
    }
    menu.appendChild(list)
    const note = document.createElement('div')
    note.className = 'folder-note'
    menu.appendChild(label(note, 'contextNote'))
    usageSection(menu)
    const compact = document.createElement('div')
    compact.className = 'folder-item other'
    menu.appendChild(label(compact, 'contextCompact'))
    compact.addEventListener('click', () => {
      closeFolderMenu()
      const input = part('input')
      if (!input) return
      input.value = '/compact'
      sendMessage()
    })
    placeMenu(menu, anchor)
  }
  if (api.onContext) api.onContext((c) => { context = c; renderContext() })

  // ------------------------------------------------------------------ modello e ragionamento

  // Il pulsante del modello (in data-part="model"): il nome del modello scelto e il ragionamento; un clic apre il
  // menu con i modelli che Claude Code dà (supportedModels) e i livelli di ragionamento del modello scelto
  let models = []
  let model = null
  let effort = null
  let ultracode = false
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
      b.textContent = [name, effort ? t(`effort_${effort}`) : '', ultracode ? t('ultracode') : ''].filter(Boolean).join(' · ')
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
        api.setModel(model, effort, ultracode)
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
        b.addEventListener('click', () => { effort = lv; api.setModel(model, effort, ultracode); renderModel(); closeFolderMenu() })
        row.appendChild(b)
      }
      menu.appendChild(row)
    }
    // L'interruttore di ultracode, come nell'app desktop
    const uc = document.createElement('div')
    uc.className = 'folder-item toggle-item' + (ultracode ? ' on' : '')
    uc.innerHTML = '<span class="ti-text"><span class="fi-name"></span><span class="fi-path fi-wrap"></span></span><span class="switch"></span>'
    label(uc.querySelector('.fi-name'), 'ultracode')
    label(uc.querySelector('.fi-path'), 'ultracodeDesc')
    uc.addEventListener('click', () => {
      ultracode = !ultracode
      uc.classList.toggle('on', ultracode)
      api.setModel(model, effort, ultracode)
      renderModel()
    })
    menu.appendChild(uc)
    const note = document.createElement('div')
    note.className = 'folder-note'
    menu.appendChild(label(note, 'modelNote'))
    placeMenu(menu, anchor)
  }
  if (api.models) api.models().then((x) => { models = x.models || []; model = x.model || null; effort = x.effort || null; ultracode = !!x.ultracode; renderModel() }).catch(() => {})
  if (api.onModels) api.onModels((list) => { models = list || []; renderModel() })

  function chapterHasMessages() {
    return logEl().querySelectorAll('.entry.you').length > 0
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
        // Le copie separate valgono come il loro repo
        const d = x.cwd && (wtOf(x.cwd) ? wtOf(x.cwd).main : x.cwd)
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
    // Le copie separate per le conversazioni nuove (solo nei repo git)
    const wtRow = document.createElement('label')
    wtRow.className = 'folder-item wt-toggle'
    wtRow.innerHTML = '<input type="checkbox"><span class="fi-text"><span class="fi-name"></span><span class="fi-wrap"></span></span>'
    label(wtRow.querySelector('.fi-name'), 'wtToggle')
    label(wtRow.querySelector('.fi-wrap'), 'wtToggleNote')
    const cb = wtRow.querySelector('input')
    cb.checked = worktreeOn
    cb.addEventListener('change', () => { worktreeOn = cb.checked; api.setSetting('worktree', worktreeOn); renderFolder() })
    menu.appendChild(wtRow)
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
    if (document.querySelector('.folder-menu') && !e.target.closest('.folder-menu, .folder-btn, .model-btn, .mode-btn, .session-more, .context-btn')) closeFolderMenu()
  }, true)

  // ------------------------------------------------------------------ comandi con /

  // L'elenco viene da Claude Code (skill, plugin, comandi del progetto e i suoi): all'avvio dalla cache, poi
  // aggiornato. Scrivendo / all'inizio della penna si apre il menu sopra di essa
  let commands = []
  // kind: 'cmd' (comandi con /) o 'file' (file da citare con @)
  const menu = { el: null, items: [], index: 0, kind: 'cmd' }
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

  // Il file che si sta citando: una @ all'inizio o dopo uno spazio, e il cursore ancora sulla parola
  function typedMention() {
    const input = part('input')
    if (!input || input.selectionStart !== input.selectionEnd) return null
    const before = input.value.slice(0, input.selectionStart)
    const m = /(^|\s)@([^\s@]*)$/.exec(before)
    return m ? { start: before.length - m[2].length - 1, query: m[2] } : null
  }
  // I suggerimenti arrivano dal processo principale: si chiedono un attimo dopo l'ultimo tasto
  let fileTimer = 0
  let fileAsk = 0
  function ensureMenuEl(input) {
    if (!menu.el || !menu.el.isConnected) {
      menu.el = document.createElement('div')
      menu.el.className = 'cmd-menu'
      const host = input.parentElement
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
      host.appendChild(menu.el)
    }
    menu.el.style.left = `${input.offsetLeft}px`
    menu.el.style.width = `${input.offsetWidth}px`
    menu.el.style.bottom = `${input.offsetParent === menu.el.offsetParent ? menu.el.parentElement.clientHeight - input.offsetTop + 6 : 6}px`
  }
  function updateFileMenu(mention) {
    const input = part('input')
    clearTimeout(fileTimer)
    const mine = ++fileAsk
    fileTimer = setTimeout(async () => {
      let list = []
      try { list = api.suggestFiles ? await api.suggestFiles(mention.query, active && active.id) : [] } catch {}
      if (mine !== fileAsk || !typedMention()) return
      if (menu.kind !== 'file') menu.index = 0
      menu.kind = 'file'
      ensureMenuEl(input)
      menu.items = list
      menu.index = Math.min(menu.index, Math.max(0, list.length - 1))
      menu.el.innerHTML = ''
      menu.el.classList.add('files')
      if (!list.length) {
        const empty = document.createElement('div')
        empty.className = 'cmd-empty'
        menu.el.appendChild(label(empty, 'fileNone'))
        return
      }
      list.forEach((f, i) => {
        const row = document.createElement('div')
        row.className = 'cmd file' + (i === menu.index ? ' active' : '') + (f.endsWith('/') ? ' dir' : '')
        row.innerHTML = '<span class="cmd-name"></span><span class="cmd-desc"></span>'
        const parts = f.replace(/\/$/, '').split('/')
        row.children[0].textContent = parts.pop() + (f.endsWith('/') ? '/' : '')
        row.children[1].textContent = parts.join('/')
        row.title = f
        row.addEventListener('mousedown', (e) => { e.preventDefault(); completeFile(f) })
        menu.el.appendChild(row)
      })
      menu.el.children[menu.index]?.scrollIntoView({ block: 'nearest' })
    }, menu.kind === 'file' && menu.el ? 60 : 0)
  }
  // Mette il percorso al posto di quello scritto dopo @; una cartella lascia il menu aperto per scendere dentro
  function completeFile(f) {
    const input = part('input')
    const m = typedMention()
    if (!m) return closeMenu()
    const end = input.selectionStart
    const text = f.endsWith('/') ? `@${f}` : `@${f} `
    input.setSelectionRange(m.start, end)
    insertText(input, text)
    input.focus()
    if (f.endsWith('/')) updateMenu()
    else closeMenu()
  }

  function updateMenu() {
    const mention = typedMention()
    if (mention) return updateFileMenu(mention)
    const q = typedCommand()
    if (q == null) return closeMenu()
    if (menu.kind !== 'cmd' && menu.el) { menu.el.remove(); menu.el = null }
    menu.kind = 'cmd'
    const input = part('input')
    // Sopra la penna, largo come lei
    ensureMenuEl(input)
    menu.el.classList.remove('files')
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
    menu.kind = 'cmd'
    fileAsk++
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
      // Il menu dei file si ridisegna solo nell'evidenziato, senza richiedere i suggerimenti
      if (menu.kind === 'file') {
        ;[...menu.el.children].forEach((r, i) => r.classList.toggle('active', i === menu.index))
        menu.el.children[menu.index]?.scrollIntoView({ block: 'nearest' })
      } else updateMenu()
      return true
    }
    if (e.key === 'Escape') { closeMenu(); return true }
    if (menu.kind === 'file' && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) {
      completeFile(menu.items[menu.index])
      return true
    }
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
      // Ogni tema si esporta; i tuoi (dell'editor o importati) si eliminano, con una conferma sul posto; quelli
      // dell'editor si modificano
      const full = Theming.get(th.id)
      const mine = full && (full.custom || Theming.installed(th.id))
      const acts = document.createElement('span')
      acts.className = 'theme-actions'
      if (full && full.custom && api.saveTheme) {
        const edit = document.createElement('span')
        edit.className = 'btn small deny'
        label(edit, 'themesEdit')
        edit.addEventListener('click', (e) => { e.stopPropagation(); openThemeEditor(th.id) })
        acts.appendChild(edit)
      }
      if (api.exportTheme) {
        const exp = document.createElement('span')
        exp.className = 'btn small deny'
        label(exp, 'themesExport')
        exp.addEventListener('click', async (e) => {
          e.stopPropagation()
          const r = await api.exportTheme(th.id).catch((err) => ({ ok: false, error: err.message }))
          if (r && r.ok) { closeThemes(); labelled('footnote', 'themesExported', { x: r.file }) } else if (r && !r.canceled) { closeThemes(); labelled('error', 'themesFail', { x: r.error || '?' }) }
        })
        acts.appendChild(exp)
      }
      if (mine && api.deleteTheme) {
        card.classList.add('mine')
        const del = document.createElement('span')
        del.className = 'btn small deny'
        label(del, 'themesDelete')
        del.addEventListener('click', async (e) => {
          e.stopPropagation()
          if (!del.classList.contains('sure')) { del.classList.add('sure'); label(del, 'themesDeleteSure'); return }
          if (await api.deleteTheme(th.id)) { Theming.unregister(th.id); openThemes() }
        })
        acts.appendChild(del)
      }
      if (acts.children.length) card.appendChild(acts)
      card.addEventListener('click', () => {
        closeThemes()
        if (th.id !== Theming.current.id) api.setTheme(th.id)
      })
      cards.appendChild(card)
    }
    if (api.saveTheme && window.SkinsKits && window.SkinsKits.moderno) {
      const card = document.createElement('button')
      card.className = 'theme-card theme-new'
      card.innerHTML = '<span class="tn-plus">+</span><span class="theme-name"></span><span class="theme-desc"></span>'
      label(card.querySelector('.theme-name'), 'themesNew')
      label(card.querySelector('.theme-desc'), 'themesNewDesc')
      card.addEventListener('click', () => openThemeEditor(null))
      cards.appendChild(card)
    }
    if (api.importTheme) {
      const card = document.createElement('button')
      card.className = 'theme-card theme-new theme-import'
      card.innerHTML = '<span class="tn-plus">⇩</span><span class="theme-name"></span><span class="theme-desc"></span>'
      label(card.querySelector('.theme-name'), 'themesImport')
      label(card.querySelector('.theme-desc'), 'themesImportDesc')
      card.addEventListener('click', importTheme)
      cards.appendChild(card)
    }
    host.appendChild(panel)
  }
  // Un tema da un file .skin: il processo principale lo controlla, chiede conferma e lo installa; qui si carica e si
  // mette in uso
  async function importTheme() {
    const r = await api.importTheme().catch((err) => ({ ok: false, error: err.message }))
    if (!r || !r.ok) { if (r && !r.canceled) { closeThemes(); labelled('error', 'themesFail', { x: r.error || '?' }) } return }
    if (r.kind === 'code') await Theming.load([{ id: r.id, base: r.base }], true)
    else Theming.register(window.SkinsKits.moderno.fromColors(r.spec))
    closeThemes()
    if (!Theming.get(r.id)) { labelled('error', 'themesFail', { x: `il file del tema non registra «${r.id}»` }); return }
    api.setTheme(r.id)
  }

  // ------------------------------------------------------------------ editor dei temi

  // Un tema nuovo (o uno dei tuoi da modificare) col kit moderno: nove colori di base, carattere, dimensione del
  // testo e angoli; il kit ricava il resto. L'anteprima è la finestra stessa: il tema in prova ('__bozza') si monta
  // subito e ogni scelta cambia le sue variabili sul posto. Il pannello sta fuori dal layout (in body), così il
  // cambio di tema non lo porta via. "Salva e usa" lo scrive fra i temi tuoi e lo mette in uso; "Annulla" torna a
  // quello di prima
  const DRAFT = '__bozza'
  let themeEditor = null
  async function openThemeEditor(editId) {
    closeThemes()
    const kit = window.SkinsKits.moderno
    if (themeEditor) themeEditor.el.remove()
    const prev = Theming.current.id === DRAFT ? (themeEditor && themeEditor.prev) : Theming.current.id
    const firstModern = Theming.list().map((x) => Theming.get(x.id)).find((x) => x && (x.kits || []).includes('moderno'))
    const from = editId ? Theming.get(editId) : ((Theming.current.kits || []).includes('moderno') ? Theming.current : firstModern)
    const spec = kit.colorsOf(from, scene)
    spec.id = editId || ''
    spec.name = editId ? from.name : t('teNameDefault')
    spec.description = editId ? (from.description || '') : ''
    let autoOn = !editId || spec.colors.onAccent === kit.readableOn(spec.colors.accent)
    const el = document.createElement('div')
    el.className = 'theme-editor'
    el.dataset.solid = ''
    themeEditor = { el, prev, spec }
    let raf = 0
    const apply = (full) => {
      Theming.register(kit.fromColors(Object.assign({}, spec, { id: DRAFT })))
      if (full) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => paint())
    }
    const field = (key, input) => {
      const r = document.createElement('label')
      r.className = 'te-row'
      const l = document.createElement('span')
      l.className = 'te-label'
      r.append(label(l, key), input)
      return r
    }
    const build = () => {
      el.innerHTML = '<div class="te-head"><span></span></div><div class="te-body"></div><div class="te-foot"><button class="btn small deny te-cancel"></button><button class="btn small te-save"></button></div>'
      label(el.querySelector('.te-head span'), editId ? 'teTitleEdit' : 'teTitleNew')
      const body = el.querySelector('.te-body')
      const name = Object.assign(document.createElement('input'), { className: 'te-input te-name', value: spec.name, spellcheck: false })
      name.addEventListener('input', () => { spec.name = name.value })
      body.appendChild(field('teName', name))
      const desc = Object.assign(document.createElement('input'), { className: 'te-input', value: spec.description, spellcheck: false })
      desc.addEventListener('input', () => { spec.description = desc.value })
      body.appendChild(field('teDesc', desc))
      // Parti da: i colori di un altro tema del kit (il nome resta)
      const fromSel = document.createElement('select')
      fromSel.className = 'set-select te-from'
      fromSel.appendChild(Object.assign(document.createElement('option'), { value: '', textContent: t('teFromPick') }))
      for (const th of Theming.list()) {
        const full = Theming.get(th.id)
        if (th.id === DRAFT || !full || !(full.kits || []).includes('moderno')) continue
        fromSel.appendChild(Object.assign(document.createElement('option'), { value: th.id, textContent: th.name }))
      }
      fromSel.addEventListener('change', () => {
        if (!fromSel.value) return
        const c = kit.colorsOf(Theming.get(fromSel.value), scene)
        Object.assign(spec, { colors: c.colors, font: c.font, textSize: c.textSize, radius: c.radius })
        autoOn = spec.colors.onAccent === kit.readableOn(spec.colors.accent)
        apply()
        build()
      })
      body.appendChild(field('teFrom', fromSel))
      const sec = (key) => { const h = document.createElement('div'); h.className = 'set-section'; body.appendChild(label(h, key)) }
      sec('teColors')
      for (const k of kit.COLOR_KEYS) {
        const inp = Object.assign(document.createElement('input'), { type: 'color', className: 'te-color', value: spec.colors[k] })
        inp.dataset.key = k
        const code = document.createElement('span')
        code.className = 'te-hex'
        code.textContent = k === 'onAccent' && autoOn ? `${spec.colors[k]} · ${t('teAuto')}` : spec.colors[k]
        const wrap = document.createElement('span')
        wrap.className = 'te-color-wrap'
        wrap.append(inp, code)
        inp.addEventListener('input', () => {
          spec.colors[k] = inp.value
          if (k === 'onAccent') autoOn = false
          if (k === 'accent' && autoOn) {
            spec.colors.onAccent = kit.readableOn(inp.value)
            const on = el.querySelector('.te-color[data-key="onAccent"]')
            if (on) { on.value = spec.colors.onAccent; on.nextElementSibling.textContent = `${spec.colors.onAccent} · ${t('teAuto')}` }
          }
          code.textContent = k === 'onAccent' && autoOn ? `${inp.value} · ${t('teAuto')}` : inp.value
          apply()
        })
        body.appendChild(field(`teColor_${k}`, wrap))
      }
      sec('teFont')
      const font = document.createElement('select')
      font.className = 'set-select te-font'
      for (const f of Object.keys(kit.FONTS)) font.appendChild(Object.assign(document.createElement('option'), { value: f, textContent: t(`teFont_${f}`), selected: f === spec.font }))
      font.addEventListener('change', () => { spec.font = font.value; apply() })
      body.appendChild(field('teFont', font))
      const range = (key, prop, min, max) => {
        const wrap = document.createElement('span')
        wrap.className = 'te-color-wrap'
        const inp = Object.assign(document.createElement('input'), { type: 'range', min, max, step: 1, value: spec[prop], className: `te-range te-${prop}` })
        const v = Object.assign(document.createElement('span'), { className: 'te-hex', textContent: `${spec[prop]} px` })
        inp.addEventListener('input', () => { spec[prop] = Number(inp.value); v.textContent = `${inp.value} px`; apply() })
        wrap.append(inp, v)
        body.appendChild(field(key, wrap))
      }
      range('teTextSize', 'textSize', 13, 18)
      range('teRadius', 'radius', 0, 16)
      const note = document.createElement('div')
      note.className = 'folder-note te-note'
      body.appendChild(label(note, 'teNote'))
      label(el.querySelector('.te-cancel'), 'teCancel')
      label(el.querySelector('.te-save'), 'teSave')
      el.querySelector('.te-cancel').addEventListener('click', () => closeThemeEditor(true))
      el.querySelector('.te-save').addEventListener('click', saveThemeEditor)
      el.addEventListener('keydown', (e) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); if (e.key === 'Escape') closeThemeEditor(true) })
    }
    build()
    document.body.appendChild(el)
    apply(true)
    await mount(DRAFT)
    el.querySelector('.te-name').focus()
  }
  async function saveThemeEditor() {
    if (!themeEditor) return
    const { spec, el } = themeEditor
    const r = await api.saveTheme(spec).catch((err) => ({ ok: false, error: err.message }))
    if (!r || !r.ok) {
      let n = el.querySelector('.te-error')
      if (!n) { n = document.createElement('div'); n.className = 'git-note error te-error'; el.querySelector('.te-body').prepend(n) }
      n.textContent = t('teSaveFail', { x: (r && r.error) || '?' })
      return
    }
    Theming.register(window.SkinsKits.moderno.fromColors(r.spec))
    closeThemeEditor(false)
    // Il processo principale lo mette in uso (misura della finestra, configurazione) e la pagina lo monta
    api.setTheme(r.spec.id)
  }
  function closeThemeEditor(restore) {
    if (!themeEditor) return
    const { el, prev } = themeEditor
    themeEditor = null
    el.remove()
    Theming.unregister(DRAFT)
    if (restore) mount(prev)
  }

  function closeThemes() {
    for (const el of document.querySelectorAll('.theme-picker')) el.remove()
  }

  // ------------------------------------------------------------------ file toccati

  // Il riepilogo dei file che Claude ha modificato nella conversazione, come il pannello dell'app desktop: un pulsante
  // "N file · +a −r" (in data-part="files") apre l'elenco, con le righe per file e le differenze di ogni modifica,
  // e i pulsanti per aprire il file o mostrarlo nella sua cartella. Vale per le modifiche viste nella conversazione
  // (anche nelle cronache riaperte); quelle fallite non contano
  function recordChange(id, change, added, removed) {
    if (!change || !change.file) return
    const key = change.file.replace(/\\/g, '/')
    if (!changed.has(key)) changed.set(key, new Map())
    changed.get(key).set(id, { change, added, removed })
    renderChanged()
  }
  function forgetChange(id) {
    for (const [file, recs] of changed) if (recs.delete(id) && !recs.size) changed.delete(file)
    renderChanged()
  }
  function changeTotals() {
    let added = 0
    let removed = 0
    for (const recs of changed.values()) for (const r of recs.values()) { added += r.added; removed += r.removed }
    return { files: changed.size, added, removed }
  }
  function renderChanged() {
    if (quiet) return
    const tot = changeTotals()
    for (const box of all('[data-part="files"]')) {
      let b = box.querySelector('.files-btn')
      if (!b) {
        b = document.createElement('button')
        b.className = 'files-btn'
        b.addEventListener('click', openChanged)
        box.appendChild(b)
      }
      b.hidden = !tot.files
      b.innerHTML = '<span class="fb-n"></span> <span class="plus"></span> <span class="minus"></span>'
      b.querySelector('.fb-n').textContent = t(tot.files === 1 ? 'filesOne' : 'filesMany', { n: tot.files })
      b.querySelector('.plus').textContent = `+${tot.added}`
      b.querySelector('.minus').textContent = `−${tot.removed}`
      b.title = t('filesTip')
    }
  }
  function openChanged() {
    closeThemes()
    closeFolderMenu()
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const panel = document.createElement('div')
    panel.className = 'theme-picker files-panel'
    panel.innerHTML = '<div class="theme-picker-box settings-box"><div class="theme-picker-head"><span></span><button class="btn small"></button></div><div class="settings-body files-body"></div></div>'
    const tot = changeTotals()
    label(panel.querySelector('.theme-picker-head span'), 'filesTitle', { n: tot.files, plus: tot.added, minus: tot.removed })
    const close = panel.querySelector('.theme-picker-head button')
    label(close, 'themesClose')
    close.addEventListener('click', closeThemes)
    panel.addEventListener('mousedown', (e) => { if (e.target === panel) closeThemes() })
    const body = panel.querySelector('.files-body')
    const conv = active && active.id
    const base = (convoDir || workdir || '').replace(/\\/g, '/').replace(/\/$/, '')
    for (const [file, recs] of changed) {
      const shown = base && file.toLowerCase().startsWith(base.toLowerCase() + '/') ? file.slice(base.length + 1) : file
      let added = 0
      let removed = 0
      let created = false
      for (const r of recs.values()) { added += r.added; removed += r.removed; if (r.change.created) created = true }
      const row = document.createElement('div')
      row.className = 'file-row'
      row.innerHTML = '<div class="fr-head"><span class="caret"></span><span class="fr-name"></span><span class="fr-dir"></span><span class="fr-new"></span><span class="fr-counts"><span class="plus"></span> <span class="minus"></span></span><span class="fr-actions"></span></div><div class="fr-diffs" hidden></div>'
      const parts = shown.split('/')
      row.querySelector('.fr-name').textContent = parts.pop()
      row.querySelector('.fr-dir').textContent = parts.join('/')
      if (created) label(row.querySelector('.fr-new'), 'filesNew')
      else row.querySelector('.fr-new').remove()
      row.querySelector('.plus').textContent = `+${added}`
      row.querySelector('.minus').textContent = `−${removed}`
      row.title = file
      const actions = row.querySelector('.fr-actions')
      for (const [key, fn] of [['filesOpen', api.openFile], ['filesReveal', api.revealFile]]) {
        if (!fn) continue
        const b = document.createElement('button')
        b.className = 'btn small deny'
        label(b, key)
        b.addEventListener('click', async (e) => {
          e.stopPropagation()
          const ok = await fn(file, conv)
          if (!ok) { label(b, 'filesMissing'); b.disabled = true }
        })
        actions.appendChild(b)
      }
      const diffs = row.querySelector('.fr-diffs')
      row.querySelector('.fr-head').addEventListener('click', () => {
        if (!diffs.children.length) for (const r of recs.values()) diffs.appendChild(changeView(r.change).box)
        diffs.hidden = !diffs.hidden
        row.classList.toggle('open', !diffs.hidden)
      })
      body.appendChild(row)
    }
    if (!changed.size) { const n = document.createElement('div'); n.className = 'folder-note'; body.appendChild(label(n, 'filesNone')) }
    host.appendChild(panel)
    renderReviews()
  }

  // ------------------------------------------------------------------ attività in background

  // I comandi lanciati in background, i sotto-agenti e i monitor di Claude: un pulsante "N in background" (in
  // data-part="tasks", con una rotella finché ce n'è uno in corso) apre il pannello con stato, durata, ultimo
  // strumento, il riassunto e i pulsanti per fermarle o aprirne l'uscita. "Manda in background" (anche Ctrl+B) sposta
  // in background quello che Claude sta facendo adesso, come nel terminale
  const elapsed = (t) => { const s = Math.max(0, Math.round(((t.ended || Date.now()) - t.started) / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s` }
  function renderTasks() {
    if (quiet) return
    const running = bgTasks.filter((t) => t.status === 'running').length
    for (const box of all('[data-part="tasks"]')) {
      let b = box.querySelector('.tasks-btn')
      if (!b) {
        b = document.createElement('button')
        b.className = 'tasks-btn'
        b.addEventListener('click', openTasks)
        box.appendChild(b)
      }
      b.hidden = !bgTasks.length
      b.classList.toggle('running', running > 0)
      b.innerHTML = '<span class="tb-spin"></span><span class="tb-text"></span>'
      b.querySelector('.tb-text').textContent = running ? t('tasksRunning', { n: running }) : t('tasksDone', { n: bgTasks.length })
      b.title = t('tasksTip')
    }
    const panel = document.querySelector('.tasks-panel')
    if (panel && panel.fill) panel.fill()
  }
  if (api.onTasks) api.onTasks((list) => { bgTasks = Array.isArray(list) ? list : []; renderTasks(); addPreviewUrls(bgTasks.filter((x) => x.status === 'running').flatMap((x) => x.urls || [])) })
  function openTasks() {
    closeThemes()
    closeFolderMenu()
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const panel = document.createElement('div')
    panel.className = 'theme-picker tasks-panel'
    panel.innerHTML = '<div class="theme-picker-box settings-box"><div class="theme-picker-head"><span></span><button class="btn small"></button></div><div class="settings-body"></div></div>'
    label(panel.querySelector('.theme-picker-head span'), 'tasksTitle')
    const close = panel.querySelector('.theme-picker-head button')
    label(close, 'themesClose')
    close.addEventListener('click', closeThemes)
    panel.addEventListener('mousedown', (e) => { if (e.target === panel) closeThemes() })
    const body = panel.querySelector('.settings-body')
    const conv = active && active.id
    panel.fill = () => {
      body.innerHTML = ''
      if (busy) {
        const r = document.createElement('div')
        r.className = 'set-row'
        r.innerHTML = '<div class="set-text"><div class="set-label"></div><div class="set-note"></div></div><div class="set-control"><button class="btn small deny"></button></div>'
        label(r.querySelector('.set-label'), 'tasksBackgroundNow')
        label(r.querySelector('.set-note'), 'tasksBackgroundNote')
        const b = r.querySelector('button')
        label(b, 'tasksBackgroundBtn')
        b.addEventListener('click', async () => { b.disabled = true; await api.backgroundNow(conv).catch(() => {}) })
        body.appendChild(r)
      }
      const list = [...bgTasks].sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1) || b.started - a.started)
      if (!list.length) { const n = document.createElement('div'); n.className = 'folder-note'; body.appendChild(label(n, 'tasksNone')) }
      for (const tk of list) {
        const r = document.createElement('div')
        r.className = `set-row task-row ${tk.status}`
        r.innerHTML = '<span class="ext-dot"></span><div class="set-text"><div class="set-label"></div><div class="set-note"></div></div><div class="set-control"></div>'
        r.querySelector('.ext-dot').classList.add(tk.status === 'running' ? 'pending' : tk.status === 'completed' ? 'connected' : tk.status === 'failed' ? 'failed' : 'disabled')
        r.querySelector('.set-label').textContent = tk.description || tk.id
        const kind = tk.type === 'local_agent' ? t('tasksAgent', { x: tk.agent || 'agente' }) : tk.type === 'monitor' ? t('tasksMonitor') : t('tasksShell')
        const bits = [kind, t(`taskStatus_${tk.status}`) || tk.status, elapsed(tk), tk.tools ? t('tasksTools', { n: tk.tools }) : '', tk.lastTool && tk.status === 'running' ? t('tasksLast', { x: tk.lastTool }) : '']
        r.querySelector('.set-note').textContent = bits.filter(Boolean).join(' · ') + (tk.summary ? `\n${tk.summary}` : '')
        const ctl = r.querySelector('.set-control')
        if (tk.status === 'running') {
          const b = document.createElement('button')
          b.className = 'btn small deny'
          label(b, 'tasksStop')
          b.addEventListener('click', async () => { b.disabled = true; await api.stopTask(tk.id, conv).catch(() => {}) })
          ctl.appendChild(b)
        }
        if (tk.output && api.openFile) {
          const b = document.createElement('button')
          b.className = 'btn small deny'
          label(b, 'tasksOutput')
          b.addEventListener('click', () => api.openFile(tk.output, conv))
          ctl.appendChild(b)
        }
        body.appendChild(r)
      }
    }
    panel.fill()
    host.appendChild(panel)
    // La durata delle attività in corso si aggiorna da sola
    const tick = setInterval(() => { if (!panel.isConnected) clearInterval(tick); else if (bgTasks.some((x) => x.status === 'running')) panel.fill() }, 1000)
  }

  // ------------------------------------------------------------------ git

  // Git nella cartella della conversazione, come nell'app desktop: un pulsante col branch (in data-part="git", o
  // accanto alla cartella se il tema non lo mette), con il conto dei file modificati e dei commit da mandare. Apre il
  // pannello con il branch (cambiarlo, crearne uno), le modifiche rispetto all'ultimo commit con le differenze, il
  // commit di tutto, il push e la pull request (con gh, o la pagina del sito nel browser). Per commit e pull request
  // si può anche chiedere a Claude, che scrive messaggio, titolo e descrizione guardando le differenze
  let gitSeq = 0
  async function refreshGit() {
    const c = active
    if (!c || !api.gitStatus) return
    const seq = ++gitSeq
    c.gitDir = convoDir || workdir
    let st = null
    try { st = await api.gitStatus(c.id) } catch {}
    if (seq !== gitSeq) return
    c.git = st && st.repo ? st : null
    if (c === active) {
      renderGit()
      renderFolder()
      const panel = document.querySelector('.git-panel')
      if (panel && panel.fill) panel.fill()
    }
  }
  function gitBoxes() {
    const own = all('[data-part="git"]')
    return own.length ? own : all('[data-part="folder"]')
  }
  function renderGit() {
    if (quiet) return
    const st = active && active.git
    for (const box of gitBoxes()) {
      let b = box.querySelector('.git-btn')
      if (!b) {
        b = document.createElement('button')
        b.className = 'git-btn'
        b.addEventListener('click', openGit)
        box.appendChild(b)
      }
      b.hidden = !st
      if (!st) continue
      b.innerHTML = '<span class="gb-icon">⎇</span><span class="gb-name"></span><span class="gb-n"></span><span class="gb-up"></span>'
      // Il branch di una copia separata senza il suo prefisso (claude/)
      b.querySelector('.gb-name').textContent = st.detached ? 'HEAD' : st.worktree ? st.branch.replace(/^claude\//, '') : st.branch
      b.querySelector('.gb-n').textContent = st.files.length ? `· ${st.files.length}` : ''
      b.querySelector('.gb-up').textContent = st.ahead ? `↑${st.ahead}` : ''
      b.classList.toggle('dirty', st.files.length > 0)
      b.classList.toggle('worktree', !!st.worktree)
      b.title = t('gitTip', { branch: st.detached ? 'HEAD' : st.branch }) + (st.worktree ? `\n${t('wtTagTip', { x: st.worktree.path })}` : '')
    }
  }
  window.addEventListener('focus', () => refreshGit())

  function askClaude(key, vars) {
    closeThemes()
    const input = part('input')
    if (!input) return
    input.value = t(key, vars)
    sendMessage()
  }

  function openGit() {
    closeThemes()
    closeFolderMenu()
    const c = active
    if (!c || !c.git) return
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const panel = document.createElement('div')
    panel.className = 'theme-picker git-panel'
    panel.innerHTML = '<div class="theme-picker-box settings-box"><div class="theme-picker-head"><span></span><button class="btn small"></button></div><div class="settings-body"></div></div>'
    const close = panel.querySelector('.theme-picker-head button')
    label(close, 'themesClose')
    close.addEventListener('click', closeThemes)
    panel.addEventListener('mousedown', (e) => { if (e.target === panel) closeThemes() })
    const body = panel.querySelector('.settings-body')
    const conv = c.id
    // Quello che resta fra un ridisegno e l'altro: il messaggio scritto, i file aperti, l'esito dell'ultima azione
    let message = ''
    let note = null
    let working = false
    let newBranch = false
    let branchList = null
    let pr
    const openFiles = new Set()
    const btn = (key, fn, cls = 'deny', vars) => {
      const b = document.createElement('button')
      b.className = `btn small ${cls}`
      label(b, key, vars)
      b.disabled = working
      b.addEventListener('click', fn)
      return b
    }
    const section = (key, vars) => { const h = document.createElement('div'); h.className = 'set-section'; body.appendChild(label(h, key, vars)) }
    const row = (labelText, noteText) => {
      const r = document.createElement('div')
      r.className = 'set-row'
      r.innerHTML = '<div class="set-text"><div class="set-label"></div><div class="set-note"></div></div><div class="set-control"></div>'
      r.querySelector('.set-label').textContent = labelText
      if (noteText) r.querySelector('.set-note').textContent = noteText
      else r.querySelector('.set-note').remove()
      body.appendChild(r)
      return r.querySelector('.set-control')
    }
    // Un'azione: i pulsanti si spengono finché lavora, poi lo stato si rilegge e l'esito resta in cima
    async function act(fn) {
      working = true
      note = { text: t('gitWorking') }
      panel.fill()
      let r = null
      try { r = await fn() } catch (err) { r = { ok: false, error: err.message } }
      working = false
      if (r && r.ok === false && r.error) note = { text: r.error, error: true, compare: r.compare }
      else if (r && r.noGh) { note = { text: t('gitNoGh'), compare: r.compare }; if (r.compare) api.openLink(r.compare) }
      else note = { text: t('gitDone'), url: r && r.url }
      if (r && r.url) api.openLink(r.url)
      pr = undefined
      branchList = null
      await refreshGit()
      if (!document.contains(panel)) return
      panel.fill()
      return r
    }
    panel.fill = () => {
      const st = c.git
      if (!st) { closeThemes(); return }
      const ta = body.querySelector('.git-msg')
      if (ta) message = ta.value
      body.innerHTML = ''
      label(panel.querySelector('.theme-picker-head span'), 'gitTitle', { x: baseName(st.worktree ? st.worktree.main : st.root) })
      if (note) {
        const n = document.createElement('div')
        n.className = `git-note${note.error ? ' error' : ''}`
        n.textContent = note.text
        if (note.compare) n.appendChild(btn('gitCompareBtn', () => api.openLink(note.compare)))
        if (note.url) { const a = btn('gitOpenBtn', () => api.openLink(note.url)); n.appendChild(a) }
        body.appendChild(n)
      }

      // Il branch
      section('gitBranchSection')
      const branchName = st.detached ? t('gitDetached') : st.branch
      const upNote = st.noCommits ? t('gitNoCommits') : st.upstream ? t('gitUpstream', { ahead: st.ahead, behind: st.behind, up: st.upstream }) : st.remote ? t('gitNoUpstream') : t('gitNoRemote')
      const bc = row(branchName, upNote)
      bc.classList.add('git-branch')
      if (newBranch) {
        const input = document.createElement('input')
        input.className = 'git-input'
        input.placeholder = t('gitNewBranchPh')
        input.spellcheck = false
        const create = () => { const name = input.value.trim(); if (!name) return; newBranch = false; act(() => api.gitCheckout(conv, name, true)) }
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { e.stopPropagation(); newBranch = false; panel.fill() } })
        bc.append(input, btn('gitCreate', create, ''), btn('gitCancel', () => { newBranch = false; panel.fill() }))
        setTimeout(() => input.focus(), 0)
      } else {
        const sel = document.createElement('select')
        sel.className = 'git-select'
        sel.title = t('gitSwitch')
        sel.disabled = working
        const names = branchList || [st.branch]
        for (const n of names.includes(st.branch) || st.detached ? names : [st.branch, ...names]) {
          const o = document.createElement('option')
          o.value = n
          o.textContent = n
          if (n === st.branch && !st.detached) o.selected = true
          sel.appendChild(o)
        }
        sel.addEventListener('change', () => act(() => api.gitCheckout(conv, sel.value, false)))
        bc.append(sel, btn('gitNewBranch', () => { newBranch = true; panel.fill() }))
        if (!branchList) api.gitBranches(conv).then((list) => { if (Array.isArray(list) && list.length && !branchList) { branchList = list; panel.fill() } }).catch(() => {})
      }

      // La copia separata: unire nella cartella principale, eliminarla
      if (st.worktree) {
        const wt = st.worktree
        section('wtSection')
        const ctl = row(t('wtLabel', { repo: baseName(wt.main) }), t('wtNote', { base: wt.base, branch: wt.branch, x: wt.unmerged ? t('wtUnmerged', { n: wt.unmerged }) : t('wtMerged') }))
        if (wt.unmerged) ctl.appendChild(btn('wtMergeBtn', async () => {
          const r = await act(() => api.mergeWorktree(conv))
          if (r && r.ok) { note = { text: t(r.nothing ? 'wtNothing' : 'wtMergedOk', { base: wt.base }) }; panel.fill() }
        }, '', { base: wt.base }))
        const rm = async (force) => {
          const r = await act(() => api.removeWorktree(conv, force))
          if (r && r.needsForce) {
            const why = [r.dirty ? t('wtRemoveDirty') : '', r.unmerged ? t('wtRemoveUnmerged', { n: r.unmerged }) : ''].filter(Boolean).join(', ')
            note = { text: t('wtRemoveWarn', { x: why }), error: true, force: true }
            panel.fill()
          } else if (r && r.ok) {
            closeThemes()
            labelled('footnote', 'wtRemoved')
            if (r.branchKept) labelled('footnote', 'wtBranchKept', { branch: r.branchKept })
          }
        }
        ctl.appendChild(btn('wtRemoveBtn', () => rm(false)))
        if (note && note.force) {
          const n = body.querySelector('.git-note')
          if (n) n.appendChild(btn('wtRemoveForce', () => rm(true), 'deny'))
        }
      }

      // Le modifiche
      section('gitChangesSection', { n: st.totals.files, plus: st.totals.added, minus: st.totals.removed })
      if (!st.files.length) {
        const n = document.createElement('div')
        n.className = 'folder-note'
        label(n, 'gitClean')
        if (st.last) n.textContent += ' ' + t('gitLast', { x: `${st.last.hash} ${st.last.subject}` })
        body.appendChild(n)
      }
      const root = String(st.root || '').replace(/\\/g, '/')
      for (const f of st.files) {
        const r = document.createElement('div')
        r.className = 'file-row'
        r.innerHTML = '<div class="fr-head"><span class="caret"></span><span class="git-st"></span><span class="fr-name"></span><span class="fr-dir"></span><span class="fr-counts"><span class="plus"></span> <span class="minus"></span></span><span class="fr-actions"></span></div><div class="fr-diffs" hidden></div>'
        const parts = f.path.split('/')
        r.querySelector('.fr-name').textContent = parts.pop()
        r.querySelector('.fr-dir').textContent = parts.join('/')
        const badge = r.querySelector('.git-st')
        badge.textContent = f.status === '?' ? 'N' : f.status
        badge.classList.add(`s-${f.status === '?' ? 'N' : f.status}`)
        badge.title = t(`gitStatus_${f.status}`)
        if (f.binary) r.querySelector('.fr-counts').remove()
        else { r.querySelector('.plus').textContent = `+${f.added}`; r.querySelector('.minus').textContent = `−${f.removed}` }
        r.title = f.path
        const abs = `${root}/${f.path}`
        if (api.openFile && f.status !== 'D') {
          const b = btn('filesOpen', async (e) => { e.stopPropagation(); if (!(await api.openFile(abs, conv))) { label(b, 'filesMissing'); b.disabled = true } })
          b.disabled = false
          r.querySelector('.fr-actions').appendChild(b)
        }
        const diffs = r.querySelector('.fr-diffs')
        const show = async () => {
          if (!diffs.children.length) {
            const ch = await api.gitDiff(conv, f.path).catch(() => null)
            diffs.innerHTML = ''
            if (ch && ch.hunks) diffs.appendChild(changeView(ch).box)
          }
          diffs.hidden = false
          r.classList.add('open')
        }
        if (openFiles.has(f.path)) show()
        r.querySelector('.fr-head').addEventListener('click', () => {
          if (diffs.hidden) { openFiles.add(f.path); show() } else { openFiles.delete(f.path); diffs.hidden = true; r.classList.remove('open') }
        })
        body.appendChild(r)
      }

      // Il commit
      if (st.files.length) {
        section('gitCommitSection')
        const box = document.createElement('div')
        box.className = 'git-commit'
        const ta = document.createElement('textarea')
        ta.className = 'git-msg'
        ta.rows = 2
        ta.spellcheck = false
        ta.placeholder = t('gitCommitPh')
        ta.value = message
        ta.disabled = working
        const btns = document.createElement('div')
        btns.className = 'git-btns'
        const commit = (andPush) => { const m = ta.value.trim(); if (!m) { ta.focus(); return } ; message = ''; ta.value = ''; act(() => api.gitCommit(conv, m, andPush)) }
        ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(false) } })
        btns.append(btn('gitCommitBtn', () => commit(false), ''))
        if (st.remote) btns.append(btn('gitCommitPushBtn', () => commit(true)))
        btns.append(btn('gitAskCommitBtn', () => askClaude('gitAskCommit')))
        box.append(ta, btns)
        body.appendChild(box)
      }

      // Push e pull request
      if (st.remote && st.last && !st.detached) {
        section('gitPublishSection')
        if (!st.upstream || st.ahead) {
          const ctl = row(t('gitPushBtn'), st.upstream ? t('gitPushNote', { n: st.ahead, up: st.upstream }) : t('gitPushFirst', { branch: st.branch, remote: 'origin' }))
          ctl.appendChild(btn('gitPushBtn', () => act(() => api.gitPush(conv)), ''))
        }
        if (st.base && st.branch === st.base) {
          const n = document.createElement('div')
          n.className = 'folder-note'
          body.appendChild(label(n, 'gitOnBase', { base: st.base }))
        } else if (pr && pr.number) {
          const state = `${t(`gitPrState_${pr.state}`) || pr.state}${pr.isDraft ? ` · ${t('gitPrDraft')}` : ''}`
          const ctl = row(t('gitPrOpen', { n: pr.number, state }), pr.title)
          ctl.appendChild(btn('gitOpenBtn', () => api.openLink(pr.url)))
        } else {
          const ctl = row(t('gitPrBtn'), t('gitPrNote', { base: st.base || 'main' }))
          ctl.append(btn('gitPrBtn', () => act(() => api.gitPr(conv, {})), ''), btn('gitAskPrBtn', () => askClaude('gitAskPr', { branch: st.branch, base: st.base || 'main' })))
        }
        // La pull request già aperta di questo branch, se gh la conosce
        if (pr === undefined && st.gh && st.branch !== st.base) {
          pr = null
          api.gitPrInfo(conv).then((info) => { if (info && info.number) { pr = info; if (document.contains(panel)) panel.fill() } }).catch(() => {})
        }
      }
    }
    panel.fill()
    host.appendChild(panel)
    renderReviews()
    refreshGit()
  }

  // Il worktree della conversazione è pronto (o non si è potuto fare): la cartella diventa la copia
  if (api.onWorktree) api.onWorktree((r) => {
    if (r && r.ok) {
      convoDir = r.path
      labelled('footnote', 'wtCreated', { branch: r.branch })
      renderFolder()
      if (cur === active) refreshGit()
    } else if (r && r.error) labelled('error', 'wtFailed', { err: r.error })
  })
  if (api.settings) api.settings().then((st) => { worktreeOn = !!(st && st.worktree); renderFolder() }).catch(() => {})

  // ------------------------------------------------------------------ impostazioni

  // Il pannello delle impostazioni, sopra il layout come il selettore dei temi: aspetto, finestra, notifiche,
  // conversazioni, Claude Code, informazioni. Ogni scelta vale subito (la applica il processo principale)
  async function openSettings() {
    closeThemes()
    closeFolderMenu()
    let st = {}
    try { st = (await api.settings()) || {} } catch {}
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const panel = document.createElement('div')
    panel.className = 'theme-picker settings-panel'
    panel.innerHTML = '<div class="theme-picker-box settings-box"><div class="theme-picker-head"><span></span><button class="btn small"></button></div><div class="settings-body"></div></div>'
    label(panel.querySelector('.theme-picker-head span'), 'settingsTitle')
    const close = panel.querySelector('.theme-picker-head button')
    label(close, 'themesClose')
    close.addEventListener('click', closeThemes)
    panel.addEventListener('mousedown', (e) => { if (e.target === panel) closeThemes() })
    const body = panel.querySelector('.settings-body')
    const set = async (key, value) => { try { st = (await api.setSetting(key, value)) || st } catch {} ; render() }
    const section = (key) => { const h = document.createElement('div'); h.className = 'set-section'; body.appendChild(label(h, key)) }
    const row = (key, noteText) => {
      const r = document.createElement('div')
      r.className = 'set-row'
      r.innerHTML = '<div class="set-text"><div class="set-label"></div><div class="set-note"></div></div><div class="set-control"></div>'
      label(r.querySelector('.set-label'), key)
      if (noteText) r.querySelector('.set-note').textContent = noteText
      else r.querySelector('.set-note').remove()
      body.appendChild(r)
      return r.querySelector('.set-control')
    }
    const toggle = (ctl, on, fn) => {
      const b = document.createElement('button')
      b.className = 'set-switch' + (on ? ' on' : '')
      b.innerHTML = '<span class="switch"></span>'
      b.addEventListener('click', () => fn(!on))
      ctl.appendChild(b)
    }
    const button = (ctl, key, fn) => {
      const b = document.createElement('button')
      b.className = 'btn small deny'
      label(b, key)
      b.addEventListener('click', fn)
      ctl.appendChild(b)
    }
    const select = (ctl, options, value, fn) => {
      const s = document.createElement('select')
      s.className = 'set-select'
      for (const [v, text] of options) { const o = document.createElement('option'); o.value = v; o.textContent = text; s.appendChild(o) }
      s.value = value
      s.addEventListener('change', () => fn(s.value))
      ctl.appendChild(s)
    }
    function render() {
      body.innerHTML = ''
      // Aspetto
      section('setLook')
      button(row('setTheme', Theming.current.name), 'setChange', () => { closeThemes(); openThemes() })
      if (app.querySelector('[data-action="scene"]')) {
        select(row('setScene'), [['notte', t('setNight')], ['giorno', t('setDay')]], scene, (v) => { if (v !== scene) actions.scene() })
      }
      // Finestra
      section('setWindow')
      toggle(row('setOnTop'), st.onTop, (v) => set('onTop', v))
      toggle(row('setLogin', t('setLoginNote')), st.openAtLogin, (v) => set('openAtLogin', v))
      const pos = row('setPosition')
      button(pos, 'setCenter', () => set('center'))
      button(pos, 'setSize', () => set('resetSize'))
      // Notifiche
      section('setNotifications')
      toggle(row('setNotify', t('setNotifyNote')), st.notify, (v) => set('notify', v))
      // Conversazioni
      section('setConversations')
      button(row('setWorkdir', st.workdir || t('setWorkdirNone')), 'setChange', () => set('workdir'))
      toggle(row('setWorktree', t('setWorktreeNote')), st.worktree, (v) => { worktreeOn = v; set('worktree', v); renderFolder() })
      select(row('setMode'), MODES.map(([m, key]) => [m, t(key)]), mode, (v) => { chooseMode(v); st.mode = v })
      if (api.memoryFiles) button(row('setMemory', t('setMemoryNote')), 'setOpenPanel', () => { closeThemes(); openMemory() })
      if (api.permissions) button(row('setPermissions', t('setPermissionsNote')), 'setOpenPanel', () => { closeThemes(); openPermissions() })
      select(row('setModel'), [['', t('modelDefault')], ...models.filter((m) => m.value !== 'default').map((m) => [m.value, m.name])], model || '', (v) => {
        model = v || null
        const m = modelInfo()
        if (effort && m && !m.efforts.includes(effort)) effort = null
        api.setModel(model, effort, ultracode)
        renderModel()
        render()
      })
      const levels = (modelInfo() && modelInfo().efforts.length ? modelInfo().efforts : ['low', 'medium', 'high', 'xhigh', 'max'])
      select(row('effortTitle'), [['', t('effortAuto')], ...levels.map((l) => [l, t(`effort_${l}`)])], effort || '', (v) => { effort = v || null; api.setModel(model, effort, ultracode); renderModel() })
      toggle(row('ultracode', t('ultracodeDesc')), ultracode, (v) => { ultracode = v; api.setModel(model, effort, ultracode); renderModel(); render() })
      // Estensioni
      section('setExtensions')
      button(row('setExtRow', t('setExtNote')), 'setOpenPanel', () => { closeThemes(); openExtensions() })
      // Claude Code
      section('setClaude')
      const where = row('setClaudePath', `${st.claudePath || ''}${st.claudeFound ? (st.claudeVersion ? ` · ${st.claudeVersion}` : '') : ` · ${t('setClaudeMissing')}`}`)
      button(where, 'setChange', () => set('chooseClaude'))
      if (!st.claudeDefault) button(where, 'setReset', () => set('claudePath', ''))
      select(row('setEntrypoint', t('setEntrypointNote')), [['cli', t('setEntryCli')], ['claude-desktop', t('setEntryDesktop')]], st.entrypoint || 'cli', (v) => set('entrypoint', v))
      // Aggiornamenti
      section('updTitle')
      const u = updateState || {}
      const status = row('updStatus', updateText(u))
      if (u.state !== 'updating' && u.state !== 'unavailable') button(status, 'updCheck', async () => { updateState = await api.checkUpdate(); render() })
      if (u.state === 'available' && !u.dirty) {
        const b = document.createElement('button')
        b.className = 'btn small'
        label(b, 'updApply')
        b.addEventListener('click', () => { api.applyUpdate(); closeThemes() })
        status.appendChild(b)
      }
      if (u.state === 'available' && u.commits && u.commits.length) {
        const list = document.createElement('ul')
        list.className = 'upd-commits'
        for (const c of u.commits.slice(0, 10)) { const li = document.createElement('li'); li.textContent = c; list.appendChild(li) }
        body.appendChild(list)
      }
      // Da dove: solo se ci sono tutte e due le strade (l'app installata da un installer fatto col repo)
      if (Array.isArray(st.updateSources) && st.updateSources.length > 1) {
        select(row('updSource', t('updSourceNote')), st.updateSources.map((x) => [x, t(`updSource_${x}`)]), st.updateSource, async (v) => { await set('updateSource', v); try { updateState = await api.updateState() } catch {} ; render() })
      }
      toggle(row('updAuto', t(st.updateSource === 'github' ? 'updAutoNoteGithub' : 'updAutoNote')), st.autoUpdate !== false, (v) => set('autoUpdate', v))
      // Informazioni
      section('setAbout')
      row('setVersion', `${st.version || '?'}${st.installed ? '' : ` · ${t('setFromRepo')}`}`)
      row('setShortcut', `${st.shortcut || ''} · ${t('setShortcutNote')}`)
      row('setKeys', t('setKeysList'))
      button(row('setData', st.dataDir || ''), 'setOpen', () => set('openData'))
    }
    try { updateState = (await api.updateState()) || updateState } catch {}
    render()
    host.appendChild(panel)
    settingsRender = () => { if (panel.isConnected) render() }
  }
  if (api.onSettingsOpen) api.onSettingsOpen(() => openSettings())

  // ------------------------------------------------------------------ aggiornamenti

  // Lo stato dell'aggiornamento dal repo (vedi updater.js): una riga nelle impostazioni e un avviso nella finestra
  // quando c'è una novità o un aggiornamento in corso
  let updateState = null
  let settingsRender = null
  let bannerDismissed = 0
  function updateText(u) {
    if (!u || !u.state || u.state === 'idle') return t('updIdle')
    if (u.state === 'unavailable') return u.error || t('updUnavailable')
    if (u.state === 'checking') return t('updChecking')
    if (u.state === 'uptodate') return t('updUpToDate') + (u.checkedAt ? ` · ${formatWhen(u.checkedAt)}` : '')
    if (u.state === 'available') return u.version ? t('updAvailableVersion', { v: u.version }) : t('updAvailable', { n: u.count }) + (u.dirty ? ` · ${t('updDirty')}` : '')
    if (u.state === 'updating') return t(`updStep_${u.step || 'pull'}`, { v: u.version || '', p: u.percent || 0 })
    return `${t('updError')}: ${u.error || '?'}`
  }
  // L'avviso dell'avvio sicuro, al posto di quello degli aggiornamenti finché non lo si chiude
  let safeInfo = null
  function showSafe(info) {
    safeInfo = info && info.reason ? info : null
    renderUpdateBanner()
  }
  if (api.onSafeState) api.onSafeState(showSafe)
  function renderSafeBanner() {
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const b = document.createElement('div')
    b.className = 'update-banner safe-banner'
    b.innerHTML = '<span class="ub-icon"></span><span class="ub-text"></span>'
    b.querySelector('.ub-text').textContent = t(`safe_${safeInfo.reason}`, { x: safeInfo.themeName || safeInfo.theme || '', err: safeInfo.error || '?' })
    const btn = (key, fn, cls, vars) => { const x = document.createElement('button'); x.className = `btn small ${cls || ''}`; label(x, key, vars); x.addEventListener('click', fn); b.appendChild(x) }
    const close = () => { safeInfo = null; if (api.dismissSafe) api.dismissSafe(); renderUpdateBanner() }
    if (safeInfo.theme && api.retrySafeTheme) btn('safeRetry', () => { safeInfo = null; api.retrySafeTheme(); renderUpdateBanner() }, '', { x: safeInfo.themeName || safeInfo.theme })
    if (api.openErrorLog) btn('safeLog', () => api.openErrorLog(), 'deny')
    btn('safeOk', close, 'deny')
    host.appendChild(b)
  }
  function renderUpdateBanner() {
    for (const el of document.querySelectorAll('.update-banner')) el.remove()
    if (safeInfo) return renderSafeBanner()
    const u = updateState
    if (!u) return
    const show = u.state === 'updating' || (u.state === 'available' && !u.dirty && bannerDismissed !== (u.version || u.count)) || (u.state === 'error' && u.step === null)
    if (!show) return
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const b = document.createElement('div')
    b.className = `update-banner ${u.state}`
    b.innerHTML = '<span class="ub-icon"></span><span class="ub-text"></span>'
    b.querySelector('.ub-text').textContent = u.state === 'available' ? (u.version ? t('updBannerVersion', { v: u.version }) : t('updBanner', { n: u.count })) : updateText(u)
    const btn = (key, fn, cls) => { const x = document.createElement('button'); x.className = `btn small ${cls || ''}`; label(x, key); x.addEventListener('click', fn); b.appendChild(x) }
    if (u.state === 'available') {
      btn('updApply', () => api.applyUpdate())
      btn('updDetails', () => openSettings(), 'deny')
      btn('updLater', () => { bannerDismissed = u.version || u.count; renderUpdateBanner() }, 'deny')
    } else if (u.state === 'error') {
      btn('updDetails', () => openSettings(), 'deny')
      btn('updLater', () => { updateState = Object.assign({}, u, { step: undefined }); renderUpdateBanner() }, 'deny')
    }
    host.appendChild(b)
  }
  if (api.onUpdate) api.onUpdate((u) => { updateState = u; renderUpdateBanner(); if (settingsRender) settingsRender() })
  if (api.updateState) api.updateState().then((u) => { updateState = u; renderUpdateBanner() }).catch(() => {})

  // ------------------------------------------------------------------ estensioni: server MCP e plugin

  // Il pannello delle estensioni: i server MCP (stato, strumenti, da dove vengono; accendere, spegnere, riconnettere)
  // e i plugin (accesi, spenti, errori). Le risposte le dà Claude Code: quello della conversazione in vista se è acceso,
  // altrimenti uno temporaneo (qualche secondo)
  async function openExtensions() {
    closeThemes()
    closeFolderMenu()
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const panel = document.createElement('div')
    panel.className = 'theme-picker settings-panel ext-panel'
    panel.innerHTML = '<div class="theme-picker-box settings-box"><div class="theme-picker-head"><span></span><button class="btn small"></button></div><div class="settings-body"></div></div>'
    label(panel.querySelector('.theme-picker-head span'), 'extTitle')
    const close = panel.querySelector('.theme-picker-head button')
    label(close, 'themesClose')
    close.addEventListener('click', closeThemes)
    panel.addEventListener('mousedown', (e) => { if (e.target === panel) closeThemes() })
    const body = panel.querySelector('.settings-body')
    host.appendChild(panel)
    const note = (key, vars) => { const n = document.createElement('div'); n.className = 'folder-note'; body.appendChild(label(n, key, vars)); return n }
    async function load() {
      body.innerHTML = ''
      note('extLoading')
      let x = null
      try { x = await api.extensions() } catch {}
      if (!panel.isConnected) return
      body.innerHTML = ''
      if (!x || !x.ok) { note('extFailed', { err: (x && x.error) || '' }); }
      if (x) render(x)
    }
    const section = (key) => { const h = document.createElement('div'); h.className = 'set-section'; body.appendChild(label(h, key)) }
    const row = (name, noteText, dot) => {
      const r = document.createElement('div')
      r.className = 'set-row'
      r.innerHTML = '<span class="ext-dot"></span><div class="set-text"><div class="set-label"></div><div class="set-note"></div></div><div class="set-control"></div>'
      if (dot) r.querySelector('.ext-dot').classList.add(dot)
      else r.querySelector('.ext-dot').remove()
      r.querySelector('.set-label').textContent = name
      if (noteText) r.querySelector('.set-note').textContent = noteText
      else r.querySelector('.set-note').remove()
      body.appendChild(r)
      return r.querySelector('.set-control')
    }
    const toggle = (ctl, on, fn) => {
      const b = document.createElement('button')
      b.className = 'set-switch' + (on ? ' on' : '')
      b.innerHTML = '<span class="switch"></span>'
      b.addEventListener('click', async () => {
        b.disabled = true
        const r = await fn(!on).catch((err) => ({ ok: false, error: err.message }))
        if (r && r.ok === false) { const n = document.createElement('div'); n.className = 'ext-error'; n.textContent = r.error || '?'; ctl.closest('.set-row').after(n) }
        load()
      })
      ctl.appendChild(b)
    }
    function render(x) {
      // Server MCP
      section('extMcp')
      if (!x.mcp.length) note('extMcpNone')
      for (const s of x.mcp) {
        const where = [s.source || s.scope, s.tools ? t('extTools', { n: s.tools }) : '', s.error].filter(Boolean).join(' · ')
        const ctl = row(s.name, `${t(`extStatus_${s.status}`)}${where ? ` · ${where}` : ''}`, s.status)
        if (s.status === 'failed' || s.status === 'needs-auth') {
          const b = document.createElement('button')
          b.className = 'btn small deny'
          label(b, 'extReconnect')
          b.addEventListener('click', async () => { b.disabled = true; await api.reconnectMcp(s.name).catch(() => {}); load() })
          ctl.appendChild(b)
        }
        if (s.source !== 'sdk') toggle(ctl, s.status !== 'disabled', (on) => api.toggleMcp(s.name, on))
      }
      // Plugin: quelli caricati, quelli spenti nelle impostazioni, quelli accesi che non si sono caricati
      section('extPlugins')
      const enabled = x.enabled || {}
      const keyOf = (name) => Object.keys(enabled).find((k) => k.split('@')[0] === name) || null
      const seen = new Set()
      const rows = []
      for (const p of x.plugins) { const k = keyOf(p.name); if (k) seen.add(k); rows.push({ name: p.name, key: k, on: true, note: [p.version && `v${p.version}`, k && k.includes('@') ? k.split('@')[1] : p.source].filter(Boolean).join(' · ') }) }
      for (const [k, v] of Object.entries(enabled)) {
        if (seen.has(k)) continue
        const err = x.errors.find((e) => e.plugin === k || e.plugin.split('@')[0] === k.split('@')[0])
        rows.push({ name: k.split('@')[0], key: k, on: !!v, note: [k.split('@')[1], v && (err ? err.message : t('extNotLoaded'))].filter(Boolean).join(' · ') })
      }
      if (!rows.length) note('extPluginsNone')
      for (const r of rows) {
        const ctl = row(r.name, r.note, r.on ? 'connected' : 'disabled')
        if (r.key) toggle(ctl, r.on, (on) => api.togglePlugin(r.key, on))
      }
      for (const e of x.errors) if (!rows.some((r) => r.key === e.plugin)) { const n = document.createElement('div'); n.className = 'ext-error'; n.textContent = `${e.plugin}: ${e.message}`; body.appendChild(n) }
      note('extHowTo')
    }
    load()
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
  // Monta un tema; se non ci riesce (un errore, o un layout senza conversazione o casella) torna a quello di
  // partenza e lo dice al processo principale, che lo ricorda e mostra l'avviso dell'avvio sicuro
  async function mount(id) {
    try {
      await mountTheme(id)
      if (!part('log') || !part('input')) throw new Error('il layout non ha la conversazione o la casella (data-part="log" e "input")')
    } catch (err) {
      const failed = Theming.current.id || id
      console.error(`Tema ${failed} non montato:`, err)
      if (api.logError) api.logError(`tema ${failed}: ${(err && err.stack) || err}`)
      const fallback = (Theming.list()[0] || {}).id
      if (!fallback || fallback === failed) return
      if (api.themeFailed) api.themeFailed(failed, (err && err.message) || String(err))
      await mountTheme(fallback)
    }
  }
  // I temi che seguono Windows (followSystem): la scena è chiara o scura come il sistema, e cambia con lui
  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
  const systemScene = () => (darkQuery && !darkQuery.matches ? 'giorno' : 'notte')
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => {
    if (!Theming.current.followSystem) return
    scene = systemScene()
    paint()
    hook('scene', scene)
  })
  async function mountTheme(id) {
    closeMenu()
    const convEls = [...convs.values()].map((c) => c.el)
    const draft = part('input') ? part('input').value : ''
    if (app.children.length) hook('unmount')
    const theme = await Theming.use(id)
    if (theme.followSystem) scene = systemScene()
    app.innerHTML = theme.layout || '<div data-solid style="background:#000;color:#fff;padding:20px">Questo tema non ha un layout.</div>'
    addEdges()
    const log = part('log')
    if (log) for (const el of convEls) log.appendChild(el)
    watchLog()
    if (part('input')) part('input').value = draft
    setBusy(busy)
    setWindowState(winMode)
    renderModes()
    renderFolder()
    renderAttachments()
    renderTodos()
    renderModel()
    renderContext()
    renderChanged()
    renderTasks()
    renderGhost()
    renderUpdateBanner()
    renderChapterHead()
    renderDictate()
    renderGit()
    // L'anteprima aperta resta aperta col tema nuovo
    if (preview && !preview.hidden) { preview = null; openPreview(previewUrl) } else preview = null
    renderPreviewBtn()
    paint()
    scrollDown(true)
    if (sessionsPinned()) refreshSessions()
    api.setTrayIcon(Theming.trayIcon(Theming.palette('notte')))
    if (api.setAppIcon) api.setAppIcon(Theming.appIcon(Theming.palette('notte')))
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
    if (change.file) box.dataset.file = change.file
    const notes = []
    if (change.created) notes.push('diffNew')
    if (change.whole) notes.push('diffWhole')
    if (change.then) notes.push('diffThen')
    if (change.hunks.some((h) => h.all)) notes.push('diffAll')
    if (change.tooBig) notes.push('diffTooBig')
    if (change.binary) notes.push('gitBinary')
    if (change.deleted) notes.push('gitDeleted')
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
      // Le righe vere si possono commentare (il "+" compare passandoci sopra)
      if (change.file && (cls === 'add' || cls === 'del' || cls === 'ctx')) {
        d.dataset.ln = ln
        d.dataset.side = cls === 'add' ? '+' : cls === 'del' ? '-' : ' '
        d.rawLine = text
        const cm = document.createElement('button')
        cm.className = 'dl-cm'
        cm.textContent = '+'
        cm.title = t('reviewAddTip')
        d.prepend(cm)
      }
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
    // I commenti non ancora mandati su queste righe
    if (change.file) for (const r of reviews) if (r.file === change.file) {
      const d = [...body.children].find((x) => x.dataset.ln === r.line && x.dataset.side === r.side && x.rawLine === r.code)
      if (d) d.after(reviewCard(r))
    }
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
    setWorking(on)
    if (quiet) return
    for (const el of all('[data-action="send"]')) el.hidden = on
    for (const el of all('[data-action="stop"]')) el.hidden = !on
    for (const el of all('[data-part="hint"]')) el.textContent = t(on ? 'busyHint' : 'hint')
    document.body.classList.toggle('busy', on)
    // Dopo, così l'aggancio può cambiare anche il suggerimento
    if (changed) hook('busy', on)
  }

  // ------------------------------------------------------------------ "sta lavorando"

  // Mentre Claude lavora, in fondo alla conversazione una riga con un verbo a caso, i puntini che si animano e i
  // secondi, come il "Clauding…" di Claude Code. I verbi vengono dal tema (workingVerbs, separati da |)
  const WORKING_START = new WeakMap()
  function setWorking(on) {
    const log = logEl()
    if (!log) return
    let w = [...log.children].find((x) => x.classList.contains('working'))
    if (!on) { if (w) w.remove(); return }
    if (w) { log.appendChild(w); return }
    w = document.createElement('div')
    w.className = 'item working'
    w.innerHTML = '<span class="w-spin"></span><span class="w-verb"></span><span class="w-dots"><i></i><i></i><i></i></span><span class="w-time"></span><span class="w-esc"></span>'
    label(w.querySelector('.w-esc'), 'workingEsc')
    const verbs = t('workingVerbs').split('|').map((x) => x.trim()).filter(Boolean)
    w.dataset.verb = String(Math.floor(Math.random() * Math.max(1, verbs.length)))
    w.querySelector('.w-verb').textContent = verbs[Number(w.dataset.verb)] || ''
    WORKING_START.set(w, Date.now())
    log.appendChild(w)
    scrollDown()
  }
  // I secondi, e ogni tanto un verbo nuovo
  setInterval(() => {
    for (const w of document.querySelectorAll('.item.working')) {
      const s = Math.floor((Date.now() - (WORKING_START.get(w) || Date.now())) / 1000)
      w.querySelector('.w-time').textContent = s >= 2 ? `${s} s` : ''
      if (s > 0 && s % 12 === 0) {
        const verbs = t('workingVerbs').split('|').map((x) => x.trim()).filter(Boolean)
        if (verbs.length > 1) w.querySelector('.w-verb').textContent = verbs[Math.floor(Math.random() * verbs.length)]
      }
    }
  }, 1000)

  // ------------------------------------------------------------------ risposte suggerite

  // Dopo una risposta Claude Code prevede il prossimo messaggio (prompt_suggestion): un pulsante sotto la risposta lo
  // manda con un clic, e nella penna vuota compare in grigio; Tab lo scrive nella penna, da correggere o spedire
  function renderGhost() {
    if (quiet) return
    const input = part('input')
    if (!input) return
    input.placeholder = suggestion ? `${suggestion}   ⇥ Tab` : t(input.dataset.sPlaceholder || 'placeholder')
    input.classList.toggle('has-suggestion', !!suggestion)
  }
  function clearSuggestion() {
    suggestion = ''
    for (const el of [...logEl().querySelectorAll(':scope > .item.suggestions')]) el.remove()
    renderGhost()
  }
  function useSuggestion(text, send) {
    const input = part('input')
    if (!input) return
    input.value = text
    input.focus()
    autoGrow(input)
    if (send) sendMessage()
  }
  if (api.onSuggestion) api.onSuggestion((text) => {
    clearSuggestion()
    if (!text) return
    suggestion = text
    const row = add('suggestions', '')
    const b = document.createElement('button')
    b.className = 'suggestion-chip'
    b.textContent = text
    b.title = t('suggestionTip')
    b.addEventListener('click', () => { const c = convs.get(row.closest('.convo') && row.closest('.convo').dataset.conv); if (c && c !== active) return; useSuggestion(text, true) })
    row.appendChild(b)
    renderGhost()
  })

  // ------------------------------------------------------------------ la penna: markdown come nell'app desktop

  // Liste che continuano da sole (Maiusc+Invio su una riga "- …" o "1. …" apre la voce dopo; su una voce vuota la
  // lista finisce), Tab e Maiusc+Tab per rientrare una voce, Ctrl+B e Ctrl+I per grassetto e corsivo. La penna
  // cresce col testo. Le modifiche passano da insertText, così Ctrl+Z le annulla
  const LIST = /^(\s*)([-*+]|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?(.*)$/
  function lineAt(input) {
    const v = input.value
    const start = v.lastIndexOf('\n', input.selectionStart - 1) + 1
    let end = v.indexOf('\n', input.selectionStart)
    if (end < 0) end = v.length
    return { start, end, text: v.slice(start, end) }
  }
  function insertText(input, text) {
    if (!document.execCommand('insertText', false, text)) {
      const a = input.selectionStart
      input.setRangeText(text, a, input.selectionEnd, 'end')
    }
    autoGrow(input)
  }
  // Toglie un pezzo di testo (anche questo annullabile con Ctrl+Z)
  function removeRange(input, a, b) {
    if (a === b) return
    input.setSelectionRange(a, b)
    if (!document.execCommand('delete')) input.setRangeText('', a, b, 'end')
    autoGrow(input)
  }
  function autoGrow(input) {
    if (!input) return
    if (!input.dataset.baseHeight) input.dataset.baseHeight = String(input.offsetHeight || 52)
    const base = Number(input.dataset.baseHeight)
    input.style.height = ''
    if (input.scrollHeight > base + 2) input.style.height = `${Math.min(input.scrollHeight + 2, Math.max(base, window.innerHeight * 0.35))}px`
  }
  function composerKey(e, input) {
    // Tab con la penna vuota e una risposta suggerita: la scrive
    if (e.key === 'Tab' && !e.shiftKey && !input.value && suggestion) { e.preventDefault(); useSuggestion(suggestion, false); return true }
    const line = lineAt(input)
    const m = LIST.exec(line.text)
    if (e.key === 'Enter' && e.shiftKey && m && input.selectionStart === input.selectionEnd) {
      e.preventDefault()
      const [, indent, marker, num, sep, space, check, body] = m
      if (!body.trim() && !check) {
        // Voce vuota: la lista finisce (si toglie il segno)
        removeRange(input, line.start, line.end)
        return true
      }
      const next = num ? `${Number(num) + 1}${sep}` : marker
      insertText(input, `\n${indent}${next}${space}${check ? '[ ] ' : ''}`)
      return true
    }
    if (e.key === 'Tab' && m && input.selectionStart === input.selectionEnd) {
      e.preventDefault()
      const pos = input.selectionStart
      input.setSelectionRange(line.start, line.start)
      if (e.shiftKey) {
        const cut = Math.min(2, m[1].length)
        if (!cut) { input.setSelectionRange(pos, pos); return true }
        removeRange(input, line.start, line.start + cut)
        input.setSelectionRange(pos - cut, pos - cut)
      } else {
        insertText(input, '  ')
        input.setSelectionRange(pos + 2, pos + 2)
      }
      return true
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'b' || e.key === 'i')) {
      e.preventDefault()
      const mark = e.key === 'b' ? '**' : '*'
      const a = input.selectionStart
      const b = input.selectionEnd
      const sel = input.value.slice(a, b)
      insertText(input, `${mark}${sel}${mark}`)
      if (!sel) input.setSelectionRange(a + mark.length, a + mark.length)
      return true
    }
    return false
  }
  document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('[data-part="input"]')) autoGrow(e.target) })

  function sendMessage() {
    const input = part('input')
    const typed = input ? input.value.trim() : ''
    // I commenti sulle differenze partono con il messaggio (non con un comando)
    const notes = typed.startsWith('/') ? [] : reviews
    const text = (typed + reviewBlock(notes)).trim()
    if (!text && !attachments.length) return
    closeMenu()
    // Prima conversazione senza una cartella scelta: prima la cartella, poi il messaggio parte da sé
    const folderBtn = app.querySelector('[data-part="folder"] .folder-btn')
    if (folderBtn && !workdirChosen && !currentSession && !chapterHasMessages() && !text.startsWith('/')) {
      openFolderMenu(folderBtn, true)
      return
    }
    // /clear e /new: un nuovo capitolo, come il pulsante
    if (/^\/(clear|new)\s*$/i.test(text)) { input.value = ''; newChapter(); return }
    // /export: la conversazione in Markdown (quella di Claude Code chiederebbe dal terminale)
    if (/^\/export\s*$/i.test(text) && api.exportSession) { input.value = ''; exportSession(active && (active.sessionId || (currentSession && currentSession.id)), convoDir || workdir || null, (part('chapter-title') && part('chapter-title').textContent) || ''); return }
    // /memory: il pannello della memoria (quello di Claude Code apre un editor da terminale)
    if (/^\/memory\s*$/i.test(text) && api.memoryFiles) { input.value = ''; openMemory(); return }
    if (notes.length) clearReviews()
    input.value = ''
    input.style.height = ''
    clearSuggestion()
    // Chi spedisce vuole vedere il suo messaggio e la risposta: il log torna in fondo
    stick = true
    // Mentre Claude lavora il messaggio entra nel turno in corso: la risposta continua sotto di lui
    if (busy) renderReply()
    reply = null
    const sent = attachments
    attachments = []
    renderAttachments()
    const images = sent.filter((a) => a.kind === 'image')
    const files = sent.filter((a) => a.kind === 'file').map((a) => a.path)
    const you = entry('you')
    if (busy) you.classList.add('queued')
    // L'id del messaggio: con questo si può modificare dopo
    const uuid = newUuid()
    you.dataset.uuid = uuid
    fillYou(you, text, images.map((a) => a.url), files)
    renderFolder()
    setBusy(true)
    api.send({ text, uuid, images: images.map((a) => ({ mediaType: a.mediaType, data: a.data })), files }, active && active.id)
  }
  function newUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID()
    const h = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
  }

  // ------------------------------------------------------------------ memoria

  // I CLAUDE.md che Claude legge all'avvio di ogni conversazione: personale, del progetto, solo tuo nel progetto, e
  // quelli delle cartelle sopra. Una scheda per file, un editor con l'anteprima del markdown; Ctrl+S salva. Le
  // modifiche non salvate restano finché l'app è aperta (anche chiudendo il pannello)
  const memDrafts = new Map()
  let memCurrent = ''
  async function openMemory() {
    closeThemes()
    closeFolderMenu()
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const panel = document.createElement('div')
    panel.className = 'theme-picker mem-panel'
    panel.innerHTML = '<div class="theme-picker-box settings-box"><div class="theme-picker-head"><span></span><button class="btn small"></button></div><div class="perm-tabs"></div><div class="mem-body"></div></div>'
    label(panel.querySelector('.theme-picker-head span'), 'memTitle')
    const close = panel.querySelector('.theme-picker-head button')
    label(close, 'themesClose')
    close.addEventListener('click', closeThemes)
    panel.addEventListener('mousedown', (e) => { if (e.target === panel) closeThemes() })
    const tabs = panel.querySelector('.perm-tabs')
    const body = panel.querySelector('.mem-body')
    const conv = active && active.id
    let files = []
    try { files = ((await api.memoryFiles(conv)) || {}).files || [] } catch {}
    const saved = new Map()
    let note = null
    let previewing = false
    const nameOf = (f) => t(`memFile_${f.id}`, { x: f.dir || '' })
    const show = async (file) => {
      memCurrent = file
      const f = files.find((x) => x.file === file) || files[0]
      if (!f) return
      if (!saved.has(f.file)) {
        const r = await api.readMemory(conv, f.file).catch((err) => ({ ok: false, error: err.message }))
        saved.set(f.file, r && r.ok ? r.text : null)
        if (!r || !r.ok) note = { text: (r && r.error) || '?', error: true }
      }
      fill()
    }
    const fill = () => {
      const f = files.find((x) => x.file === memCurrent) || files[0]
      tabs.innerHTML = ''
      for (const x of files) {
        const b = document.createElement('button')
        const dirty = memDrafts.has(x.file) && memDrafts.get(x.file) !== saved.get(x.file)
        b.className = `perm-tab${x === f ? ' on' : ''}${x.exists ? '' : ' missing'}`
        b.textContent = nameOf(x) + (dirty ? ' •' : '')
        b.title = x.file
        b.addEventListener('click', () => { note = null; show(x.file) })
        tabs.appendChild(b)
      }
      body.innerHTML = ''
      if (!f) return
      if (note) {
        const n = document.createElement('div')
        n.className = `git-note${note.error ? ' error' : ''}`
        n.textContent = note.text
        body.appendChild(n)
      }
      const info = document.createElement('div')
      info.className = 'folder-note perm-file'
      info.textContent = t(`memNote_${f.id}`, { x: f.file }) + (f.exists ? '' : ` ${t('memNew')}`)
      body.appendChild(info)
      if (files.length === 1) { const n = document.createElement('div'); n.className = 'folder-note perm-file'; body.appendChild(label(n, 'memNoProject')) }
      const orig = saved.get(f.file)
      if (orig === null) return
      const text = memDrafts.has(f.file) ? memDrafts.get(f.file) : orig
      const area = document.createElement('textarea')
      area.className = 'mem-text'
      area.spellcheck = false
      area.placeholder = t('memPlaceholder')
      area.value = text
      area.hidden = previewing
      const view = document.createElement('div')
      view.className = 'mem-view text'
      view.hidden = !previewing
      if (previewing) view.innerHTML = Markdown.render(text || '')
      const row = document.createElement('div')
      row.className = 'mem-row'
      row.innerHTML = '<span class="mem-state"></span><span class="sp"></span>'
      const state = row.querySelector('.mem-state')
      const mkBtn = (key, fn, cls = 'deny') => { const b = document.createElement('button'); b.className = `btn small ${cls}`; label(b, key); b.addEventListener('click', fn); row.appendChild(b); return b }
      const save = async () => {
        const v = area.value
        const r = await api.writeMemory(conv, f.file, v).catch((err) => ({ ok: false, error: err.message }))
        if (r && r.ok) { saved.set(f.file, v); memDrafts.delete(f.file); f.exists = true; note = { text: t('memSaved') } } else note = { text: (r && r.error) || '?', error: true }
        fill()
      }
      const revertB = mkBtn('memRevert', () => { memDrafts.delete(f.file); note = null; fill() })
      mkBtn(previewing ? 'memEdit' : 'memPreview', () => { previewing = !previewing; fill() })
      if (api.openMemory) mkBtn('memOpen', async () => { await api.openMemory(conv, f.file); f.exists = true })
      const saveB = mkBtn('memSave', save, '')
      const dirtyNow = () => area.value !== orig
      const update = () => {
        const d = dirtyNow()
        if (d) memDrafts.set(f.file, area.value); else memDrafts.delete(f.file)
        state.textContent = d ? t('memDirty') : ''
        saveB.disabled = !d
        revertB.disabled = !d
        const tab = tabs.querySelector('.perm-tab.on')
        if (tab) tab.textContent = nameOf(f) + (d ? ' •' : '')
      }
      area.addEventListener('input', update)
      area.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirtyNow()) save(); return }
        if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
        // Tab scrive un rientro invece di passare al pulsante dopo
        if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end'); update() }
      })
      body.append(area, view, row)
      update()
      if (!previewing) area.focus()
    }
    host.appendChild(panel)
    await show(files.some((x) => x.file === memCurrent) ? memCurrent : ((files.find((x) => x.id === 'project') || files[0] || {}).file))
  }

  // ------------------------------------------------------------------ regole dei permessi

  // Le regole dei permessi di Claude Code, come nelle impostazioni dell'app desktop: tre posti (tutti i progetti,
  // questo progetto condiviso col repo, questo progetto solo per te), e in ognuno le liste "senza chiedere" (allow),
  // "chiede sempre" (ask), "mai" (deny) e le cartelle in più. Una regola si aggiunge, si toglie o si sposta in un'altra
  // lista; le conversazioni ripartono con le regole nuove al prossimo messaggio
  let permScope = 'local'
  async function openPermissions() {
    closeThemes()
    closeFolderMenu()
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const panel = document.createElement('div')
    panel.className = 'theme-picker perm-panel'
    panel.innerHTML = '<div class="theme-picker-box settings-box"><div class="theme-picker-head"><span></span><button class="btn small"></button></div><div class="perm-tabs"></div><div class="settings-body"></div></div>'
    label(panel.querySelector('.theme-picker-head span'), 'permTitle')
    const close = panel.querySelector('.theme-picker-head button')
    label(close, 'themesClose')
    close.addEventListener('click', closeThemes)
    panel.addEventListener('mousedown', (e) => { if (e.target === panel) closeThemes() })
    const tabs = panel.querySelector('.perm-tabs')
    const body = panel.querySelector('.settings-body')
    const conv = active && active.id
    let data = null
    let note = null
    const load = async () => { try { data = await api.permissions(conv) } catch { data = null } }
    const changeRule = async (op) => {
      const r = await api.changePermission(conv, permScope, op).catch((err) => ({ ok: false, error: err.message }))
      note = r && r.ok ? { text: t('permApplied') } : { text: (r && r.error) || '?', error: true }
      await load()
      fill()
    }
    const fill = () => {
      tabs.innerHTML = ''
      body.innerHTML = ''
      const scopes = (data && data.scopes) || []
      for (const sc of scopes) {
        const b = document.createElement('button')
        b.className = `perm-tab${sc.id === permScope ? ' on' : ''}`
        label(b, `permScope_${sc.id}`)
        const n = sc.allow.length + sc.ask.length + sc.deny.length
        if (n) { const c = document.createElement('span'); c.className = 'perm-count'; c.textContent = n; b.appendChild(c) }
        b.addEventListener('click', () => { permScope = sc.id; note = null; fill() })
        tabs.appendChild(b)
      }
      const sc = scopes.find((x) => x.id === permScope)
      if (!sc) return
      if (note) {
        const n = document.createElement('div')
        n.className = `git-note${note.error ? ' error' : ''}`
        n.textContent = note.text
        body.appendChild(n)
      }
      const head = document.createElement('div')
      head.className = 'folder-note perm-file'
      head.textContent = t(`permScopeNote_${sc.id}`, { x: sc.file })
      body.appendChild(head)
      if (sc.noProject) { const n = document.createElement('div'); n.className = 'folder-note'; body.appendChild(label(n, 'permNoProject')); return }
      if (sc.error) { const n = document.createElement('div'); n.className = 'git-note error'; n.textContent = t('permBroken', { x: sc.error }); body.appendChild(n); return }
      for (const list of ['allow', 'ask', 'deny', 'dirs']) {
        const sec = document.createElement('div')
        sec.className = `perm-list perm-${list}`
        sec.innerHTML = '<div class="perm-list-head"><span class="pl-title"></span><span class="pl-note"></span></div><div class="pl-rules"></div><div class="pl-add"><input spellcheck="false"><button class="btn small"></button></div>'
        label(sec.querySelector('.pl-title'), `permList_${list}`)
        label(sec.querySelector('.pl-note'), `permListNote_${list}`)
        const rules = sec.querySelector('.pl-rules')
        for (const rule of sc[list]) {
          const r = document.createElement('div')
          r.className = 'perm-rule'
          r.innerHTML = '<code></code><span class="sp"></span>'
          r.querySelector('code').textContent = rule
          if (list !== 'dirs') {
            const sel = document.createElement('select')
            sel.className = 'set-select perm-move'
            sel.title = t('permMoveTip')
            for (const l of ['allow', 'ask', 'deny']) { const o = document.createElement('option'); o.value = l; o.textContent = t(`permList_${l}`); if (l === list) o.selected = true; sel.appendChild(o) }
            sel.addEventListener('change', () => changeRule({ kind: 'move', list, to: sel.value, rule }))
            r.appendChild(sel)
          }
          const x = document.createElement('button')
          x.className = 'btn small deny'
          label(x, 'permRemove')
          x.addEventListener('click', () => changeRule({ kind: 'remove', list, rule }))
          r.appendChild(x)
          rules.appendChild(r)
        }
        if (!sc[list].length) { const n = document.createElement('div'); n.className = 'perm-none'; rules.appendChild(label(n, list === 'dirs' ? 'permNoneDirs' : 'permNone')) }
        const input = sec.querySelector('.pl-add input')
        input.className = 'git-input perm-input'
        input.placeholder = t(list === 'dirs' ? 'permAddDirPh' : `permAddPh_${list}`)
        const add = () => { const v = input.value.trim(); if (v) changeRule({ kind: 'add', list, rule: v }) }
        input.addEventListener('keydown', (e) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); if (e.key === 'Enter') add() })
        const ab = sec.querySelector('.pl-add button')
        label(ab, 'permAdd')
        ab.addEventListener('click', add)
        body.appendChild(sec)
      }
      const ex = document.createElement('div')
      ex.className = 'folder-note perm-examples'
      body.appendChild(label(ex, 'permExamples'))
    }
    await load()
    fill()
    host.appendChild(panel)
  }

  // ------------------------------------------------------------------ anteprima

  // Come l'app desktop: quando Claude avvia un server locale (npm run dev e simili) il suo indirizzo si riconosce
  // nell'uscita dei comandi, delle attività in background e nelle risposte; "Anteprima · localhost:5173" (nella
  // riga della penna, in data-part="preview-btn" o accanto alle attività) apre la pagina in un pannello accanto alla
  // conversazione (dentro data-part="preview" se il tema lo mette, altrimenti subito dopo il suo <main>), con la
  // barra dell'indirizzo, ricarica, apri nel browser e "Foto per Claude" (una foto del pannello allegata al prossimo
  // messaggio). I link a localhost nelle risposte si aprono lì (con Ctrl nel browser). Ctrl+Maiusc+P lo apre e chiude
  const LOCAL_URL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}(?:\/[^\s"'`<>()[\]{}\\]*)?/g
  const isLocal = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(u)
  const urlsIn = (text) => [...new Set((String(text || '').match(LOCAL_URL) || []).map((u) => u.replace('://0.0.0.0:', '://localhost:').replace(/[.,;:!?]+$/, '')))]
  const hostPort = (u) => { try { const x = new URL(u); return x.host + (x.pathname !== '/' ? x.pathname : '') } catch { return u } }
  let preview = null
  let previewUrl = ''
  function addPreviewUrls(urls) {
    const c = cur || active
    if (!c || !urls || !urls.length) return
    const list = (c.previewUrls || []).filter((u) => !urls.includes(u))
    c.previewUrls = [...urls.slice().reverse(), ...list].slice(0, 8)
    if (c === active) renderPreviewBtn()
  }
  function renderPreviewBtn() {
    if (quiet) return
    const urls = (active && active.previewUrls) || []
    const own = all('[data-part="preview-btn"]')
    for (const box of own.length ? own : all('[data-part="tasks"]')) {
      let b = box.querySelector('.preview-btn')
      if (!b) {
        b = document.createElement('button')
        b.className = 'preview-btn'
        b.addEventListener('click', () => openPreview((active && active.previewUrls || [])[0]))
        box.appendChild(b)
      }
      const u = urls[0]
      b.hidden = !u || (preview && !preview.hidden && previewUrl === u)
      if (!u) continue
      b.innerHTML = '<span class="pb-play"></span><span class="pb-text"></span>'
      b.querySelector('.pb-text').textContent = t('previewBtn', { x: hostPort(u) })
      b.title = t('previewTip', { x: u })
    }
  }
  function previewWidth(host) {
    let w = 0
    try { w = Number(localStorage.getItem('skins.previewWidth')) || 0 } catch {}
    // La conversazione accanto resta larga almeno 520 pixel
    const max = Math.max(320, host.clientWidth - 520)
    return Math.min(max, Math.max(300, w || Math.round(host.clientWidth * 0.4)))
  }
  function buildPreview() {
    const pane = document.createElement('div')
    pane.className = 'preview-pane'
    pane.innerHTML = '<div class="pv-grip"></div><div class="pv-bar"><button class="pv-btn pv-reload">↻</button><input class="pv-addr" spellcheck="false"><button class="pv-btn pv-shot"></button><button class="pv-btn pv-open">↗</button><button class="pv-btn pv-close">×</button></div><div class="pv-body"><iframe class="pv-frame" allow="clipboard-read; clipboard-write; fullscreen"></iframe><div class="pv-empty"></div></div>'
    const own = part('preview')
    const main = app.querySelector('main')
    if (own) own.appendChild(pane)
    else if (main) main.after(pane)
    else { pane.classList.add('floating'); (app.querySelector('[data-solid]') || app).appendChild(pane) }
    const frame = pane.querySelector('.pv-frame')
    const addr = pane.querySelector('.pv-addr')
    pane.querySelector('.pv-reload').title = t('previewReload')
    pane.querySelector('.pv-open').title = t('previewOpen')
    pane.querySelector('.pv-close').title = t('previewClose')
    label(pane.querySelector('.pv-shot'), 'previewShot')
    pane.querySelector('.pv-shot').title = t('previewShotTip')
    pane.querySelector('.pv-grip').title = t('previewGrip')
    addr.placeholder = t('previewAddress')
    label(pane.querySelector('.pv-empty'), 'previewEmpty')
    pane.querySelector('.pv-reload').addEventListener('click', () => { if (previewUrl) { frame.src = 'about:blank'; setTimeout(() => { frame.src = previewUrl }, 30) } })
    pane.querySelector('.pv-open').addEventListener('click', () => { if (previewUrl) api.openLink(previewUrl) })
    pane.querySelector('.pv-close').addEventListener('click', closePreview)
    pane.querySelector('.pv-shot').addEventListener('click', async () => {
      const r = frame.getBoundingClientRect()
      const data = previewUrl && api.capturePreview ? await api.capturePreview({ x: r.left, y: r.top, width: r.width, height: r.height }).catch(() => null) : null
      if (data) await addImage(data, 'image/png', `anteprima ${hostPort(previewUrl)}.png`)
      else labelled('error', 'previewShotFail')
    })
    addr.addEventListener('keydown', (e) => {
      // Le scorciatoie con Ctrl valgono anche da qui
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
      if (e.key !== 'Enter') return
      let v = addr.value.trim()
      if (!v) return
      if (/^\d{2,5}$/.test(v)) v = `http://localhost:${v}`
      else if (!/^https?:\/\//i.test(v)) v = `http://${v}`
      navigatePreview(v)
    })
    // Il bordo sinistro si trascina per cambiare la larghezza (l'iframe non deve rubare il mouse intanto)
    pane.querySelector('.pv-grip').addEventListener('mousedown', (e) => {
      e.preventDefault()
      const host = pane.parentElement
      const x0 = e.clientX
      const w0 = pane.offsetWidth
      pane.classList.add('dragging')
      const move = (ev) => { pane.style.width = `${Math.min(host.clientWidth - 360, Math.max(280, w0 + x0 - ev.clientX))}px` }
      const up = () => {
        pane.classList.remove('dragging')
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        try { localStorage.setItem('skins.previewWidth', String(pane.offsetWidth)) } catch {}
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    })
    pane.style.width = `${previewWidth(pane.parentElement)}px`
    return pane
  }
  function navigatePreview(url) {
    previewUrl = url || ''
    if (!preview) return
    preview.querySelector('.pv-addr').value = previewUrl
    const frame = preview.querySelector('.pv-frame')
    frame.hidden = !previewUrl
    preview.querySelector('.pv-empty').hidden = !!previewUrl
    if (previewUrl && frame.src !== previewUrl) frame.src = previewUrl
    renderPreviewBtn()
  }
  function openPreview(url) {
    if (!preview || !preview.isConnected) preview = buildPreview()
    preview.hidden = false
    document.body.classList.add('has-preview')
    navigatePreview(url || previewUrl || ((active && active.previewUrls) || [])[0] || '')
    if (!previewUrl) preview.querySelector('.pv-addr').focus()
    hook('preview', previewUrl)
  }
  function closePreview() {
    if (preview) { preview.hidden = true; preview.querySelector('.pv-frame').src = 'about:blank' }
    document.body.classList.remove('has-preview')
    renderPreviewBtn()
  }
  const togglePreview = () => (preview && preview.isConnected && !preview.hidden ? closePreview() : openPreview())

  // ------------------------------------------------------------------ commenti sulle differenze

  // Come nell'app desktop: passando su una riga di una differenza (nella conversazione, nei file modificati, in git)
  // compare un "+"; un clic apre un commento su quella riga. I commenti restano in attesa (etichette sopra la penna,
  // una barra nei pannelli) e partono con il prossimo messaggio, in un blocco <diff_comments> in fondo al testo che
  // Claude legge (file, riga, lato, codice, commento) e che qui torna una lista. Valgono per la conversazione in vista
  let reviewSeq = 0
  const REVIEW_INTRO = 'Commenti sulle righe delle modifiche: per ognuno il file, la riga (side "+" aggiunta, "-" tolta, " " invariata), il codice di quella riga e il commento.'
  const attr = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const unattr = (x) => String(x).replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  function reviewBlock(list) {
    if (!list.length) return ''
    const items = list.map((r) => `<comment file="${attr(r.file)}" line="${attr(r.line)}" side="${attr(r.side)}">\n<code>${r.code}</code>\n${r.text}\n</comment>`)
    return `\n\n<diff_comments>\n${REVIEW_INTRO}\n${items.join('\n')}\n</diff_comments>`
  }
  function parseReviews(block) {
    const out = []
    const re = /<comment file="([^"]*)" line="([^"]*)" side="([^"]*)">\n<code>([\s\S]*?)<\/code>\n([\s\S]*?)\n<\/comment>/g
    let m
    while ((m = re.exec(block))) out.push({ file: unattr(m[1]), line: unattr(m[2]), side: unattr(m[3]), code: m[4], text: m[5] })
    return out
  }
  // Il commento sotto la sua riga (o nella lista di un messaggio mandato, sent)
  function reviewCard(r, sent) {
    const card = document.createElement('div')
    card.className = `dl-note${sent ? ' sent' : ''}`
    if (r.id) card.dataset.review = r.id
    card.innerHTML = '<div class="dn-head"><span class="dn-where"></span><span class="sp"></span></div><div class="dn-code"></div><div class="dn-text"></div>'
    card.querySelector('.dn-where').textContent = sent ? `${r.file}${r.line ? `:${r.line}` : ''}` : t('reviewYours')
    card.querySelector('.dn-where').title = r.file
    if (sent && r.code.trim()) card.querySelector('.dn-code').textContent = `${r.side === '-' ? '−' : r.side === '+' ? '+' : ' '} ${r.code.trim()}`
    else card.querySelector('.dn-code').remove()
    card.querySelector('.dn-text').textContent = r.text
    if (!sent) {
      const x = document.createElement('button')
      x.className = 'btn small deny'
      label(x, 'reviewRemove')
      x.addEventListener('click', () => removeReview(r))
      card.querySelector('.dn-head').appendChild(x)
    }
    return card
  }
  function addReview(r) {
    r.id = `r${++reviewSeq}`
    reviews.push(r)
    renderReviews()
    return r
  }
  function removeReview(r) {
    reviews = reviews.filter((x) => x !== r)
    for (const el of document.querySelectorAll(`.dl-note[data-review="${r.id}"]`)) el.remove()
    renderReviews()
  }
  function clearReviews() {
    for (const r of reviews) for (const el of document.querySelectorAll(`.dl-note[data-review="${r.id}"]`)) el.remove()
    reviews = []
    renderReviews()
  }
  // Le etichette sopra la penna e la barra "Manda a Claude" nei pannelli dei file e di git
  function renderReviews() {
    if (quiet) return
    renderAttachments()
    for (const box of document.querySelectorAll('.files-panel .settings-box, .git-panel .settings-box')) {
      let bar = box.querySelector(':scope > .review-bar')
      if (!bar) {
        bar = document.createElement('div')
        bar.className = 'review-bar'
        bar.innerHTML = '<span class="rb-text"></span><button class="btn small deny rb-clear"></button><button class="btn small rb-send"></button>'
        label(bar.querySelector('.rb-clear'), 'reviewClear')
        label(bar.querySelector('.rb-send'), 'reviewSend')
        bar.querySelector('.rb-clear').addEventListener('click', clearReviews)
        bar.querySelector('.rb-send').addEventListener('click', () => { closeThemes(); sendMessage() })
        box.appendChild(bar)
      }
      bar.hidden = !reviews.length
      label(bar.querySelector('.rb-text'), reviews.length === 1 ? 'reviewOne' : 'reviewMany', { n: reviews.length })
    }
  }
  // Il riquadro per scrivere un commento, sotto la riga
  function openReviewEditor(d) {
    const box = d.closest('.diff')
    if (!box || !box.dataset.file) return
    const open = d.nextElementSibling
    if (open && open.classList.contains('dl-edit')) { open.querySelector('textarea').focus(); return }
    const ed = document.createElement('div')
    ed.className = 'dl-edit'
    ed.innerHTML = '<textarea rows="2" spellcheck="false"></textarea><div class="de-row"><span class="de-hint"></span><span class="sp"></span><button class="btn small deny de-cancel"></button><button class="btn small de-ok"></button></div>'
    const area = ed.querySelector('textarea')
    area.placeholder = t('reviewPlaceholder', { x: `${baseName(box.dataset.file)}${d.dataset.ln ? `:${d.dataset.ln}` : ''}` })
    label(ed.querySelector('.de-hint'), 'reviewHint')
    label(ed.querySelector('.de-cancel'), 'editCancel')
    label(ed.querySelector('.de-ok'), 'reviewAdd')
    const close = () => ed.remove()
    const ok = () => {
      const text = area.value.trim()
      if (!text) { area.focus(); return }
      const r = addReview({ file: box.dataset.file, line: d.dataset.ln || '', side: d.dataset.side || ' ', code: d.rawLine || '', text })
      ed.replaceWith(reviewCard(r))
    }
    ed.querySelector('.de-cancel').addEventListener('click', close)
    ed.querySelector('.de-ok').addEventListener('click', ok)
    area.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); close() } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ok() }
    })
    d.after(ed)
    // Una riga fra quelle nascoste dal "mostra tutto" resta visibile col suo commento
    area.focus()
  }
  document.addEventListener('click', (e) => {
    const cm = e.target.closest && e.target.closest('.dl-cm')
    if (cm) { e.preventDefault(); e.stopPropagation(); openReviewEditor(cm.parentElement) }
  }, true)

  // ------------------------------------------------------------------ modificare un messaggio

  // Come nell'app desktop: "Modifica" sotto un tuo messaggio lo riapre sul posto; spedito, la conversazione riparte
  // da lì (in una sessione nuova: la vecchia resta negli annali) e quello che veniva dopo sparisce. A scelta anche i
  // file tornano com'erano prima di quel messaggio
  function startEdit(d) {
    if (busy || !d.dataset.uuid || d.classList.contains('editing')) return
    const textEl = d.querySelector('.text')
    const box = d.querySelector('.sent-attachments')
    const images = box ? [...box.querySelectorAll('img')].map((i) => i.src) : []
    const files = box ? [...box.querySelectorAll('.attachment.file')].map((f) => f.title) : []
    const old = d.rawText || ''
    const block = d.reviewBlock || ''
    d.classList.add('editing')
    const editor = document.createElement('div')
    editor.className = 'edit-box'
    editor.innerHTML = '<textarea spellcheck="false"></textarea><div class="edit-row"><label class="edit-restore"><input type="checkbox"><span></span></label><span class="sp"></span><button class="btn small deny edit-cancel"></button><button class="btn small edit-send"></button></div>'
    const area = editor.querySelector('textarea')
    area.value = old
    label(editor.querySelector('.edit-restore span'), 'editRestore')
    label(editor.querySelector('.edit-cancel'), 'editCancel')
    label(editor.querySelector('.edit-send'), 'editSend')
    textEl.hidden = true
    textEl.after(editor)
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
    autoGrow(area)
    area.addEventListener('input', () => autoGrow(area))
    const cancel = () => { editor.remove(); textEl.hidden = false; d.classList.remove('editing') }
    const send = () => {
      const text = (area.value.trim() + block).trim()
      if (!text && !images.length && !files.length) return
      if (busy) return
      const restore = editor.querySelector('.edit-restore input').checked
      const oldUuid = d.dataset.uuid
      // Via questo messaggio e tutto quello che veniva dopo nella conversazione
      let n = d
      while (n) { const next = n.nextElementSibling; if (n.classList.contains('item')) n.remove(); n = next }
      tools.clear()
      // I file toccati: solo le modifiche rimaste nella conversazione
      changed = new Map()
      for (const r of logEl().querySelectorAll('.tool.has-change:not(.fail)')) if (r.changeRec) recordChange(r.changeRec.id, r.changeRec.change, r.changeRec.added, r.changeRec.removed)
      renderChanged()
      reply = null
      clearSuggestion()
      stick = true
      const you = entry('you')
      const uuid = newUuid()
      you.dataset.uuid = uuid
      fillYou(you, text, images, files)
      setBusy(true)
      const pics = images.map((u) => { const m = /^data:([^;]+);base64,(.*)$/.exec(u); return m ? { mediaType: m[1], data: m[2] } : null }).filter(Boolean)
      api.edit(oldUuid, { text, uuid, images: pics, files }, restore, active && active.id)
    }
    editor.querySelector('.edit-cancel').addEventListener('click', cancel)
    editor.querySelector('.edit-send').addEventListener('click', send)
    area.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); cancel() }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
    })
  }
  // L'esito del ripristino dei file
  if (api.onRewound) api.onRewound((r) => {
    if (!r) return
    if (r.ok) labelled('footnote', 'rewindOk', { n: r.files.length, plus: r.insertions, minus: r.deletions })
    else labelled('error', 'rewindFail', { err: r.error || '?' })
  })

  // Una domanda della persona nel log, con le miniature delle immagini e le etichette dei file. I file stanno anche
  // in fondo al testo, in <attached_files> (così li trova Claude): lì si tolgono e diventano etichette
  function fillYou(d, text, images = [], files = []) {
    const m = /\s*<attached_files>\n([\s\S]*?)\n?<\/attached_files>\s*$/.exec(text || '')
    if (m) {
      files = files.length ? files : m[1].split('\n').map((x) => x.trim()).filter(Boolean)
      text = text.slice(0, m.index)
    }
    const cm = /\s*<diff_comments>\n[\s\S]*?<\/diff_comments>\s*$/.exec(text || '')
    let comments = []
    d.reviewBlock = ''
    if (cm) {
      comments = parseReviews(cm[0])
      d.reviewBlock = `\n\n${cm[0].trim()}`
      text = text.slice(0, cm.index)
    }
    const el = d.querySelector('.text')
    el.textContent = ''
    if (comments.length) {
      const box = document.createElement('div')
      box.className = 'sent-comments'
      for (const r of comments) box.appendChild(reviewCard(r, true))
      el.appendChild(box)
    }
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
    d.rawText = text
    if (!d.querySelector('.entry-actions')) {
      const row = entryActions('copyMessage', () => d.rawText || '')
      if (!text) row.firstChild.remove()
      // Modifica: solo per i messaggi che hanno il loro id (quelli spediti da qui e quelli delle cronache)
      const b = document.createElement('button')
      b.className = 'copy-btn edit-btn'
      label(b, 'editMessage')
      b.addEventListener('click', (e) => { e.stopPropagation(); startEdit(d) })
      row.appendChild(b)
      d.appendChild(row)
    }
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
  // ------------------------------------------------------------------ dettatura

  // Il microfono accanto a "+" (o dove il tema mette data-action="dictate"): mette il cursore in fondo alla casella e
  // accende la digitazione vocale di Windows (Win+H), che scrive lì. Solo dove c'è (api.dictate)
  const MIC = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>'
  function renderDictate() {
    const own = all('[data-action="dictate"]')
    for (const b of own) { b.hidden = !api.dictate; if (!b.title) b.title = t('dictateTip') }
    if (own.length || !api.dictate) return
    for (const attach of all('[data-action="attach"]')) {
      if (attach.nextElementSibling && attach.nextElementSibling.classList.contains('dictate-btn')) continue
      const b = document.createElement('button')
      b.className = 'attach-btn dictate-btn'
      b.dataset.action = 'dictate'
      b.innerHTML = MIC
      b.title = t('dictateTip')
      attach.after(b)
    }
  }
  async function dictate() {
    const input = part('input')
    if (!input || !api.dictate) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
    const b = app.querySelector('.dictate-btn, [data-action="dictate"]')
    if (b) { b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 1500) }
    await api.dictate()
  }

  function renderAttachments() {
    const box = attachBox()
    if (!box) return
    box.innerHTML = ''
    box.hidden = !attachments.length && !reviews.length
    for (const r of reviews) {
      const chip = document.createElement('span')
      chip.className = 'attachment review'
      chip.innerHTML = '<span class="rv-icon"></span><span class="name"></span>'
      chip.querySelector('.name').textContent = `${baseName(r.file)}${r.line ? `:${r.line}` : ''}`
      chip.title = `${r.file}${r.line ? `:${r.line}` : ''}\n${r.text}`
      const x = document.createElement('button')
      x.className = 'attachment-remove'
      x.textContent = '×'
      x.title = t('reviewRemove')
      x.addEventListener('click', () => removeReview(r))
      chip.appendChild(x)
      box.appendChild(chip)
    }
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

  // ------------------------------------------------------------------ ragionamento

  // Il ragionamento di Claude (i riassunti che Claude Code manda), come nell'app desktop: mentre arriva un riquadro
  // aperto "Sta ragionando…" col testo che scorre; finito, si chiude in "Ha ragionato per N s" e si riapre con un clic
  let thinking = null
  let thinkingFrame = 0
  function thinkingBox(live) {
    const box = add(`thinking${live ? ' open live' : ''}`, '<div class="thinking-head"><span class="caret"></span><span class="th-text"></span></div><div class="thinking-body text"></div>')
    box.querySelector('.thinking-head').addEventListener('click', () => { if (!box.classList.contains('empty')) box.classList.toggle('open') })
    box.raw = ''
    return box
  }
  function renderThinking() {
    thinkingFrame = 0
    if (!thinking || !thinking.isConnected) return
    const body = thinking.querySelector('.thinking-body')
    body.innerHTML = markdown(thinking.raw)
    body.scrollTop = body.scrollHeight
  }
  function startThinking() {
    renderReply()
    reply = null
    thinking = thinkingBox(true)
    thinking.started = Date.now()
    label(thinking.querySelector('.th-text'), 'thinkingNow')
  }
  function endThinking() {
    if (!thinking) return
    renderThinking()
    const box = thinking
    thinking = null
    label(box.querySelector('.th-text'), 'thinkingDone', { s: Math.max(1, Math.round((Date.now() - box.started) / 1000)) })
    box.classList.remove('open', 'live')
    // Senza testo (il modello non manda i riassunti): resta solo la riga, che non si apre
    if (!box.raw.trim()) box.classList.add('empty')
  }
  if (api.onThinkingStart) {
    api.onThinkingStart(startThinking)
    api.onThinking((text) => {
      if (!thinking) startThinking()
      thinking.raw += text
      if (!thinkingFrame) { const c = cur; thinkingFrame = requestAnimationFrame(() => run(c, renderThinking)) }
    })
    api.onThinkingEnd(endThinking)
  }

  api.onDelta((d) => {
    endThinking()
    const r = startReply()
    // Una risposta che comincia dopo un ragionamento non parte con righe vuote
    if (!r.raw) d = d.replace(/^\s+/, '')
    r.raw += d
    if (!pending) { pending = true; const c = cur; requestAnimationFrame(() => run(c, renderReply)) }
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
      row.changeRec = { id, change, added: view.added, removed: view.removed }
      recordChange(id, change, view.added, view.removed)
      const item = add('change', '')
      item.appendChild(view.box)
      row.classList.add('has-change')
      row.addEventListener('click', () => { item.hidden = !item.hidden })
      scrollDown()
    }
    return row
  }

  function toolDone(id, error) {
    // Una modifica fallita non conta fra i file toccati
    if (error) forgetChange(id)
    const row = tools.get(id)
    if (!row) return
    row.classList.add(error ? 'fail' : 'done')
    row.dataset.statusKey = error ? 'toolFail' : 'toolOk'
    row.dataset.status = t(row.dataset.statusKey)
  }
  api.onToolDone(({ id, error, urls }) => { toolDone(id, error); addPreviewUrls(urls); hook('toolDone', { error: !!error }) })

  // La frase che riassume un gruppo di azioni (come nell'app desktop): le loro righe, con le differenze, vanno dentro
  // un gruppo chiuso sotto quella frase; un clic lo apre. Nel titolo, il conto delle righe cambiate
  api.onToolSummary(({ summary, ids }) => {
    const rows = (ids || []).map((id) => tools.get(id)).filter((r) => r && r.isConnected && r.parentElement === logEl())
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
    endThinking()
    renderReply()
    // Un indirizzo locale nella risposta ("il server è su http://localhost:5173")
    if (reply && reply.raw) addPreviewUrls(urlsIn(reply.raw))
    labelled('footnote', 'took', { s: Math.round((durationMs || 0) / 1000) })
    hook('done', { durationMs })
    reply = null
    setBusy(false)
    // Claude può aver cambiato file, fatto commit o cambiato branch
    if (cur === active) refreshGit()
    // Una conversazione nuova compare negli annali
    if (sessionsPinned()) refreshSessions()
  })
  api.onError((msg) => {
    endThinking()
    hook('error', String(msg))
    renderReply()
    add('error', esc(String(msg)))
    reply = null
    setBusy(false)
  })

  // Un capitolo nuovo è una conversazione nuova: quella di prima resta dov'è (e continua a lavorare, se lavora)
  async function newChapter() {
    const r = await api.newChapter()
    const n = r && typeof r === 'object' ? r.chapter : r
    const c = newConv((r && r.conv) || `local${Date.now()}`)
    c.chapter = n || chapter + 1
    c.convoDir = workdir
    switchTo(c)
    pruneEmpty()
    if (part('input')) part('input').focus()
  }

  // Il titolo del capitolo: "Capitolo" e la data vengono dal tema. Con una cronaca aperta il titolo è il suo
  function setChapter(n) {
    chapter = n || 1
    renderChapterHead()
  }
  function renderChapterHead() {
    if (quiet) return
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

  let asks = new Map()

  api.onAsk((q) => {
    renderReply()
    reply = null
    hook('ask', q)
    if (q.kind === 'plan') return askPlan(q)
    if (q.kind === 'question') return askQuestions(q)
    const owner = cur && cur.id
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
        api.answer(id, allow, always, undefined, owner)
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
    const owner = cur && cur.id
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
        api.answer(id, allow, false, undefined, owner)
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
    const owner = cur && cur.id
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
      api.answer(id, allow, false, a, owner)
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

  // Gli annali come la barra dell'app desktop: ricerca in cima, conversazioni raggruppate per giorno, un menu per
  // ciascuna (rinomina, archivia, elimina, anche col tasto destro) e in fondo le archiviate, nascoste finché non si
  // chiede di vederle. L'elenco si scarica una volta e la ricerca lo filtra sul posto
  let sessionsLoad = 0
  let sessionsCache = []
  let sessionsQuery = ''
  let showArchived = false
  async function refreshSessions() {
    const list = part('sessions-list')
    if (!list) return
    ensureSessionSearch()
    const mine = ++sessionsLoad
    if (!list.children.length) sessionNote(list, 'sessionsLoading')
    try {
      const sessions = await api.sessions()
      if (mine !== sessionsLoad || !list.isConnected) return
      sessionsCache = sessions
      renderSessionList()
    } catch (err) {
      list.innerHTML = `<div class="error">${esc(String(err.message || err))}</div>`
    }
  }

  // Il campo di ricerca: in data-part="sessions-search" se il tema lo mette, altrimenti subito sopra l'elenco
  function ensureSessionSearch() {
    const list = part('sessions-list')
    let input = app.querySelector('[data-part="sessions-search"]') || (list && list.parentElement.querySelector(':scope > .sessions-search'))
    if (!input && list) {
      input = document.createElement('input')
      input.className = 'sessions-search'
      list.before(input)
    }
    if (!input || input.dataset.ready) return
    input.dataset.ready = '1'
    input.type = 'search'
    input.spellcheck = false
    input.dataset.sPlaceholder = 'sessionsSearch'
    input.placeholder = t('sessionsSearch')
    input.value = sessionsQuery
    input.addEventListener('input', () => { sessionsQuery = input.value; renderSessionList() })
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; sessionsQuery = ''; renderSessionList() } })
  }

  // Oggi, ieri, ultimi 7 giorni, ultimi 30, più vecchie
  function sessionGroup(ms) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const t0 = today.getTime()
    const day = 86400000
    if (ms >= t0) return 'groupToday'
    if (ms >= t0 - day) return 'groupYesterday'
    if (ms >= t0 - 7 * day) return 'groupWeek'
    if (ms >= t0 - 30 * day) return 'groupMonth'
    return 'groupOlder'
  }
  // L'ora per oggi e ieri, altrimenti il giorno
  function shortWhen(ms) {
    const d = new Date(ms)
    const g = sessionGroup(ms)
    if (g === 'groupToday' || g === 'groupYesterday') return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`
  }
  const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  function renderSessionList() {
    const list = part('sessions-list')
    if (!list) return
    const q = fold(sessionsQuery.trim())
    const match = (s) => !q || fold(s.title).includes(q) || fold(s.cwd).includes(q) || fold(s.branch).includes(q)
    // Le fissate in cima, le archiviate tutte in fondo, ognuna sotto la sua testata
    const rank = (s) => (s.archived ? 2 : s.pinned ? 0 : 1)
    const visible = sessionsCache.filter((s) => (showArchived || !s.archived) && match(s)).sort((x, y) => rank(x) - rank(y))
    const archivedCount = sessionsCache.filter((s) => s.archived).length
    list.innerHTML = ''
    if (!sessionsCache.length) { sessionNote(list, 'sessionsEmpty', { dir: workdir || 'cartella di lavoro' }); return }
    if (!visible.length) sessionNote(list, 'sessionsNoMatch', { q: sessionsQuery.trim() })
    let group = null
    for (const s of visible) {
      const g = s.archived ? 'groupArchived' : s.pinned ? 'groupPinned' : sessionGroup(s.lastModified)
      if (g !== group) {
        group = g
        const h = document.createElement('div')
        h.className = 'session-group'
        list.appendChild(label(h, g))
      }
      list.appendChild(sessionRow(s))
    }
    if (archivedCount) {
      const more = document.createElement('button')
      more.className = 'sessions-archived'
      label(more, showArchived ? 'sessionsHideArchived' : 'sessionsArchived', { n: archivedCount })
      more.addEventListener('click', () => { showArchived = !showArchived; renderSessionList() })
      list.appendChild(more)
    }
    markCurrentSession()
  }

  function sessionRow(s) {
    const row = document.createElement('div')
    row.className = 'session-row' + (s.archived ? ' archived' : '') + (s.pinned && !s.archived ? ' pinned' : '')
    row.dataset.id = s.id
    row.innerHTML = '<div class="title"></div><div class="when"></div><button class="session-more" tabindex="-1">⋯</button>'
    row.querySelector('.title').textContent = s.title
    // Quando e in che cartella: le cronache sono di tutte le cartelle, come nella barra dell'app desktop
    const folder = s.cwd ? s.cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : ''
    row.querySelector('.when').textContent = shortWhen(s.lastModified) + (folder ? ` · ${folder}` : '') + (s.branch && s.branch !== 'HEAD' ? ` · ${s.branch}` : '')
    row.title = `${s.title}\n${formatWhen(s.lastModified)}${s.cwd ? `\n${s.cwd}` : ''}`
    const more = row.querySelector('.session-more')
    more.title = t('sessionMenu')
    more.addEventListener('click', (e) => { e.stopPropagation(); openSessionMenu(more, s) })
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); openSessionMenu(more, s) })
    row.addEventListener('click', () => { if (!row.classList.contains('editing')) openSession(s) })
    return row
  }

  function openSessionMenu(anchor, s) {
    closeFolderMenu()
    const menu = document.createElement('div')
    menu.className = 'folder-menu session-menu'
    const item = (key, fn, cls) => {
      const it = document.createElement('div')
      it.className = `folder-item${cls ? ` ${cls}` : ''}`
      it.appendChild(label(document.createElement('span'), key))
      it.addEventListener('click', () => { closeFolderMenu(); fn() })
      menu.appendChild(it)
    }
    item('sessionRename', () => startRename(s))
    if (api.pinSession && !s.archived) item(s.pinned ? 'sessionUnpin' : 'sessionPin', async () => { await api.pinSession(s.id, !s.pinned); refreshSessions() })
    if (api.exportSession) item('sessionExport', () => exportSession(s.id, s.cwd || null, s.title))
    item(s.archived ? 'sessionUnarchive' : 'sessionArchive', async () => {
      await api.archiveSession(s.id, s.cwd || null, !s.archived)
      refreshSessions()
    })
    item('sessionDelete', async () => {
      const r = await api.deleteSession(s.id, s.cwd || null, s.title)
      if (!r || !r.deleted) return
      const owner = [...convs.values()].find((c) => c.sessionId === s.id)
      if (r.wasCurrent || (owner && owner === active)) await newChapter()
      if (owner) dropConv(owner)
      refreshSessions()
    }, 'danger')
    placeMenu(menu, anchor)
  }

  // Una conversazione in Markdown: si sceglie dove salvarla; l'esito come nota nella conversazione in vista
  async function exportSession(id, cwd, title) {
    if (!id) { labelled('footnote', 'exportNothing'); return }
    const r = await api.exportSession(id, cwd, title).catch((err) => ({ ok: false, error: err.message }))
    if (r && r.ok) labelled('footnote', 'exportDone', { x: r.file })
    else if (r && !r.canceled) labelled('error', 'exportFail', { x: (r && r.error) || '?' })
  }

  // La rinomina sul posto: il titolo diventa un campo; Invio (o un clic altrove) salva, Esc annulla
  function startRename(s) {
    const row = part('sessions-list') && part('sessions-list').querySelector(`.session-row[data-id="${CSS.escape(s.id)}"]`)
    if (!row) return
    const title = row.querySelector('.title')
    const input = document.createElement('input')
    input.className = 'session-rename'
    input.value = s.title
    input.spellcheck = false
    row.classList.add('editing')
    title.replaceWith(input)
    input.focus()
    input.select()
    let done = false
    const finish = async (save) => {
      if (done) return
      done = true
      const value = input.value.trim()
      row.classList.remove('editing')
      if (save && value && value !== s.title) {
        input.replaceWith(Object.assign(title, { textContent: value }))
        s.title = value
        if (currentSession && currentSession.id === s.id) { currentSession.title = value; renderChapterHead() }
        await api.renameSession(s.id, value, s.cwd || null)
        refreshSessions()
      } else input.replaceWith(title)
    }
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') { e.preventDefault(); finish(true) } else if (e.key === 'Escape') finish(false)
    })
    input.addEventListener('blur', () => finish(true))
    input.addEventListener('click', (e) => e.stopPropagation())
  }

  // Negli annali: quella in vista, quelle che lavorano, quelle con una domanda aperta o una risposta da leggere
  function markCurrentSession() {
    const bySession = new Map()
    for (const c of convs.values()) if (c.sessionId) bySession.set(c.sessionId, c)
    const here = active && (active.sessionId || (currentSession && currentSession.id))
    for (const row of all('.session-row[data-id]')) {
      const c = bySession.get(row.dataset.id)
      row.classList.toggle('current', !!here && row.dataset.id === here)
      row.classList.toggle('running', !!c && c !== active && isBusy(c))
      row.classList.toggle('attention', !!c && c !== active && c.attention)
      row.classList.toggle('unread', !!c && c !== active && c.unread && !c.attention)
    }
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

  // Aprire una cronaca: se è già aperta (magari sta lavorando) si torna a lei; altrimenti diventa una conversazione
  // nuova, con le sue pagine ricopiate. Le altre restano come sono
  async function openSession(s) {
    if (!sessionsPinned() && part('sessions')) part('sessions').hidden = true
    // Già aperta: si torna a lei, se ha le sue pagine (una aperta ma vuota si ricopia qui sotto)
    const open = [...convs.values()].find((c) => c.sessionId === s.id)
    if (open && (open.el.querySelector('.entry') || isBusy(open))) { switchTo(open); return }
    if (open) { open.sessionId = null; dropConv(open) }
    const c = newConv(`local${Date.now()}`)
    c.sessionId = s.id
    c.currentSession = s
    c.convoDir = s.cwd || workdir
    switchTo(c)
    const loading = labelled('footnote', 'copying')
    let r
    try {
      r = await api.openSession(s.id, s.cwd || null)
    } catch (err) {
      run(c, () => { loading.remove(); add('error', esc(String(err.message || err))) })
      return
    }
    const history = Array.isArray(r) ? r : (r && r.history) || []
    const realId = Array.isArray(r) ? c.id : r.conv
    // L'id vero della conversazione, dal processo principale
    if (realId && realId !== c.id) {
      const other = convs.get(realId)
      // Il processo principale aveva già una conversazione su quella sessione: se qui ha le sue pagine si torna a lei,
      // altrimenti (aperta ma vuota) la si sostituisce con questa
      if (other && other !== c) {
        if (other.el.querySelector('.entry') || isBusy(other)) { if (active === c) switchTo(other); dropConv(c); return }
        other.el.remove()
        convs.delete(realId)
      }
      convs.delete(c.id)
      c.id = realId
      c.el.dataset.conv = realId
      convs.set(realId, c)
      if (active === c && api.setActive) api.setActive(c.id)
    }
    pruneEmpty()
    run(c, () => fillHistory(c, history, loading))
  }

  // Una cronaca riaperta mostra gli ultimi 40 messaggi (con le azioni in mezzo); quelli prima restano nella
  // conversazione (c.older) e un pulsante in cima li carica, 40 alla volta, senza spostare quello che si sta leggendo
  const PAGE = 40
  function pageStart(items, end) {
    let texts = 0
    for (let k = end - 1; k >= 0; k--) if (items[k].role !== 'tool' && ++texts === PAGE) return k
    return 0
  }
  const countTexts = (items) => items.filter((m) => m.role !== 'tool').length
  function renderHistory(items) {
    for (const m of items) {
      if (m.role === 'user') { const y = entry('you'); if (m.uuid) y.dataset.uuid = m.uuid; fillYou(y, m.text, m.images || []) }
      else if (m.role === 'assistant') setReplyText(entry('claude').querySelector('.text'), m.text)
      else if (m.role === 'thinking') {
        const box = thinkingBox(false)
        box.raw = m.text
        box.querySelector('.thinking-body').innerHTML = markdown(m.text)
        label(box.querySelector('.th-text'), 'thinkingPast')
      }
      else if (m.role === 'output') add('cmd-output', '').textContent = m.text
      else if (m.role === 'tool') {
        addTool(m.id, m.name, m.summary, m.change, m.intent)
        if (m.error !== null) toolDone(m.id, m.error)
      }
    }
  }
  function olderButton(c) {
    const item = add('older', '<button class="older-btn"></button>')
    const b = item.querySelector('button')
    label(b, 'olderLoad', { n: countTexts(c.older) })
    b.addEventListener('click', () => loadOlder(c, item))
    return item
  }
  function loadOlder(c, item) {
    if (!c.older || !c.older.length) { item.remove(); return }
    const from = pageStart(c.older, c.older.length)
    const chunk = c.older.slice(from)
    c.older = c.older.slice(0, from)
    const log = part('log')
    const prevH = log ? log.scrollHeight : 0
    const prevTop = log ? log.scrollTop : 0
    // Si disegna in un contenitore a parte, poi si mette tutto subito sotto il pulsante
    const tmp = document.createElement('div')
    const real = c.el
    c.el = tmp
    const keepStick = stick
    stick = false
    try { run(c, () => renderHistory(chunk)) } finally { c.el = real; stick = keepStick }
    for (const el of tmp.querySelectorAll(':scope > .item.change')) el.hidden = true
    item.after(...tmp.children)
    if (c.older.length) label(item.querySelector('button'), 'olderLoad', { n: countTexts(c.older) })
    else item.remove()
    if (log) log.scrollTop = prevTop + (log.scrollHeight - prevH)
  }

  function fillHistory(c, history, loading) {
    try {
      loading.remove()
      const from = pageStart(history, history.length)
      c.older = history.slice(0, from)
      if (c.older.length) olderButton(c)
      renderHistory(history.slice(from))
      // Le differenze delle cronache restano chiuse: si aprono con un clic sulla riga dell'azione
      for (const el of logEl().querySelectorAll(':scope > .item.change')) el.hidden = true
      hook('chapter')
      labelled('footnote', 'continueHere')
      scrollDown(true)
    } catch (err) {
      loading.remove()
      add('error', esc(String(err.message || err)))
    }
    if (part('input')) part('input').focus()
  }

  // ------------------------------------------------------------------ cercare nella conversazione (Ctrl+F)

  // Una barra in alto a destra della conversazione: le corrispondenze si evidenziano con le Highlight di CSS
  // (::highlight(find), ::highlight(find-current)), senza toccare il testo; Invio e Maiusc+Invio vanno avanti e
  // indietro, Esc chiude. Si cerca solo nella conversazione in vista e nel testo che si vede
  const find = { bar: null, ranges: [], index: 0 }
  function openFind() {
    const log = part('log')
    if (!log) return
    if (find.bar && find.bar.isConnected) { const i = find.bar.querySelector('input'); i.focus(); i.select(); return }
    const host = app.querySelector('[data-solid]') || app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const bar = document.createElement('div')
    bar.className = 'find-bar'
    bar.innerHTML = '<input type="text" spellcheck="false"><span class="find-count"></span><button class="find-prev">↑</button><button class="find-next">↓</button><button class="find-close">✕</button>'
    const input = bar.querySelector('input')
    input.placeholder = t('findPlaceholder')
    bar.querySelector('.find-prev').title = t('findPrev')
    bar.querySelector('.find-next').title = t('findNext')
    bar.querySelector('.find-close').title = t('findClose')
    const r = log.getBoundingClientRect()
    const hr = host.getBoundingClientRect()
    bar.style.top = `${r.top - hr.top + 8}px`
    bar.style.right = `${hr.right - r.right + 18}px`
    host.appendChild(bar)
    find.bar = bar
    input.addEventListener('input', () => runFind(input.value))
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); closeFind() }
      else if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1) }
    })
    bar.querySelector('.find-prev').addEventListener('click', () => stepFind(-1))
    bar.querySelector('.find-next').addEventListener('click', () => stepFind(1))
    bar.querySelector('.find-close').addEventListener('click', closeFind)
    input.focus()
  }
  function closeFind() {
    if (find.bar) find.bar.remove()
    find.bar = null
    find.ranges = []
    if (window.CSS && CSS.highlights) { CSS.highlights.delete('find'); CSS.highlights.delete('find-current') }
  }
  function runFind(q) {
    find.ranges = []
    find.index = 0
    const root = active && active.el
    const needle = q.trim().toLowerCase()
    if (root && needle) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement && n.parentElement.getClientRects().length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      })
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const text = n.nodeValue.toLowerCase()
        let i = text.indexOf(needle)
        while (i >= 0 && find.ranges.length < 2000) {
          const r = document.createRange()
          r.setStart(n, i)
          r.setEnd(n, i + needle.length)
          find.ranges.push(r)
          i = text.indexOf(needle, i + needle.length)
        }
      }
      // Si parte dall'ultima corrispondenza (la più vicina al fondo, dove di solito si legge)
      find.index = Math.max(0, find.ranges.length - 1)
    }
    paintFind()
  }
  function stepFind(dir) {
    if (!find.ranges.length) return
    find.index = (find.index + dir + find.ranges.length) % find.ranges.length
    paintFind()
  }
  function paintFind() {
    const count = find.bar && find.bar.querySelector('.find-count')
    const q = find.bar ? find.bar.querySelector('input').value.trim() : ''
    if (count) count.textContent = q ? (find.ranges.length ? t('findCount', { i: find.index + 1, n: find.ranges.length }) : t('findNone')) : ''
    if (!(window.CSS && CSS.highlights && window.Highlight)) return
    CSS.highlights.set('find', new Highlight(...find.ranges))
    const cur = find.ranges[find.index]
    if (cur) {
      CSS.highlights.set('find-current', new Highlight(cur))
      // La corrispondenza in vista, a un terzo dall'alto
      const log = part('log')
      const rr = cur.getBoundingClientRect()
      const lr = log.getBoundingClientRect()
      if (rr.top < lr.top + 20 || rr.bottom > lr.bottom - 20) {
        stick = false
        log.scrollTop += rr.top - lr.top - lr.height / 3
      }
    } else CSS.highlights.delete('find-current')
  }

  // L'ultima risposta di Claude, col suo markdown, negli appunti (Ctrl+Maiusc+C)
  function copyLastReply() {
    const last = active && [...active.el.querySelectorAll('.entry.claude')].pop()
    if (last && last.rawText) copyText(last.rawText)
  }
  // Ctrl+K: la ricerca negli annali (o gli annali, se il tema li tiene nascosti)
  function focusSessionsSearch() {
    if (!sessionsPinned()) showSessions()
    setTimeout(() => { const s = app.querySelector('[data-part="sessions-search"], .sessions-search'); if (s) { s.focus(); s.select() } }, 50)
  }

  // ------------------------------------------------------------------ comandi, delegati al documento

  const actions = {
    send: sendMessage,
    stop: () => { endThinking(); api.stop(active && active.id); labelled('error', 'stopped'); reply = null; setBusy(false) },
    hide: () => api.hide(),
    attach: async () => addPaths(await api.chooseFiles()),
    quit: () => api.quit(),
    new: newChapter,
    sessions: showSessions,
    'sessions-close': () => { if (part('sessions') && !sessionsPinned()) part('sessions').hidden = true },
    themes: openThemes,
    settings: openSettings,
    dictate: () => dictate(),
    preview: togglePreview,
    memory: () => openMemory(),
    maximize: () => api.windowMode('max'),
    fullscreen: () => api.windowMode('full'),
    scene: () => { scene = scene === 'notte' ? 'giorno' : 'notte'; api.setScene(scene); paint(); hook('scene', scene) },
  }
  document.addEventListener('click', (e) => {
    // I link delle risposte si aprono nel browser di sistema
    const a = e.target.closest('a[data-href]')
    if (a) {
      e.preventDefault()
      if (isLocal(a.dataset.href) && !e.ctrlKey && !e.metaKey && !e.shiftKey) openPreview(a.dataset.href)
      else api.openLink(a.dataset.href)
      return
    }
    const m = e.target.closest('[data-perm-mode]')
    if (m && app.contains(m)) return chooseMode(m.dataset.permMode)
    const b = e.target.closest('[data-action]')
    if (b && app.contains(b) && actions[b.dataset.action]) actions[b.dataset.action](e)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.querySelector('.theme-picker')) { closeThemes(); return }
    // Le scorciatoie, come nell'app desktop: Ctrl+, impostazioni, Ctrl+N nuova conversazione, Ctrl+K cerca negli
    // annali, Ctrl+F cerca nella conversazione, Ctrl+Maiusc+C copia l'ultima risposta
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey
    const k = e.key.toLowerCase()
    if (mod && e.key === ',') { e.preventDefault(); openSettings(); return }
    if (mod && !e.shiftKey && k === 'n') { e.preventDefault(); newChapter(); return }
    if (mod && !e.shiftKey && k === 'k') { e.preventDefault(); focusSessionsSearch(); return }
    if (mod && !e.shiftKey && k === 'f') { e.preventDefault(); openFind(); return }
    if (mod && e.shiftKey && k === 'c') { e.preventDefault(); copyLastReply(); return }
    if (mod && e.shiftKey && k === 'p') { e.preventDefault(); togglePreview(); return }
    if (mod && !e.shiftKey && k === 'b' && busy && !e.target.matches('[data-part="input"]')) { e.preventDefault(); api.backgroundNow(active && active.id); return }
    if (e.key === 'Escape' && find.bar) { closeFind(); return }
    if (e.key === 'Escape' && document.querySelector('.folder-menu')) { closeFolderMenu(); return }
    // F11: schermo intero, e di nuovo per tornare
    if (e.key === 'F11') { e.preventDefault(); api.windowMode('full'); return }
    // Esc ferma Claude, come nell'app desktop. Prima chiude il menu dei comandi, se è aperto; i campi che usano Esc
    // per sé (ricerca negli annali, rinomina, risposta libera a una domanda) lo tengono
    if (e.key === 'Escape' && busy) {
      if (e.target.matches('[data-part="input"]') && menuKey(e)) { e.preventDefault(); return }
      if (e.target.matches('.sessions-search, .session-rename, .q-other')) return
      e.preventDefault()
      actions.stop()
      return
    }
    if (!e.target.matches('[data-part="input"]')) return
    if (menuKey(e)) { e.preventDefault(); return }
    if (composerKey(e, e.target)) return
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  })
  // Il menu dei comandi segue quello che si scrive e dove sta il cursore
  document.addEventListener('input', (e) => { if (e.target.matches('[data-part="input"]')) updateMenu() })
  document.addEventListener('keyup', (e) => { if (e.target.matches('[data-part="input"]') && /^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) updateMenu() })
  document.addEventListener('focusout', (e) => { if (e.target.matches('[data-part="input"]')) setTimeout(closeMenu, 100) })
  api.onReset(newChapter)
  // Una conversazione nuova ha ricevuto la sua sessione: compare negli annali
  if (api.onConvSession) api.onConvSession((x, id) => {
    const c = convs.get(id)
    if (!c || !x) return
    c.sessionId = x.id
    if (sessionsPinned()) refreshSessions()
    else markCurrentSession()
  })
  // Un clic su una notifica: la sua conversazione
  if (api.onConvShow) api.onConvShow((_x, id) => switchTo(convs.get(id)))
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
    // La prima conversazione: quella dell'ultima volta, se c'era
    const first = newConv(info.conv || 'c1')
    first.chapter = chapter
    first.convoDir = convoDir
    first.sessionId = info.sessionId || null
    first.el.hidden = false
    active = first
    cur = first
    load(first)
    api.windowState().then(setWindowState).catch(() => {})
    // I comandi della cache; l'elenco aggiornato arriva poi da onCommands
    api.commands().then((list) => { if (!commands.length) commands = list || [] }).catch(() => {})
    await Theming.load(info.themes || [])
    // I temi dell'editor si costruiscono dai loro colori
    for (const spec of info.userThemes || []) Theming.register(window.SkinsKits.moderno.fromColors(spec))
    await mount(info.theme)
    if (part('input')) part('input').focus()
    // La pagina è partita: l'avvio sicuro non serve
    if (api.ready) api.ready()
    if (api.safeState) api.safeState().then(showSafe).catch(() => {})
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
    // ?veloce nell'indirizzo: tutto venti volte più svelto (le prove automatiche)
    const speed = new URLSearchParams(location.search).has('veloce') ? 0.05 : 1
    const fire = (name, v, ms, conv) => setTimeout(() => handlers[name] && handlers[name](v, conv), ms * speed)
    const fireAll = fire
    let n = 1
    let fakeWin = 'normal'
    // Dalla console dell'anteprima: anteprima.tema('notturno'), anteprima.permesso(), anteprima.piano(),
    // anteprima.risposta('testo in markdown')
    window.anteprima = {
      tema: (id) => fire('onTheme', id, 0),
      // Una risposta di Claude con il testo dato, come se arrivasse adesso
      // L'avviso dell'avvio sicuro, come dopo un tema che non partiva
      avvioSicuro: () => fireAll('onSafeState', { reason: 'error', theme: 'notturno', themeName: 'Notturno', error: 'il layout non ha la casella' }, 0),
      risposta: (text) => { fire('onDelta', String(text), 0); fire('onDone', { durationMs: 1000 }, 10) },
      piano: () => fire('onAsk', { id: Date.now(), kind: 'plan', plan: '## Fiumi sulla mappa\n\n1. Aggiungere `DrawRivers()` in **MapView.cpp**, prima delle strade\n2. Leggere i fiumi dal file della mappa in `MapLoader`\n3. Un interruttore `m_showRivers` nel menu Vista\n\nNessun file cambia finché non approvi.' }, 0),
      domande: () => fire('onAsk', { id: Date.now(), kind: 'question', questions: [
        { question: 'Dove disegno i fiumi rispetto alle strade?', header: 'Ordine', multiSelect: false, options: [{ label: 'Sotto le strade', description: 'Le strade passano sopra i fiumi, come ponti' }, { label: 'Sopra le strade', description: 'I fiumi coprono le strade dove si incrociano' }] },
        { question: 'Quali elementi aggiungo anche?', header: 'Extra', multiSelect: true, options: [{ label: 'Guadi', description: 'Dove un sentiero attraversa un fiume' }, { label: 'Ponti', description: 'Sulle strade principali' }, { label: 'Laghi', description: 'Alle sorgenti' }] },
      ] }, 0),
      contesto: (p = 64) => fire('onContext', { percentage: p, used: Math.round(200000 * p / 100), max: 200000, categories: [
        { id: 'system_prompt', name: 'System prompt', tokens: 3100, kind: 'used' }, { id: 'system_tools', name: 'System tools', tokens: 14200, kind: 'used' },
        { id: 'memory_files', name: 'Memory files', tokens: 2400, kind: 'used' }, { id: 'messages', name: 'Messages', tokens: Math.max(0, Math.round(200000 * p / 100) - 19700), kind: 'used' },
        { id: 'autocompact_buffer', name: 'Autocompact buffer', tokens: 33000, kind: 'buffer' }, { id: 'free_space', name: 'Free space', tokens: Math.max(0, 200000 - Math.round(200000 * p / 100) - 33000), kind: 'free' },
      ] }, 0),
      // Due attività in background: un comando in corso e un sotto-agente finito
      background: () => fire('onTasks', [
        { id: 'b1', type: 'local_bash', agent: '', description: 'npm run build -- --watch', status: 'running', background: true, started: Date.now() - 42000, ended: null, tokens: 0, tools: 0, lastTool: '', summary: '', output: 'C:/Temp/b1.txt' },
        { id: 'a1', type: 'local_agent', agent: 'Explore', description: 'Cerca dove si disegnano le strade', status: 'completed', background: true, started: Date.now() - 120000, ended: Date.now() - 60000, tokens: 18200, tools: 14, lastTool: 'Grep', summary: 'Le strade si disegnano in MapView::DrawRoads.', output: '' },
      ], 0),
      attivita: () => {
        const list = [{ id: '1', content: 'Leggere MapView.cpp', activeForm: 'Legge MapView.cpp', status: 'completed' }, { id: '2', content: 'Aggiungere DrawRivers()', activeForm: 'Aggiunge DrawRivers()', status: 'in_progress' }, { id: '3', content: 'Compilare e provare la mappa', activeForm: 'Compila e prova la mappa', status: 'pending' }]
        fire('onTodos', list, 0)
      },
      permesso: () => fire('onAsk', { id: Date.now(), title: 'Claude vuole modificare un file', description: '', detail: 'src/MapView.cpp', canAlways: true }, 0),
    }
    const day = 86400000
    // Un repo finto per il pannello di git
    const fakeGit = {
      repo: true, root: 'C:/Users/luca/MapEditor', branch: 'fiumi', upstream: 'origin/fiumi', ahead: 1, behind: 0, detached: false, noCommits: false,
      files: [
        { path: 'src/MapView.cpp', status: 'M', added: 2, removed: 1 },
        { path: 'src/Rivers.cpp', status: '?', added: 48, removed: 0 },
        { path: 'docs/vecchio.md', status: 'D', added: 0, removed: 12 },
      ],
      remote: 'git@github.com:luca/MapEditor.git', web: 'https://github.com/luca/MapEditor', base: 'main', last: { hash: 'a1b2c3d', subject: 'Le strade sopra i sentieri' },
      compare: 'https://github.com/luca/MapEditor/compare/main...fiumi?expand=1', gh: true,
    }
    const gitTotals = () => { fakeGit.totals = fakeGit.files.reduce((t, f) => ({ files: t.files + 1, added: t.added + f.added, removed: t.removed + f.removed }), { files: 0, added: 0, removed: 0 }) }
    gitTotals()
    const fakeBranches = ['fiumi', 'main', 'sentieri']
    // Un tema dell'editor già salvato, per le prove del cambio di tema
    const fakeUserThemes = [{ id: 'notturno', name: 'Notturno', description: 'Un tema di prova', colors: { bg: '#101820', side: '#16202a', surface: '#1d2833', ink: '#e8e2d6', inkSoft: '#9a958b', accent: '#f2aa4c', line: '#2c3a47', bubble: '#2b3a4a' }, font: 'libro', textSize: 15, radius: 10 }]
    // Le regole dei permessi finte, nei tre posti
    const fakePerms = {
      user: { allow: ['WebSearch', 'Bash(git status)'], ask: [], deny: ['Bash(rm -rf:*)'], dirs: [] },
      project: { allow: ['Bash(npm run test:*)', 'Read(./docs/**)'], ask: ['Bash(git push:*)'], deny: [], dirs: [] },
      local: { allow: ['Edit(src/**)'], ask: [], deny: [], dirs: ['C:/Users/luca/Documenti/Mappe'] },
    }
    // La memoria finta: personale e del progetto, quella locale non c'è ancora
    const fakeMemory = new Map([
      ['C:/Users/luca/.claude/CLAUDE.md', '# Le mie preferenze\n\n- Rispondi in italiano\n- Commenti nel codice in italiano\n- Prima di toccare più di tre file, chiedi\n'],
      ['C:/Users/luca/MapEditor/CLAUDE.md', '# MapEditor\n\nEditor di mappe in C++17 con Qt 6.\n\n## Comandi\n\n- `cmake --build build` compila\n- `ctest --test-dir build` le prove\n\n## Regole\n\n- I fiumi si disegnano prima delle strade\n'],
    ])
    const fakeMemFiles = () => ({ cwd: 'C:/Users/luca/MapEditor', files: [['user', 'C:/Users/luca/.claude/CLAUDE.md'], ['project', 'C:/Users/luca/MapEditor/CLAUDE.md'], ['local', 'C:/Users/luca/MapEditor/CLAUDE.local.md'], ['parent', 'C:/Users/luca/CLAUDE.md']].filter(([id, f]) => id !== 'parent' || fakeMemory.has(f)).map(([id, file]) => ({ id, file, exists: fakeMemory.has(file), size: (fakeMemory.get(file) || '').length })) })
    const fakePermFiles = { user: 'C:/Users/luca/.claude/settings.json', project: 'C:/Users/luca/MapEditor/.claude/settings.json', local: 'C:/Users/luca/MapEditor/.claude/settings.local.json' }
    const fakeUpdate = { state: 'available', count: 3, behind: 3, local: 0, commits: ['Pannello dei server MCP e dei plugin', 'Riepilogo dei file modificati nella conversazione', 'Pannello delle impostazioni'], branch: 'main', dirty: false, repo: 'C:/Users/luca/Claude-desktop-skins', installed: true }
    const fakeSettings = { onTop: false, notify: true, openAtLogin: false, workdir: 'C:/Workspace', mode: 'auto', entrypoint: 'cli', claudePath: 'C:/Users/luca/.local/bin/claude.exe', claudeDefault: true, claudeFound: true, claudeVersion: '2.1.330', version: '0.1.0', installed: true, dataDir: 'C:/Users/luca/AppData/Roaming/Claudeleon', shortcut: 'Ctrl+Alt+P', worktree: false }
    const fakeSessions = [
      { id: 's0', title: 'Allegati e domande con le opzioni', lastModified: Date.now() - 600000, cwd: 'C:/Workspace/Progetti/Claude-desktop-skins', branch: 'main' },
      { id: 's1', title: 'Temi per Claudeleon', lastModified: Date.now() - 3600000, cwd: 'C:/Workspace/Progetti/Claude-desktop-skins', branch: 'main' },
      { id: 's2', title: 'Il calcolo dei sentieri in RouteFinder', lastModified: Date.now() - day, cwd: 'C:/Workspace/MapEditor' },
      { id: 's3', title: 'Mod desktop Signore degli Anelli', lastModified: Date.now() - 4 * day, cwd: 'C:/Workspace' },
      { id: 's4', title: 'Profilo di Windows Terminal', lastModified: Date.now() - 9 * day, cwd: 'C:/Users/luca' },
      { id: 's5', title: 'Backup delle note su Drive', lastModified: Date.now() - 45 * day, cwd: 'C:/Users/luca/Documenti' },
      { id: 's6', title: 'Prova del vecchio rotolo', lastModified: Date.now() - 20 * day, cwd: 'C:/Workspace', archived: true },
    ]
    return {
      // ?tema=<id>&scena=giorno nell'indirizzo per guardare un tema
      info: async () => {
        const q = new URLSearchParams(location.search)
        return { scene: q.get('scena') || 'notte', chapter: n, theme: q.get('tema') || 'essenziale', themes: ['essenziale'], userThemes: fakeUserThemes, workdir: 'C:/Workspace', workdirChosen: q.get('cartella') !== 'no', mode: q.get('modo') || 'auto' }
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
      sessions: async () => fakeSessions.map((s) => Object.assign({}, s)),
      renameSession: async (id, title) => { const s = fakeSessions.find((x) => x.id === id); if (s) s.title = title; return true },
      pinSession: async (id, on) => { const s = fakeSessions.find((x) => x.id === id); if (s) s.pinned = !!on; return true },
      exportSession: async (id, cwd, title) => (id ? { ok: true, file: `C:/Users/luca/Documents/${title || 'Conversazione'}.md` } : { ok: false, error: 'nessuna sessione' }),
      archiveSession: async (id, cwd, on) => { const s = fakeSessions.find((x) => x.id === id); if (s) s.archived = !!on; return true },
      deleteSession: async (id) => { const k = fakeSessions.findIndex((x) => x.id === id); if (k >= 0 && confirm('Eliminare?')) { fakeSessions.splice(k, 1); return { deleted: true } } return { deleted: false } },
      // Una cronaca lunga (Backup delle note): 120 messaggi, per provare "Carica i messaggi precedenti"
      openSession: async (id) => id === 's5' ? Array.from({ length: 120 }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', text: `Messaggio ${k + 1}`, uuid: k % 2 ? undefined : `00000000-0000-4000-a000-${String(k).padStart(12, '0')}` })) : [
        { role: 'user', text: 'Aggiungi i fiumi alla mappa' },
        { role: 'thinking', text: 'La mappa si disegna in **MapView.cpp**: conviene guardare prima lì.' },
        { role: 'assistant', text: 'Guardo prima come si disegna la mappa.' },
        { role: 'tool', id: 'h1', name: 'Read', summary: 'src/MapView.cpp', change: null, error: false },
        { role: 'tool', id: 'h2', name: 'Edit', summary: 'src/MapView.cpp', change: FAKE_EDIT, error: false },
        { role: 'tool', id: 'h3', name: 'Bash', summary: 'cmake --build build', change: null, error: true },
        { role: 'assistant', text: 'Fatto: i fiumi ora si disegnano **prima** delle strade. La compilazione però si è fermata su un errore di `MapLoader`.' },
        { role: 'user', text: '/usage' },
        { role: 'output', text: 'Sessione corrente\n  Token in ingresso   12.408\n  Costo stimato       0,21 $' },
      ],
      onAsk: on('onAsk'), onAskClosed: on('onAskClosed'),
      newChapter: async () => ({ chapter: ++n, conv: `f${n}` }),
      setActive() {},
      onConvSession: on('onConvSession'), onConvShow: on('onConvShow'),
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
      usage: async () => ({ plan: 'max', fiveHour: { used: 34, resetsAt: new Date(Date.now() + 2 * 3600000).toISOString() }, week: { used: 82, resetsAt: new Date(Date.now() + 3 * 86400000).toISOString() } }),
      onUsage: on('onUsage'),
      onModels: on('onModels'), onTodos: on('onTodos'), onContext: on('onContext'),
      onThinkingStart: on('onThinkingStart'), onSuggestion: on('onSuggestion'), onThinking: on('onThinking'), onThinkingEnd: on('onThinkingEnd'),
      openFile: async () => true,
      permissions: async () => ({ cwd: 'C:/Users/luca/MapEditor', scopes: ['user', 'project', 'local'].map((id) => Object.assign({ id, file: fakePermFiles[id], exists: true, error: '' }, JSON.parse(JSON.stringify(fakePerms[id])))) }),
      changePermission: async (_c, scope, op) => {
        const sc = fakePerms[scope]
        const rule = String(op.rule || '').trim()
        if (op.kind === 'add' && op.list !== 'dirs' && !/^[A-Za-z0-9_*.-]+(\(.+\))?$/.test(rule)) return { ok: false, error: `«${rule}» non sembra una regola: per esempio Bash(npm run test:*) o Read(./docs/**)` }
        if (op.kind === 'add') { for (const l of ['allow', 'ask', 'deny']) if (op.list !== 'dirs') sc[l] = sc[l].filter((x) => x !== rule); if (!sc[op.list].includes(rule)) sc[op.list].push(rule) }
        if (op.kind === 'remove') sc[op.list] = sc[op.list].filter((x) => x !== rule)
        if (op.kind === 'move') { sc[op.list] = sc[op.list].filter((x) => x !== rule); sc[op.to].push(rule) }
        return { ok: true }
      },
      memoryFiles: async () => fakeMemFiles(),
      readMemory: async (_c, f) => ({ ok: true, text: fakeMemory.get(f) || '', exists: fakeMemory.has(f) }),
      writeMemory: async (_c, f, text) => { fakeMemory.set(f, text); return { ok: true } },
      openMemory: async () => true,
      dictate: async () => true,
      retrySafeTheme: () => fireAll('onTheme', 'notturno', 0),
      dismissSafe() {},
      saveTheme: async (spec) => { const id = spec.id || String(spec.name || 'tema').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tema'; return { ok: true, spec: Object.assign(window.SkinsKits.moderno.normalizeSpec(spec), { id }) } },
      deleteTheme: async () => true,
      exportTheme: async (id) => ({ ok: true, file: `C:/Users/luca/Documents/${id}.skin` }),
      importTheme: async () => ({ ok: true, kind: 'colors', id: 'citta-di-sera', spec: { id: 'citta-di-sera', name: 'Città di sera', description: '', colors: { bg: '#fbf4ea', side: '#f1e6d6', surface: '#ffffff', ink: '#2b2118', inkSoft: '#7a6a58', accent: '#c2562b', onAccent: '#ffffff', line: '#e4d6c3', bubble: '#f6e1cf' }, font: 'serif', textSize: 15, radius: 6 } }),
      capturePreview: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      gitStatus: async () => JSON.parse(JSON.stringify(fakeGit)),
      gitDiff: async (_c, f) => (f.endsWith('.cpp') ? { file: f, created: f.includes('Rivers'), hunks: [{ before: f.includes('Rivers') ? '' : 'void Draw(Map& map) {\n    DrawRoads(map);\n}\n', after: 'void Draw(Map& map) {\n    DrawRivers(map);\n    DrawRoads(map);\n}\n', line: 1 }] } : { file: f, deleted: true, hunks: [{ before: '# Vecchio\n', after: '', line: 1 }] }),
      gitBranches: async () => fakeBranches.slice(),
      gitCheckout: async (_c, name, create) => { if (create) fakeBranches.unshift(name); fakeGit.branch = name; fakeGit.upstream = create ? '' : `origin/${name}`; return { ok: true } },
      gitCommit: async (_c, m, andPush) => { fakeGit.files = []; gitTotals(); fakeGit.last = { hash: 'e4f5a6b', subject: m }; fakeGit.ahead = andPush ? 0 : fakeGit.ahead + 1; return { ok: true } },
      gitPush: async () => { fakeGit.ahead = 0; fakeGit.upstream = `origin/${fakeGit.branch}`; return { ok: true } },
      gitPrInfo: async () => null,
      gitPr: async () => ({ ok: true, url: 'https://github.com/luca/MapEditor/pull/7' }),
      mergeWorktree: async () => { fakeGit.worktree.unmerged = 0; return { ok: true } },
      removeWorktree: async (_c, force) => (!force && (fakeGit.files.length || fakeGit.worktree.unmerged) ? { ok: false, needsForce: true, dirty: fakeGit.files.length > 0, unmerged: fakeGit.worktree.unmerged } : { ok: true, branchKept: '' }),
      revealFile: async () => false,
      extensions: async () => ({ ok: true, mcp: [
        { name: 'github', status: 'connected', scope: 'user', source: 'user', tools: 48, error: '' },
        { name: 'Gmail', status: 'needs-auth', scope: 'claudeai', source: 'claudeai', tools: 0, error: '' },
        { name: 'datadog', status: 'failed', scope: 'plugin', source: 'plugin', tools: 0, error: 'connessione rifiutata' },
        { name: 'notion', status: 'disabled', scope: 'project', source: 'project', tools: 0, error: '' },
      ], plugins: [{ name: 'engineering', version: '1.2.0', source: '' }], errors: [], enabled: { 'engineering@anthropic-plugins': true, 'cowork-plugin-management@anthropic-plugins': false } }),
      toggleMcp: async () => ({ ok: true }), reconnectMcp: async () => ({ ok: true }), togglePlugin: async () => ({ ok: true }),
      updateState: async () => fakeUpdate,
      checkUpdate: async () => fakeUpdate,
      applyUpdate: () => { const steps = ['pull', 'deps', 'build', 'install']; steps.forEach((st, i) => fireAll('onUpdate', Object.assign({}, fakeUpdate, { state: 'updating', step: st }), 600 * (i + 1))) },
      onUpdate: on('onUpdate'),
      stopTask: async () => true,
      backgroundNow: async () => true,
      onTasks: on('onTasks'), onWorktree: on('onWorktree'), onSafeState: on('onSafeState'),
      settings: async () => fakeSettings,
      setSetting: async (k, v) => { if (k in fakeSettings) fakeSettings[k] = v; return fakeSettings },
      suggestFiles: async (q) => ['src/', 'src/MapView.cpp', 'src/MapView.h', 'src/MapLoader.cpp', 'src/RouteFinder.h', 'docs/', 'docs/specifiche.pdf', 'README.md', 'CMakeLists.txt'].filter((f) => f.toLowerCase().includes(q.toLowerCase())).slice(0, 15),
      edit(uuid, msg, restore, conv) {
        if (restore) fireAll('onRewound', { ok: true, files: ['src/MapView.cpp'], insertions: 2, deletions: 1 }, 50, conv)
        this.send(msg, conv)
      },
      onRewound: on('onRewound'),
      send(msg, conv) {
        const fire = (n, v, ms) => fireAll(n, v, ms, conv)
        // Una conversazione nuova riceve la sua sessione e compare negli annali
        // Con le copie separate accese, la prima domanda di una conversazione parte in un worktree
        if (conv && fakeSettings.worktree && !fakeSessions.some((x) => x.conv === conv)) {
          const wt = { ok: true, name: 'aggiungi-fiumi-1a2b', branch: 'claude/aggiungi-fiumi-1a2b', path: 'C:/Users/luca/MapEditor/.claude/worktrees/aggiungi-fiumi-1a2b', main: 'C:/Users/luca/MapEditor', base: 'fiumi' }
          Object.assign(fakeGit, { branch: wt.branch, upstream: '', ahead: 0, root: wt.path, worktree: { main: wt.main, path: wt.path, name: wt.name, branch: wt.branch, base: 'fiumi', mainBranch: 'fiumi', unmerged: 2 } })
          fire('onWorktree', wt, 10)
        }
        if (conv && !fakeSessions.some((x) => x.conv === conv)) {
          fakeSessions.unshift({ id: `fs-${conv}`, conv, title: (typeof msg === 'string' ? msg : msg.text.replace(/\s*<diff_comments>[\s\S]*$/, '') || 'Commenti sulle modifiche').slice(0, 40), lastModified: Date.now(), cwd: 'C:/Workspace' })
          fire('onConvSession', { id: `fs-${conv}`, cwd: 'C:/Workspace' }, 30)
        }
        const text = typeof msg === 'string' ? msg : msg.text || '(allegati)'
        if (text.startsWith('/')) {
          // I comandi finti: uno locale con la sua uscita, gli altri come una risposta
          if (/^\/usage/.test(text)) fire('onCommandOutput', 'Sessione corrente\n  Token in ingresso   12.408\n  Token in uscita     3.215\n  Costo stimato       0,21 $', 400)
          else if (/^\/compact/.test(text)) fire('onCompacted', { pre: 48210, post: 6120 }, 600)
          else fire('onDelta', `Eseguo ${text.split(' ')[0]}.`, 400)
          fire('onDone', { durationMs: 900 }, 800)
          return
        }
        fire('onThinkingStart', null, 60)
        ;['Devo capire **dove** si disegnano le strade. ', 'Cerco DrawRoads nel codice, poi leggo MapView.cpp ', 'e aggiungo i fiumi prima delle strade.'].forEach((x, i) => fire('onThinking', x, 80 + i * 40))
        fire('onThinkingEnd', null, 190)
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
        fire('onSuggestion', 'Aggiungi anche i guadi sui sentieri', 900 + answer.length * 15 + 150)
        fire('onAsk', { id: 1, title: 'Claude vuole creare un file', description: '', detail: 'src/RouteFinder.h', change: FAKE_WRITE, canAlways: true }, 900 + answer.length * 15 + 200)
      },
      onDelta: on('onDelta'), onTool: on('onTool'), onToolDone: on('onToolDone'), onDone: on('onDone'), onError: on('onError'), onReset: on('onReset'), onTheme: on('onTheme'), onMode: on('onMode'), onToolSummary: on('onToolSummary'), onWindowState: on('onWindowState'), onWorkdir: on('onWorkdir'), onCommands: on('onCommands'), onCommandsError: on('onCommandsError'), onCommandOutput: on('onCommandOutput'), onCompacted: on('onCompacted'), onTitle: on('onTitle'), onStatus: on('onStatus'),
    }
  }
})()
