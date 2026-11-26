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

  // Rumore a valori, periodico su un riquadro di lato size (celle di lato cell): macchie morbide che si ripetono
  // senza giunture
  function valueNoise(size, cell, seed) {
    const n = size / cell
    const rand = seeded(seed)
    const grid = Array.from({ length: n * n }, () => rand())
    const at = (i, j) => grid[((j + n) % n) * n + ((i + n) % n)]
    const smooth = (t) => t * t * (3 - 2 * t)
    return (x, y) => {
      const gx = x / cell
      const gy = y / cell
      const i = Math.floor(gx)
      const j = Math.floor(gy)
      const fx = smooth(gx - i)
      const fy = smooth(gy - j)
      const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx
      const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx
      return a + (b - a) * fy
    }
  }

  // La grana della carta: un riquadro 64×64 senza giunture, con macchie ampie e tenui (pal.paper[1] più scuro, [3]
  // più chiaro), qualche fibra e qualche puntino ([2])
  function paperTile(pal) {
    const S = 64
    const c = canvas(S, S)
    const ctx = c.getContext('2d')
    const rand = seeded(7)
    const big = valueNoise(S, 32, 3)
    const mid = valueNoise(S, 8, 5)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // Le macchie decidono solo quanto è probabile un pixel chiaro o scuro: un retino sfumato, senza contorni
        const v = big(x, y) * 0.65 + mid(x, y) * 0.35
        const r = rand()
        px(ctx, x, y, r < (0.42 - v) * 0.7 ? pal.paper[1] : r > 1 - (v - 0.5) * 0.6 ? pal.paper[3] : pal.paper[0])
      }
    }
    // Le fibre: trattini orizzontali, quasi tutti chiari
    for (let k = 0; k < 9; k++) {
      const x = Math.floor(rand() * S)
      const y = Math.floor(rand() * S)
      const len = 2 + Math.floor(rand() * 4)
      const col = rand() < 0.75 ? pal.paper[3] : pal.paper[1]
      for (let i = 0; i < len; i++) px(ctx, (x + i) % S, y, col)
    }
    for (let k = 0; k < 10; k++) px(ctx, Math.floor(rand() * S), Math.floor(rand() * S), pal.paper[2])
    return c
  }

  // Una sfera piccola (pomello, perla) di diametro d, con la luce da in alto a sinistra: tones va dallo scuro al
  // chiaro, l'ultimo è il riflesso
  function sphere(d, tones) {
    const c = canvas(d, d)
    const ctx = c.getContext('2d')
    const r = d / 2
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        const nx = (x + 0.5 - r) / r
        const ny = (y + 0.5 - r) / r
        const q = nx * nx + ny * ny
        if (q > 1) continue
        const nz = Math.sqrt(1 - q)
        // Luce da (-0.5, -0.6, 0.6)
        const lum = Math.max(0, -0.5 * nx - 0.6 * ny + 0.62 * nz)
        let k = Math.min(tones.length - 2, Math.floor(lum * (tones.length - 1)))
        if (q > 0.78) k = 0
        const spec = Math.pow(Math.max(0, lum), 12)
        px(ctx, x, y, spec > 0.55 ? tones[tones.length - 1] : tones[Math.max(0, k)])
      }
    }
    return c
  }

  // Un capo arrotolato largo w pixel e alto 18: un cilindro di carta a fasce di luce (pal.roll, sette toni: 3 il più
  // chiaro, 6 il più scuro), sfumate a retino, con le pieghe e due pomelli sferici d'oro (pal.knob) alle estremità
  function roll(w, pal) {
    const h = 18
    const c = canvas(w, h)
    const ctx = c.getContext('2d')
    // Dall'alto: bordo scuro, la luce, il corpo, l'ombra di sotto
    const bands = [6, 5, 1, 2, 3, 3, 3, 2, 2, 1, 1, 0, 4, 4, 5, 5, 6, 6]
    for (let y = 0; y < h; y++) {
      for (let x = 7; x < w - 7; x++) {
        // Sul confine fra due fasce, un retino a scacchi le mescola
        const next = bands[Math.min(h - 1, y + 1)]
        // (solo nella metà alta, dove sfuma la luce: in basso sembrerebbe una cucitura)
        const mix = y < 9 && next !== bands[y] && (x + y) % 2 === 0
        px(ctx, x, y, pal.roll[mix ? next : bands[y]])
      }
    }
    // Le pieghe: una riga scura con la luce accanto
    for (let x = 22; x < w - 22; x += 34) {
      for (let y = 2; y < h - 2; y++) {
        px(ctx, x, y, pal.roll[5])
        if (y > 3 && y < 10) px(ctx, x + 1, y, pal.roll[3])
      }
    }
    const knob = sphere(14, [pal.knob[0], pal.knob[1], pal.knob[2], pal.knob[2], pal.knob[3], pal.knob[3]])
    ctx.drawImage(knob, 0, 2)
    ctx.drawImage(knob, w - 14, 2)
    return c
  }

  // Un tratteggio largo w pixel, in due righe (color e, sotto, shade), con un rombo al centro
  function dashes(w, color, shade) {
    w = Math.max(10, w)
    const c = canvas(w, 5)
    const ctx = c.getContext('2d')
    const mid = Math.floor(w / 2)
    for (let x = 0; x < w; x++) {
      if (Math.abs(x - mid) < 5 || x % 7 >= 4) continue
      px(ctx, x, 2, color)
      if (shade) px(ctx, x, 3, shade)
    }
    ctx.drawImage(bitmap(['..y..', '.yyy.', 'yyyyy', '.ysy.', '..s..'], { y: color, s: shade || color }), mid - 2, 0)
    return c
  }

  // Una candela 12×22: fiamma a goccia che ondeggia (più alta mentre Claude lavora), stoppino, cera con una colatura e
  // la luce a sinistra, piattino d'oro
  function candle(pal, frame, busy) {
    const W = 12
    const H = 22
    const c = canvas(W, H)
    const ctx = c.getContext('2d')
    const sway = [0, 1, 0, -1][frame % 4]
    const fh = busy ? 9 : 6
    const top = 9 - fh
    for (let y = 0; y < fh; y++) {
      const t = y / (fh - 1)
      // Larghezza della goccia: stretta in cima, piena in basso
      const half = Math.max(0.5, Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) * (busy ? 2.6 : 2.2))
      const cx = 6 + Math.round(sway * (1 - t))
      for (let x = 0; x < W; x++) {
        const d = Math.abs(x + 0.5 - cx) / half
        if (d > 1) continue
        px(ctx, x, top + y, d < 0.45 && t > 0.35 ? pal.flame[2] : d < 0.8 ? pal.flame[1] : pal.flame[0])
      }
    }
    px(ctx, 6, 9, pal.inkSoft)
    // La cera: colonna da x=3 a 8, luce a sinistra, ombra a destra, una colatura
    for (let y = 10; y < 19; y++) {
      for (let x = 3; x < 9; x++) {
        px(ctx, x, y, x === 3 ? pal.wax : x >= 7 ? pal.waxShade : pal.wax)
      }
    }
    for (let x = 4; x < 7; x++) px(ctx, x, 10, pal.waxShade)
    px(ctx, 4, 11, pal.wax); px(ctx, 4, 12, pal.wax); px(ctx, 4, 13, pal.waxShade)
    // Il piattino
    for (let x = 1; x < 11; x++) px(ctx, x, 19, x < 4 ? pal.goldLight : pal.gold)
    for (let x = 0; x < 12; x++) px(ctx, x, 20, pal.gold)
    for (let x = 2; x < 10; x++) px(ctx, x, 21, pal.knob ? pal.knob[1] : pal.gold)
    return c
  }

  // Disegna un segmento a pixel (Bresenham) fra due punti
  function line(ctx, x0, y0, x1, y1, color) {
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      px(ctx, x0, y0, color)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
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
    seeded, canvas, px, bitmap, mirror, upscale, iconColors, icon, valueNoise, sphere, line,
    // I disegni pronti
    lib: { paperTile, roll, dashes, candle, trayScroll },
  }
})()
