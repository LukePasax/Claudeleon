// Le conversazioni derivate: da quale conversazione partono, letto dall'inizio del loro .jsonl
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

test('derivate: forkedFrom, requestSessionId, le altre no, i file ancora senza risposta si riguardano', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-fork-'))
  process.env.CLAUDE_CONFIG_DIR = home
  const { parents, parentIn } = require('../../src/forks')
  const dir = path.join(home, 'projects', '-C-Progetti-Mappa')
  fs.mkdirSync(dir, { recursive: true })
  const P = 'aaaaaaaa-0000-4000-8000-000000000001'
  const line = (o) => JSON.stringify(o)
  const write = (id, lines) => fs.writeFileSync(path.join(dir, `${id}.jsonl`), lines.map(line).join('\n') + '\n')
  const user = (sid, extra = {}) => Object.assign({ type: 'user', uuid: 'u1', sessionId: sid, message: { role: 'user', content: 'ciao' } }, extra)
  const claude = (sid, extra = {}) => Object.assign({ type: 'assistant', uuid: 'a1', sessionId: sid, message: { role: 'assistant', content: [{ type: 'text', text: 'ciao' }] } }, extra)
  write(P, [{ type: 'mode', mode: 'normal' }, user(P), claude(P)])
  // Il fork dell'app desktop e di forkSession
  write('bbbbbbbb-0000-4000-8000-000000000002', [user('b', { forkedFrom: { sessionId: P, messageUuid: 'u1' } }), claude('b')])
  // Ripresa con forkSession (la modifica di un messaggio in Claudeleon): la prima risposta copiata
  write('cccccccc-0000-4000-8000-000000000003', [{ type: 'queue-operation' }, user('c'), claude('c', { requestSessionId: P }), user('c')])
  // Un primo messaggio grosso (immagini): il segno arriva dopo 64 KB
  write('dddddddd-0000-4000-8000-000000000004', [user('d', { message: { role: 'user', content: 'x'.repeat(200000) } }), claude('d', { requestSessionId: P })])
  // Una normale, e una che cita "forkedFrom" in un testo più avanti
  write('eeeeeeee-0000-4000-8000-000000000005', [user('e'), claude('e'), user('e', { message: { role: 'user', content: '"forkedFrom":{"sessionId":"' + P + '"}' } })])
  // Senza ancora una risposta: niente, ma si riguarda la volta dopo
  const F = 'ffffffff-0000-4000-8000-000000000006'
  write(F, [user('f')])
  let map = parents()
  assert.deepEqual([...map.entries()].sort(), [
    ['bbbbbbbb-0000-4000-8000-000000000002', P],
    ['cccccccc-0000-4000-8000-000000000003', P],
    ['dddddddd-0000-4000-8000-000000000004', P],
  ])
  assert.deepEqual(parentIn(path.join(dir, `${F}.jsonl`)), { parent: null, done: false })
  write(F, [user('f'), claude('f', { requestSessionId: P })])
  map = parents()
  assert.equal(map.get(F), P)
  // Il proprio id non conta
  write('99999999-0000-4000-8000-000000000009', [user('9'), claude('9', { requestSessionId: '99999999-0000-4000-8000-000000000009' })])
  assert.equal(parents().has('99999999-0000-4000-8000-000000000009'), false)
  fs.rmSync(home, { recursive: true, force: true })
})
