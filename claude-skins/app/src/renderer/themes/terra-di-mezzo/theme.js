// Tema "Terra di Mezzo": la finestra è il Libro Rosso aperto, la cronaca dei viaggi degli hobbit. Copertina in cuoio
// rosso con il titolo d'oro e spille a foglia; a sinistra la pagina del capitolo e degli annali (le sessioni, sempre
// in vista come nella barra laterale dell'app desktop), a destra la conversazione; un segnalibro verde pende sotto.
// Rune al posto del tratteggio, la data nel calendario della Contea, l'Anello come lume (le lettere di fuoco
// compaiono mentre Claude lavora), il palantír per i messaggi, la fiala di luce per le ricerche. Tutto disegnato qui
// a pixel: nessuna immagine, logo o testo preso dai libri o dai film; le rune sono segni inventati, non un alfabeto.
;(function () {
  // Il viaggio: le tappe dalla Contea al Monte Fato, in frazioni della mappa (x da ovest, y da nord). Il viandante
  // avanza di una tappa a ogni messaggio del capitolo; un capitolo nuovo lo riporta a Hobbiville
  const STOPS = [
    ['Hobbiville', 0.07, 0.62], ['Brea', 0.19, 0.56], ['Colle Vento', 0.27, 0.49], ['Gran Burrone', 0.36, 0.36],
    ['Moria', 0.45, 0.58], ['Lothlórien', 0.53, 0.5], ['Amon Hen', 0.63, 0.66], ['le Paludi Morte', 0.71, 0.55],
    ["l'Ithilien", 0.76, 0.75], ['Cirith Ungol', 0.83, 0.62], ['il Monte Fato', 0.9, 0.45],
  ]

  // Le frasi del cammino, una a caso mentre Claude lavora: luoghi e cose della Terra di Mezzo, nessuna citazione
  const ROAD = [
    'Lo scriba attraversa la Vecchia Foresta…', 'Lo scriba si ferma al Puledro Impennato…',
    'Lo scriba sale su Colle Vento…', 'Lo scriba chiede consiglio a Gran Burrone…',
    'Lo scriba cerca la via nelle miniere di Moria…', 'Lo scriba riposa sotto i mallorn di Lothlórien…',
    "Lo scriba scende l'Anduin in barca…", 'Lo scriba attraversa le Paludi Morte, senza guardare le luci…',
    "Lo scriba accende la pipa con l'erba della Contea…", 'Lo scriba chiede la strada a un Ent…',
    'Lo scriba consulta le mappe dei Nani…', 'Lo scriba aspetta il passaggio delle aquile…',
  ]

  // Il viandante: la tappa a cui è arrivato (i messaggi della persona nel capitolo), sulla mappa e sotto
  function updateJourney(ctx) {
    const map = ctx.root.querySelector('.journey-map')
    const place = ctx.root.querySelector('.journey-place')
    if (!map) return
    const n = ctx.root.querySelectorAll('[data-part="log"] > .entry.you').length
    const step = Math.min(n, STOPS.length - 1)
    map.dataset.step = String(step)
    if (place) place.textContent = ctx.t('journeyAt', { place: STOPS[step][0] })
    ctx.redraw()
  }

  // Il fondo della mappa (mare, montagne, boschi, fiume, Mordor) non cambia: si disegna una volta per misura e scena
  const mapCache = new Map()
  function mapBase(P, w, h, pal) {
    const key = `${w}x${h}|${pal.gold}|${pal.inkSoft}`
    if (mapCache.has(key)) return mapCache.get(key)
    if (mapCache.size > 8) mapCache.clear()
    const c = P.canvas(w, h)
    const g = c.getContext('2d')
    const X = (f) => Math.round(f * (w - 1))
    const Y = (f) => Math.round(f * (h - 1))
    const ink = pal.inkSoft
    const rand = P.seeded(21)
    // Il mare a ovest, a onde
    for (let y = 3; y < h - 3; y += 4) { P.px(g, 2, y, pal.blue); P.px(g, 3, y + 1, pal.blue); P.px(g, 4, y, pal.blue) }
    // Una montagna: punta e due fianchi, il destro in ombra
    const mountain = (x, y, col, shade) => { P.px(g, x, y, col); P.px(g, x - 1, y + 1, col); P.px(g, x + 1, y + 1, shade); P.px(g, x - 2, y + 2, col); P.px(g, x + 2, y + 2, shade) }
    // Le Montagne Nebbiose, da nord a sud
    for (let f = 0.06; f < 0.86; f += 0.07) mountain(X(0.44 + (rand() - 0.5) * 0.03), Y(f), ink, pal.gold)
    // Mordor: le due catene e il recinto a ovest, scure; dentro, cenere
    for (let f = 0.79; f < 0.98; f += 0.045) { mountain(X(f), Y(0.26), ink, pal.red); mountain(X(f), Y(0.74), ink, pal.red) }
    for (let f = 0.3; f < 0.74; f += 0.09) mountain(X(0.79), Y(f), ink, pal.red)
    for (let k = 0; k < 18; k++) P.px(g, X(0.82 + rand() * 0.14), Y(0.34 + rand() * 0.34), pal.red)
    // Un albero: chioma di due pixel e tronco
    const tree = (x, y, col) => { P.px(g, x, y, col); P.px(g, x + 1, y, col); P.px(g, x, y + 1, ink) }
    const wood = (cx, cy, rx, ry, col, count) => { for (let k = 0; k < count; k++) { const a = rand() * Math.PI * 2; const r = Math.sqrt(rand()); tree(X(cx + Math.cos(a) * rx * r), Y(cy + Math.sin(a) * ry * r), col) } }
    wood(0.14, 0.68, 0.035, 0.08, pal.leaf.v, 7)          // la Vecchia Foresta
    wood(0.63, 0.2, 0.06, 0.13, pal.leaf.d, 14)           // Bosco Atro
    wood(0.53, 0.5, 0.03, 0.07, pal.gold, 7)              // Lothlórien, alberi d'oro
    // La Contea: colline verdi
    for (const [fx, fy] of [[0.05, 0.55], [0.1, 0.7], [0.04, 0.72]]) { P.px(g, X(fx), Y(fy), pal.leaf.v); P.px(g, X(fx) + 1, Y(fy) - 1, pal.leaf.l); P.px(g, X(fx) + 2, Y(fy), pal.leaf.v) }
    // L'Anduin, da nord a sud, a serpentina
    for (let y = 2; y < h - 2; y++) P.px(g, X(0.6 + 0.05 * (y / h)) + Math.round(Math.sin(y / 3) * 1.2), y, pal.blue)
    // La rosa dei venti, in basso a destra
    const rx = w - 6
    const ry = h - 6
    P.px(g, rx, ry - 3, pal.goldLight); P.px(g, rx, ry - 2, pal.gold); P.px(g, rx, ry + 2, pal.gold); P.px(g, rx - 2, ry, pal.gold); P.px(g, rx + 2, ry, pal.gold); P.px(g, rx, ry, pal.goldLight)
    // La cornice
    g.fillStyle = ink
    g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h)
    mapCache.set(key, c)
    return c
  }

  const theme = {
    id: 'terra-di-mezzo',
    name: 'Terra di Mezzo',
    description: 'Il Libro Rosso aperto: cuoio, rune, il calendario della Contea e un Anello che arde mentre Claude lavora.',

    // La finestra: grande come l'app desktop; sotto i 760 px le due pagine non ci stanno
    window: { width: 1180, height: 780, minWidth: 760, minHeight: 520 },

    // Lo stile pixel (bordi a gradino, palette di partenza color pergamena) viene dal kit, poi theme.css
    kits: ['pixel'],
    // Pixel ×2: più fini di quelli di partenza (×3), con più dettaglio nei disegni
    artScale: 2,
    css: true,

    layout: `
  <div class="book" data-solid data-art-bg="leather">
    <header class="book-head" data-drag>
      <canvas class="brooch" data-art="leaf" data-art-fit="natural"></canvas>
      <div class="title" data-s="title"></div>
      <canvas class="brooch" data-art="leaf" data-art-arg="destra" data-art-fit="natural"></canvas>
      <div class="controls">
        <button class="ctl" data-action="hide" data-s-title="hideTip">_</button>
        <button class="ctl max" data-action="maximize" data-s-title="maxTip"></button>
        <button class="ctl" data-action="quit" data-s-title="quitTip">x</button>
      </div>
    </header>
    <div class="spread">
      <section class="page left" data-art-bg="paper">
        <div class="chapter">
          <div class="chapter-title" data-part="chapter-title"></div>
          <div class="chapter-date" data-part="chapter-date"></div>
          <canvas class="chapter-divider" data-art="divider"></canvas>
        </div>
        <button class="btn small new-chapter" data-action="new" data-s="newChapter"></button>
        <div class="annali" data-part="sessions" data-mode="always">
          <div class="annali-head" data-s="sessionsTitle"></div>
          <div class="sessions-list" data-part="sessions-list"></div>
        </div>
        <div class="journey">
          <div class="journey-head" data-s="journeyTitle"></div>
          <canvas class="journey-map" data-art="journey" data-art-anim></canvas>
          <div class="journey-place"></div>
        </div>
        <div class="page-foot"><button class="scene" data-action="scene"></button><span>&middot;</span><button class="scene" data-action="themes" data-s="themes"></button></div>
      </section>
      <canvas class="spine" data-art="spine"></canvas>
      <section class="page right" data-art-bg="paper">
        <div class="log" data-part="log"></div>
        <div class="quill">
          <div class="modes" data-part="modes"></div>
          <textarea data-part="input" data-s-placeholder="placeholder" spellcheck="false"></textarea>
          <div class="quill-row">
            <canvas class="lamp" data-art="lamp" data-art-anim data-art-fit="natural"></canvas>
            <span class="hint" data-part="hint"></span>
            <button class="btn" data-action="send" data-s="send"></button>
            <button class="btn" data-action="stop" data-s="stop" hidden></button>
          </div>
        </div>
      </section>
    </div>
  </div>
  <canvas class="ribbon" data-art="ribbon" data-art-fit="natural" data-solid></canvas>
  <div class="grip" data-grip data-solid data-s-title="gripTip"></div>`,

    persona: [
      'Le tue risposte compaiono in una piccola finestra in pixel art che imita una pagina del Libro Rosso, la cronaca dei viaggi degli hobbit nella Terra di Mezzo.',
      'Scrivi come uno scriba di Gran Burrone che annota il viaggio della persona: garbato, con al massimo un\'immagine della Terra di Mezzo per risposta (sentieri, compagnie, mappe, fucine dei Nani, la Contea) e solo quando viene naturale.',
      'Non riportare citazioni dei libri o dei film. La sostanza tecnica viene prima dello stile: nomi di file, comandi, numeri e risultati restano esatti, e una risposta breve resta breve.',
      'Usa markdown leggero (grassetto, `codice`, blocchi di codice, elenchi).',
    ].join(' '),

    strings: {
      title: 'Libro Rosso',
      busyHint: 'Lo scriba è in cammino...',
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
      sessionsLoading: 'Sfoglio gli annali...',
      sessionsEmpty: 'Nessun annale: Claude Code non ha ancora conversazioni salvate su questo computer.',
      copying: 'Ricopio le pagine...',
      continueHere: 'Da qui in poi si scrive nello stesso annale.',
      notte: 'stelle',
      giorno: 'Contea',
      newChapter: 'Nuovo capitolo',
      journeyTitle: 'Il viaggio',
      journeyAt: 'Il viandante è a {place}',
      themes: 'altri libri',
      themesTitle: 'Gli altri libri',
      planTitle: 'Lo scriba traccia la via',
      planApprove: 'Approva la via',
      planKeep: 'Continua a tracciarla',
      planApproved: 'La via è approvata: lo scriba si mette in cammino.',
      planKept: 'Lo scriba continua a studiare le mappe.',
      diffMore: 'Sfoglia altre {n} righe',
      diffLess: 'Richiudi',
      diffNew: 'Pagina nuova.',
      gripTip: 'Trascina per allargare o allungare il libro',
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
      // Sotto le stelle: carta scura, cuoio rosso cupo
      notte: {
        palette: {
          roll: ['#5a1a14', '#7a261c', '#9a3626', '#b84a32', '#8a2e20', '#4a1410', '#2a0a08'],
          leaf: { d: '#2c4420', v: '#4f7a3a', l: '#8fbf5a', s: '#c8ccd4' },
          ring: ['#7a5418', '#d4a338', '#ffe7a0', '#fff8e0'],
          iconColors: { v: '#4f7a3a', s: '#c8d0dc', w: '#f4f8ff', b: '#1e2638', k: '#2a0a08' },
        },
        vars: {
          green: '#8fbf5a', 'leather-dark': '#1e0806',
          'title-ink': '#ffe7a0', 'title-glow': 'rgba(20, 4, 2, 0.8)',
          'initial-bg': '#4a1410',
          'ctl-bg': '#3a0f0c', 'ctl-hover': '#5a1a14', 'ctl-light': '#8a3022', 'ctl-dark': '#1e0806', 'ctl-ink': '#ffe7a0',
          'deny-bg': '#55525a', 'deny-light': '#8a8690', 'deny-dark': '#2e2c33', 'deny-ink': '#f0ece0',
        },
      },
      // La Contea: carta chiara, cuoio rosso vivo
      giorno: {
        palette: {
          roll: ['#7a261c', '#9a3626', '#b84a32', '#d0644a', '#a83c2a', '#6a2018', '#4a1410'],
          leaf: { d: '#2c4420', v: '#4f7a3a', l: '#8fbf5a', s: '#eef0f4' },
          ring: ['#7a5418', '#c8963a', '#f6d98a', '#fff8e0'],
          iconColors: { v: '#3f6a2e', s: '#8a96a8', w: '#ffffff', b: '#1e2638', k: '#4a1410' },
        },
        vars: {
          green: '#3f6a2e', 'leather-dark': '#2a0a08',
          'title-ink': '#ffe7a0', 'title-glow': 'rgba(40, 8, 4, 0.8)',
          'initial-bg': '#7a261c',
          'ctl-bg': '#4a1410', 'ctl-hover': '#6a2018', 'ctl-light': '#9a3626', 'ctl-dark': '#2a0a08', 'ctl-ink': '#ffe7a0',
          'deny-bg': '#6a6670', 'deny-light': '#9a96a0', 'deny-dark': '#3e3c43', 'deny-ink': '#f6f2e8',
        },
      },
    },

    // Gli agganci: la mappa segue il capitolo, e mentre Claude lavora il suggerimento sotto la penna è una tappa
    // del cammino
    hooks: {
      mount: updateJourney,
      chapter: updateJourney,
      done: updateJourney,
      busy(ctx, on) {
        updateJourney(ctx)
        if (!on) return
        const hint = ctx.part('hint')
        if (hint) hint.textContent = ROAD[Math.floor(Math.random() * ROAD.length)]
      },
    },

    art: {
      // La mappa del viaggio: il fondo (in cache), la rotta (fatta in rosso, da fare a puntini), le tappe, il Monte
      // Fato con il fuoco che guizza e il viandante con la sua bandierina, che saltella mentre Claude lavora
      journey({ w, h, pal, frame, busy, el }) {
        const P = window.Pixel
        if (w < 30 || h < 16) return null
        const c = P.canvas(w, h)
        const g = c.getContext('2d')
        g.drawImage(mapBase(P, w, h, pal), 0, 0)
        const step = Math.min(STOPS.length - 1, Number(el && el.dataset.step) || 0)
        const pts = STOPS.map(([, fx, fy]) => [Math.round(fx * (w - 1)), Math.round(fy * (h - 1))])
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, y0] = pts[i]
          const [x1, y1] = pts[i + 1]
          const done = i < step
          const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
          for (let k = 0; k <= n; k++) {
            if (k % (done ? 2 : 3)) continue
            P.px(g, Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), done ? pal.red : pal.inkSoft)
          }
        }
        pts.forEach(([x, y], i) => P.px(g, x, y, i <= step ? pal.goldLight : pal.inkSoft))
        // Il Monte Fato: un cono scuro con il fuoco in cima
        const [vx, vy] = pts[pts.length - 1]
        for (let r = 0; r < 4; r++) for (let dx = -r; dx <= r; dx++) P.px(g, vx + dx, vy - 2 + r, r === 3 ? pal.inkSoft : '#1c0c08')
        P.px(g, vx, vy - 3, pal.flame[frame % 3])
        P.px(g, vx + (frame % 2 ? 1 : -1), vy - 4, pal.flame[(frame + 1) % 3])
        // Il viandante: un alone d'oro sulla tappa, un'asta con la bandierina rossa bordata di scuro (si vede anche
        // sopra le montagne); saltella mentre Claude lavora
        const [mx, my] = pts[step]
        const bob = busy ? frame % 2 : 0
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]]) P.px(g, mx + dx, my + dy, pal.gold)
        P.px(g, mx, my, pal.goldLight)
        const dark = '#1c0c08'
        for (let k = 1; k <= 7; k++) P.px(g, mx, my - k - bob, dark)
        for (let y = 0; y < 4; y++) for (let x = 1; x <= 5 - y; x++) P.px(g, mx + x, my - 7 + y - bob, x === 5 - y || y === 0 || y === 3 ? dark : pal.red)
        P.px(g, mx + 1, my - 6 - bob, pal.goldLight)
        P.px(g, mx, my - 8 - bob, pal.goldLight)
        return c
      },

      // La grana del cuoio della copertina: riquadro 48×48 senza giunture, appena accennata (il cuoio quasi liscio si
      // legge meglio): pochi pixel un filo più scuri dove la grana è bassa, qualche riflesso dove è alta
      leather({ pal }) {
        const P = window.Pixel
        const S = 48
        const c = P.canvas(S, S)
        const ctx = c.getContext('2d')
        const rand = P.seeded(5)
        const grain = P.valueNoise(S, 4, 4)
        const base = pal.roll[4]
        const shade = pal.roll[1]
        const light = pal.roll[2]
        ctx.fillStyle = base
        ctx.fillRect(0, 0, S, S)
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const g = grain(x, y)
            const r = rand()
            if (r < (0.4 - g) * 0.6) P.px(ctx, x, y, shade)
            else if (r > 1 - (g - 0.62) * 0.35) P.px(ctx, x, y, light)
          }
        }
        return c
      },

      paper: ({ pal }) => window.Pixel.lib.paperTile(pal),

      // La spilla a foglia, 13×15: una foglia vera (lente appuntita, inclinata), bordo d'argento, nervatura chiara,
      // verde più chiaro verso la luce, un picciolo; arg "destra" la specchia
      leaf({ pal, arg }) {
        const P = window.Pixel
        const W = 13
        const H = 15
        const c = P.canvas(W, H)
        const ctx = c.getContext('2d')
        const { d, v, l, s } = pal.leaf
        const cx = 6.5
        const cy = 7
        const ang = -Math.PI / 4
        const L = 7.4
        const B = 3.3
        const inside = (x, y) => {
          const dx = x - cx
          const dy = y - cy
          const u = dx * Math.cos(ang) - dy * Math.sin(ang)
          const w = dx * Math.sin(ang) + dy * Math.cos(ang)
          return { u, w, ok: Math.abs(u) <= L && Math.abs(w) <= B * (1 - (u / L) * (u / L)) }
        }
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const p = inside(x + 0.5, y + 0.5)
            if (!p.ok) continue
            // Sul bordo se un vicino è fuori
            const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => !inside(x + 0.5 + ox, y + 0.5 + oy).ok)
            let col = p.w < 0 ? l : v
            if (Math.abs(p.w) < 0.55) col = s
            if (rim) col = p.w < 0 ? s : d
            P.px(ctx, x, y, col)
          }
        }
        // Il picciolo, in basso a sinistra
        P.line(ctx, 0, 14, 2, 12, d)
        const flip = arg === 'destra'
        if (!flip) return c
        const m = P.canvas(W, H)
        const mc = m.getContext('2d')
        mc.translate(W, 0)
        mc.scale(-1, 1)
        mc.drawImage(c, 0, 0)
        return m
      },

      // Il dorso fra le due pagine: la carta che si piega verso la cucitura, con il cuoio che si vede in mezzo
      spine({ w, h, pal }) {
        const P = window.Pixel
        const W = Math.max(4, w)
        const H = Math.max(1, h)
        const c = P.canvas(W, H)
        const ctx = c.getContext('2d')
        const mid = (W - 1) / 2
        for (let x = 0; x < W; x++) {
          const d = Math.abs(x - mid) / mid
          ctx.fillStyle = d < 0.2 ? pal.roll[6] : d < 0.45 ? pal.paperEdge : d < 0.75 ? pal.paper[2] : pal.paper[0]
          ctx.fillRect(x, 0, 1, H)
        }
        // Qualche punto di cucitura d'oro lungo il dorso
        for (let y = 4; y < H - 2; y += 9) P.px(ctx, Math.round(mid), y, pal.gold)
        return c
      },

      // Una riga di rune d'oro fra due rombi, alte 9 pixel, tracciate a linee con un'ombra sotto: segni inventati
      // (un'asta e qualche ramo), sempre gli stessi (seme fisso)
      divider({ w, pal }) {
        const P = window.Pixel
        // Ogni runa: segmenti [x0, y0, x1, y1] su una griglia 5×9
        const RUNES = [
          [[2, 0, 2, 8], [2, 2, 4, 0], [2, 5, 0, 3]],
          [[2, 0, 2, 8], [0, 0, 2, 2], [4, 0, 2, 2]],
          [[2, 0, 2, 8], [2, 3, 4, 5], [2, 6, 0, 8]],
          [[0, 0, 0, 8], [0, 2, 3, 0], [0, 4, 3, 2]],
          [[4, 0, 4, 8], [4, 3, 1, 5], [1, 5, 1, 2]],
          [[0, 0, 4, 8], [4, 0, 0, 8], [2, 0, 2, 2]],
          [[2, 0, 2, 8], [0, 4, 4, 4], [0, 4, 2, 2]],
          [[1, 0, 1, 8], [1, 0, 4, 2], [4, 2, 1, 4], [1, 4, 4, 7]],
          [[2, 0, 2, 8], [0, 2, 2, 4], [4, 2, 2, 4], [0, 6, 2, 8]],
        ]
        w = Math.max(40, w)
        const H = 11
        const c = P.canvas(w, H)
        const ctx = c.getContext('2d')
        const shade = pal.knob ? pal.knob[1] : pal.inkSoft
        const draw = (x0, gold, dy) => RUNES[gold].forEach(([a, b, e, f]) => P.line(ctx, x0 + a, 1 + b + dy, x0 + e, 1 + f + dy, dy ? shade : pal.gold))
        const diamond = (x) => ctx.drawImage(P.bitmap(['...y...', '..ygy..', '.ygggy.', 'ygggggs', '.sgggs.', '..sgs..', '...s...'], { y: pal.goldLight, g: pal.gold, s: shade }), x, 2)
        diamond(0)
        diamond(w - 7)
        const rand = P.seeded(11)
        const glyphs = []
        let x = 11
        let n = 0
        while (x + 5 <= w - 11) {
          if (n > 0 && n % 4 === 0) { glyphs.push(['dot', x]); x += 4 }
          if (x + 5 > w - 11) break
          glyphs.push([Math.floor(rand() * RUNES.length), x])
          x += 8
          n++
        }
        // Prima le ombre, poi l'oro sopra
        for (const dy of [1, 0]) {
          for (const [g, gx] of glyphs) {
            if (g === 'dot') { P.px(ctx, gx + 1, 5 + dy, dy ? shade : pal.goldLight); continue }
            draw(gx, g, dy)
          }
        }
        return c
      },

      // Il segnalibro di seta verde che pende sotto il libro, 8×24: un riflesso lungo la seta, la coda a coda di rondine
      ribbon({ pal }) {
        const P = window.Pixel
        const { d, v, l } = pal.leaf
        const rows = []
        for (let i = 0; i < 20; i++) rows.push(i % 6 === 2 ? 'ddllvvvd' : 'dvllvvvd')
        rows.push('dvlvvvvd', 'dvv..vvd', 'dv....vd', 'd......d')
        return P.bitmap(rows, { d, v, l })
      },

      // Le icone che cambiano, 12×12; le altre (penna, incudine, rosa dei venti) restano quelle di partenza.
      // Colori in più: v verde, s argento, w luce, b pietra scura, k cuoio scuro
      icons: {
        leggere: [
          '.kkkkkkkkkk.',
          '.kggggggggp.',
          '.kgrrrrrrgpp',
          '.kgrryyrrgpp',
          '.kgrwrryrgpp',
          '.kgryrryrgpp',
          '.kgryrryrgpp',
          '.kgrryyrrgpp',
          '.kgrrrrrrgpp',
          '.kgrrrrrrgpp',
          '.kggggggggp.',
          '.kkkkkkkkkk.',
        ],
        cercare: [
          '.....ss.....',
          '.....ss.....',
          '....ssss....',
          '.....ss.....',
          '...sswwss...',
          '..sswwwwss..',
          '..swwyyyws..',
          '..swyyyyws..',
          '..swyyyyws..',
          '..sswwwwss..',
          '...sswwss...',
          '.....ss.....',
        ],
        messaggi: [
          '....bbbb....',
          '..bbbbbbbb..',
          '..bssbbbbb..',
          '.bbsbbbbbbb.',
          '.bbbbbbbbbb.',
          '.bbbbbrrrbb.',
          '.bbbbbryrbb.',
          '..bbbbrrrb..',
          '..bbbbbbbb..',
          '....bbbb....',
          '...gggggg...',
          '..dddddddd..',
        ],
        compagnia: [
          '.yy.........',
          '.dsssssssss.',
          '.dvvvvwvvvv.',
          '.dvvvvwvvv..',
          '.dvvvwwwv...',
          '.dvvvvwvvv..',
          '.dvvvvvvvvv.',
          '.d..........',
          '.d..........',
          '.d..........',
          '.d..........',
          '.d..........',
        ],
        altro: [
          '............',
          '....yyyg....',
          '..yyyyyggg..',
          '..yw....gg..',
          '.yy......dd.',
          '.yy......dd.',
          '.yy......dd.',
          '.gg......dd.',
          '..gg....dd..',
          '..ggdddddd..',
          '....dddd....',
          '............',
        ],
      },

      // L'Anello, 19×19: a riposo un riflesso gira lungo il cerchio; mentre Claude lavora, sulla fascia compaiono
      // lettere di fuoco che tremolano
      lamp({ pal, frame, busy }) {
        const P = window.Pixel
        const S = 19
        const c = P.canvas(S, S)
        const ctx = c.getContext('2d')
        const [dark, gold, light, glint] = pal.ring
        const cx = 9
        const cy = 9
        const glintAt = (frame % 16) / 16 * Math.PI * 2
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const dx = x - cx
            const dy = y - cy
            const d = Math.hypot(dx, dy)
            if (d < 5.6 || d > 9.2) continue
            // Luce da in alto a sinistra
            const lit = (-dx - dy) / (d * Math.SQRT2)
            // Il bordo interno ed esterno più scuri: la fascia sembra tonda
            const edge = d < 6.1 || d > 8.7
            let color = edge ? (lit > 0.5 ? gold : dark) : lit > 0.45 ? light : lit < -0.35 ? dark : gold
            const a = Math.atan2(dy, dx) + Math.PI
            if (busy && d > 6.4 && d < 8.4) {
              // Le lettere: tratti fissi lungo la fascia, il colore del fuoco cambia a ogni fotogramma
              const k = Math.floor(a / (Math.PI * 2) * 40)
              if ((k * 7) % 5 < 3) color = pal.flame[(k + frame) % 3]
            } else if (!busy && d > 7.4 && !edge) {
              let diff = Math.abs(a - glintAt)
              diff = Math.min(diff, Math.PI * 2 - diff)
              if (diff < 0.2) color = glint
            }
            P.px(ctx, x, y, color)
          }
        }
        return c
      },

      // Il vassoio: il Libro Rosso chiuso, con l'Anello d'oro sulla copertina (16×16)
      trayIcon() {
        const P = window.Pixel
        const rows = [
          '................', '.krrrrrrrrrrrk..', '.krgggggggggrkp.', '.krgrrrrrrrgrkp.', '.krgrrryyrrgrkp.', '.krgrryrryrgrkp.',
          '.krgrryrryrgrkp.', '.krgrrryyrrgrkp.', '.krgrrrrrrrgrkp.', '.krgrrrrrrrgrkp.', '.krgrrrrrrrgrkp.', '.krgrrrrrrrgrkp.',
          '.krgggggggggrkp.', '.krrrrrrrrrrrkp.', '..kkkkkkkkkkkpp.', '................',
        ]
        return P.bitmap(rows, { k: '#2a0a08', r: '#9a3626', g: '#d4a338', y: '#ffe7a0', p: '#ead9ad' })
      },
    },
  }

  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})()
