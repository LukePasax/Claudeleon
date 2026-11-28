// "Terminal": the modern kit's structure dressed as an old phosphor terminal. Shows how to start from the kit and
// change everything else: colors (fromColors), its own theme.css on top of the kit's (css: true), texts in both
// languages, Claude's tone, and a hook (a blinking block cursor while Claude works).
;(function () {
  const kit = typeof module === 'object' && module.exports ? require('../../kits/moderno.js') : window.SkinsKits.moderno
  const theme = kit.fromColors({
    id: 'terminal',
    name: 'Terminal',
    description: 'Green phosphor on black, square corners, scanlines',
    colors: { bg: '#050a05', side: '#071007', surface: '#0a160a', ink: '#7dff8a', inkSoft: '#3fa34a', accent: '#7dff8a', onAccent: '#031203', line: '#1d4a22', bubble: '#0d240f' },
    font: 'mono',
    textSize: 15,
    radius: 0,
  })
  // Its own CSS after the kit's: the file theme.css next to this one
  theme.css = true
  theme.persona = 'Answer tersely, like output on an old terminal. Plain sentences, no flourishes. Code and facts stay exact.'
  // Texts per language (the others come from the app)
  theme.strings = {
    en: { title: 'TERMINAL', placeholder: '> type a command for Claude_', send: 'RUN', stop: 'BREAK', busyHint: 'Processing…', workingVerbs: 'Computing|Compiling|Spooling|Polling|Paging', newChapter: 'New session', sessionsTitle: 'Sessions' },
    it: { title: 'TERMINALE', placeholder: '> scrivi un comando per Claude_', send: 'ESEGUI', stop: 'INTERROMPI', busyHint: 'Elaborazione…', workingVerbs: 'Calcolo|Compilo|Accodo|Interrogo|Pagino', newChapter: 'Nuova sessione', sessionsTitle: 'Sessioni' },
  }
  // A block cursor that blinks at the end of the hint while Claude works (the kit's own hooks keep running)
  const kitHooks = theme.hooks || {}
  theme.hooks = Object.assign({}, kitHooks, {
    busy(ctx, on) {
      if (kitHooks.busy) kitHooks.busy(ctx, on)
      const hint = ctx.part('hint')
      if (hint) hint.classList.toggle('term-cursor', !!on)
    },
  })
  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})()
