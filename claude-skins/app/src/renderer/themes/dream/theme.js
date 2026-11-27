// Tema "Dream": la struttura del kit moderno con i colori del software Dream. Chiaro, testo grigio scuro, verde come
// accento e i verdi menta per la barra laterale e il fumetto delle domande. Dream non ha una palette scritta: sono i
// colori che le sue finestre usano di più.
;(function () {
  const kit = typeof module === 'object' && module.exports ? require('../../kits/moderno.js') : window.SkinsKits.moderno

  const theme = kit({
    id: 'dream',
    name: 'Dream',
    description: 'I colori di Dream: chiaro, menta, accento verde.',
    look: {
      palette: {
        ink: '#3c3c3c', inkSoft: '#6e6e6e', accent: '#0cae31', onAccent: '#ffffff',
        bg: '#f9f9f9', side: '#e0efea', surface: '#ffffff', line: '#dadada', bubble: '#c3e8d9',
      },
      vars: {
        ink: '#3c3c3c', 'ink-soft': '#6e6e6e', strong: '#1c1c1c',
        gold: '#0cae31', 'gold-light': '#19a559', 'gold-dark': '#86bfa8', red: '#b00020',
        edge: '#eaeaea', 'edge-light': '#dadada', field: '#ffffff', code: 'rgba(0, 0, 0, 0.04)',
        bg: '#f9f9f9', surface: '#ffffff', 'side-bg': '#e0efea',
        'btn-bg': '#0cae31', 'btn-hover': '#19a559', 'btn-light': '#19a559', 'btn-dark': '#0d2b19', 'btn-ink': '#ffffff',
        'deny-bg': '#e0efea', 'deny-light': '#c3e8d9', 'deny-dark': '#b4d8c9', 'deny-ink': '#0d2b19',
        'ctl-hover': 'rgba(0, 0, 0, 0.06)',
        'add-bg': 'rgba(12, 174, 49, 0.12)', 'del-bg': 'rgba(176, 0, 32, 0.1)', plus: '#19a559',
        'menu-bg': '#ffffff', veil: 'rgba(28, 28, 28, 0.25)', shadow: '0 8px 28px rgba(0, 0, 0, 0.15)',
        'frame-shadow': '0 6px 24px rgba(0, 0, 0, 0.18)', 'box-shadow': '0 2px 10px rgba(0, 0, 0, 0.06)',
        'you-bg': '#e0efea', 'you-edge': 'transparent',
      },
    },
  })

  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})()
