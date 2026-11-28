// "Harbor": a clean theme from the modern kit, light or dark following Windows. Only colors: the kit gives layout,
// icons, preview and tray icon.
;(function () {
  const kit = typeof module === 'object' && module.exports ? require('../../kits/moderno.js') : window.SkinsKits.moderno
  const theme = kit.adaptive({
    id: 'harbor',
    name: 'Harbor',
    description: 'Sea blues, light or dark like Windows',
    light: { colors: { bg: '#f7fafc', side: '#e8f0f5', surface: '#ffffff', ink: '#16202a', inkSoft: '#5f6e7a', accent: '#1f6fb2', line: '#d7e1e8', bubble: '#e2eef8' }, font: 'sistema', radius: 10 },
    dark: { colors: { bg: '#0f1720', side: '#14202b', surface: '#1b2733', ink: '#e3ebf2', inkSoft: '#8ea0ae', accent: '#5aa9e6', line: '#2a3846', bubble: '#1d3550' }, font: 'sistema', radius: 10 },
  })
  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})()
