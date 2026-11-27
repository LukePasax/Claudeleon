// Le attività in background seguite dagli eventi di Claude Code
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ClaudeBridge } = require('../../src/claude-bridge')

test('attività: inizio, avanzamento, fine; l\'insieme in background; spegnendo si svuotano', () => {
  const b = new ClaudeBridge({ getSession: () => null, setSession() {} }, '/w', '', 'default')
  let last = []
  b.on('tasks', (l) => { last = l })
  const live = {}
  b.taskEvent(live, { subtype: 'task_started', task_id: 'b1', description: 'npm run build', task_type: 'local_bash', is_backgrounded: true })
  b.taskEvent(live, { subtype: 'task_started', task_id: 'a1', description: 'Cerca', subagent_type: 'Explore' })
  b.taskEvent(live, { subtype: 'task_progress', task_id: 'a1', usage: { total_tokens: 900, tool_uses: 3, duration_ms: 10 }, last_tool_name: 'Grep' })
  assert.equal(b.runningTasks(), 2)
  const a = last.find((x) => x.id === 'a1')
  assert.deepEqual([a.type, a.agent, a.tools, a.lastTool], ['local_agent', 'Explore', 3, 'Grep'])
  b.taskEvent(live, { subtype: 'task_notification', task_id: 'a1', status: 'completed', summary: 'Trovato', output_file: '/tmp/a1.txt' })
  assert.equal(last.find((x) => x.id === 'a1').status, 'completed')
  assert.equal(last.find((x) => x.id === 'a1').output, '/tmp/a1.txt')
  b.taskEvent(live, { subtype: 'task_updated', task_id: 'b1', patch: { status: 'killed' } })
  assert.equal(last.find((x) => x.id === 'b1').status, 'stopped')
  // Un'attività che esce dall'insieme in background è finita
  b.taskEvent(live, { subtype: 'background_tasks_changed', tasks: [{ task_id: 'c1', task_type: 'local_bash', description: 'tail -f log' }] })
  assert.equal(b.runningTasks(), 1)
  b.taskEvent(live, { subtype: 'background_tasks_changed', tasks: [] })
  assert.equal(b.runningTasks(), 0)
  // Spegnendo la conversazione le attività di quel processo non ci sono più
  b.live = { ended: false, idle: null, inbox: { close() {} }, query: { close() {} } }
  b.closeLive()
  assert.deepEqual(last, [])
})
