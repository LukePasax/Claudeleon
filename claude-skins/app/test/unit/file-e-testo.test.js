// I file da citare con @ e il testo in poche parole delle notifiche
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { listFiles, rankFiles } = require('../../src/files')
const { plainSnippet } = require('../../src/text')

test('@: prima i nomi che cominciano così, poi quelli che lo contengono, poi i percorsi', () => {
  const files = ['src/', 'src/MapView.cpp', 'src/RoadMap.h', 'docs/mappa/', 'docs/mappa/note.md', 'README.md']
  // A parità di posto, prima i percorsi più corti (anche "mappa" comincia con "map")
  assert.deepEqual(rankFiles(files, 'map'), ['docs/mappa/', 'src/MapView.cpp', 'src/RoadMap.h', 'docs/mappa/note.md'])
  // Senza niente dopo @: le voci della cartella principale
  assert.deepEqual(rankFiles(files, ''), ['src/', 'README.md'])
  assert.deepEqual(rankFiles(files, 'zzz'), [])
})

function tempTree(git) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-file-'))
  fs.mkdirSync(path.join(d, 'src'))
  fs.mkdirSync(path.join(d, 'node_modules', 'x'), { recursive: true })
  fs.writeFileSync(path.join(d, 'src', 'a.cpp'), '')
  fs.writeFileSync(path.join(d, 'node_modules', 'x', 'b.js'), '')
  fs.writeFileSync(path.join(d, 'leggimi.md'), '')
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: d })
    fs.writeFileSync(path.join(d, '.gitignore'), 'node_modules/\n')
  }
  return d
}

test('@: senza git le cartelle, saltando quelle pesanti', async () => {
  const files = await listFiles(tempTree(false))
  assert.ok(files.includes('src/a.cpp') && files.includes('src/') && files.includes('leggimi.md'))
  assert.ok(!files.some((f) => f.startsWith('node_modules')))
})

test('@: con git i file del repo, senza gli ignorati', async () => {
  const files = await listFiles(tempTree(true))
  assert.ok(files.includes('src/a.cpp') && files.includes('.gitignore'))
  assert.ok(!files.some((f) => f.startsWith('node_modules')))
})

test('notifiche: la risposta in poche parole, senza markdown né codice', () => {
  const s = plainSnippet('## Fatto\n\nI **fiumi** ora vanno prima delle `strade`.\n\n```cpp\nDrawRivers();\n```\n- [guida](http://x)')
  assert.equal(s, 'Fatto I fiumi ora vanno prima delle strade. guida')
  assert.ok(plainSnippet('x'.repeat(500)).length <= 180)
})

test('temi dell\'editor: colori di base, id dal nome, salvataggio ed eliminazione', () => {
  const kit = require('../../src/renderer/kits/moderno.js')
  const t = require('../../src/themes')
  const th = kit.fromColors({ id: 'x', name: 'Prova', colors: { bg: '#fdf6e3', accent: '#1a73e8' }, font: 'serif', radius: 30 })
  const v = th.scenes.notte.vars
  assert.equal(v['btn-ink'], '#ffffff')
  assert.equal(v['font-body'], kit.FONTS.serif)
  assert.equal(v.radius, '20px')
  assert.equal(th.custom.colors.bg, '#fdf6e3')
  assert.deepEqual(kit.colorsOf(th).colors, th.custom.colors)
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-temi-'))
  const a = t.saveUserTheme(d, { name: 'Città di notte' })
  assert.equal(a.id, 'citta-di-notte')
  assert.equal(t.saveUserTheme(d, { name: 'Città di notte' }).id, 'citta-di-notte-2')
  assert.equal(t.saveUserTheme(d, { name: 'Dream' }).id, 'dream-2')
  assert.equal(t.saveUserTheme(d, { id: 'citta-di-notte', name: 'Altro' }).id, 'citta-di-notte')
  assert.deepEqual(t.userThemes(d).map((x) => x.id).sort(), ['citta-di-notte', 'citta-di-notte-2', 'dream-2'])
  assert.equal(t.userThemeInfo(a).custom, true)
  assert.ok(t.deleteUserTheme(d, 'dream-2'))
  assert.ok(!t.deleteUserTheme(d, '../fuori'))
  assert.equal(t.userThemes(d).length, 2)
})
