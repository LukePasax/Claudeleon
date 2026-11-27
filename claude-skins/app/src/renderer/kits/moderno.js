// Kit "moderno": la struttura comune dei temi puliti, come un'app di oggi. Niente pixel art: caratteri di sistema,
// angoli arrotondati, icone SVG. La finestra è un riquadro con l'ombra che galleggia sul desktop: a sinistra le
// conversazioni recenti, a destra la conversazione in una colonna leggibile e la casella in basso; un punto che pulsa
// dice che cosa sta facendo Claude. Un tema del kit dà solo identità e colori: kit({ id, name, description, look }).
//
// look ha due parti: palette (i colori dei disegni: icone, anteprima, vassoio) e vars (le variabili CSS di style.css e
// di kits/moderno.css). Il tema ha un aspetto solo, chiaro o scuro: vale per tutte e due le scene, e il pulsante
// notte/giorno non c'è.
//
// Lo carica index.html prima dei temi (window.SkinsKits.moderno); il processo principale lo prende con require.
;(function () {
  // Un'icona a linea nel colore tenue del tema
  function icon(pal, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${pal.inkSoft}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  }

  const strings = {
    title: 'Claude',
    chapter: 'Nuova conversazione',
    newChapter: 'Nuova conversazione',
    placeholder: 'Scrivi a Claude…',
    hint: 'Invio per inviare · Maiusc+Invio per andare a capo · / per i comandi',
    busyHint: 'Claude sta lavorando…',
    send: 'Invia',
    stop: 'Ferma',
    stopped: 'Interrotto.',
    you: 'Tu',
    claude: 'Claude',
    took: '{s} s',
    toolOk: '✓',
    toolFail: '✕',
    sessions: 'Conversazioni',
    sessionsTitle: 'Recenti',
    sessionsLoading: 'Carico le conversazioni…',
    sessionsEmpty: 'Nessuna conversazione salvata su questo computer.',
    copying: 'Carico la conversazione…',
    continueHere: 'Da qui la conversazione continua.',
    themes: 'Temi',
    themesTitle: 'Temi',
    modesLabel: '',
    hideTip: 'Riduci a icona',
    quitTip: 'Chiudi',
    gripTip: 'Ridimensiona',
  }

  const layout = `
  <div class="frame" data-solid>
    <aside class="side">
      <div class="side-head" data-drag>
        <span class="brand"></span>
        <span class="side-title" data-s="title"></span>
      </div>
      <button class="new" data-action="new"><span class="plus">+</span><span data-s="newChapter"></span></button>
      <div class="sessions" data-part="sessions" data-mode="always">
        <div class="sessions-list" data-part="sessions-list"></div>
      </div>
      <div class="side-foot">
        <button class="link" data-action="themes" data-s="themes"></button>
        <button class="link" data-action="settings" data-s="settings"></button>
      </div>
    </aside>
    <main class="main">
      <header class="top" data-drag>
        <div class="top-title">
          <span class="chapter-title" data-part="chapter-title"></span>
          <span class="chapter-date" data-part="chapter-date"></span>
        </div>
        <div class="controls">
          <button class="ctl" data-action="hide" data-s-title="hideTip">&#8211;</button>
          <button class="ctl max" data-action="maximize" data-s-title="maxTip"></button>
          <button class="ctl" data-action="quit" data-s-title="quitTip">&#10005;</button>
        </div>
      </header>
      <div class="log" data-part="log"></div>
      <div class="composer">
        <div class="todos" data-part="todos" hidden></div>
        <div class="box">
          <textarea data-part="input" data-s-placeholder="placeholder" spellcheck="false"></textarea>
          <div class="row">
            <button class="attach-btn" data-action="attach" data-s-title="attachTip">+</button>
            <div class="modes" data-part="modes" data-style="menu"></div>
            <div class="folder" data-part="folder"></div>
            <div class="model" data-part="model"></div>
            <span class="activity"><span class="dot"></span><span class="activity-text"></span></span>
            <div class="tasks" data-part="tasks"></div>
            <div class="files" data-part="files"></div>
            <div class="context" data-part="context"></div>
            <button class="btn send" data-action="send" data-s="send"></button>
            <button class="btn deny stop" data-action="stop" data-s="stop" hidden></button>
          </div>
        </div>
        <div class="hint" data-part="hint"></div>
      </div>
    </main>
    <div class="grip" data-grip data-s-title="gripTip"></div>
  </div>`

  // Gli agganci: accanto ai pulsanti, un punto che pulsa e l'azione in corso ("Legge MapView.cpp")
  const hooks = {
    busy(ctx, on) {
      const text = ctx.root.querySelector('.activity-text')
      if (text) text.textContent = on ? ctx.t('busyHint') : ''
    },
    tool(ctx, { name, summary, intent }) {
      const text = ctx.root.querySelector('.activity-text')
      if (text) text.textContent = intent || (summary ? `${name} · ${summary}` : name)
    },
    reply(ctx) {
      const text = ctx.root.querySelector('.activity-text')
      if (text) text.textContent = ctx.t('busyHint')
    },
  }

  const art = {
    // Icone a linea, 24×24, nel colore del testo tenue
    icons: {
      leggere: ({ pal }) => icon(pal, '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 16h5"/>'),
      scrivere: ({ pal }) => icon(pal, '<path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/>'),
      forgiare: ({ pal }) => icon(pal, '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 10l3 2-3 2"/><path d="M13 15h4"/>'),
      cercare: ({ pal }) => icon(pal, '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>'),
      messaggi: ({ pal }) => icon(pal, '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>'),
      compagnia: ({ pal }) => icon(pal, '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.5-3 3-4.5 5.5-4.5s5 1.5 5.5 4.5"/><circle cx="16.5" cy="8" r="2.5"/><path d="M16 13c2.5 0 4 1.5 4.5 4"/>'),
      mappa: ({ pal }) => icon(pal, '<path d="M9 7h10M9 12h10M9 17h10"/><path d="M4.5 7l1 1 2-2M4.5 12l1 1 2-2M4.5 17l1 1 2-2"/>'),
      altro: ({ pal }) => icon(pal, '<circle cx="12" cy="12" r="2.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>'),
    },

    // L'anteprima per il selettore, a piena risoluzione: barra laterale, due messaggi, la casella in basso
    preview({ pal, width, height }) {
      const c = document.createElement('canvas')
      c.width = width * 2
      c.height = height * 2
      const g = c.getContext('2d')
      g.scale(2, 2)
      const box = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill() }
      box(0, 0, width, height, 6, pal.bg)
      g.save(); g.beginPath(); g.roundRect(0, 0, width, height, 6); g.clip()
      g.fillStyle = pal.side; g.fillRect(0, 0, 38, height)
      g.restore()
      box(6, 8, 26, 6, 3, pal.accent)
      for (let i = 0; i < 4; i++) box(6, 22 + i * 9, 20 + (i % 2) * 6, 4, 2, pal.line)
      box(78, 12, 56, 10, 5, pal.bubble || pal.line)
      box(46, 28, 80, 4, 2, pal.inkSoft)
      box(46, 36, 70, 4, 2, pal.inkSoft)
      box(46, 44, 50, 4, 2, pal.inkSoft)
      box(46, 64, 90, 18, 5, pal.surface)
      g.strokeStyle = pal.line; g.lineWidth = 1; g.beginPath(); g.roundRect(46.5, 64.5, 89, 17, 5); g.stroke()
      box(122, 70, 9, 7, 3, pal.accent)
      return c
    },

    // Il vassoio: un quadrato arrotondato nel colore d'accento con una stella a quattro punte
    trayIcon({ pal, size = 32 }) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const g = c.getContext('2d')
      g.scale(size / 32, size / 32)
      g.beginPath(); g.roundRect(1, 1, 30, 30, 8); g.fillStyle = pal.accent; g.fill()
      g.fillStyle = pal.onAccent || '#ffffff'
      g.beginPath()
      g.moveTo(16, 6); g.quadraticCurveTo(17, 15, 26, 16); g.quadraticCurveTo(17, 17, 16, 26); g.quadraticCurveTo(15, 17, 6, 16); g.quadraticCurveTo(15, 15, 16, 6)
      g.fill()
      return c
    },
  }

  function kit({ id, name, description, look }) {
    const scene = { palette: look.palette, vars: look.vars }
    return {
      id,
      name,
      description,
      persona: [
        'Rispondi in modo chiaro e diretto, senza giri di parole.',
        'Usa markdown (titoli, elenchi, tabelle, blocchi di codice) quando aiuta la lettura.',
      ].join(' '),
      window: { width: 1100, height: 760, minWidth: 560, minHeight: 440 },
      kits: ['moderno'],
      strings,
      scenes: { notte: scene, giorno: scene },
      layout,
      hooks,
      art,
    }
  }

  if (typeof module === 'object' && module.exports) module.exports = kit
  else (window.SkinsKits = window.SkinsKits || {}).moderno = kit
})()
