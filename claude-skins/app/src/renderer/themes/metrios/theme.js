// Tema "Metrios": la struttura del kit moderno con i colori del software Metrios. Scuro, con i fondi blu-grigi a
// gradini e l'azzurro come accento; il fumetto delle domande è il contenitore secondario blu scuro.
;(function () {
  const kit = typeof module === 'object' && module.exports ? require('../../kits/moderno.js') : window.SkinsKits.moderno

  const theme = kit({
    id: 'metrios',
    name: 'Metrios',
    description: 'I colori di Metrios: scuro, fondi blu-grigi, accento azzurro.',
    look: {
      palette: {
        ink: '#dee3ea', inkSoft: '#88929d', accent: '#00a2f3', onAccent: '#000a14',
        bg: '#0f1419', side: '#171c21', surface: '#252a30', line: '#3e4851', bubble: '#174361',
      },
      vars: {
        ink: '#dee3ea', 'ink-soft': '#88929d', strong: '#ffffff',
        gold: '#00a2f3', 'gold-light': '#93ccff', 'gold-dark': '#174361', red: '#ffb4ab',
        edge: '#0a0f14', 'edge-light': '#3e4851', field: '#1b2025', code: 'rgba(255, 255, 255, 0.04)',
        bg: '#0f1419', surface: '#252a30', 'side-bg': '#171c21',
        'btn-bg': '#00a2f3', 'btn-hover': '#1aabf4', 'btn-light': '#26b0f5', 'btn-dark': '#174361', 'btn-ink': '#000a14',
        'deny-bg': '#174361', 'deny-light': '#2e5671', 'deny-dark': '#3a5f79', 'deny-ink': '#b1d8fe',
        'ctl-hover': 'rgba(255, 255, 255, 0.08)',
        'add-bg': 'rgba(6, 73, 17, 0.55)', 'del-bg': 'rgba(147, 0, 10, 0.35)', plus: '#a1e399',
        'menu-bg': '#30353b', veil: 'rgba(0, 0, 0, 0.55)', shadow: '0 8px 28px rgba(0, 0, 0, 0.45)',
        'you-bg': '#174361', 'you-edge': 'transparent',
      },
    },
  })

  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})()
