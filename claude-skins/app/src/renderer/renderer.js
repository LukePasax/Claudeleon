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

  // Copia un disegno a bassa risoluzione nel suo canvas; la misura a schermo la decide il CSS, o il disegno stesso
  // (× SCALE) con data-art-fit="natural"
  function blit(target, drawn, natural) {
    if (target.width !== drawn.width || target.height !== drawn.height) {
      target.width = drawn.width
      target.height = drawn.height
    }
    if (natural) {
      target.style.width = `${drawn.width * Pixel.SCALE}px`
      target.style.height = `${drawn.height * Pixel.SCALE}px`
    }
    const ctx = target.getContext('2d')
    ctx.clearRect(0, 0, target.width, target.height)
    ctx.drawImage(drawn, 0, 0)
  }

  let frame = 0
  function artOptions(el) {
    const width = el.clientWidth
    const height = el.clientHeight
    return { width, height, w: Math.floor(width / Pixel.SCALE), h: Math.floor(height / Pixel.SCALE), pal: Theming.palette(scene), scene, frame, busy, el, arg: el.dataset.artArg }
  }

  // <canvas data-art="nome">: il disegno del tema, nel canvas
  function drawArt(el) {
    const drawn = Theming.art(el.dataset.art, artOptions(el))
    if (drawn) blit(el, drawn, el.dataset.artFit === 'natural')
  }
  // data-art-bg="nome" su qualunque elemento: il disegno come sfondo ripetuto, ingrandito a pixel pieni
  function drawBackground(el) {
    const drawn = Theming.art(el.dataset.artBg, artOptions(el))
    if (!drawn) return
    el.style.backgroundImage = `url(${drawn.toDataURL()})`
    el.style.backgroundSize = `${drawn.width * Pixel.SCALE}px ${drawn.height * Pixel.SCALE}px`
  }

  function paint() {
    Theming.applyScene(scene)
    for (const el of all('[data-art-bg]')) drawBackground(el)
    for (const el of all('canvas[data-art]')) drawArt(el)
    const pal = Theming.palette(scene)
    for (const row of all('.tool')) row.querySelector('img').src = Theming.icon(row.dataset.craft, pal)
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

  function chooseMode(m) {
    if (m === mode) return
    mode = m
    renderModes()
    api.setMode(m)
  }
  api.onMode((m) => { mode = m; renderModes() })

  // ------------------------------------------------------------------ il layout del tema

  // Monta il tema: il suo HTML prende il posto del precedente, la conversazione, la bozza e lo stato passano al nuovo
  async function mount(id) {
    const items = [...all('[data-part="log"] > .item')]
    const draft = part('input') ? part('input').value : ''
    const theme = await Theming.use(id)
    app.innerHTML = theme.layout || '<div data-solid style="background:#000;color:#fff;padding:20px">Questo tema non ha un layout.</div>'
    const log = part('log')
    if (log) for (const it of items) log.appendChild(it)
    if (part('input')) part('input').value = draft
    setBusy(busy)
    renderModes()
    renderChapterHead()
    paint()
    scrollDown()
    if (sessionsPinned()) refreshSessions()
    api.setTrayIcon(Theming.trayIcon(Theming.palette('notte')))
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
    }
    return reply
  }

  // Il testo arriva a pezzi: si ridisegna al più una volta per fotogramma
  function renderReply() {
    pending = false
    if (reply) { reply.querySelector('.text').innerHTML = markdown(reply.raw); scrollDown() }
  }

  function setBusy(on) {
    busy = on
    for (const el of all('[data-action="send"]')) el.hidden = on
    for (const el of all('[data-action="stop"]')) el.hidden = !on
    for (const el of all('[data-part="hint"]')) el.textContent = t(on ? 'busyHint' : 'hint')
    document.body.classList.toggle('busy', on)
  }

  function sendMessage() {
    const input = part('input')
    const text = input ? input.value.trim() : ''
    if (!text || busy) return
    input.value = ''
    reply = null
    entry('you').querySelector('.text').textContent = text
    setBusy(true)
    api.send(text)
  }

  api.onDelta((d) => {
    const r = startReply()
    r.raw += d
    if (!pending) { pending = true; requestAnimationFrame(renderReply) }
  })
  api.onTool(({ id, name, summary, change }) => {
    renderReply()
    reply = null
    const craft = craftOf(name)
    const row = add('tool', `<img alt=""><span>${esc(name)}</span><span class="what">${esc(summary || '')}</span>`)
    row.dataset.craft = craft
    row.querySelector('img').src = Theming.icon(craft, Theming.palette(scene))
    tools.set(id, row)
    // Le modifiche ai file: il conto delle righe nella riga dello strumento, le differenze sotto; un clic sulla
    // riga le chiude e le riapre
    if (change) {
      const view = changeView(change)
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
  })
  api.onToolDone(({ id, error }) => {
    const row = tools.get(id)
    if (!row) return
    row.classList.add(error ? 'fail' : 'done')
    row.dataset.statusKey = error ? 'toolFail' : 'toolOk'
    row.dataset.status = t(row.dataset.statusKey)
  })
  api.onDone(({ durationMs }) => {
    renderReply()
    labelled('footnote', 'took', { s: Math.round((durationMs || 0) / 1000) })
    reply = null
    setBusy(false)
    // Una conversazione nuova compare negli annali
    if (sessionsPinned()) refreshSessions()
  })
  api.onError((msg) => {
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
    if (q.kind === 'plan') return askPlan(q)
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
      b.className = `pix small ${cls}`
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
      b.className = `pix small ${cls}`
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
        row.querySelector('.when').textContent = formatWhen(s.lastModified)
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
    renderChapterHead()
    markCurrentSession()
    const loading = labelled('footnote', 'copying')
    try {
      const history = await api.openSession(s.id)
      loading.remove()
      // Delle cronache lunghe bastano gli ultimi scambi
      for (const m of history.slice(-40)) {
        if (m.role === 'user') entry('you').querySelector('.text').textContent = m.text
        else entry('claude').querySelector('.text').innerHTML = markdown(m.text)
      }
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
    quit: () => api.quit(),
    new: newChapter,
    sessions: showSessions,
    'sessions-close': () => { if (part('sessions') && !sessionsPinned()) part('sessions').hidden = true },
    scene: () => { scene = scene === 'notte' ? 'giorno' : 'notte'; api.setScene(scene); paint() },
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
    if (e.target.matches('[data-part="input"]') && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  })
  api.onReset(newChapter)
  // Il tema scelto dal vassoio: si rimonta sul posto, la conversazione resta
  api.onTheme((id) => mount(id))

  // Spostare da data-drag (non dai suoi pulsanti e campi) e ridimensionare da data-grip: il gesto lo segue il
  // processo principale, la pagina dice solo quando comincia e quando finisce
  let gesturing = null
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    const grip = e.target.closest('[data-grip]')
    const drag = e.target.closest('[data-drag]')
    let kind = null
    if (grip) kind = 'resize'
    else if (drag && !e.target.closest('button, input, textarea, select, a, [data-action], [data-no-drag], .session-row')) kind = 'move'
    if (!kind) return
    e.preventDefault()
    gesturing = grip || drag
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
    requestAnimationFrame(() => { repaintQueued = false; paint() })
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
    // Dalla console dell'anteprima: anteprima.tema('pergamena'), anteprima.permesso(), anteprima.piano()
    window.anteprima = {
      tema: (id) => fire('onTheme', id, 0),
      piano: () => fire('onAsk', { id: Date.now(), kind: 'plan', plan: '## Fiumi sulla mappa\n\n1. Aggiungere `DrawRivers()` in **MapView.cpp**, prima delle strade\n2. Leggere i fiumi dal file della mappa in `MapLoader`\n3. Un interruttore `m_showRivers` nel menu Vista\n\nNessun file cambia finché non approvi.' }, 0),
      permesso: () => fire('onAsk', { id: Date.now(), title: 'Claude vuole modificare un file', description: '', detail: 'src/MapView.cpp', canAlways: true }, 0),
    }
    const day = 86400000
    return {
      // ?tema=<id>&scena=giorno nell'indirizzo per guardare un tema
      info: async () => {
        const q = new URLSearchParams(location.search)
        return { scene: q.get('scena') || 'notte', chapter: n, theme: q.get('tema') || 'terra-di-mezzo', themes: ['terra-di-mezzo', 'pergamena'], workdir: 'C:/Workspace', mode: q.get('modo') || 'auto' }
      },
      setInteractive() {}, hide() {}, quit() {}, setScene() {}, stop() {}, setTrayIcon() {}, answer() {}, gestureStart() {}, gestureEnd() {},
      setMode: (m) => fire('onMode', m, 0),
      openLink: (url) => window.open(url, '_blank', 'noopener'),
      sessions: async () => [
        { id: 's1', title: 'Temi per la Pergamena', lastModified: Date.now() - 3600000 },
        { id: 's2', title: 'Il calcolo dei sentieri in RouteFinder', lastModified: Date.now() - day },
        { id: 's3', title: 'Mod desktop Signore degli Anelli', lastModified: Date.now() - 4 * day },
        { id: 's4', title: 'Profilo di Windows Terminal', lastModified: Date.now() - 9 * day },
      ],
      openSession: async () => [{ role: 'user', text: 'Ciao' }, { role: 'assistant', text: 'Salve, viandante.' }],
      onAsk: on('onAsk'), onAskClosed: on('onAskClosed'),
      newChapter: async () => ++n,
      send(text) {
        fire('onTool', { id: 't1', name: 'Read', summary: 'src/MapView.cpp' }, 300)
        fire('onToolDone', { id: 't1', error: false }, 500)
        fire('onTool', { id: 't2', name: 'Edit', summary: 'src/MapView.cpp', change: FAKE_EDIT }, 600)
        fire('onToolDone', { id: 't2', error: false }, 800)
        const answer = FAKE_ANSWER.replace('{text}', text)
        ;[...answer].forEach((ch, i) => fire('onDelta', ch, 900 + i * 15))
        fire('onDone', { durationMs: 2400 }, 900 + answer.length * 15 + 100)
        fire('onAsk', { id: 1, title: 'Claude vuole creare un file', description: '', detail: 'src/RouteFinder.h', change: FAKE_WRITE, canAlways: true }, 900 + answer.length * 15 + 200)
      },
      onDelta: on('onDelta'), onTool: on('onTool'), onToolDone: on('onToolDone'), onDone: on('onDone'), onError: on('onError'), onReset: on('onReset'), onTheme: on('onTheme'), onMode: on('onMode'),
    }
  }
})()
