// I temi: ognuno è una cartella in themes/ con un theme.js (e, se vuole, un theme.css). Questo file li carica, tiene
// il tema in uso e risponde alla pagina con le sue scritte, i suoi colori e i suoi disegni; quello che un tema non
// definisce viene dai valori di partenza qui sotto e dai disegni di partenza di pixel.js. Guida: themes/LEGGIMI.md.
(function () {
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

  // Le scritte dell'interfaccia. {s}, {dir} ecc. si sostituiscono con i valori del momento
  const STRINGS = {
    title: 'Pergamena',
    chapter: 'Capitolo',
    placeholder: 'Intingi la penna e scrivi...',
    hint: 'Invio spedisce, Maiusc+Invio va a capo',
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
  let current = null
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

  // ids: le cartelle dei temi. I theme.js si registrano in window.PergamenaThemes; i theme.css valgono solo sotto
  // body[data-theme="<id>"], quindi si caricano tutti subito e cambiare tema non ricarica nulla
  async function load(ids) {
    window.PergamenaThemes = window.PergamenaThemes || []
    await Promise.all(ids.map((id) => loadScript(`themes/${id}/theme.js`)))
    for (const t of window.PergamenaThemes) {
      if (!t || !t.id || registry.has(t.id)) continue
      registry.set(t.id, t)
      if (t.css) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = `themes/${t.id}/theme.css`
        document.head.appendChild(link)
      }
    }
    return [...registry.values()].map((t) => ({ id: t.id, name: t.name || t.id }))
  }

  // Sceglie il tema; se l'id non c'è, il primo caricato
  function use(id) {
    current = registry.get(id) || registry.values().next().value || { id: 'nessuno', scenes: {} }
    document.body.dataset.theme = current.id
    return current
  }

  // Le scene sono due, 'notte' e 'giorno'; un tema può definirne una sola o nessuna
  function scene(name) {
    const key = name === 'giorno' ? 'giorno' : 'notte'
    return (current.scenes && current.scenes[key]) || {}
  }

  // Le variabili CSS della scena: le precedenti si tolgono, così un tema non lascia colori a quello dopo
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

  // I disegni: quello del tema se c'è, altrimenti quello di partenza
  function art(name) {
    const a = current.art || {}
    return typeof a[name] === 'function' ? a[name] : Pixel.defaults[name]
  }
  const draw = {
    paperTile: (pal) => art('paperTile')(pal),
    roll: (w, pal, where) => art('roll')(w, pal, where),
    divider: (w, pal) => art('divider')(w, pal),
    icon: (craft, pal) => Pixel.defaults.icon(craft, pal, Object.assign({}, Pixel.ICONS, (current.art && current.art.icons) || {})),
    lamp: (pal, frame, busy) => art('lamp')(pal, frame, busy),
    trayIcon: (pal) => art('trayIcon')(pal),
  }

  window.Theming = {
    load, use, applyScene, t, chapterDate, plainDate, draw, MONTHS,
    get current() { return current },
    palette: (name) => Object.assign({}, PALETTES[name === 'giorno' ? 'giorno' : 'notte'], scene(name).palette || {}),
  }
})()
