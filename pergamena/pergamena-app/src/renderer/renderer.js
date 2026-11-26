// La pagina del rotolo: disegna la pixel art, mostra la conversazione e passa i messaggi al processo principale.
// Senza Electron (aperta in un browser) la chat risponde con un'eco finta, per guardare la grafica.
(function () {
  const api = window.pergamena || fakeApi()
  const $ = (id) => document.getElementById(id)
  const log = $('log')
  const input = $('input')
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

  let scene = 'notte'
  let busy = false
  let reply = null
  let pending = false
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

  // ------------------------------------------------------------------ pixel art e scena

  function paint() {
    const pal = Pixel.PALETTES[scene]
    document.body.classList.toggle('giorno', scene === 'giorno')
    $('sheet').style.backgroundImage = `url(${Pixel.paperTile(pal)})`
    for (const id of ['roll-top', 'roll-bottom']) {
      const target = $(id)
      const drawn = Pixel.roll(target.clientWidth || 452, pal)
      target.width = drawn.width
      target.height = drawn.height
      target.getContext('2d').drawImage(drawn, 0, 0)
    }
    for (const row of log.querySelectorAll('.tool')) row.querySelector('img').src = Pixel.icon(row.dataset.craft, pal)
    $('btn-scene').textContent = scene === 'notte' ? 'giorno' : 'notte'
  }

  let flameFrame = 0
  function drawCandle() {
    const c = $('candle')
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(Pixel.candle(Pixel.PALETTES[scene], flameFrame++, busy), 0, 0)
  }
  setInterval(drawCandle, 180)

  // ------------------------------------------------------------------ conversazione

  function startReply() {
    if (!reply) {
      reply = add('entry claude', '<div class="who">Claude scrive:</div><div class="text"></div>')
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
    $('hint').textContent = on ? 'Il messaggero è in viaggio...' : 'Invio spedisce, Maiusc+Invio va a capo'
  }

  function sendMessage() {
    const text = input.value.trim()
    if (!text || busy) return
    input.value = ''
    reply = null
    add('entry you', '<div class="who">Tu scrivi:</div><div class="text"></div>').querySelector('.text').textContent = text
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
    row.querySelector('img').src = Pixel.icon(craft, Pixel.PALETTES[scene])
    tools.set(id, row)
  })
  api.onToolDone(({ id, error }) => { const row = tools.get(id); if (row) row.classList.add(error ? 'fail' : 'done') })
  api.onDone(({ durationMs }) => {
    renderReply()
    add('footnote', `Vergato in ${Math.round((durationMs || 0) / 1000)} s`)
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

  function setChapter(n) {
    const today = new Date()
    $('chapter-title').innerHTML = `Capitolo<span class="num">${roman(n || 1)}</span>`
    $('chapter-date').textContent = `${today.getDate()} ${MONTHS[today.getMonth()]} ${today.getFullYear()}`
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
    const choice = (label, cls, allow, always, outcome) => {
      const b = document.createElement('button')
      b.className = `pix small ${cls}`
      b.textContent = label
      b.addEventListener('click', () => {
        api.answer(id, allow, always)
        buttons.outerHTML = `<div class="ask-outcome">${esc(outcome)}</div>`
        asks.delete(id)
      })
      buttons.appendChild(b)
    }
    choice('Permetti', '', true, false, 'Permesso concesso.')
    if (canAlways) choice('Sempre', '', true, true, 'Permesso concesso, anche per le prossime volte.')
    choice('Nega', 'deny', false, false, 'Permesso negato.')
    asks.set(id, card)
  })

  api.onAskClosed(({ id }) => {
    const card = asks.get(id)
    if (!card) return
    const buttons = card.querySelector('.ask-buttons')
    if (buttons) buttons.outerHTML = '<div class="ask-outcome">Richiesta annullata.</div>'
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
    list.innerHTML = '<div class="session-row"><span class="when">Sfoglio le cronache...</span></div>'
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
      if (!sessions.length) list.innerHTML = '<div class="session-row"><span class="when">Nessuna cronaca in C:\\Workspace.</span></div>'
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
    const loading = add('footnote', 'Ricopio la cronaca...')
    try {
      const history = await api.openSession(s.id)
      loading.remove()
      // Delle cronache lunghe bastano gli ultimi scambi
      for (const m of history.slice(-40)) {
        if (m.role === 'user') add('entry you', '<div class="who">Tu scrivi:</div><div class="text"></div>').querySelector('.text').textContent = m.text
        else add('entry claude', '<div class="who">Claude scrive:</div><div class="text"></div>').querySelector('.text').innerHTML = markdown(m.text)
      }
      add('footnote', 'Da qui in poi si scrive nella stessa cronaca.')
    } catch (err) {
      loading.remove()
      add('error', esc(String(err.message || err)))
    }
    input.focus()
  }

  // ------------------------------------------------------------------ comandi e finestra

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } })
  $('btn-send').addEventListener('click', sendMessage)
  $('btn-stop').addEventListener('click', () => { api.stop(); add('error', 'Il messaggero è stato richiamato.'); reply = null; setBusy(false) })
  $('btn-hide').addEventListener('click', () => api.hide())
  $('btn-quit').addEventListener('click', () => api.quit())
  $('btn-new').addEventListener('click', newChapter)
  $('btn-sessions').addEventListener('click', showSessions)
  $('btn-back').addEventListener('click', () => { $('sessions').hidden = true })
  $('btn-scene').addEventListener('click', () => { scene = scene === 'notte' ? 'giorno' : 'notte'; api.setScene(scene); paint() })
  api.onReset(newChapter)

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

  api.info().then((info) => {
    scene = info.scene === 'giorno' ? 'giorno' : 'notte'
    setChapter(info.chapter)
    paint()
    api.setTrayIcon(Pixel.trayIcon(Pixel.PALETTES.notte))
    input.focus()
  })

  // ------------------------------------------------------------------ anteprima senza Electron

  function fakeApi() {
    const handlers = {}
    const on = (name) => (cb) => { handlers[name] = cb }
    const fire = (name, v, ms) => setTimeout(() => handlers[name] && handlers[name](v), ms)
    let chapter = 1
    return {
      info: async () => ({ scene: 'notte', chapter }),
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
      },
      onDelta: on('onDelta'), onTool: on('onTool'), onToolDone: on('onToolDone'), onDone: on('onDone'), onError: on('onError'), onReset: on('onReset'),
    }
  }
})()
