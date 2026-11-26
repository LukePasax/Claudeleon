// Tema "Pergamena": il rotolo, fantasy senza riferimenti a un'opera precisa. Colori e scritte sono quelli di partenza
// (non li ridefinisce); il layout è il rotolo con due capi, e i disegni vengono dalla libreria di pixel.js.
;(function (theme) {
  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})({
  id: 'pergamena',
  name: 'Pergamena',
  description: 'Il rotolo: pergamena, oro e inchiostro, senza un mondo preciso.',

  persona: [
    'Le tue risposte compaiono in una finestra a forma di rotolo di pergamena, in pixel art.',
    'Tieni il tono appena di un cronista garbato, ma resta preciso e conciso: la sostanza viene prima dello stile.',
    'Usa markdown leggero (grassetto, `codice`, blocchi di codice, elenchi).',
  ].join(' '),

  // La finestra: misura di partenza e minima (il rotolo sta anche stretto)
  window: { width: 1080, height: 760, minWidth: 360, minHeight: 480 },

  css: true,

  layout: `
<div class="scroll" data-solid>
  <div class="roll top" data-drag>
    <canvas data-art="roll"></canvas>
    <div class="title" data-s="title"></div>
    <div class="controls">
      <button class="ctl" data-action="hide" data-s-title="hideTip">_</button>
      <button class="ctl" data-action="quit" data-s-title="quitTip">x</button>
    </div>
  </div>
  <div class="sheet" data-art-bg="paper">
    <div class="sessions" data-part="sessions" data-art-bg="paper" hidden>
      <div class="sessions-head"><span data-s="sessionsTitle"></span><button class="pix small" data-action="sessions-close" data-s="back"></button></div>
      <div class="sessions-list" data-part="sessions-list"></div>
    </div>
    <div class="log" data-part="log">
      <div class="chapter">
        <div class="chapter-title" data-part="chapter-title"></div>
        <div class="chapter-date" data-part="chapter-date"></div>
        <canvas class="chapter-divider" data-art="divider"></canvas>
      </div>
    </div>
    <div class="quill">
      <div class="modes" data-part="modes"></div>
      <textarea data-part="input" data-s-placeholder="placeholder" spellcheck="false"></textarea>
      <div class="quill-row">
        <canvas class="lamp" data-art="lamp" data-art-anim data-art-fit="natural"></canvas>
        <span class="hint" data-part="hint"></span>
        <button class="pix" data-action="send" data-s="send"></button>
        <button class="pix" data-action="stop" data-s="stop" hidden></button>
      </div>
    </div>
  </div>
  <div class="roll bottom"><canvas data-art="roll"></canvas></div>
  <div class="grip" data-grip data-s-title="gripTip"></div>
  <div class="bar">
    <button data-action="scene"></button>
    <span>&middot;</span>
    <button data-action="new" data-s="newChapter"></button>
    <span>&middot;</span>
    <button data-action="sessions" data-s="sessions"></button>
  </div>
</div>`,

  art: {
    paper: ({ pal }) => Pixel.lib.paperTile(pal),
    roll: ({ w, pal }) => Pixel.lib.roll(w, pal),
    divider: ({ w, pal }) => Pixel.lib.dashes(w, pal.gold),
    lamp: ({ pal, frame, busy }) => Pixel.lib.candle(pal, frame, busy),
    trayIcon: () => Pixel.lib.trayScroll(),
  },
})
