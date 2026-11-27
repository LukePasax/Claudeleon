// Tema "Terra di Mezzo": lo scrittoio di Casa Baggins. La struttura è quella dell'app desktop (a sinistra gli annali,
// cioè le conversazioni, al centro la conversazione in una colonna, in basso la casella con modo e cartella), dentro
// una stanza scavata nella collina: pareti di legno, la finestra tonda sulla Contea (di notte le stelle e una finestra
// accesa), il foglio di carta con i bordi rotti, una candela accanto alla penna che arde più viva mentre Claude lavora.
// Lo stile è l'acquerello: stesure trasparenti dai bordi irregolari (filtri SVG), linee d'inchiostro, grana della
// carta. I disegni si fanno in SVG e diventano immagini di sfondo: il browser li dipinge una volta sola. Nessuna
// immagine, logo o testo preso dai libri o dai film.
;(function () {
  // Le frasi del cammino, una a caso mentre Claude lavora: luoghi e cose della Terra di Mezzo, nessuna citazione
  const ROAD = [
    'Lo scriba attraversa la Vecchia Foresta…', 'Lo scriba si ferma al Puledro Impennato…',
    'Lo scriba sale su Colle Vento…', 'Lo scriba chiede consiglio a Gran Burrone…',
    'Lo scriba cerca la via nelle miniere di Moria…', 'Lo scriba riposa sotto i mallorn di Lothlórien…',
    "Lo scriba scende l'Anduin in barca…", 'Lo scriba attraversa le Paludi Morte, senza guardare le luci…',
    "Lo scriba accende la pipa con l'erba della Contea…", 'Lo scriba chiede la strada a un Ent…',
    'Lo scriba consulta le mappe dei Nani…', 'Lo scriba aspetta il passaggio delle aquile…',
  ]

  // --- Il pennello ad acquerello, in stringhe SVG ---
  // brush(seed) dà wash (stesura trasparente coi bordi rotti e il pigmento che si raccoglie sul bordo), line (inchiostro
  // appena tremolante), sky (sfumatura), paper (grana) e svg(w, h) che chiude il disegno
  function brush(seed) {
    const parts = []
    const defs = `
      <filter id="w" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="3" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="8" result="d"/><feGaussianBlur in="d" stdDeviation=".5"/></filter>
      <filter id="l"><feTurbulence type="turbulence" baseFrequency=".05" numOctaves="2" seed="${seed + 1}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.2"/></filter>
      <filter id="p" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" seed="2"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .35  0 0 0 0 .22  0 0 0 .09 0"/></filter>`
    let n = 0
    return {
      raw(s) { parts.push(s) },
      // solid: stesura normale invece che moltiplicata, per le cose chiare su fondo scuro
      wash(d, col, op = 0.55, edge = true, solid = false) {
        parts.push(`<g filter="url(#w)"${solid ? '' : ' style="mix-blend-mode:multiply"'}><path d="${d}" fill="${col}" opacity="${op}"/>${edge ? `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" opacity="${Math.min(1, op + 0.25)}"/>` : ''}</g>`)
      },
      line(d, o = {}) {
        parts.push(`<path d="${d}" fill="none" stroke="${o.color || '#3a2814'}" stroke-width="${o.width || 1.1}" opacity="${o.opacity ?? 0.8}" stroke-linecap="round" filter="url(#l)"/>`)
      },
      sky(x, y0, w, y1, col, op = 0.6) {
        const id = 's' + n++
        parts.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity="${op}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient><rect x="${x}" y="${y0}" width="${w}" height="${y1 - y0}" fill="url(#${id})"/>`)
      },
      paper(x, y, w, h) { parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" filter="url(#p)"/>`) },
      svg(w, h, extra = '') {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}><defs>${defs}</defs>${parts.join('')}</svg>`
      },
    }
  }
  const url = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  // Un generatore di numeri ripetibile: lo stesso disegno a ogni avvio
  const seeded = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647

  // Le pareti di legno: assi verticali, una piastrella che si ripete in orizzontale
  function wall(night) {
    const W = 444
    const H = 1600
    const B = brush(8)
    const rnd = seeded(9)
    B.raw(`<rect width="${W}" height="${H}" fill="${night ? '#3a2416' : '#6e4a2c'}"/>`)
    for (let x = 0; x < W; x += 74) {
      B.wash(`M${x + 2} -10 H${x + 72} V${H + 10} H${x + 2}Z`, ['#8a5a32', '#7a4e2a', '#946238'][Math.floor(rnd() * 3)], night ? 0.3 : 0.45, false)
      for (let k = 0; k < 9; k++) { const xx = x + 8 + rnd() * 58; const y = rnd() * H; B.line(`M${xx} ${y} q ${(rnd() - 0.5) * 10} 200 0 ${300 + rnd() * 300}`, { color: '#4a2e18', opacity: 0.25, width: 0.8 }) }
      B.line(`M${x} -10 V${H + 10}`, { color: '#2a180c', opacity: 0.5, width: 1.6 })
    }
    if (night) B.raw(`<rect width="${W}" height="${H}" fill="#0c1030" opacity=".28"/>`)
    B.paper(0, 0, W, H)
    return B.svg(W, H)
  }

  // La finestra tonda sulla Contea, come quelle delle case degli hobbit: un oblò con la cornice di legno verde e la
  // croce. Dentro colline, un albero e la porta tonda di un'altra casa; di notte stelle, luna e una finestra accesa
  function porthole(night) {
    const S = 340
    const R = 150
    const cx = S / 2
    const cy = S / 2
    const B = brush(4)
    const rnd = seeded(5)
    B.raw(`<clipPath id="c"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath><g clip-path="url(#c)">`)
    B.raw(`<rect width="${S}" height="${S}" fill="${night ? '#1c2448' : '#f6efdf'}"/>`)
    if (night) {
      for (let i = 0; i < 70; i++) B.raw(`<circle cx="${rnd() * S}" cy="${rnd() * 190}" r="${rnd() * 2.2 + 0.6}" fill="#fff" opacity="${0.5 + rnd() * 0.5}"/>`)
      B.wash('M232 92 a 26 26 0 1 1 0 .1z', '#f6efc8', 0.9, false, true)
    } else {
      B.sky(0, 0, S, 230, '#5ea8dc', 0.6)
      B.wash('M236 94 a 28 28 0 1 1 0 .1z', '#ffd24a', 0.55)
    }
    B.wash(`M-10 ${S} V 200 Q 70 150 170 190 T 350 170 V${S}Z`, night ? '#2e4a3a' : '#9ccf6a', 0.7)
    B.wash(`M-10 ${S} V 250 Q 90 215 190 240 T 350 232 V${S}Z`, night ? '#1e3428' : '#5e9a3e', 0.7)
    B.wash('M62 210 a 24 24 0 1 1 48 0 a 24 24 0 1 1 -48 0', night ? '#16281c' : '#3f8a2a', 0.75)
    B.line('M86 262 V 222 M86 240 l -10 -10 M86 247 l 10 -8', { opacity: 0.6, width: 2 })
    B.wash('M196 262 a 34 34 0 0 1 68 0 z', night ? '#16281c' : '#2e5c2a', 0.85)
    B.raw(`<circle cx="230" cy="248" r="5" fill="${night ? '#ffd27a' : '#c9a646'}"/>`)
    if (night) {
      B.wash('M276 236 h 14 v 13 h -14z', '#ffd27a', 0.9, false, true)
      B.raw('<circle cx="283" cy="242" r="20" fill="#ffd27a" opacity=".14"/>')
    }
    B.wash(`M40 ${S} C 110 300 170 312 240 288`, '#cbb184', 0.7)
    B.paper(0, 0, S, S)
    B.raw('</g>')
    // Il vetro un po' lucido, la croce, la cornice verde e il bordo scuro
    B.raw(`<path d="M${cx - R * 0.62} ${cy - R * 0.45} A ${R} ${R} 0 0 1 ${cx + R * 0.1} ${cy - R * 0.82}" fill="none" stroke="#fff" stroke-width="6" opacity=".18" stroke-linecap="round"/>`)
    B.raw(`<path d="M${cx} ${cy - R} V${cy + R} M${cx - R} ${cy} H${cx + R}" stroke="#2e5c2a" stroke-width="11"/>`)
    B.raw(`<circle cx="${cx}" cy="${cy}" r="${R + 6}" fill="none" stroke="#2e5c2a" stroke-width="20"/>`)
    B.raw(`<circle cx="${cx}" cy="${cy}" r="${R + 16}" fill="none" stroke="#1c3a1a" stroke-width="3"/>`)
    B.raw(`<circle cx="${cx}" cy="${cy}" r="${R - 4}" fill="none" stroke="#1c3a1a" stroke-width="2" opacity=".6"/>`)
    B.raw(`<circle cx="${cx}" cy="${cy}" r="9" fill="#2e5c2a" stroke="#1c3a1a" stroke-width="2"/>`)
    return B.svg(S, S, ' preserveAspectRatio="xMidYMid meet"')
  }

  // Il foglio, della misura esatta dell'elemento: carta con i bordi rotti e un alone più scuro verso il margine
  function sheet(w, h, night) {
    const B = brush(30)
    const m = 4
    B.wash(`M${m} ${m} H${w - m} V${h - m} H${m}Z`, night ? '#eadcb8' : '#f4ead2', 1, true, true)
    B.wash(`M${m} ${m} H${w - m} V${h - m} H${m}Z M24 24 V${h - 24} H${w - 24} V24Z`, '#c9a46a', 0.2, false)
    B.paper(m, m, w - 2 * m, h - 2 * m)
    return B.svg(w, h, ' preserveAspectRatio="none"')
  }

  // La candela accanto alla penna: la fiamma è un gruppo a parte, che il CSS fa tremolare (più viva mentre Claude
  // lavora). Disegnata a tinte piene: è piccola e si muove, i filtri non servono
  const CANDLE = `<svg viewBox="0 0 46 110" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="cg"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>
    <circle class="glow" cx="23" cy="32" r="23" fill="url(#cg)"/>
    <ellipse cx="23" cy="104" rx="19" ry="5" fill="#c9a646"/><ellipse cx="23" cy="103" rx="19" ry="4" fill="none" stroke="#8a6a20" stroke-width=".8" opacity=".6"/>
    <path d="M15 50 h16 v52 h-16z" fill="#f3ead2"/><path d="M25 50 h6 v52 h-6z" fill="#c9b88f" opacity=".6"/>
    <path d="M17 50 q 3 10 0 16 h 3 q 2 -7 -1 -16z" fill="#e0d4b4"/>
    <path d="M15 50 h16 v52 h-16z" fill="none" stroke="#7a6243" stroke-width=".8" opacity=".5"/>
    <path d="M23 50 v-6" stroke="#3a2814" stroke-width="1.4"/>
    <g class="flame"><path d="M23 18 C 31 28 31 37 23 44 C 15 37 15 28 23 18Z" fill="#ffb347"/><path d="M23 28 C 26 33 26 38 23 41 C 20 38 20 33 23 28Z" fill="#fff1b0"/></g>
  </svg>`

  // Dipinge le parti con l'acquerello della scena. Il foglio dipende dalla misura: si ridipinge (con calma) quando
  // cambia; nel frattempo il disegno di prima si allarga
  function paint(ctx) {
    const night = ctx.scene !== 'giorno'
    const desk = ctx.root.querySelector('.desk')
    const hole = ctx.root.querySelector('.porthole')
    if (desk) desk.style.backgroundImage = url(wall(night))
    if (hole) hole.style.backgroundImage = url(porthole(night))
    paintSheet(ctx)
  }
  function paintSheet(ctx) {
    const el = ctx.root.querySelector('.sheet-paper')
    if (!el) return
    const w = Math.round(el.offsetWidth)
    const h = Math.round(el.offsetHeight)
    if (!w || !h) return
    const key = `${w}x${h}|${ctx.scene}`
    if (el.dataset.painted === key) return
    el.dataset.painted = key
    // Un SVG coi filtri, allargato, si ridipingerebbe a ogni fotogramma del ridimensionamento: lo si fissa una volta
    // in un canvas (alla densità dello schermo), che il CSS allarga a tutto il foglio
    const img = new Image()
    img.onload = () => {
      if (el.dataset.painted !== key) return
      const k = Math.min(2, window.devicePixelRatio || 1)
      let c = el.querySelector('canvas')
      if (!c) { c = document.createElement('canvas'); el.appendChild(c) }
      c.width = Math.round(w * k)
      c.height = Math.round(h * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    }
    img.src = `data:image/svg+xml,${encodeURIComponent(sheet(w, h, ctx.scene !== 'giorno'))}`
  }

  // Un'icona a linea d'inchiostro, 24×24
  const icon = (pal, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${pal.inkSoft}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

  const theme = {
    id: 'terra-di-mezzo',
    name: 'Terra di Mezzo',
    description: 'Lo scrittoio di Casa Baggins, ad acquerello: la finestra tonda sulla Contea, il foglio, la candela.',

    // Grande come l'app desktop; sotto gli 820 px la barra laterale si nasconde
    window: { width: 1180, height: 780, minWidth: 560, minHeight: 480 },

    css: true,

    layout: `
  <div class="desk" data-solid>
    <header class="beam" data-drag>
      <span class="beam-title"><span class="beam-door"></span><span data-s="appTitle"></span></span>
      <div class="controls">
        <button class="ctl" data-action="hide" data-s-title="hideTip">&#8211;</button>
        <button class="ctl max" data-action="maximize" data-s-title="maxTip"></button>
        <button class="ctl" data-action="quit" data-s-title="quitTip">&#10005;</button>
      </div>
    </header>
    <div class="room">
    <aside class="side">
      <div class="porthole" data-drag></div>
      <div class="side-head" data-drag><span class="brand" data-s="title"></span></div>
      <button class="new" data-action="new"><span class="plus">+</span><span data-s="newChapter"></span></button>
      <div class="side-label" data-s="sessionsTitle"></div>
      <div class="sessions" data-part="sessions" data-mode="always">
        <div class="sessions-list" data-part="sessions-list"></div>
      </div>
      <div class="side-foot">
        <button class="link" data-action="scene"></button>
        <button class="link" data-action="themes" data-s="themes"></button>
      </div>
    </aside>
    <main class="sheet">
      <div class="sheet-paper"></div>
      <header class="top" data-drag>
        <div class="top-title">
          <span class="chapter-title" data-part="chapter-title"></span>
          <span class="chapter-date" data-part="chapter-date"></span>
        </div>
      </header>
      <div class="log" data-part="log"></div>
      <div class="composer">
        <div class="todos" data-part="todos" hidden></div>
        <div class="box-wrap">
        <div class="candle">${CANDLE}</div>
        <div class="box">
          <textarea data-part="input" data-s-placeholder="placeholder" spellcheck="false"></textarea>
          <div class="row">
            <button class="attach-btn" data-action="attach" data-s-title="attachTip">+</button>
            <div class="modes" data-part="modes" data-style="menu"></div>
            <div class="folder" data-part="folder"></div>
            <div class="model" data-part="model"></div>
            <span class="sp"></span>
            <div class="context" data-part="context"></div>
            <button class="btn send" data-action="send" data-s="send"></button>
            <button class="btn deny stop" data-action="stop" data-s="stop" hidden></button>
          </div>
        </div>
        </div>
        <div class="hint" data-part="hint"></div>
      </div>
    </main>
    </div>
    <div class="grip" data-grip data-s-title="gripTip"></div>
  </div>`,

    persona: [
      'Le tue risposte compaiono in una finestra che imita lo scrittoio di Casa Baggins, nella Contea: un foglio di carta accanto alla finestra tonda.',
      'Scrivi come uno scriba di Gran Burrone che annota il viaggio della persona: garbato, con al massimo un\'immagine della Terra di Mezzo per risposta (sentieri, compagnie, mappe, fucine dei Nani, la Contea) e solo quando viene naturale.',
      'Non riportare citazioni dei libri o dei film. La sostanza tecnica viene prima dello stile: nomi di file, comandi, numeri e risultati restano esatti, e una risposta breve resta breve.',
      'Usa markdown leggero (grassetto, `codice`, blocchi di codice, elenchi).',
    ].join(' '),

    strings: {
      title: 'Casa Baggins',
      placeholder: 'Intingi la penna e scrivi…',
      hint: 'Invio per spedire · Maiusc+Invio per andare a capo · / per i comandi',
      busyHint: 'Lo scriba è in cammino…',
      send: 'Spedisci',
      stop: 'Posa la penna',
      stopped: 'Lo scriba ha posato la penna.',
      you: 'Il viandante scrive:',
      claude: 'Lo scriba annota:',
      took: 'Annotato in {s} s',
      toolOk: 'fatto',
      toolFail: 'fallito',
      allow: 'Concedi',
      always: 'Sempre',
      deny: 'Non passerai',
      granted: 'Il passaggio è concesso.',
      grantedAlways: 'Il passaggio è concesso, anche per le prossime volte.',
      denied: 'Il passaggio è negato.',
      sessions: 'annali',
      sessionsTitle: 'Gli annali',
      sessionsLoading: 'Sfoglio gli annali…',
      sessionsSearch: 'Cerca negli annali…',
      thinkingNow: 'Lo scriba medita…',
      workingVerbs: 'Lo scriba intinge la penna|Lo scriba sfoglia gli annali|Lo scriba traccia la mappa|Lo scriba consulta gli Elfi|Lo scriba accende la candela|Lo scriba conta i passi|Lo scriba studia le rune',
      thinkingDone: 'Ha meditato per {s} s',
      thinkingPast: 'Le meditazioni dello scriba',
      sessionsEmpty: 'Nessun annale: Claude Code non ha ancora conversazioni salvate su questo computer.',
      copying: 'Ricopio le pagine…',
      continueHere: 'Da qui in poi si scrive nello stesso annale.',
      notte: 'Accendi le stelle',
      giorno: 'Apri le imposte',
      newChapter: 'Nuovo capitolo',
      themes: 'Altre stanze',
      themesTitle: 'Le altre stanze',
      modesLabel: '',
      planTitle: 'Lo scriba traccia la via',
      planApprove: 'Approva la via',
      planKeep: 'Continua a tracciarla',
      planApproved: 'La via è approvata: lo scriba si mette in cammino.',
      planKept: 'Lo scriba continua a studiare le mappe.',
      diffMore: 'Sfoglia altre {n} righe',
      diffLess: 'Richiudi',
      diffNew: 'Pagina nuova.',
      hideTip: 'Riduci a icona',
      quitTip: 'Chiudi',
      gripTip: 'Ridimensiona',
    },


    // La data nel calendario della Contea (dodici mesi di trenta giorni, più i giorni di Yule e di Lithe; l'anno
    // comincia verso il nostro 22 dicembre), seguita da quella di tutti i giorni
    date(d, plainDate) {
      const MONTHS = ['Afteryule', 'Solmath', 'Rethe', 'Astron', 'Thrimidge', 'Forelithe', 'Afterlithe', 'Wedmath', 'Halimath', 'Winterfilth', 'Blotmath', 'Foreyule']
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      let start = new Date(d.getFullYear(), 11, 22)
      if (day < start) start = new Date(d.getFullYear() - 1, 11, 22)
      const y = start.getFullYear() + 1
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
      let i = Math.round((day - start) / 86400000)
      let shire
      if (i === 0) shire = '2 Yule'
      else {
        i -= 1
        const lithe = leap ? ['1 Lithe', 'Mezzanno', 'Overlithe', '2 Lithe'] : ['1 Lithe', 'Mezzanno', '2 Lithe']
        if (i < 180) shire = `${(i % 30) + 1} ${MONTHS[Math.floor(i / 30)]}`
        else if (i < 180 + lithe.length) shire = lithe[i - 180]
        else if (i < 360 + lithe.length) { const j = i - 180 - lithe.length; shire = `${(j % 30) + 1} ${MONTHS[6 + Math.floor(j / 30)]}` }
        else shire = '1 Yule'
      }
      return `${shire} · ${plainDate(d)}`
    },

    scenes: {
      // Il foglio resta chiaro anche di notte (lo illumina la candela): cambiano le pareti e la finestra
      giorno: {
        palette: { inkSoft: '#7a6243', accent: '#2e5c2a', wood: '#6e4a2c', side: '#3a2414', paper: '#f4ead2', ink: '#2e2216', glass: '#9ccf6a', sky: '#bcd6e6' },
        vars: {},
      },
      notte: {
        palette: { inkSoft: '#7a6243', accent: '#2e5c2a', wood: '#3a2416', side: '#1e120a', paper: '#eadcb8', ink: '#2e2216', glass: '#1e3428', sky: '#1c2448' },
        vars: {},
      },
    },

    hooks: {
      mount(ctx) {
        paint(ctx)
        // Il foglio segue la misura della finestra: si ridipinge quando il ridimensionamento si ferma
        const el = ctx.root.querySelector('.sheet-paper')
        if (el && window.ResizeObserver) {
          let timer = 0
          theme._ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => paintSheet(ctx), 140) })
          theme._ro.observe(el)
        }
      },
      unmount() {
        if (theme._ro) theme._ro.disconnect()
        theme._ro = null
      },
      scene(ctx, name) { paint(Object.assign({}, ctx, { scene: name })) },
      // Mentre Claude lavora, il suggerimento sotto la penna è una tappa del cammino
      busy(ctx, on) {
        if (!on) return
        const hint = ctx.part('hint')
        if (hint) hint.textContent = ROAD[Math.floor(Math.random() * ROAD.length)]
      },
    },

    art: {
      // Icone a linea d'inchiostro
      icons: {
        leggere: ({ pal }) => icon(pal, '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 16h5"/>'),
        scrivere: ({ pal }) => icon(pal, '<path d="M4 20c3-1 5-3 7-6l7-9c1 1 1 2 0 3l-7 9"/><path d="M4 20l2-5"/>'),
        forgiare: ({ pal }) => icon(pal, '<path d="M4 15h12l-1 3H6z"/><path d="M7 15c0-2 1-3 3-3h6c2 0 3-1 4-2"/><path d="M9 18v2M14 18v2"/>'),
        cercare: ({ pal }) => icon(pal, '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>'),
        messaggi: ({ pal }) => icon(pal, '<circle cx="12" cy="10" r="6.5"/><path d="M9 8c1-1.5 2.5-2 4-1.5"/><path d="M7 20h10M9 17l-1 3M15 17l1 3"/>'),
        compagnia: ({ pal }) => icon(pal, '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.5-3 3-4.5 5.5-4.5s5 1.5 5.5 4.5"/><circle cx="16.5" cy="8" r="2.5"/><path d="M16 13c2.5 0 4 1.5 4.5 4"/>'),
        mappa: ({ pal }) => icon(pal, '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
        altro: ({ pal }) => icon(pal, '<circle cx="12" cy="12" r="2.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>'),
      },

      // L'anteprima per il selettore: parete, barra con la finestra tonda, foglio con due righe e la casella
      preview({ pal, width, height }) {
        const c = document.createElement('canvas')
        c.width = width * 2
        c.height = height * 2
        const g = c.getContext('2d')
        g.scale(2, 2)
        g.fillStyle = pal.wood; g.fillRect(0, 0, width, height)
        g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < width; x += 12) g.fillRect(x, 0, 1, height)
        g.fillStyle = pal.side; g.globalAlpha = 0.6; g.fillRect(0, 0, 40, height); g.globalAlpha = 1
        // La finestra tonda
        // La finestra tonda
        g.save(); g.beginPath(); g.arc(20, 17, 11, 0, Math.PI * 2); g.fillStyle = pal.sky; g.fill(); g.clip()
        g.fillStyle = pal.glass; g.fillRect(8, 20, 24, 10); g.restore()
        g.beginPath(); g.arc(20, 17, 11, 0, Math.PI * 2); g.lineWidth = 2.5; g.strokeStyle = '#2e5c2a'; g.stroke()
        g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, 6); g.lineTo(20, 28); g.moveTo(9, 17); g.lineTo(31, 17); g.stroke()
        for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(244,234,210,.5)'; g.fillRect(6, 34 + i * 9, 20 + (i % 2) * 6, 3) }
        // Il foglio
        g.fillStyle = pal.paper; g.fillRect(46, 5, width - 51, height - 10)
        g.fillStyle = 'rgba(46,92,42,.15)'; g.fillRect(96, 14, 40, 8)
        g.fillStyle = pal.inkSoft; g.fillRect(58, 30, 70, 3); g.fillRect(58, 37, 62, 3); g.fillRect(58, 44, 44, 3)
        g.fillStyle = '#fffbf0'; g.fillRect(58, 62, 80, 16); g.strokeStyle = 'rgba(90,60,30,.35)'; g.lineWidth = 1; g.strokeRect(58.5, 62.5, 79, 15)
        g.fillStyle = pal.accent; g.fillRect(124, 68, 10, 6)
        g.fillStyle = '#ffb347'; g.beginPath(); g.ellipse(51, 68, 2, 3.5, 0, 0, Math.PI * 2); g.fill()
        g.fillStyle = '#f3ead2'; g.fillRect(49.5, 72, 3, 7)
        return c
      },

      // Il vassoio: la porta tonda verde col pomello d'oro (32×32)
      trayIcon({ size = 32 } = {}) {
        const c = document.createElement('canvas')
        c.width = size
        c.height = size
        const g = c.getContext('2d')
        g.scale(size / 32, size / 32)
        // La cornice di legno, con una luce in alto a sinistra
        g.beginPath(); g.arc(16, 16, 15.2, 0, Math.PI * 2); g.fillStyle = '#6b4423'; g.fill()
        g.lineWidth = 0.9; g.strokeStyle = '#3a2412'; g.stroke()
        g.beginPath(); g.arc(16, 16, 13.9, Math.PI * 1.05, Math.PI * 1.6); g.lineWidth = 1; g.strokeStyle = 'rgba(255, 220, 160, 0.35)'; g.stroke()
        // La porta verde, rotonda, con le assi dentro
        const grad = g.createRadialGradient(13, 12, 2, 16, 16, 13)
        grad.addColorStop(0, '#4a8a40'); grad.addColorStop(1, '#2a5426')
        g.save()
        g.beginPath(); g.arc(16, 16, 12.2, 0, Math.PI * 2); g.fillStyle = grad; g.fill(); g.clip()
        g.strokeStyle = 'rgba(0, 0, 0, 0.28)'; g.lineWidth = 0.7
        for (const x of [8.5, 12.3, 16.1, 19.9, 23.7]) { g.beginPath(); g.moveTo(x, 2); g.lineTo(x, 30); g.stroke() }
        g.restore()
        g.beginPath(); g.arc(16, 16, 12.2, 0, Math.PI * 2); g.lineWidth = 0.8; g.strokeStyle = '#1c3a1a'; g.stroke()
        // Il pomello d'ottone al centro
        g.beginPath(); g.arc(16, 16, 2.1, 0, Math.PI * 2); g.fillStyle = '#e6c36a'; g.fill()
        g.lineWidth = 0.5; g.strokeStyle = '#8a6a20'; g.stroke()
        g.beginPath(); g.arc(15.4, 15.3, 0.7, 0, Math.PI * 2); g.fillStyle = 'rgba(255, 250, 220, 0.8)'; g.fill()
        return c
      },
    },
  }

  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})()
