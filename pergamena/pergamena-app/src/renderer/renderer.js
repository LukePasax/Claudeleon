// La pagina del rotolo: disegna la pixel art, mostra la conversazione e passa i messaggi al processo principale.
// Scritte, colori e disegni vengono dal tema in uso (theming.js); cambiando tema si ridisegna tutto sul posto.
// Senza Electron (aperta in un browser) la chat risponde con un'eco finta, per guardare la grafica.
(function () {
  const api = window.pergamena || fakeApi()
  const $ = (id) => document.getElementById(id)
  const log = $('log')
  const input = $('input')
  const t = Theming.t
  const MONTHS = Theming.MONTHS

  let scene = 'notte'
  let busy = false
  let reply = null
  let pending = false
  let chapter = 1
  let workdir = ''
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
    const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
    let out = ''
    for (const [v, s] of t) while (n >= v) { out += s; n -= v }
    return out
  }

  function esc(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }

  // Markdown minimo: blocchi di codice, titoli, elenchi, paragrafi; nelle righe codice, grassetto, corsivo
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
  }
  function markdown(src) {
    const out = []
    src.replace(/\r/g, '').split(/\n?```/).forEach((part, i) => {
      if (i % 2 === 1) {
        const nl = part.indexOf('\n')
        out.push('<pre><code>' + esc(nl >= 0 ? part.slice(nl + 1) : part) + '</code></pre>')
        return
      }
      for (const para of part.split(/\n{2,}/)) {
        const lines = para.split('\n').filter((l) => l.trim() !== '')
        if (!lines.length) continue
        if (/^#{1,6} /.test(lines[0])) { out.push('<h3>' + inline(lines.shift().replace(/^#+ /, '')) + '</h3>') }
        if (!lines.length) continue
        if (lines.every((l) => /^\s*[-*] /.test(l))) out.push('<ul>' + lines.map((l) => '<li>' + inline(l.replace(/^\s*[-*] /, '')) + '</li>').join('') + '</ul>')
        else if (lines.every((l) => /^\s*\d+\. /.test(l))) out.push('<ol>' + lines.map((l) => '<li>' + inline(l.replace(/^\s*\d+\. /, '')) + '</li>').join('') + '</ol>')
        else out.push('<p>' + lines.map(inline).join('<br>') + '</p>')
      }
    })
    return out.join('')
  }

  function scrollDown() { log.scrollTop = log.scrollHeight }
  function add(cls, html) {
    const d = document.createElement('div')
    d.className = cls
    d.innerHTML = html
    log.appendChild(d)
    scrollDown()
    return d
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
  // Una voce della conversazione: chi scrive (dal tema) e il testo
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
    $('hint').textContent = t(busy ? 'busyHint' : 'hint')
    $('btn-scene').textContent = t(scene === 'notte' ? 'giorno' : 'notte')
    document.title = t('title')
  }

  // ------------------------------------------------------------------ pixel art e scena

  // Copia un disegno a bassa risoluzione nel suo canvas; la misura a schermo la decide il CSS o, se cssSize, il disegno
  function blit(target, drawn, cssSize) {
    if (target.width !== drawn.width || target.height !== drawn.height) {
      target.width = drawn.width
      target.height = drawn.height
    }
    if (cssSize) {
      target.style.width = `${drawn.width * Pixel.SCALE}px`
      target.style.height = `${drawn.height * Pixel.SCALE}px`
    }
    const ctx = target.getContext('2d')
    ctx.clearRect(0, 0, target.width, target.height)
    ctx.drawImage(drawn, 0, 0)
  }

  function paint() {
    const pal = Theming.palette(scene)
    Theming.applyScene(scene)
    $('sheet').style.backgroundImage = `url(${Theming.draw.paperTile(pal)})`
    for (const [id, where] of [['roll-top', 'top'], ['roll-bottom', 'bottom']]) {
      const target = $(id)
      blit(target, Theming.draw.roll(target.clientWidth || 452, pal, where))
    }
    const div = $('chapter-divider')
    const drawn = Theming.draw.divider(div.clientWidth || 240, pal)
    blit(div, drawn)
    div.style.height = `${drawn.height * Pixel.SCALE}px`
    for (const row of log.querySelectorAll('.tool')) row.querySelector('img').src = Theming.draw.icon(row.dataset.craft, pal)
    drawLamp()
    applyStrings()
  }

  let lampFrame = 0
  function drawLamp() {
    blit($('lamp'), Theming.draw.lamp(Theming.palette(scene), lampFrame, busy), true)
  }
  setInterval(() => { lampFrame++; drawLamp() }, 180)

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
    $('btn-send').hidden = on
    $('btn-stop').hidden = !on
    $('hint').textContent = t(on ? 'busyHint' : 'hint')
  }

  function sendMessage() {
    const text = input.value.trim()
    if (!text || busy) return
    input.value = ''
    reply = null
    entry('you').querySelector('.text').textContent = text
    setBusy(true)
    api.send(text)
  }

  api.onDelta((t) => {
    const r = startReply()
    r.raw += t
    if (!pending) { pending = true; requestAnimationFrame(renderReply) }
  })
  api.onTool(({ id, name, summary }) => {
    renderReply()
    reply = null
    const craft = craftOf(name)
    const row = add('tool', `<img alt=""><span>${esc(name)}</span><span class="what">${esc(summary || '')}</span>`)
    row.dataset.craft = craft
    row.querySelector('img').src = Theming.draw.icon(craft, Theming.palette(scene))
    tools.set(id, row)
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
  })
  api.onError((msg) => {
    renderReply()
    add('error', esc(String(msg)))
    reply = null
    setBusy(false)
  })

  async function newChapter() {
    const n = await api.newChapter()
    for (const el of [...log.children]) if (!el.classList.contains('chapter')) el.remove()
    reply = null
    currentSession = null
    setBusy(false)
    setChapter(n)
    input.focus()
  }

  // Il titolo del capitolo: "Capitolo" e la data vengono dal tema. Con una cronaca aperta il titolo è il suo
  function setChapter(n) {
    chapter = n || 1
    renderChapterHead()
  }
  function renderChapterHead() {
    if (currentSession) return
    const title = $('chapter-title')
    title.textContent = t('chapter')
    const num = document.createElement('span')
    num.className = 'num'
    num.textContent = roman(chapter)
    title.appendChild(num)
    $('chapter-date').textContent = Theming.chapterDate(new Date())
  }

  // ------------------------------------------------------------------ permessi

  const asks = new Map()

  api.onAsk(({ id, title, description, detail, canAlways }) => {
    renderReply()
    reply = null
    const card = add('ask', '<div class="ask-title"></div><div class="ask-desc"></div><div class="ask-detail"></div><div class="ask-buttons"></div>')
    card.querySelector('.ask-title').textContent = title
    card.querySelector('.ask-desc').textContent = description
    card.querySelector('.ask-detail').textContent = detail
    if (!description) card.querySelector('.ask-desc').remove()
    if (!detail) card.querySelector('.ask-detail').remove()
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

  let currentSession = null

  function formatWhen(ms) {
    const d = new Date(ms)
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  async function showSessions() {
    if (busy) return
    const panel = $('sessions')
    const list = $('sessions-list')
    list.innerHTML = '<div class="session-row"><span class="when"></span></div>'
    list.querySelector('.when').textContent = t('sessionsLoading')
    panel.hidden = false
    try {
      const sessions = await api.sessions()
      list.innerHTML = ''
      for (const s of sessions) {
        const row = document.createElement('div')
        row.className = 'session-row' + (s.id === currentSession ? ' current' : '')
        row.innerHTML = '<div class="title"></div><div class="when"></div>'
        row.querySelector('.title').textContent = s.title
        row.querySelector('.when').textContent = formatWhen(s.lastModified)
        row.addEventListener('click', () => openSession(s))
        list.appendChild(row)
      }
      if (!sessions.length) {
        list.innerHTML = '<div class="session-row"><span class="when"></span></div>'
        list.querySelector('.when').textContent = t('sessionsEmpty', { dir: workdir || 'cartella di lavoro' })
      }
    } catch (err) {
      list.innerHTML = `<div class="error">${esc(String(err.message || err))}</div>`
    }
  }

  async function openSession(s) {
    $('sessions').hidden = true
    for (const el of [...log.children]) if (!el.classList.contains('chapter')) el.remove()
    reply = null
    currentSession = s.id
    $('chapter-title').textContent = s.title.length > 34 ? s.title.slice(0, 33) + '…' : s.title
    $('chapter-date').textContent = formatWhen(s.lastModified)
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
    input.focus()
  }

  // ------------------------------------------------------------------ comandi e finestra

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } })
  $('btn-send').addEventListener('click', sendMessage)
  $('btn-stop').addEventListener('click', () => { api.stop(); labelled('error', 'stopped'); reply = null; setBusy(false) })
  $('btn-hide').addEventListener('click', () => api.hide())
  $('btn-quit').addEventListener('click', () => api.quit())
  $('btn-new').addEventListener('click', newChapter)
  $('btn-sessions').addEventListener('click', showSessions)
  $('btn-back').addEventListener('click', () => { $('sessions').hidden = true })
  $('btn-scene').addEventListener('click', () => { scene = scene === 'notte' ? 'giorno' : 'notte'; api.setScene(scene); paint() })
  api.onReset(newChapter)
  // Il tema scelto dal vassoio: si cambia sul posto, la conversazione resta
  api.onTheme((id) => { Theming.use(id); paint(); renderChapterHead(); api.setTrayIcon(Theming.draw.trayIcon(Theming.palette('notte'))) })

  // Spostare dal capo alto (non dai suoi pulsanti) e ridimensionare dalla maniglia: il gesto lo segue il processo
  // principale, la pagina dice solo quando comincia e quando finisce
  let gesturing = false
  function beginGesture(kind, e) {
    if (e.button !== 0) return
    e.preventDefault()
    gesturing = true
    document.querySelector('.roll.top').classList.toggle('dragging', kind === 'move')
    api.gestureStart(kind)
  }
  function endGesture() {
    if (!gesturing) return
    gesturing = false
    document.querySelector('.roll.top').classList.remove('dragging')
    api.gestureEnd()
  }
  document.querySelector('.roll.top').addEventListener('mousedown', (e) => { if (!e.target.closest('button')) beginGesture('move', e) })
  $('grip').addEventListener('mousedown', (e) => beginGesture('resize', e))
  window.addEventListener('mouseup', endGesture)
  window.addEventListener('blur', endGesture)

  // A ogni cambio di larghezza i capi del rotolo si ridisegnano, al più una volta per fotogramma
  let repaintQueued = false
  window.addEventListener('resize', () => {
    if (repaintQueued) return
    repaintQueued = true
    requestAnimationFrame(() => { repaintQueued = false; paint() })
  })

  // I clic attraversano la finestra tranne sopra il rotolo
  let interactive = null
  document.addEventListener('mousemove', (e) => {
    const over = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('#scroll')
    if (over !== interactive) { interactive = over; api.setInteractive(over) }
  })
  document.addEventListener('mouseleave', () => { interactive = false; api.setInteractive(false) })

  api.info().then(async (info) => {
    scene = info.scene === 'giorno' ? 'giorno' : 'notte'
    workdir = info.workdir || ''
    await Theming.load(info.themes || [])
    Theming.use(info.theme)
    setChapter(info.chapter)
    paint()
    api.setTrayIcon(Theming.draw.trayIcon(Theming.palette('notte')))
    input.focus()
  })

  // ------------------------------------------------------------------ anteprima senza Electron

  function fakeApi() {
    const handlers = {}
    const on = (name) => (cb) => { handlers[name] = cb }
    const fire = (name, v, ms) => setTimeout(() => handlers[name] && handlers[name](v), ms)
    let chapter = 1
    // Dalla console dell'anteprima: anteprima.tema('pergamena'), anteprima.permesso()
    window.anteprima = {
      tema: (id) => fire('onTheme', id, 0),
      permesso: () => fire('onAsk', { id: Date.now(), title: 'Claude vuole modificare un file', description: '', detail: 'src/MapView.cpp', canAlways: true }, 0),
    }
    return {
      // ?tema=<id>&scena=giorno nell'indirizzo per guardare un tema
      info: async () => {
        const q = new URLSearchParams(location.search)
        return { scene: q.get('scena') || 'notte', chapter, theme: q.get('tema') || 'terra-di-mezzo', themes: ['terra-di-mezzo', 'pergamena'], workdir: 'C:/Workspace' }
      },
      setInteractive() {}, hide() {}, quit() {}, setScene() {}, stop() {}, setTrayIcon() {}, answer() {}, gestureStart() {}, gestureEnd() {},
      sessions: async () => [{ id: 's1', title: '10/11 · Mod desktop Signore degli Anelli', lastModified: Date.now() }],
      openSession: async () => [{ role: 'user', text: 'Ciao' }, { role: 'assistant', text: 'Salve, viandante.' }],
      onAsk: on('onAsk'), onAskClosed: on('onAskClosed'),
      newChapter: async () => ++chapter,
      send(text) {
        fire('onTool', { id: 't1', name: 'Read', summary: 'src/MapView.cpp' }, 300)
        fire('onToolDone', { id: 't1', error: false }, 700)
        const answer = `Ecco quanto mi chiedi: "${text}".\n\nLa risposta arriva a pezzi, come in una vera conversazione, con **grassetto** e \`codice\`.`
        ;[...answer].forEach((ch, i) => fire('onDelta', ch, 900 + i * 15))
        fire('onDone', { durationMs: 2400 }, 900 + answer.length * 15 + 100)
        fire('onAsk', { id: 1, title: 'Claude vuole eseguire un comando', description: 'Il comando scrive fuori dalla cartella di lavoro.', detail: 'git push origin feature/sentieri', canAlways: true }, 900 + answer.length * 15 + 200)
      },
      onDelta: on('onDelta'), onTool: on('onTool'), onToolDone: on('onToolDone'), onDone: on('onDone'), onError: on('onError'), onReset: on('onReset'), onTheme: on('onTheme'),
    }
  }
})()
