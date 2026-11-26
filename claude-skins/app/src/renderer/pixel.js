// La pixel art: si disegna dal codice a bassa risoluzione e si ingrandisce senza sfumature (image-rendering:
// pixelated), un pixel del disegno = SCALE pixel dello schermo. Qui ci sono gli attrezzi comuni (canvas, bitmap,
// grana con seme...), le icone dei mestieri di partenza e una piccola libreria di disegni pronti (lib) che i temi
// possono usare nei loro: grana della carta, capo di un rotolo, tratteggio, candela, rotolino per il vassoio.
(function () {
  const SCALE = 3

  // Numeri pseudo-casuali con seme: la stessa grana a ogni avvio
  function seeded(seed) {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
  }

  function canvas(w, h) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }

  function px(ctx, x, y, color) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, 1, 1)
  }

  // Disegna una bitmap di caratteri: ogni carattere è un colore della mappa, '.' (o un carattere senza colore) è trasparente
  function bitmap(rows, colors) {
    const c = canvas(Math.max(...rows.map((r) => r.length)), rows.length)
    const ctx = c.getContext('2d')
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (colors[ch]) px(ctx, x, y, colors[ch]) }))
    return c
  }

  // La stessa bitmap specchiata in orizzontale
  function mirror(rows) {
    return rows.map((r) => [...r].reverse().join(''))
  }

  // Ingrandisce a pixel pieni e restituisce un data URL (per il vassoio, che vuole 32×32)
  function upscale(c, w, h) {
    const big = canvas(w, h)
    const ctx = big.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(c, 0, 0, w, h)
    return big.toDataURL()
  }

  // ------------------------------------------------------------------ la libreria di disegni pronti

  // La grana della carta: un riquadro 32×32 a toni sparsi (pal.paper, quattro toni), da ripetere sullo sfondo
  function paperTile(pal) {
    const c = canvas(32, 32)
    const ctx = c.getContext('2d')
    const rand = seeded(7)
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const r = rand()
        px(ctx, x, y, r < 0.55 ? pal.paper[0] : r < 0.8 ? pal.paper[1] : r < 0.95 ? pal.paper[2] : pal.paper[3])
      }
    }
    return c
  }

  // Un capo arrotolato largo w pixel e alto 12: un cilindro di carta a fasce di luce (pal.roll, sette toni), con due
  // pomelli d'oro (pal.knob) alle estremità
  function roll(w, pal) {
    const h = 12
    const c = canvas(w, h)
    const ctx = c.getContext('2d')
    const bands = [6, 5, 3, 2, 3, 3, 1, 1, 0, 4, 5, 6]
    for (let y = 0; y < h; y++) {
      ctx.fillStyle = pal.roll[bands[y]]
      ctx.fillRect(4, y, w - 8, 1)
    }
    // Le pieghe della carta arrotolata
    for (let x = 14; x < w - 14; x += 23) {
      for (let y = 2; y < h - 2; y++) px(ctx, x, y, pal.roll[5])
    }
    const knob = ['..1111..', '.122321.', '12233321', '12233221', '12222221', '11222211', '.111111.', '..0000..']
    const colors = { 0: pal.knob[0], 1: pal.knob[1], 2: pal.knob[2], 3: pal.knob[3] }
    ctx.drawImage(bitmap(knob, colors), 0, 2)
    ctx.drawImage(bitmap(knob, colors), w - 8, 2)
    return c
  }

  // Un tratteggio largo w pixel e alto 1, nel colore dato
  function dashes(w, color) {
    const c = canvas(Math.max(1, w), 1)
    const ctx = c.getContext('2d')
    for (let x = 0; x < w; x++) if (x % 5 < 3) px(ctx, x, 0, color)
    return c
  }

  // Le icone dei mestieri, 8×8. Colori: o inchiostro tenue, p carta chiara, g oro, y oro chiaro, r rosso; un tema
  // può aggiungere lettere sue con palette.iconColors
  const ICONS = {
    leggere: ['........', '.oooooo.', 'opppppo.', '.opppppo', '.opoopo.', '.opppppo', 'opppppo.', '.oooooo.'],
    scrivere: ['......go', '.....ggo', '....ggo.', '...ggo..', '..ggo...', '..go....', '.o......', 'o.......'],
    forgiare: ['........', 'ooooooo.', 'ogggggoo', '.oogggo.', '...gg...', '..oggo..', '.oooooo.', '........'],
    cercare: ['...oo...', '..o..o..', '.oooooo.', '.oyyyyo.', '.oyrryo.', '.oyyyyo.', '.oooooo.', '........'],
    messaggi: ['..rrrr..', '.rrrrrr.', 'rrrggrrr', 'rrggggrr', 'rrrggrrr', '.rrrrrr.', '..rrrr..', '........'],
    compagnia: ['o.......', 'ogggggg.', 'oggggg..', 'ogggggg.', 'o.......', 'o.......', 'o.......', 'o.......'],
    mappa: ['...g....', '...g....', '..ggg...', 'ggggggg.', '..ggg...', '...g....', '...g....', '........'],
    altro: ['...o....', '..ogo...', '.oggo...', 'oggggo..', '.oggo...', '..ogo...', '...o....', '........'],
  }

  function iconColors(pal) {
    return Object.assign({ o: pal.inkSoft, p: pal.paper[3], g: pal.gold, y: pal.goldLight, r: pal.red }, pal.iconColors || {})
  }

  function icon(craft, pal, icons) {
    const set = icons || ICONS
    return bitmap(set[craft] || ICONS[craft] || ICONS.altro, iconColors(pal)).toDataURL()
  }

  // Una candela 8×13 a tre fotogrammi, con la fiamma più alta mentre Claude lavora
  function candle(pal, frame, busy) {
    const flames = busy
      ? [['...1....', '..121...', '..121...', '.12321..', '..232...'], ['....1...', '...121..', '..1221..', '..1321..', '..232...'], ['..1.....', '..121...', '.1221...', '.12321..', '..232...']]
      : [['........', '...1....', '..121...', '..131...', '..232...'], ['........', '....1...', '...121..', '...131..', '..232...'], ['........', '..1.....', '..121...', '..131...', '..232...']]
    const body = ['...k....', '.wwwww..', '.wwwws..', '.wwwws..', '.wwwws..', '.wwwws..', 'ooooooo.', '.ooooo..']
    const rows = [...flames[frame % 3], ...body]
    return bitmap(rows, { 1: pal.flame[0], 2: pal.flame[1], 3: pal.flame[2], k: pal.inkSoft, w: pal.wax, s: pal.waxShade, o: pal.gold })
  }

  // Un rotolino 16×16 per il vassoio di Windows
  function trayScroll() {
    const rows = [
      '................', '.kkkkkkkkkkkkkk.', 'kggppppppppppggk', '.kkkkkkkkkkkkkk.', '..kppppppppppk..', '..kpiiiiiiiipk..',
      '..kppppppppppk..', '..kpiiiiiiipk...', '..kppppppppppk..', '..kpiiiiiiiipk..', '..kppppppppppk..',
      '..kpiiiiipppk...', '.kkkkkkkkkkkkkk.', 'kggppppppppppggk', '.kkkkkkkkkkkkkk.', '................',
    ]
    return bitmap(rows, { k: '#3d2e18', g: '#d4a338', p: '#ead9ad', i: '#7b6343' })
  }

  window.Pixel = {
    SCALE, ICONS,
    // Gli attrezzi, per i temi che disegnano da sé
    seeded, canvas, px, bitmap, mirror, upscale, iconColors, icon,
    // I disegni pronti
    lib: { paperTile, roll, dashes, candle, trayScroll },
  }
})()
