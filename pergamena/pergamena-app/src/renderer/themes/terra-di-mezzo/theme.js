// Tema "Terra di Mezzo": la finestra è il Libro Rosso aperto, la cronaca dei viaggi degli hobbit. Copertina in cuoio
// rosso con il titolo d'oro e spille a foglia; a sinistra la pagina del capitolo e degli annali (le sessioni, sempre
// in vista come nella barra laterale dell'app desktop), a destra la conversazione; un segnalibro verde pende sotto.
// Rune al posto del tratteggio, la data nel calendario della Contea, l'Anello come lume (le lettere di fuoco
// compaiono mentre Claude lavora), il palantír per i messaggi, la fiala di luce per le ricerche. Tutto disegnato qui
// a pixel: nessuna immagine, logo o testo preso dai libri o dai film; le rune sono segni inventati, non un alfabeto.
;(function (theme) {
  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.PergamenaThemes = window.PergamenaThemes || []).push(theme)
})({
  id: 'terra-di-mezzo',
  name: 'Terra di Mezzo',
  description: 'Il Libro Rosso aperto: cuoio, rune, il calendario della Contea e un Anello che arde mentre Claude lavora.',

  // La finestra: grande come l'app desktop; sotto i 760 px le due pagine non ci stanno
  window: { width: 1180, height: 780, minWidth: 760, minHeight: 520 },

  css: true,

  layout: `
<div class="book" data-solid data-art-bg="leather">
  <header class="book-head" data-drag>
    <canvas class="brooch" data-art="leaf" data-art-fit="natural"></canvas>
    <div class="title" data-s="title"></div>
    <canvas class="brooch" data-art="leaf" data-art-arg="destra" data-art-fit="natural"></canvas>
    <div class="controls">
      <button class="ctl" data-action="hide" data-s-title="hideTip">_</button>
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
      <button class="pix small new-chapter" data-action="new" data-s="newChapter"></button>
      <div class="annali" data-part="sessions" data-mode="always">
        <div class="annali-head" data-s="sessionsTitle"></div>
        <div class="sessions-list" data-part="sessions-list"></div>
      </div>
      <div class="page-foot"><button class="scene" data-action="scene"></button></div>
    </section>
    <canvas class="spine" data-art="spine"></canvas>
    <section class="page right" data-art-bg="paper">
      <div class="log" data-part="log"></div>
      <div class="quill">
        <textarea data-part="input" data-s-placeholder="placeholder" spellcheck="false"></textarea>
        <div class="quill-row">
          <canvas class="lamp" data-art="lamp" data-art-anim data-art-fit="natural"></canvas>
          <span class="hint" data-part="hint"></span>
          <button class="pix" data-action="send" data-s="send"></button>
          <button class="pix" data-action="stop" data-s="stop" hidden></button>
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
    sessionsEmpty: 'Nessun annale in {dir}.',
    copying: 'Ricopio le pagine...',
    continueHere: 'Da qui in poi si scrive nello stesso annale.',
    notte: 'stelle',
    giorno: 'Contea',
    newChapter: 'Nuovo capitolo',
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

  art: {
    // La grana del cuoio della copertina: riquadro 24×24 a toni di rosso, con qualche piega più scura
    leather({ pal }) {
      const P = window.Pixel
      const c = P.canvas(24, 24)
      const ctx = c.getContext('2d')
      const rand = P.seeded(5)
      const [, mid, light, , base, dark] = pal.roll
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) {
          const r = rand()
          P.px(ctx, x, y, r < 0.72 ? base : r < 0.9 ? mid : r < 0.98 ? dark : light)
        }
      }
      return c
    },

    paper: ({ pal }) => window.Pixel.lib.paperTile(pal),

    // La spilla a foglia; arg "destra" la specchia
    leaf({ pal, arg }) {
      const P = window.Pixel
      const leaf = ['......ss', '....svvs', '...svlvs', '..svlvvs', '.svlvvs.', 'svlvvs..', 'svvss...', 'dss.....', 'd.......']
      return P.bitmap(arg === 'destra' ? P.mirror(leaf) : leaf, pal.leaf)
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

    // Una riga di rune d'oro fra due rombi: segni inventati, sempre gli stessi (seme fisso)
    divider({ w, pal }) {
      const P = window.Pixel
      const RUNES = [
        ['.g.', 'gg.', '.g.', '.gg', '.g.'], ['g.g', '.g.', '.g.', '.g.', '.g.'], ['.g.', '.gg', '.g.', 'gg.', '.g.'],
        ['g..', 'gg.', 'g.g', 'g..', 'g..'], ['..g', '.gg', 'g.g', '..g', '..g'], ['g.g', 'g.g', '.g.', 'g.g', 'g.g'],
        ['.g.', 'g.g', '.g.', '.g.', '.g.'], ['gg.', 'g.g', 'gg.', 'g.g', 'g..'], ['.g.', '.g.', 'ggg', '.g.', '.g.'],
      ]
      w = Math.max(20, w)
      const c = P.canvas(w, 5)
      const ctx = c.getContext('2d')
      const colors = { g: pal.gold, y: pal.goldLight }
      const diamond = ['..y..', '.ygy.', 'ygggy', '.ygy.', '..y..']
      ctx.drawImage(P.bitmap(diamond, colors), 0, 0)
      ctx.drawImage(P.bitmap(diamond, colors), w - 5, 0)
      const rand = P.seeded(11)
      let x = 8
      let n = 0
      while (x + 3 <= w - 8) {
        if (n > 0 && n % 4 === 0) { P.px(ctx, x, 2, pal.inkSoft); x += 2 }
        if (x + 3 > w - 8) break
        ctx.drawImage(P.bitmap(RUNES[Math.floor(rand() * RUNES.length)], colors), x, 0)
        x += 4
        n++
      }
      return c
    },

    // Il segnalibro di seta verde che pende sotto il libro, con la coda a coda di rondine
    ribbon({ pal }) {
      const P = window.Pixel
      const rows = []
      for (let i = 0; i < 9; i++) rows.push(i % 4 === 1 ? 'dllvd' : 'dlvvd')
      rows.push('dlvvd', 'dv.vd', 'd...d')
      return P.bitmap(rows, { d: pal.leaf.d, v: pal.leaf.v, l: pal.leaf.l })
    },

    // Le icone che cambiano; le altre (penna, incudine, rosa dei venti) restano quelle di partenza.
    // Colori in più: v verde, s argento, w luce, b pietra scura, k cuoio scuro
    icons: {
      leggere: ['.kkkkkk.', '.krrrrkp', '.krggrkp', '.krrrrkp', '.krrrrkp', '.krrrrkp', '.kkkkkkp', '..ppppp.'],
      cercare: ['...ss...', '...ww...', '..swws..', '.swwwws.', '.swwwws.', '.swwwws.', '..ssss..', '........'],
      messaggi: ['..bbbb..', '.bbsbbb.', 'bbsbbbbb', 'bbbbbrbb', '.bbbrrb.', '..bbbb..', '.oooooo.', 'oooooooo'],
      compagnia: ['o.......', 'ovvvvvv.', 'ovvsvv..', 'ovvvvvv.', 'o.......', 'o.......', 'o.......', 'o.......'],
      altro: ['........', '..gyyg..', '.g....y.', '.y....g.', '.g....g.', '.g....g.', '..gggg..', '........'],
    },

    // L'Anello, 13×13: a riposo un riflesso gira lungo il cerchio; mentre Claude lavora, sulla fascia compaiono
    // lettere di fuoco che tremolano
    lamp({ pal, frame, busy }) {
      const P = window.Pixel
      const S = 13
      const c = P.canvas(S, S)
      const ctx = c.getContext('2d')
      const [dark, gold, light, glint] = pal.ring
      const cx = 6
      const cy = 6
      const glintAt = (frame % 16) / 16 * Math.PI * 2
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = x - cx
          const dy = y - cy
          const d = Math.hypot(dx, dy)
          if (d < 3.9 || d > 6.3) continue
          // Luce da in alto a sinistra
          const lit = (-dx - dy) / (d * Math.SQRT2)
          let color = lit > 0.45 ? light : lit < -0.35 ? dark : gold
          const a = Math.atan2(dy, dx) + Math.PI
          if (busy && d > 4.4 && d < 5.7) {
            // Le lettere: tratti fissi lungo la fascia, il colore del fuoco cambia a ogni fotogramma
            const k = Math.floor(a / (Math.PI * 2) * 28)
            if ((k * 7) % 5 < 3) color = pal.flame[(k + frame) % 3]
          } else if (!busy && d > 5.2) {
            let diff = Math.abs(a - glintAt)
            diff = Math.min(diff, Math.PI * 2 - diff)
            if (diff < 0.28) color = glint
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
})
