// La skill per creare temi che Claudeleon dà a Claude: il plugin si legge, la guida è quella del repo e gli esempi
// sono temi che l'app riconosce ed esporta
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const themes = require('../../src/themes')
const { PLUGIN_DIR } = require('../../src/claude-bridge')

const SKILL = path.join(PLUGIN_DIR, 'skills', 'claudeleon-theme')

test('skill dei temi: plugin e SKILL.md', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.name, 'claudeleon')
  const md = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8')
  const head = md.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(head, 'manca l\'intestazione')
  assert.match(head[1], /^name: claudeleon-theme$/m)
  assert.match(head[1], /^description: .{40,}/m)
  assert.match(md, /CLAUDELEON_THEMES_DIR/)
  // i file citati esistono
  for (const rel of md.match(/`(reference|examples)\/[^`]+`/g).map((s) => s.slice(1, -1))) assert.ok(fs.existsSync(path.join(SKILL, rel)), rel)
})

test('skill dei temi: la guida è la stessa di docs/themes.md', () => {
  const docs = path.join(__dirname, '..', '..', '..', '..', 'docs', 'themes.md')
  assert.equal(fs.readFileSync(path.join(SKILL, 'reference', 'guide.md'), 'utf8'), fs.readFileSync(docs, 'utf8'))
})

test('skill dei temi: gli esempi sono temi validi', () => {
  const ex = path.join(SKILL, 'examples')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-skill-'))
  fs.cpSync(ex, dir, { recursive: true })
  const code = themes.installedThemes(dir).map((t) => t.id).sort()
  const folders = fs.readdirSync(ex, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  assert.deepEqual(code, folders)
  for (const id of folders) assert.equal(JSON.parse(fs.readFileSync(path.join(ex, id, 'theme.json'), 'utf8')).id, id)
  const colors = themes.userThemes(dir)
  assert.ok(colors.some((t) => t.id === 'dusk'))
  for (const id of [...folders, 'dusk']) {
    const b = themes.bundleFor(id, dir)
    assert.ok(b, id)
    assert.equal(themes.checkBundle(JSON.parse(JSON.stringify(b))).ok, true, id)
  }
  fs.rmSync(dir, { recursive: true, force: true })
})
