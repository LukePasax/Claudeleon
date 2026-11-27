// Tema "Essenziale": quello di partenza. La struttura del kit moderno, pulita e neutra, chiara o scura come
// l'impostazione di Windows (e cambia da sola quando la cambi). Gli altri temi si creano con l'editor o si importano.
;(function () {
  const kit = typeof module === 'object' && module.exports ? require('../../kits/moderno.js') : window.SkinsKits.moderno

  const theme = kit.adaptive({
    id: 'essenziale',
    name: 'Essenziale',
    description: 'Pulito e neutro: chiaro o scuro come Windows.',
    light: {
      colors: { bg: '#fafafa', side: '#f1f2f4', surface: '#ffffff', ink: '#1f2328', inkSoft: '#69707a', accent: '#3b6fd8', onAccent: '#ffffff', line: '#e1e4e8', bubble: '#eaf0fb' },
      font: 'sistema', textSize: 15, radius: 8,
    },
    dark: {
      colors: { bg: '#17191c', side: '#1d2024', surface: '#25282d', ink: '#e4e6ea', inkSoft: '#9299a3', accent: '#7aa2f7', onAccent: '#0e1220', line: '#33373d', bubble: '#243049' },
      font: 'sistema', textSize: 15, radius: 8,
    },
  })

  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})()
