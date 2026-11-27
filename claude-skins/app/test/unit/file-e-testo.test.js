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
  assert.equal(t.saveUserTheme(d, { name: 'Essenziale' }).id, 'essenziale-2')
  assert.equal(t.saveUserTheme(d, { id: 'citta-di-notte', name: 'Altro' }).id, 'citta-di-notte')
  assert.deepEqual(t.userThemes(d).map((x) => x.id).sort(), ['citta-di-notte', 'citta-di-notte-2', 'essenziale-2'])
  assert.equal(t.userThemeInfo(a).custom, true)
  assert.ok(t.deleteUserTheme(d, 'essenziale-2'))
  assert.ok(!t.deleteUserTheme(d, '../fuori'))
  assert.equal(t.userThemes(d).length, 2)
})

test('temi in file .skin: esporta, controlla, installa (con codice e di colori)', () => {
  const t = require('../../src/themes')
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-skin-'))
  // Il tema del programma si esporta coi suoi file e il manifest
  const b = t.bundleFor('essenziale', d)
  assert.equal(b.format, 'claude-skins-theme')
  assert.equal(b.kind, 'code')
  assert.equal(b.manifest.name, 'Essenziale')
  assert.deepEqual(Object.keys(b.files), ['theme.js'])
  // ...e non si reinstalla al suo posto
  assert.match(t.installBundle(d, b).error, /programma/)
  // Un tema con codice importato: nella sua cartella, con theme.json; una seconda volta chiede di sostituire
  const own = JSON.parse(JSON.stringify(b))
  own.manifest.id = 'mio'
  own.files['fonts/x.woff2'] = Buffer.from('font').toString('base64')
  assert.deepEqual(t.installBundle(d, own), { ok: true, kind: 'code', id: 'mio', name: 'Essenziale' })
  assert.ok(fs.existsSync(path.join(d, 'mio', 'fonts', 'x.woff2')))
  assert.deepEqual(t.installedThemes(d).map((x) => [x.id, x.code]), [['mio', true]])
  assert.equal(t.installBundle(d, own).exists, true)
  assert.equal(t.installBundle(d, own, true).ok, true)
  assert.deepEqual(Object.keys(t.bundleFor('mio', d).files).sort(), ['fonts/x.woff2', 'theme.js'])
  // File non ammessi, id sbagliati, formati sconosciuti
  for (const bad of [
    Object.assign({}, own, { files: Object.assign({}, own.files, { '../fuori.js': 'AA==' }) }),
    Object.assign({}, own, { files: Object.assign({}, own.files, { 'x.exe': 'AA==' }) }),
    Object.assign({}, own, { files: { 'theme.css': 'AA==' } }),
    Object.assign({}, own, { manifest: { id: 'Non Va' } }),
    { format: 'altro' },
  ]) assert.equal(t.checkBundle(bad).ok, false)
  // Un tema di colori diventa un tema dell'editor, con un id nuovo dal nome
  t.saveUserTheme(d, { name: 'Sera', colors: { bg: '#101010' } })
  const c = t.bundleFor('sera', d)
  assert.equal(c.kind, 'colors')
  const r = t.installBundle(d, c)
  assert.deepEqual([r.ok, r.kind, r.id], [true, 'colors', 'sera-2'])
  // Eliminare un tema con codice toglie la cartella
  assert.ok(t.deleteUserTheme(d, 'mio'))
  assert.equal(fs.existsSync(path.join(d, 'mio')), false)
})
