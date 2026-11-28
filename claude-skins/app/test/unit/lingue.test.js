// Le lingue: ogni frase del processo principale ha la sua traduzione inglese, le scritte della finestra ci sono in
// tutte e due le lingue con gli stessi segnaposto, e tr() sceglie e riempie
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const i18n = require('../../src/i18n')

const SRC = path.join(__dirname, '..', '..', 'src')

test('lingue: ogni tr() del processo principale ha la traduzione inglese', () => {
  const missing = []
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.js') && x !== 'i18n.js')) {
    const text = fs.readFileSync(path.join(SRC, f), 'utf8')
    for (const m of text.matchAll(/\btr\('((?:[^'\\]|\\.)*)'/g)) {
      const s = m[1].replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\"/g, '"')
      if (!(s in i18n.EN)) missing.push(`${f}: ${s}`)
    }
  }
  assert.deepEqual(missing, [])
})

test('lingue: le scritte della finestra in inglese e in italiano, stessi segnaposto', () => {
  const src = fs.readFileSync(path.join(SRC, 'renderer', 'theming.js'), 'utf8')
  const IT = eval('(' + src.match(/const STRINGS = (\{[\s\S]*?\n  \})\n/)[1] + ')')
  const EN = require('../../src/renderer/lang/en.js').strings
  assert.deepEqual(Object.keys(IT).filter((k) => !(k in EN)), [])
  assert.deepEqual(Object.keys(EN).filter((k) => !(k in IT)), [])
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join()
  assert.deepEqual(Object.keys(IT).filter((k) => ph(IT[k]) !== ph(EN[k])), [])
})

test('lingue: tr sceglie la lingua e riempie i segnaposto; pick per i temi', () => {
  i18n.setLanguage('it')
  assert.equal(i18n.tr('Installare il tema «{x}»?', { x: 'Sera' }), 'Installare il tema «Sera»?')
  assert.equal(i18n.pick({ en: 'Essential', it: 'Essenziale' }), 'Essenziale')
  i18n.setLanguage('en')
  assert.equal(i18n.tr('Installare il tema «{x}»?', { x: 'Sera' }), 'Install the “Sera” theme?')
  assert.equal(i18n.tr('Una frase senza traduzione'), 'Una frase senza traduzione')
  assert.equal(i18n.pick({ en: 'Essential', it: 'Essenziale' }), 'Essential')
  assert.equal(i18n.pick('Sempre uguale'), 'Sempre uguale')
})
