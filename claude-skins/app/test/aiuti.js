// Aiuti comuni alle prove: una cartella di Claude Code finta (con sessioni scritte a mano) e il ponte con un
// Claude Code finto al posto di query() dell'SDK
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')

const APP = path.join(__dirname, '..')

// Una casa finta per Claude Code: HOME e CLAUDE_CONFIG_DIR puntano lì, prima di caricare l'SDK. La cartella di lavoro
// delle sessioni è <casa>/w; la cartella del progetto si chiama come la fa l'SDK (ogni carattere non alfanumerico -)
function tempHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-prova-'))
  const cwd = path.join(home, 'w')
  fs.mkdirSync(cwd, { recursive: true })
  process.env.HOME = home
  process.env.USERPROFILE = home
  process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude')
  const project = path.join(home, '.claude', 'projects', fs.realpathSync(cwd).replace(/[^a-zA-Z0-9]/g, '-'))
  fs.mkdirSync(project, { recursive: true })
  return { home, cwd: fs.realpathSync(cwd), project }
}

// Una sessione salvata: le righe del transcript, con sessionId, cwd e ora messi da qui
function writeSession(h, id, entries) {
  const line = (o) => JSON.stringify(Object.assign({ sessionId: id, cwd: h.cwd, timestamp: '2026-11-27T08:00:00Z' }, o))
  fs.writeFileSync(path.join(h.project, `${id}.jsonl`), entries.map(line).join('\n') + '\n')
}

// Il modulo del ponte con query() sostituita da fake(args)
function bridgeWithFakeQuery(fake) {
  const file = path.join(APP, 'src', 'claude-bridge.js')
  const src = fs.readFileSync(file, 'utf8').replace(
    "if (!sdk) sdk = await import('@anthropic-ai/claude-agent-sdk')",
    "if (!sdk) sdk = Object.assign({}, await import('@anthropic-ai/claude-agent-sdk'), { query: global.__fakeQuery })",
  )
  if (src.indexOf('global.__fakeQuery') < 0) throw new Error('Il caricamento dell\'SDK nel ponte è cambiato: aggiorna test/aiuti.js')
  global.__fakeQuery = fake
  const m = new Module(file)
  m.filename = file
  m.paths = Module._nodeModulePaths(path.dirname(file))
  m._compile(src, file)
  return m.exports
}

// Un Claude Code finto: legge i messaggi dalla coda e per ognuno risponde "Risposta a <testo>" in due pezzi, poi il
// risultato. interrupt() fa finire il turno in errore. rec raccoglie quello che è successo, per le verifiche
function fakeClaude(rec) {
  return (args) => {
    const me = { options: args.options, sent: [], interrupted: false }
    rec.push(me)
    const out = []
    let wake = null
    let closed = false
    const emit = (m) => { out.push(m); if (wake) { const w = wake; wake = null; w() } }
    ;(async () => {
      for await (const m of args.prompt) {
        me.sent.push(m)
        const text = m.message.content.map((c) => c.text || '[img]').join(' ')
        emit({ type: 'system', subtype: 'init', session_id: 'S1', permissionMode: 'default' })
        for (const ch of ['Risposta a ', text]) {
          await new Promise((r) => setTimeout(r, 15))
          if (me.interrupted) break
          emit({ type: 'stream_event', session_id: 'S1', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: ch } } })
        }
        emit({ type: 'result', subtype: me.interrupted ? 'error_during_execution' : 'success', is_error: me.interrupted, session_id: 'S1', duration_ms: 30, result: '' })
        me.interrupted = false
      }
      closed = true
      if (wake) wake()
    })()
    return {
      supportedCommands: async () => [], setPermissionMode: async () => {}, setModel: async () => {}, applyFlagSettings: async () => {},
      rewindFiles: async (uuid) => { me.rewound = uuid; return { canRewind: true, filesChanged: ['a.txt'], insertions: 1, deletions: 2 } },
      interrupt: async () => { me.interrupted = true },
      close: () => { closed = true; if (wake) wake() },
      async *[Symbol.asyncIterator]() { while (true) { if (out.length) { yield out.shift(); continue } if (closed) return; await new Promise((r) => { wake = r }) } },
    }
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = { APP, tempHome, writeSession, bridgeWithFakeQuery, fakeClaude, wait }
