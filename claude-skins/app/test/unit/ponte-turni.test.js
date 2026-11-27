// La conversazione accesa (un solo Claude Code), lo stop, i messaggi mentre lavora, la modifica di un messaggio
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { tempHome, writeSession, bridgeWithFakeQuery, fakeClaude, wait } = require('../aiuti')

const h = tempHome()
const runs = []
const { ClaudeBridge } = bridgeWithFakeQuery(fakeClaude(runs))

const opened = []
after(() => { for (const b of opened) b.cancel() })

function newBridge(sessionId) {
  let sess = sessionId || null
  const b = new ClaudeBridge({ getSession: () => sess, setSession: (id) => { sess = id } }, h.cwd, '', 'default')
  opened.push(b)
  const log = []
  for (const ev of ['delta', 'done', 'error', 'busy']) b.on(ev, (x) => log.push(ev === 'delta' ? x : ev))
  return { b, log, session: () => sess }
}

test('più messaggi, un solo Claude Code; lo stop scarta solo il turno fermato', async () => {
  runs.length = 0
  const { b, log } = newBridge()
  await b.send('uno'); await wait(100)
  await b.send({ text: 'due', uuid: '44444444-0000-4000-a000-000000000001' }); await wait(100)
  assert.equal(runs.length, 1)
  assert.equal(runs[0].sent[1].uuid, '44444444-0000-4000-a000-000000000001')
  assert.equal(runs[0].options.enableFileCheckpointing, true)
  assert.equal(runs[0].options.promptSuggestions, true)
  await b.send('tre'); await wait(5); b.stop(); await wait(100)
  await b.send('quattro'); await wait(100)
  assert.deepEqual(log, ['Risposta a ', 'uno', 'done', 'Risposta a ', 'due', 'done', 'Risposta a ', 'quattro', 'done'])
  b.cancel()
})

test('un messaggio mandato mentre lavora entra con priority next; se il turno era finito, torna busy', async () => {
  runs.length = 0
  const { b, log } = newBridge()
  await b.send('cinque'); await wait(5)
  await b.send('sei')
  await wait(150)
  assert.equal(runs[0].sent[1].priority, 'next')
  assert.ok(log.includes('busy'))
  assert.equal(log.filter((x) => x === 'done').length, 2)
  b.cancel()
})

test('capitolo nuovo: un altro Claude Code', async () => {
  runs.length = 0
  const { b } = newBridge()
  await b.send('a'); await wait(60)
  b.cancel()
  await b.send('b'); await wait(60)
  assert.equal(runs.length, 2)
  b.cancel()
})

test('immagini: blocchi immagine prima del testo', async () => {
  runs.length = 0
  const { b } = newBridge()
  await b.send({ text: 'Cosa vedi?', images: [{ mediaType: 'image/png', data: 'AAA' }, { mediaType: 'text/plain', data: 'no' }], files: ['C:/a.pdf'] })
  await wait(30)
  const content = runs[0].sent[0].message.content
  assert.deepEqual(content.map((c) => c.type), ['image', 'text'])
  assert.match(content[1].text, /<attached_files>\nC:\/a\.pdf/)
  b.cancel()
})

test('modificare un messaggio: file riportati indietro, poi una sessione biforcata da prima di quel messaggio', async () => {
  runs.length = 0
  const id = '55555555-0000-4000-a000-000000000001'
  const U = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`
  writeSession(h, id, [
    { type: 'user', uuid: U(1), parentUuid: null, message: { role: 'user', content: 'Uno' } },
    { type: 'assistant', uuid: U(2), parentUuid: U(1), message: { role: 'assistant', content: [{ type: 'text', text: 'R1' }] } },
    { type: 'user', uuid: U(3), parentUuid: U(2), message: { role: 'user', content: 'Due' } },
    { type: 'assistant', uuid: U(4), parentUuid: U(3), message: { role: 'assistant', content: [{ type: 'text', text: 'R2' }] } },
  ])
  const { b } = newBridge(id)
  b.sessionCwd = h.cwd
  let rewound = null
  b.on('rewound', (r) => { rewound = r })
  await b.edit(U(3), { text: 'Due, corretto', uuid: U(9) }, true)
  await wait(80)
  assert.equal(runs[0].rewound, U(3))
  assert.equal(rewound.ok, true)
  const fork = runs[runs.length - 1]
  assert.equal(fork.options.resume, id)
  assert.equal(fork.options.resumeSessionAt, U(2))
  assert.equal(fork.options.forkSession, true)
  assert.equal(fork.sent[0].uuid, U(9))
  b.cancel()
})
