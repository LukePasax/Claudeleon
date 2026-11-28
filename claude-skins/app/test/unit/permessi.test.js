// Le regole dei permessi nei file delle impostazioni di Claude Code: lettura, aggiunta, spostamento, rimozione,
// senza toccare il resto dei file
const { test } = require('node:test')
const assert = require('node:assert/strict')
// Queste prove controllano i messaggi in italiano
require('../../src/i18n').setLanguage('it')
const fs = require('fs')
const os = require('os')
const path = require('path')
const permissions = require('../../src/permissions')

function temp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-perm-'))
  const home = path.join(d, 'claude')
  const proj = path.join(d, 'progetto')
  fs.mkdirSync(home)
  fs.mkdirSync(proj)
  process.env.CLAUDE_CONFIG_DIR = home
  return { home, proj }
}

test('permessi: regole valide e no', () => {
  for (const r of ['Bash', 'Bash(npm run test:*)', 'Read(./docs/**)', 'WebFetch(domain:github.com)', 'mcp__github', 'mcp__github__get_issue']) assert.ok(permissions.validRule(r), r)
  for (const r of ['', 'npm test', 'Bash(', 'Bash(x)\nRead', 'rm -rf /']) assert.ok(!permissions.validRule(r), r)
})

test('permessi: tre posti, aggiunta, spostamento, rimozione, il resto del file resta', () => {
  const { home, proj } = temp()
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ model: 'opus', permissions: { allow: ['WebSearch'], defaultMode: 'auto' } }))
  let st = permissions.read(proj)
  assert.deepEqual(st.scopes.map((s) => [s.id, s.exists, s.allow]), [['user', true, ['WebSearch']], ['project', false, []], ['local', false, []]])

  // Un file nuovo (e la sua cartella) nasce con la prima regola
  assert.deepEqual(permissions.change(proj, 'local', { kind: 'add', list: 'allow', rule: 'Bash(npm run test:*)' }), { ok: true })
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.local.json'), 'utf8')), { permissions: { allow: ['Bash(npm run test:*)'] } })
  // Una regola sta in una sola lista: aggiunta in deny lascia allow
  permissions.change(proj, 'local', { kind: 'add', list: 'deny', rule: 'Bash(npm run test:*)' })
  st = permissions.read(proj).scopes[2]
  assert.deepEqual([st.allow, st.deny], [[], ['Bash(npm run test:*)']])
  permissions.change(proj, 'local', { kind: 'move', list: 'deny', to: 'ask', rule: 'Bash(npm run test:*)' })
  assert.deepEqual(permissions.read(proj).scopes[2].ask, ['Bash(npm run test:*)'])
  permissions.change(proj, 'local', { kind: 'remove', list: 'ask', rule: 'Bash(npm run test:*)' })
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.local.json'), 'utf8')), {})

  // Le impostazioni dell'utente: il resto (modello, defaultMode) non si tocca
  permissions.change(proj, 'user', { kind: 'add', list: 'dirs', rule: 'C:/Mappe' })
  permissions.change(proj, 'user', { kind: 'remove', list: 'allow', rule: 'WebSearch' })
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8')), { model: 'opus', permissions: { defaultMode: 'auto', additionalDirectories: ['C:/Mappe'] } })

  // Regola non valida, file rotto
  assert.equal(permissions.change(proj, 'project', { kind: 'add', list: 'allow', rule: 'npm test' }).ok, false)
  fs.writeFileSync(path.join(proj, '.claude', 'settings.json'), '{ rotto')
  assert.ok(permissions.read(proj).scopes[1].error)
  assert.match(permissions.change(proj, 'project', { kind: 'add', list: 'allow', rule: 'Bash' }).error, /non si legge/)
  assert.equal(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf8'), '{ rotto')
  delete process.env.CLAUDE_CONFIG_DIR
})
