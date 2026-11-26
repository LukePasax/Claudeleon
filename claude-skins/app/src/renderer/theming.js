// I temi: ognuno è una cartella in themes/ con un theme.js (e, se vuole, un theme.css). Questo file li carica, tiene
// il tema in uso e risponde alla pagina con il suo layout, le sue scritte, i suoi colori e i suoi disegni. Le scritte
// e i colori che un tema non definisce vengono dai valori di partenza qui sotto e in style.css. Guida: themes/LEGGIMI.md.
(function () {
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

  // Le scritte dell'interfaccia. {s}, {dir} ecc. si sostituiscono con i valori del momento
  const STRINGS = {
    title: 'Pergamena',
    chapter: 'Capitolo',
    placeholder: 'Intingi la penna e scrivi...',
    hint: 'Invio spedisce, Maiusc+Invio va a capo, / per i comandi',
    busyHint: 'Il messaggero è in viaggio...',
    send: 'Spedisci',
    stop: 'Ferma',
    stopped: 'Il messaggero è stato richiamato.',
    you: 'Tu scrivi:',
    claude: 'Claude scrive:',
    took: 'Vergato in {s} s',
    toolOk: 'ok',
    toolFail: 'errore',
    allow: 'Permetti',
    always: 'Sempre',
    deny: 'Nega',
    granted: 'Permesso concesso.',
    grantedAlways: 'Permesso concesso, anche per le prossime volte.',
    denied: 'Permesso negato.',
    cancelled: 'Richiesta annullata.',
    // I comandi con /
    cmdNone: 'Nessun comando con questo nome.',
    cmdLoading: 'Chiedo i comandi a Claude Code...',
    cmdUnavailable: 'Claude Code non ha dato l\'elenco dei comandi; si possono scrivere lo stesso.',
    cmdCompacting: 'Riassumo la conversazione...',
    cmdCompacted: 'Conversazione riassunta: da {pre} a {post} token.',
    cmdCompactedShort: 'Conversazione riassunta.',
    // Il modo dei permessi
    modesLabel: 'Permessi:',
    modeAuto: 'automatico',
    modeAutoTip: 'Un classificatore approva le azioni chiare e chiede solo quando non sa',
    modeDefault: 'chiedi sempre',
    modeDefaultTip: 'Chiede prima di ogni azione a rischio: comandi, modifiche ai file, rete',
    modeAcceptEdits: 'accetta modifiche',
    modeAcceptEditsTip: 'Le modifiche ai file passano senza chiedere; comandi e rete si chiedono',
    modePlan: 'piano',
    modePlanTip: 'Claude legge e propone un piano, senza toccare nulla finché non lo approvi',
    // Il piano proposto alla fine del modo piano
    planTitle: 'Claude propone un piano',
    planEmpty: 'Il piano è nella risposta qui sopra.',
    planApprove: 'Approva il piano',
    planKeep: 'Continua a pianificare',
    planApproved: 'Piano approvato: Claude procede.',
    planKept: 'Claude continua a pianificare.',
    // Le modifiche ai file
    diffMore: 'Mostra altre {n} righe',
    diffLess: 'Mostra meno',
    diffGap: '··· {n} righe uguali',
    diffNew: 'File nuovo.',
    diffWhole: 'Scritto per intero: ecco il contenuto.',
    diffAll: 'In tutte le occorrenze nel file.',
    diffTooBig: 'Modifica troppo grande da mostrare qui.',
    diffSame: 'Nessuna differenza.',
    newChapter: 'nuovo capitolo',
    sessions: 'cronache',
    sessionsTitle: 'Le cronache',
    sessionsLoading: 'Sfoglio le cronache...',
    sessionsEmpty: 'Nessuna cronaca in {dir}.',
    back: 'Torna',
    copying: 'Ricopio la cronaca...',
    continueHere: 'Da qui in poi si scrive nella stessa cronaca.',
    // Il pulsante della scena mostra il nome dell'altra
    notte: 'notte',
    giorno: 'giorno',
    hideTip: 'Nascondi (si riapre col vassoio o con la scorciatoia)',
    quitTip: 'Chiudi',
    gripTip: 'Trascina per allargare o allungare il rotolo',
  }

  // I colori della pixel art per scena. Un tema ridefinisce solo le chiavi che cambia; i colori dell'interfaccia
  // (variabili CSS) hanno i loro valori di partenza in style.css
  const PALETTES = {
    notte: {
      paper: ['#3a2f1f', '#342a1b', '#2f2618', '#403422'], paperEdge: '#1c160d',
      roll: ['#5a4526', '#7a5f35', '#9c7c46', '#b8955a', '#8a6c3c', '#5f4828', '#3d2e18'],
      knob: ['#5a3d10', '#9a6a1a', '#d4a338', '#ffe7a0'],
      ink: '#e8d9b5', inkSoft: '#a8946a', gold: '#d4a338', goldLight: '#ffe7a0', red: '#c0441e', blue: '#5b8590',
      flame: ['#ff6a2a', '#ffb347', '#ffe7a0'], wax: '#e8d9b5', waxShade: '#b8a684',
    },
    giorno: {
      paper: ['#ead9ad', '#e3cf9e', '#dcc690', '#f0e2bc'], paperEdge: '#a8783f',
      roll: ['#8a6a3a', '#b08a52', '#d4b07a', '#ecd3a0', '#c29c62', '#94723e', '#6b5230'],
      knob: ['#5a3d10', '#9a6a1a', '#c8963a', '#f6d98a'],
      ink: '#3a2a18', inkSoft: '#7b6343', gold: '#9a6a1a', goldLight: '#c8963a', red: '#a0381a', blue: '#3f6670',
      flame: ['#e0663a', '#f0a040', '#fff0b0'], wax: '#fff8e6', waxShade: '#d8c9a5',
    },
  }

  function plainDate(d) {
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  }

  const registry = new Map()
  let current = { id: 'nessuno' }
  let setVars = []

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = resolve
      // Un tema rotto non blocca gli altri: semplicemente non compare
      s.onerror = () => { console.warn('Tema non caricato:', src); resolve() }
      document.head.appendChild(s)
    })
  }

  // ids: le cartelle dei temi. Ogni theme.js si registra in window.SkinsThemes
  async function load(ids) {
    window.SkinsThemes = window.SkinsThemes || []
    await Promise.all(ids.map((id) => loadScript(`themes/${id}/theme.js`)))
    for (const th of window.SkinsThemes) if (th && th.id && !registry.has(th.id)) registry.set(th.id, th)
    return [...registry.values()].map((th) => ({ id: th.id, name: th.name || th.id }))
  }

  // Sceglie il tema (se l'id non c'è, il primo caricato) e carica il suo theme.css al posto di quello del tema
  // precedente: è attivo un solo foglio di tema alla volta, quindi le sue regole non hanno bisogno di prefissi
  function use(id) {
    current = registry.get(id) || registry.values().next().value || { id: 'nessuno' }
    document.body.dataset.theme = current.id
    const old = document.getElementById('theme-css')
    if (!current.css) {
      if (old) old.remove()
      return Promise.resolve(current)
    }
    return new Promise((resolve) => {
      const link = document.createElement('link')
      link.id = 'theme-css'
      link.rel = 'stylesheet'
      link.href = `themes/${current.id}/theme.css`
      link.onload = link.onerror = () => resolve(current)
      if (old) old.replaceWith(link)
      else document.head.appendChild(link)
    })
  }

  // Le scene sono due, 'notte' e 'giorno'; un tema può definirne una sola o nessuna
  function scene(name) {
    const key = name === 'giorno' ? 'giorno' : 'notte'
    return (current.scenes && current.scenes[key]) || {}
  }

  // Le variabili CSS della scena, in linea su body: le precedenti si tolgono, così un tema non lascia colori a quello dopo
  function applyScene(name) {
    const root = document.body.style
    for (const v of setVars) root.removeProperty(v)
    setVars = []
    for (const [k, v] of Object.entries(scene(name).vars || {})) {
      const prop = k.startsWith('--') ? k : `--${k}`
      root.setProperty(prop, v)
      setVars.push(prop)
    }
    document.body.classList.toggle('giorno', name === 'giorno')
  }

  function t(key, vars) {
    const s = (current.strings && current.strings[key]) ?? STRINGS[key] ?? key
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s
  }

  // La data sotto il titolo del capitolo: un tema può avere il suo calendario
  function chapterDate(d) {
    return current.date ? current.date(d, plainDate) : plainDate(d)
  }

  // Un disegno del tema per nome (data-art, data-art-bg): restituisce un canvas, o null se il tema non ce l'ha
  const warned = new Set()
  function art(name, options) {
    const fn = current.art && current.art[name]
    if (typeof fn !== 'function') {
      if (!warned.has(current.id + name)) { warned.add(current.id + name); console.warn(`Il tema ${current.id} non disegna "${name}"`) }
      return null
    }
    try {
      return fn(options)
    } catch (err) {
      console.warn(`Tema ${current.id}, disegno "${name}":`, err)
      return null
    }
  }

  // Le icone dei mestieri: quelle del tema, altrimenti quelle di partenza
  function icon(craft, pal) {
    return Pixel.icon(craft, pal, Object.assign({}, Pixel.ICONS, (current.art && current.art.icons) || {}))
  }

  // L'icona del vassoio, 32×32: quella del tema (un canvas 16×16) o il rotolino di partenza
  function trayIcon(pal) {
    const fn = current.art && current.art.trayIcon
    const drawn = typeof fn === 'function' ? fn({ pal }) : Pixel.lib.trayScroll()
    return Pixel.upscale(drawn, 32, 32)
  }

  window.Theming = {
    load, use, applyScene, t, chapterDate, plainDate, art, icon, trayIcon, MONTHS,
    get current() { return current },
    palette: (name) => Object.assign({}, PALETTES[name === 'giorno' ? 'giorno' : 'notte'], scene(name).palette || {}),
  }
})()
