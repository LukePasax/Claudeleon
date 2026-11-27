// Il ponte, le parti che non chiamano Claude Code: intenzioni, allegati, attività, domande, stima del contesto
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { intent, _internals: I, ClaudeBridge } = require('../../src/claude-bridge')

test('intenzioni: la descrizione scritta da Claude vince, altrimenti verbo e oggetto', () => {
  assert.deepEqual(intent('Bash', { command: 'ls', description: 'Elenca i file' }), { text: 'Elenca i file' })
  const r = intent('Read', { file_path: 'C:/x/src/MapView.cpp' })
  assert.ok(r.verb && /MapView\.cpp/.test(r.target))
})

test('allegati: i file vanno in fondo al testo, in <attached_files>', () => {
  assert.equal(I.withFiles('Guarda', []), 'Guarda')
  assert.equal(I.withFiles('Guarda', ['C:/a.pdf', ' ']), 'Guarda\n\n<attached_files>\nC:/a.pdf\n</attached_files>')
  assert.equal(I.withFiles('', ['C:/a.pdf']), '<attached_files>\nC:/a.pdf\n</attached_files>')
})

test('immagini di un messaggio salvato come indirizzi data:', () => {
  const pics = I.imagesOf({ content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }, { type: 'text', text: 'x' }] })
  assert.deepEqual(pics, ['data:image/png;base64,AAA'])
})

test('attività: TodoWrite rimpiazza tutto', () => {
  const todos = []
  const created = new Map()
  assert.ok(I.applyTodo(todos, created, 'TodoWrite', 't', { todos: [{ content: 'A', activeForm: 'Fa A', status: 'in_progress' }, { content: 'B', status: 'pending' }] }))
  assert.deepEqual(todos.map((t) => `${t.id}:${t.status}:${t.activeForm}`), ['1:in_progress:Fa A', '2:pending:B'])
})

test('attività: TaskCreate aspetta l\'id dal risultato, TaskUpdate cambia e cancella', () => {
  const todos = []
  const created = new Map()
  assert.equal(I.applyTodo(todos, created, 'TaskCreate', 'c1', { subject: 'Leggere', activeForm: 'Legge' }), false)
  assert.ok(I.settleTodo(todos, created, 'c1', { task: { id: '7', subject: 'Leggere' } }))
  I.applyTodo(todos, created, 'TaskCreate', 'c2', { subject: 'Scrivere' })
  assert.ok(I.settleTodo(todos, created, 'c2', 'Task #8 created successfully'))
  assert.deepEqual(todos.map((t) => t.id), ['7', '8'])
  assert.ok(I.applyTodo(todos, created, 'TaskUpdate', 'u1', { taskId: '7', status: 'completed' }))
  assert.equal(todos[0].status, 'completed')
  assert.ok(I.applyTodo(todos, created, 'TaskUpdate', 'u2', { taskId: '8', status: 'deleted' }))
  assert.equal(todos.length, 1)
})

test('contesto: la finestra di un modello mai visto', () => {
  assert.equal(I.guessContextMax('claude-x', 60000), 200000)
  assert.equal(I.guessContextMax('claude-x', 493000), 1000000)
  assert.equal(I.guessContextMax('claude-x[1m]', 1000), 1000000)
})

test('la coda dei messaggi: consegna in ordine, poi finisce quando si chiude', async () => {
  const q = new I.Inbox()
  q.push(1)
  const it = q[Symbol.asyncIterator]()
  assert.deepEqual(await it.next(), { value: 1, done: false })
  const later = it.next()
  q.push(2)
  assert.deepEqual(await later, { value: 2, done: false })
  q.close()
  assert.equal((await it.next()).done, true)
})

test('domande di Claude: le risposte tornano come answers; saltarle è un rifiuto', async () => {
  const b = new ClaudeBridge({ getSession: () => null, setSession() {} }, '/w', '', 'default')
  b.suggestions = new Map()
  const input = { questions: [{ question: 'Dove?', header: 'H', multiSelect: false, options: [{ label: 'Sotto', description: '' }, { label: 'Sopra', description: '' }] }] }
  b.once('ask', (q) => { assert.equal(q.kind, 'question'); b.answer(q.id, true, false, { 'Dove?': 'Sotto' }) })
  const r = await b.ask('AskUserQuestion', input, { suggestions: [] })
  assert.equal(r.behavior, 'allow')
  assert.deepEqual(r.updatedInput.answers, { 'Dove?': 'Sotto' })
  b.once('ask', (q) => b.answer(q.id, false, false, null))
  assert.equal((await b.ask('AskUserQuestion', input, { suggestions: [] })).behavior, 'deny')
})

test('il titolo della conversazione non chiede il permesso', async () => {
  const b = new ClaudeBridge({ getSession: () => null, setSession() {} }, '/w', '', 'default')
  const r = await b.ask('mcp__ccd_session_mgmt__set_session_title', { title: 'x' }, {})
  assert.equal(r.behavior, 'allow')
})
