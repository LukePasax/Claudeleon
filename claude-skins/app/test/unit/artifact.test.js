// Gli artifact di claude.ai: riconoscere una pubblicazione dall'ingresso e dal risultato dello strumento, le parole
// dell'azione, le pagine HTML per l'anteprima e l'elenco dalle conversazioni salvate
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const artifacts = require('../../src/artifacts')
const { intent, _internals: { toolExtras } } = require('../../src/claude-bridge')

const URL1 = 'https://claude.ai/code/artifact/0a1b2c3d-4e5f-6789-abcd-ef0123456789'

test('artifact: una pubblicazione, dal risultato strutturato o dal testo', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-art-'))
  const page = path.join(d, 'pagina.html')
  fs.writeFileSync(page, '<!doctype html><html><head><title>  Il mio\n cruscotto </title></head><body></body></html>')
  // il risultato strutturato vince
  assert.deepEqual(artifacts.artifactOf({ file_path: page }, { url: URL1, title: 'Cruscotto', updated: true }, ''), { url: URL1, title: 'Cruscotto', updated: true, file: page, icon: null })
  // dal testo, col titolo della pagina
  const a = artifacts.artifactOf({ file_path: page, icon: 'chart' }, null, `Published: ${URL1} (private)`)
  assert.equal(a.url, URL1)
  assert.equal(a.title, 'Il mio cruscotto')
  assert.equal(a.icon, 'chart')
  assert.equal(a.updated, false)
  // aggiornare un artifact esistente
  assert.equal(artifacts.artifactOf({ file_path: page, url: URL1 }, null, URL1).updated, true)
  // senza <title>: il nome del file
  assert.equal(artifacts.artifactOf({ file_path: path.join(d, 'note-di-viaggio.md') }, null, URL1).title, 'note-di-viaggio')
  // non sono pubblicazioni: elenchi, letture, file caricati, nessun indirizzo, indirizzi d'altro
  assert.equal(artifacts.artifactOf({ action: 'list' }, null, URL1), null)
  assert.equal(artifacts.artifactOf({ action: 'read', url: URL1 }, null, URL1), null)
  assert.equal(artifacts.artifactOf({ url: URL1, file_path: 'x.png', asset: true }, null, URL1), null)
  assert.equal(artifacts.artifactOf({ file_path: page }, null, 'Publish refused'), null)
  assert.equal(artifacts.artifactOf({ file_path: page }, { url: 'https://example.com/x' }, ''), null)
  fs.rmSync(d, { recursive: true, force: true })
})

test('artifact: le parole dell\'azione e cosa si aggiunge alla fine', () => {
  assert.deepEqual(intent('Artifact', { file_path: '/tmp/x/cruscotto.html', title: 'Vendite' }), { verb: 'artifact', target: 'Vendite' })
  assert.deepEqual(intent('Artifact', { file_path: 'C:\\lavori\\cruscotto.html', url: URL1 }), { verb: 'artifactUpdate', target: 'cruscotto.html' })
  assert.deepEqual(intent('Artifact', { action: 'list' }), { verb: 'artifactList', target: '' })
  assert.deepEqual(intent('Artifact', { action: 'read', url: URL1 }), { verb: 'artifactRead', target: '' })
  assert.deepEqual(intent('Artifact', { action: 'delete', url: URL1 }), { verb: 'other', target: 'Artifact' })
  const html = path.join(os.tmpdir(), 'pagina.html')
  // Una pagina HTML scritta o modificata: il suo indirizzo per l'anteprima
  assert.deepEqual(toolExtras('Write', { file_path: html }, '', null), { urls: [pathToFileURL(html).href], artifact: null })
  assert.deepEqual(toolExtras('Edit', { file_path: path.join(os.tmpdir(), 'a.js') }, 'ok', null).urls, [])
  assert.deepEqual(toolExtras('Write', { file_path: 'relativo.html' }, '', null).urls, [])
  // Un server locale nell'uscita resta
  assert.deepEqual(toolExtras('Bash', { command: 'npm run dev' }, 'Local: http://localhost:5173/', null).urls, ['http://localhost:5173/'])
  const r = toolExtras('Artifact', { file_path: html, title: 'Pagina' }, `Published ${URL1}`, null)
  assert.equal(r.artifact.url, URL1)
  assert.deepEqual(r.urls, [pathToFileURL(html).href])
})

test('artifact: l\'elenco dalle conversazioni salvate', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-artlist-'))
  process.env.CLAUDE_CONFIG_DIR = home
  const dir = path.join(home, 'projects', '-C-Progetti-Mappa')
  fs.mkdirSync(dir, { recursive: true })
  const line = (o) => JSON.stringify(o)
  const use = (id, input) => line({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Artifact', input }] } })
  const result = (id, text, at, extra = {}) => line(Object.assign({ type: 'user', timestamp: at, sessionId: 'uno', cwd: 'C:/Progetti/Mappa', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text }] } }, extra))
  const URL2 = 'https://claude.ai/code/artifact/ffff0000-1111-2222-3333-444455556666'
  fs.writeFileSync(path.join(dir, 'uno.jsonl'), [
    use('t1', { file_path: 'C:/Progetti/Mappa/fiumi.html', title: 'Fiumi' }),
    result('t1', `Published ${URL1}`, '2026-11-20T10:00:00Z'),
    use('t2', { file_path: 'C:/Progetti/Mappa/fiumi.html', url: URL1 }),
    result('t2', 'ok', '2026-11-21T10:00:00Z', { toolUseResult: { url: URL1, title: 'Fiumi e guadi', updated: true } }),
    use('t3', { action: 'list' }),
    result('t3', `${URL1}\n${URL2}`, '2026-11-22T10:00:00Z'),
    use('t4', { file_path: 'C:/x.html' }),
    line({ type: 'user', timestamp: '2026-11-23T10:00:00Z', message: { content: [{ type: 'tool_result', tool_use_id: 't4', is_error: true, content: `failed ${URL2}` }] } }),
    'non json',
  ].join('\n'))
  fs.writeFileSync(path.join(dir, 'due.jsonl'), line({ type: 'user', message: { content: 'niente artifact' } }))
  let list = artifacts.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].url, URL1)
  assert.equal(list[0].title, 'Fiumi e guadi')
  assert.equal(list[0].versions, 2)
  assert.equal(list[0].sessionId, 'uno')
  assert.equal(list[0].cwd, 'C:/Progetti/Mappa')
  assert.equal(list[0].at, Date.parse('2026-11-21T10:00:00Z'))
  // Un'altra conversazione pubblica un altro artifact, più tardi: va in cima
  fs.writeFileSync(path.join(dir, 'tre.jsonl'), [use('u1', { file_path: '/tmp/b.html', title: 'Note' }), result('u1', `Published ${URL2}`, '2026-11-25T10:00:00Z', { sessionId: 'tre' })].join('\n'))
  list = artifacts.list()
  assert.deepEqual(list.map((a) => [a.title, a.sessionId]), [['Note', 'tre'], ['Fiumi e guadi', 'uno']])
  fs.rmSync(home, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
})
