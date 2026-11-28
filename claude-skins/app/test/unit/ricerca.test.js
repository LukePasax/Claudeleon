// La ricerca dentro le conversazioni salvate: le parole nei messaggi della persona e di Claude, senza strumenti,
// promemoria e sotto-agenti; i file cambiati si rileggono
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

test('ricerca: parole nei messaggi, accenti e maiuscole, pezzo del testo, file cambiati', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-cerca-'))
  process.env.CLAUDE_CONFIG_DIR = home
  const { search } = require('../../src/search')
  const dir = path.join(home, 'projects', '-C-Progetti-Mappa')
  fs.mkdirSync(dir, { recursive: true })
  const line = (o) => JSON.stringify(o)
  fs.writeFileSync(path.join(dir, 'uno.jsonl'), [
    line({ type: 'queue-operation', content: 'guadi nella coda' }),
    line({ type: 'user', message: { role: 'user', content: 'Aggiungi i guadi sui sentieri della Città\n\n<attached_files>\nC:/segreto.txt\n</attached_files>' } }),
    line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Ecco i GUADI: dove un sentiero attraversa un fiume.' }, { type: 'tool_use', name: 'Read', input: { file_path: 'x' } }] } }),
    line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ponte levatoio' }] } }),
    line({ type: 'user', message: { content: '<system-reminder>ponte levatoio</system-reminder>' } }),
    line({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'ponte levatoio dal sotto-agente' }] } }),
    'non json',
  ].join('\n'))
  fs.writeFileSync(path.join(dir, 'due.jsonl'), line({ type: 'user', message: { content: 'Il calcolo del percorso più breve' } }))

  let r = search('guadi')
  assert.deepEqual(r.map((x) => [x.id, x.count]), [['uno', 2]])
  assert.match(r[0].snippet, /guadi sui sentieri/)
  // Senza accenti e maiuscole, e tutte le parole anche in messaggi diversi
  assert.equal(search('citta FIUME')[0].id, 'uno')
  assert.deepEqual(search('percorso piu breve').map((x) => x.id), ['due'])
  // Strumenti, promemoria, sotto-agenti e file allegati restano fuori
  assert.deepEqual(search('levatoio'), [])
  assert.deepEqual(search('segreto'), [])
  assert.deepEqual(search('x'), [])
  // Un file cambiato si rilegge, uno tolto sparisce
  fs.appendFileSync(path.join(dir, 'due.jsonl'), '\n' + line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Anche i guadi contano.' }] } }))
  assert.deepEqual(search('guadi').map((x) => x.id).sort(), ['due', 'uno'])
  fs.unlinkSync(path.join(dir, 'uno.jsonl'))
  assert.deepEqual(search('guadi').map((x) => x.id), ['due'])
  delete process.env.CLAUDE_CONFIG_DIR
})
