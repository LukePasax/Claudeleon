// Tema "Pergamena": il rotolo di partenza, fantasy senza riferimenti a un'opera precisa. Non ridefinisce colori né
// disegni (usa quelli di theming.js, style.css e pixel.js): è anche l'esempio più piccolo di tema.
;(function (theme) {
  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.PergamenaThemes = window.PergamenaThemes || []).push(theme)
})({
  id: 'pergamena',
  name: 'Pergamena',
  description: 'Il rotolo di partenza: pergamena, oro e inchiostro, senza un mondo preciso.',
  persona: [
    'Le tue risposte compaiono in una piccola finestra a forma di rotolo di pergamena, in pixel art.',
    'Tieni il tono appena di un cronista garbato, ma resta preciso e conciso: la sostanza viene prima dello stile.',
    'Usa markdown leggero (grassetto, `codice`, blocchi di codice, elenchi).',
  ].join(' '),
})
