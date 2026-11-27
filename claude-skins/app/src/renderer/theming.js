// I temi: ognuno è una cartella in themes/ con un theme.js (e, se vuole, un theme.css). Questo file li carica, tiene
// il tema in uso e risponde alla pagina con il suo layout, le sue scritte, i suoi colori e i suoi disegni. Le scritte
// e i colori che un tema non definisce vengono dai valori di partenza qui sotto e in style.css. Guida: themes/LEGGIMI.md.
(function () {
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

  // Le scritte dell'interfaccia. {s}, {dir} ecc. si sostituiscono con i valori del momento
  const STRINGS = {
    title: 'Claude Skins',
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
    // Il selettore dei temi
    themes: 'temi',
    themesTitle: 'Scegli il tema',
    themesCurrent: 'in uso',
    themesClose: 'Chiudi',
    // Che cosa fa Claude, a parole ({x}: il file, la ricerca, il sito...); quando Claude scrive lui la descrizione
    // (Bash, Agent) si usa quella
    tool_read: 'Legge {x}',
    tool_edit: 'Modifica {x}',
    tool_write: 'Scrive {x}',
    tool_grep: 'Cerca «{x}» nel codice',
    tool_glob: 'Cerca i file {x}',
    tool_run: 'Esegue un comando',
    tool_fetch: 'Legge una pagina di {x}',
    tool_search: 'Cerca sul web «{x}»',
    tool_todo: 'Aggiorna la lista delle cose da fare',
    tool_skill: 'Usa la skill {x}',
    tool_agent: 'Affida un compito a un aiutante',
    tool_plan: 'Propone un piano',
    tool_mcp: 'Usa {x}',
    tool_other: 'Usa {x}',
    // La cartella della conversazione
    folderPick: 'Scegli la cartella',
    folderTitle: 'Dove lavora Claude',
    folderFirst: 'In quale cartella lavoriamo? Scegline una e il messaggio parte.',
    folderNew: 'Una conversazione resta nella sua cartella: sceglierne un\'altra apre un capitolo nuovo.',
    folderOther: 'Scegli un\'altra cartella…',
    // Le domande di Claude con le opzioni
    qSubmit: 'Rispondi',
    qSkip: 'Salta',
    qOther: 'Altro: scrivi tu la risposta…',
    qAnswered: 'Risposto.',
    qSkipped: 'Domande saltate.',
    // La lista delle attività
    todosTitle: 'Attività · {done} di {total}',
    // Modello e ragionamento
    modelDefault: 'Modello predefinito',
    modelDefaultDesc: 'Quello scelto nelle impostazioni di Claude Code',
    modelTitle: 'Modello',
    modelNote: 'Le scelte valgono subito, anche per la conversazione in corso.',
    ultracode: 'Ultracode',
    ultracodeDesc: 'Orchestrazione dinamica dei flussi di lavoro, a qualunque livello di ragionamento',
    modelNone: 'L\'elenco dei modelli arriva da Claude Code poco dopo l\'avvio.',
    effortTitle: 'Ragionamento',
    // I livelli coi nomi dell'app desktop
    effortAuto: 'Predefinito',
    effort_low: 'Low',
    effort_medium: 'Medium',
    effort_high: 'High',
    effort_xhigh: 'Extra',
    effort_max: 'Max',
    // La riga "sta lavorando": un verbo a caso, separati da |
    workingVerbs: 'Claudando|Rimuginando|Elucubrando|Architettando|Cogitando|Ponderando|Arzigogolando|Macinando|Districando|Combinando',
    workingEsc: 'Esc per fermare',
    // Le risposte suggerite
    suggestionTip: 'Manda questa risposta (Tab la scrive nella casella)',
    // Il nome dell'app, per i temi che lo scrivono nella testata
    appTitle: 'Claude Skins',
    // I file da citare con @
    fileNone: 'Nessun file con questo nome nella cartella della conversazione.',
    // Modificare un messaggio
    editMessage: 'Modifica',
    editSend: 'Invia',
    editCancel: 'Annulla',
    editRestore: 'Riporta anche i file a prima di questo messaggio',
    rewindOk: 'File riportati a prima del messaggio: {n} (+{plus} −{minus} righe).',
    rewindFail: 'I file non si possono riportare indietro: {err}',
    // Copiare
    copy: 'Copia',
    copied: 'Copiato',
    copyCode: 'Copia il codice',
    copyReply: 'Copia la risposta',
    copyMessage: 'Copia il messaggio',
    // Il ragionamento di Claude
    thinkingNow: 'Sta ragionando…',
    thinkingDone: 'Ha ragionato per {s} s',
    thinkingPast: 'Ragionamento',
    // Il contesto
    contextTip: 'Contesto: {p}% ({used} di {max} token)',
    contextNone: 'Contesto: il conto arriva dopo la prima risposta',
    contextTitle: 'Contesto · {p}%',
    contextOf: '{used} di {max} token',
    contextCompact: 'Compatta ora',
    contextNote: 'Quando si riempie, Claude Code riassume da solo la conversazione per fare spazio.',
    ctx_system_prompt: 'Prompt di sistema',
    ctx_system_tools: 'Strumenti di Claude Code',
    ctx_mcp_tools: 'Strumenti MCP',
    ctx_mcp_instructions: 'Istruzioni dei server MCP',
    ctx_custom_agents: 'Agenti',
    ctx_memory_files: 'Memoria (CLAUDE.md)',
    ctx_skills: 'Skill',
    ctx_messages: 'Conversazione',
    ctx_autocompact_buffer: 'Riserva per la compattazione',
    ctx_compact_buffer: 'Riserva per la compattazione',
    ctx_free_space: 'Spazio libero',
    contextEstimate: 'circa {used} di {max} token, dall\'ultima risposta salvata',
    usageTitle: 'Utilizzo del piano',
    usage5h: 'Sessione (5 ore)',
    usageWeek: 'Settimana',
    usageWeekOpus: 'Settimana · Opus',
    usageWeekSonnet: 'Settimana · Sonnet',
    usageAt: 'si azzera {when}',
    usageNone: 'L\'utilizzo arriva da Claude Code poco dopo l\'avvio (solo con l\'abbonamento claude.ai).',
    contextEmpty: 'Il conto del contesto arriva dopo la prima risposta di questa conversazione.',
    // Gli annali: ricerca, gruppi, menu di ogni conversazione
    sessionsSearch: 'Cerca…',
    sessionsNoMatch: 'Nessuna conversazione con «{q}».',
    sessionsArchived: 'Archiviate ({n})',
    sessionsHideArchived: 'Nascondi le archiviate',
    groupToday: 'Oggi',
    groupYesterday: 'Ieri',
    groupWeek: 'Ultimi 7 giorni',
    groupMonth: 'Ultimi 30 giorni',
    groupOlder: 'Più vecchie',
    groupArchived: 'Archiviate',
    sessionMenu: 'Altre azioni',
    sessionRename: 'Rinomina',
    sessionArchive: 'Archivia',
    sessionUnarchive: 'Ripristina',
    sessionDelete: 'Elimina…',
    // Gli allegati
    attachTip: 'Allega file o immagini (anche incollando o trascinando)',
    attachRemove: 'Togli',
    attachNoPath: '«{name}» non ha un percorso sul disco: trascinalo da Esplora file o sceglilo col pulsante +.',
    attachFailed: 'Non riesco a leggere l\'immagine «{name}».',
    // I comandi con /
    cmdNone: 'Nessun comando con questo nome.',
    cmdLoading: 'Chiedo i comandi a Claude Code...',
    cmdUnavailable: 'Claude Code non ha dato l\'elenco dei comandi; si possono scrivere lo stesso.',
    cmdCompacting: 'Riassumo la conversazione...',
    cmdCompacted: 'Conversazione riassunta: da {pre} a {post} token.',
    cmdCompactedShort: 'Conversazione riassunta.',
    // Il modo dei permessi
    modesLabel: 'Permessi:',
    modesTitle: 'Permessi',
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
    diffThen: 'Il contenuto scritto allora (il file può essere cambiato da così).',
    diffAll: 'In tutte le occorrenze nel file.',
    diffTooBig: 'Modifica troppo grande da mostrare qui.',
    diffSame: 'Nessuna differenza.',
    newChapter: 'nuovo capitolo',
    sessions: 'cronache',
    sessionsTitle: 'Le cronache',
    sessionsLoading: 'Sfoglio le cronache...',
    sessionsEmpty: 'Nessuna cronaca: Claude Code non ha ancora conversazioni salvate su questo computer.',
    back: 'Torna',
    copying: 'Ricopio la cronaca...',
    continueHere: 'Da qui in poi si scrive nella stessa cronaca.',
    // Il pulsante della scena mostra il nome dell'altra
    notte: 'notte',
    giorno: 'giorno',
    hideTip: 'Riduci a icona',
    maxTip: 'Ingrandisci (F11: schermo intero)',
    restoreTip: 'Ripristina',
    quitTip: 'Chiudi',
    gripTip: 'Trascina per allargare o allungare la finestra',
  }

  // I colori della pixel art per scena. Un tema ridefinisce solo le chiavi che cambia; i colori dell'interfaccia
  // (variabili CSS) hanno i loro valori di partenza in style.css
  const PALETTES = {
    notte: {
      paper: ['#3a2f1f', '#342a1b', '#2f2618', '#403422'], paperEdge: '#1c160d',
      roll: ['#5a4526', '#7a5f35', '#9c7c46', '#b8955a', '#8a6c3c', '#5f4828', '#3d2e18'],
      knob: ['#5a3d10', '#9a6a1a', '#d4a338', '#ffe7a0'],
      ink: '#e8d9b5', inkSoft: '#a8946a', gold: '#d4a338', goldLight: '#ffe7a0', red: '#c0441e', blue: '#5b8590',
      flame: ['#ff6a2a', '#ffb347', '#ffe7a0'], wax: '#e8d9b5', waxShade: '#b8a684', iconDark: '#9a6a1a',
    },
    giorno: {
      paper: ['#ead9ad', '#e3cf9e', '#dcc690', '#f0e2bc'], paperEdge: '#a8783f',
      roll: ['#8a6a3a', '#b08a52', '#d4b07a', '#ecd3a0', '#c29c62', '#94723e', '#6b5230'],
      knob: ['#5a3d10', '#9a6a1a', '#c8963a', '#f6d98a'],
      ink: '#3a2a18', inkSoft: '#7b6343', gold: '#9a6a1a', goldLight: '#c8963a', red: '#a0381a', blue: '#3f6670',
      flame: ['#e0663a', '#f0a040', '#fff0b0'], wax: '#fff8e6', waxShade: '#d8c9a5', iconDark: '#5a3d10',
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
    // Nell'ordine dato (il predefinito per primo, poi per nome), non in quello in cui i file finiscono di caricarsi
    const loaded = new Map(window.SkinsThemes.filter((th) => th && th.id).map((th) => [th.id, th]))
    for (const id of [...ids, ...loaded.keys()]) if (loaded.has(id) && !registry.has(id)) registry.set(id, loaded.get(id))
    return [...registry.values()].map((th) => ({ id: th.id, name: th.name || th.id }))
  }

  // Sceglie il tema (se l'id non c'è, il primo caricato) e carica i suoi fogli al posto di quelli del tema
  // precedente: prima i kit che include (kits/<nome>.css, per esempio la pixel art), poi il suo theme.css. È attivo
  // un solo tema alla volta, quindi le sue regole non hanno bisogno di prefissi
  function use(id) {
    current = registry.get(id) || registry.values().next().value || { id: 'nessuno' }
    document.body.dataset.theme = current.id
    for (const old of document.querySelectorAll('link[data-theme-css]')) old.remove()
    const sheets = [...(current.kits || []).map((k) => `kits/${k}.css`), ...(current.css ? [`themes/${current.id}/theme.css`] : [])]
    return Promise.all(sheets.map((href) => new Promise((resolve) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.dataset.themeCss = ''
      link.onload = link.onerror = resolve
      document.head.appendChild(link)
    }))).then(() => current)
  }

  // Un file della cartella del tema (immagini, caratteri, suoni), come indirizzo per la pagina
  function asset(path, theme = current) {
    return `themes/${theme.id}/${String(path).replace(/^\.?\//, '')}`
  }

  // I disegni del tema sono ingranditi di questa scala (data-art-scale la cambia per un elemento)
  function artScale() {
    return Number(current.artScale) || Pixel.SCALE
  }

  // Le scene sono due, 'notte' e 'giorno'; un tema può definirne una sola o nessuna
  function scene(name, theme = current) {
    const key = name === 'giorno' ? 'giorno' : 'notte'
    return (theme.scenes && theme.scenes[key]) || {}
  }

  function paletteOf(theme, name) {
    return Object.assign({}, PALETTES[name === 'giorno' ? 'giorno' : 'notte'], scene(name, theme).palette || {})
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

  // L'icona di un mestiere, come { src, pixel }. Un tema la dà in art.icons in uno di questi modi: righe di una bitmap
  // (pixel art), un canvas, un SVG scritto nel codice ('<svg ...'), un file della sua cartella ('icone/leggere.svg')
  // o una funzione ({ pal, scene, craft }) che restituisce uno di questi. Senza, l'icona a pixel di partenza
  function icon(craft, pal, sceneName) {
    const icons = (current.art && current.art.icons) || {}
    // Un mestiere che il tema non disegna: per un tema pixel l'icona a pixel di partenza di quel mestiere, per gli
    // altri la loro icona "altro" (una bitmap in mezzo a icone SVG starebbe male)
    const pixelTheme = (current.kits || []).includes('pixel')
    let v = icons[craft] ?? (pixelTheme ? undefined : icons.altro)
    try {
      if (typeof v === 'function') v = v({ pal, scene: sceneName, craft })
    } catch {
      v = null
    }
    if (Array.isArray(v)) return { src: Pixel.bitmap(v, Pixel.iconColors(pal)).toDataURL(), pixel: true }
    if (v && typeof v.toDataURL === 'function') return { src: v.toDataURL(), pixel: v.width <= 16 }
    if (typeof v === 'string' && v.trim().startsWith('<svg')) return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(v)}`, pixel: false }
    if (typeof v === 'string' && v.startsWith('data:')) return { src: v, pixel: false }
    if (typeof v === 'string' && v) return { src: asset(v), pixel: false }
    return { src: Pixel.icon(craft, pal, Pixel.ICONS), pixel: true }
  }

  // Gli agganci del tema: funzioni che il motore chiama quando succede qualcosa (vedi themes/LEGGIMI.md); un errore
  // di un tema non ferma l'app
  function hook(name, ctx, ...args) {
    const fn = current.hooks && current.hooks[name]
    if (typeof fn !== 'function') return
    try {
      fn(ctx, ...args)
    } catch (err) {
      console.warn(`Tema ${current.id}, aggancio "${name}":`, err)
    }
  }

  // L'icona del vassoio, 32×32: quella del tema (un canvas 16×16) o il rotolino di partenza
  function trayIcon(pal) {
    const fn = current.art && current.art.trayIcon
    const drawn = typeof fn === 'function' ? fn({ pal }) : Pixel.lib.trayScroll()
    return Pixel.upscale(drawn, 32, 32)
  }

  // L'icona dell'app (barra delle applicazioni, menu Start), grande: lo stesso disegno del vassoio a 256 pixel. Un
  // disegno a misura libera (trayIcon({ size })) si disegna grande; uno a pixel si ingrandisce a pixel pieni
  function appIcon(pal, size = 256) {
    const fn = current.art && current.art.trayIcon
    let drawn = null
    try { drawn = typeof fn === 'function' ? fn({ pal, size }) : null } catch {}
    if (!drawn) drawn = Pixel.lib.trayScroll()
    return Pixel.upscale(drawn, size, size)
  }

  // L'anteprima di un tema qualunque (anche non in uso) per il selettore: 48×30 pixel con la sua carta, il suo
  // capo o la sua copertina (un tratto del disegno roll o leather), un filo d'oro e la sua icona del vassoio
  function preview(id, sceneName) {
    const theme = registry.get(id)
    if (!theme) return null
    const pal = paletteOf(theme, sceneName)
    const a = theme.art || {}
    // Un tema può disegnare la sua anteprima (144×90, o più piccola per la pixel art)
    if (typeof a.preview === 'function') {
      try {
        const own = a.preview({ pal, scene: sceneName, width: 144, height: 90 })
        if (own) return own
      } catch {}
    }
    const W = 48
    const H = 30
    const c = Pixel.canvas(W, H)
    const ctx = c.getContext('2d')
    const tryArt = (name, opts) => {
      try { return typeof a[name] === 'function' ? a[name](Object.assign({ pal, scene: sceneName, frame: 0, busy: false }, opts)) : null } catch { return null }
    }
    const paper = tryArt('paper', { width: 96, height: 96, w: 32, h: 32 }) || Pixel.lib.paperTile(pal)
    ctx.fillStyle = ctx.createPattern(paper, 'repeat')
    ctx.fillRect(0, 0, W, H)
    const band = tryArt('leather', { width: 72, height: 72, w: 24, h: 24 })
    if (band) {
      ctx.fillStyle = ctx.createPattern(band, 'repeat')
      ctx.fillRect(0, 0, W, 7)
    } else {
      const roll = tryArt('roll', { width: W * 3, height: 36, w: W, h: 12 }) || Pixel.lib.roll(W, pal)
      ctx.drawImage(roll, 0, 0, W, 12, 0, -3, W, 12)
    }
    ctx.fillStyle = pal.gold
    ctx.fillRect(0, 7, W, 1)
    let icon = null
    try { icon = typeof a.trayIcon === 'function' ? a.trayIcon({ pal }) : Pixel.lib.trayScroll() } catch {}
    if (icon) ctx.drawImage(icon, (W - icon.width) / 2, 10)
    return c
  }

  window.Theming = {
    preview,
    // I temi caricati, per il selettore: id, nome, descrizione
    list: () => [...registry.values()].map((th) => ({ id: th.id, name: th.name || th.id, description: th.description || '' })),
    load, use, applyScene, t, chapterDate, plainDate, art, icon, trayIcon, appIcon, hook, asset, artScale, MONTHS,
    get current() { return current },
    palette: (name) => paletteOf(current, name),
  }
})()
