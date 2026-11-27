// Il ponte sulle sessioni salvate da Claude Code: cronache riaperte, annali, titolo
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { tempHome, writeSession } = require('../aiuti')

const h = tempHome()
const { ClaudeBridge } = require('../../src/claude-bridge')
const bridge = () => new ClaudeBridge({ getSession: () => null, setSession() {} }, h.cwd, '', 'default')
const U = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`

test('una cronaca riaperta: messaggi, immagini, file, ragionamento, attività, contesto stimato', async () => {
  const id = '11111111-0000-4000-a000-000000000001'
  writeSession(h, id, [
    { type: 'user', uuid: U(1), parentUuid: null, message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }, { type: 'text', text: 'Guarda\n\n<attached_files>\nC:/a.pdf\n</attached_files>' }] } },
    { type: 'assistant', uuid: U(2), parentUuid: U(1), message: { role: 'assistant', model: 'claude-x', content: [{ type: 'thinking', thinking: 'Penso' }, { type: 'text', text: 'Fatto.' }, { type: 'tool_use', id: 'c1', name: 'TaskCreate', input: { subject: 'Leggere' } }, { type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: 'a.txt' } }] } },
    { type: 'user', uuid: U(3), parentUuid: U(2), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'Task #1 created' }, { type: 'tool_result', tool_use_id: 'r1', content: 'x', is_error: true }] } },
    { type: 'assistant', uuid: U(4), parentUuid: U(3), message: { role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: 'Ecco.' }], usage: { input_tokens: 3, cache_read_input_tokens: 61000, output_tokens: 400 } } },
  ])
  const b = bridge()
  const seen = {}
  b.on('todos', (t) => { seen.todos = t })
  b.on('context', (c) => { seen.context = c })
  const items = await b.history(id, h.cwd)
  assert.deepEqual(items.map((x) => x.role), ['user', 'thinking', 'assistant', 'tool', 'assistant'])
  assert.equal(items[0].uuid, U(1))
  assert.deepEqual(items[0].images, ['data:image/png;base64,AAA'])
  assert.match(items[0].text, /<attached_files>/)
  assert.equal(items[3].name, 'Read')
  assert.equal(items[3].error, true)
  assert.deepEqual(seen.todos.map((t) => t.content), ['Leggere'])
  assert.equal(seen.context.estimate, true)
  assert.equal(seen.context.used, 61403)
  assert.equal(seen.context.max, 200000)
})

test('annali: elenco, rinomina, archivia e ripristina, elimina', async () => {
  const a = '22222222-0000-4000-a000-000000000001'
  const c = '22222222-0000-4000-a000-000000000002'
  writeSession(h, a, [{ type: 'user', uuid: U(10), parentUuid: null, message: { role: 'user', content: 'Prima' } }])
  writeSession(h, c, [{ type: 'user', uuid: U(11), parentUuid: null, message: { role: 'user', content: 'Seconda' } }])
  const b = bridge()
  const find = async (id) => (await b.sessions()).find((s) => s.id === id)
  assert.equal((await find(a)).title, 'Prima')
  await b.renameSessionTitle(a, '  Nuovo   titolo ', h.cwd)
  assert.equal((await find(a)).title, 'Nuovo titolo')
  await b.archive(c, h.cwd, true)
  assert.equal((await find(c)).archived, true)
  await b.archive(c, h.cwd, false)
  assert.equal((await find(c)).archived, false)
  await b.remove(c, h.cwd)
  assert.equal(await find(c), undefined)
})

test('lo strumento del titolo scrive nella sessione corrente', async () => {
  const id = '33333333-0000-4000-a000-000000000001'
  writeSession(h, id, [{ type: 'user', uuid: U(20), parentUuid: null, message: { role: 'user', content: 'Buongiorno' } }])
  const b = new ClaudeBridge({ getSession: () => id, setSession() {} }, h.cwd, '', 'default')
  b.sessionCwd = h.cwd
  const srv = await b.titleServer()
  const tool = srv.instance._registeredTools.set_session_title
  const r = await (tool.handler || tool.callback)({ title: '27/11 · Prova', session_id: 'self' }, {})
  assert.ok(!r.isError)
  const s = (await b.sessions()).find((x) => x.id === id)
  assert.equal(s.title, '27/11 · Prova')
})
