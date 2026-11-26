// Il messaggero: comanda Claude Code con l'Agent SDK. Testo e azioni arrivano man mano; quando Claude chiede un
// permesso, la domanda passa alla finestra e la risposta torna indietro. La sessione continua con resume.
const os = require('os')
const path = require('path')
const { EventEmitter } = require('events')

const CLAUDE = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')

// La personalità che si aggiunge al prompt di sistema viene dal tema (campo persona del suo theme.js); questa vale per
// un tema che non ne ha una
const FALLBACK_PERSONA = [
  'Le tue risposte compaiono in una piccola finestra a forma di rotolo di pergamena, in pixel art.',
  'Resta preciso e conciso. Usa markdown leggero (grassetto, `codice`, blocchi di codice, elenchi).',
].join(' ')

// L'SDK è un modulo ES: si carica una volta sola
let sdk = null
async function loadSdk() {
  if (!sdk) sdk = await import('@anthropic-ai/claude-agent-sdk')
  return sdk
}

function summary(input) {
  if (!input || typeof input !== 'object') return ''
  const raw = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.query ?? input.description ?? ''
  const text = String(raw)
  // Dei percorsi lunghi bastano le ultime due parti
  return input.file_path && text.split(/[\\/]/).length > 3 ? text.split(/[\\/]/).slice(-2).join('/') : text
}

// Il testo semplice di un messaggio salvato: le parti di testo, senza azioni né risultati
function plainText(message) {
  const content = message && message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((b) => b && b.type === 'text' && b.text).map((b) => b.text).join('\n\n')
}

class ClaudeBridge extends EventEmitter {
  // session: getSession/setSession della conversazione corrente; workdir: la cartella in cui lavora Claude Code;
  // persona: il tono del tema in uso, si può cambiare fra un messaggio e l'altro
  constructor(session, workdir, persona) {
    super()
    this.persona = persona
    this.session = session
    this.workdir = (workdir || os.homedir()).replace(/\\/g, '/')
    this.query = null
    this.pending = new Map()
    this.nextAsk = 1
    // 'auto': un classificatore decide e chiede solo quando non sa; 'default': chiede per ogni azione a rischio
    this.mode = 'auto'
  }

  // Ferma la risposta in corso; le domande di permesso aperte diventano un rifiuto
  cancel() {
    for (const resolve of this.pending.values()) resolve({ behavior: 'deny', message: 'La persona ha fermato il messaggero.', interrupt: true })
    this.pending.clear()
    if (this.query) {
      const q = this.query
      this.query = null
      q.interrupt().catch(() => q.close())
    }
  }

  // La risposta della finestra a una domanda di permesso
  answer(id, allow, always) {
    const resolve = this.pending.get(id)
    if (!resolve) return
    this.pending.delete(id)
    resolve(allow ? { behavior: 'allow', updatedPermissions: always ? this.suggestions.get(id) : undefined } : { behavior: 'deny', message: 'La persona ha negato il permesso.' })
  }

  async send(prompt) {
    this.cancel()
    if (!prompt.trim()) return
    let current = null
    this.suggestions = this.suggestions || new Map()
    try {
      const { query } = await loadSdk()
      const resume = this.session.getSession()
      current = query({
        prompt,
        options: {
          cwd: this.workdir,
          pathToClaudeCodeExecutable: CLAUDE,
          permissionMode: this.mode,
          systemPrompt: { type: 'preset', preset: 'claude_code', append: this.persona || FALLBACK_PERSONA },
          // Queste conversazioni non fanno partire gli hook dell'utente (log di sessione, backup)
          settings: { disableAllHooks: true },
          includePartialMessages: true,
          resume: resume || undefined,
          canUseTool: (toolName, input, options) => this.ask(toolName, input, options),
        },
      })
      this.query = current
      let sawDelta = false
      let wroteText = false
      for await (const msg of current) {
        if (this.query !== current) break
        if (msg.session_id) this.session.setSession(msg.session_id)
        if (msg.type === 'stream_event') {
          const ev = msg.event || {}
          if (ev.type === 'content_block_start' && ev.content_block?.type === 'text' && wroteText) {
            this.emit('delta', '\n\n')
          } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            sawDelta = true
            wroteText = true
            this.emit('delta', ev.delta.text)
          }
        } else if (msg.type === 'assistant') {
          for (const block of msg.message?.content || []) {
            if (block.type === 'tool_use') this.emit('tool', { id: block.id, name: block.name, summary: summary(block.input) })
            else if (block.type === 'text' && !sawDelta && block.text) {
              this.emit('delta', (wroteText ? '\n\n' : '') + block.text)
              wroteText = true
            }
          }
          sawDelta = false
        } else if (msg.type === 'user') {
          for (const block of msg.message?.content || []) {
            if (block.type === 'tool_result') this.emit('toolDone', { id: block.tool_use_id, error: !!block.is_error })
          }
        } else if (msg.type === 'result') {
          if (msg.is_error || msg.subtype !== 'success') this.emit('error', msg.result || `Il messaggero si è fermato (${msg.subtype}).`)
          else this.emit('done', { durationMs: msg.duration_ms || 0 })
        }
      }
    } catch (err) {
      if (this.query === current) this.emit('error', `Claude Code non risponde: ${err.message}`)
    } finally {
      if (this.query === current) this.query = null
    }
  }

  // Una domanda di permesso: va alla finestra e si aspetta la risposta della persona
  ask(toolName, input, options) {
    const id = this.nextAsk++
    this.suggestions.set(id, options.suggestions)
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      options.signal?.addEventListener('abort', () => {
        if (this.pending.delete(id)) resolve({ behavior: 'deny', message: 'Richiesta annullata.' })
        this.emit('askClosed', { id })
      })
      this.emit('ask', {
        id,
        title: options.title || `Claude vuole usare ${toolName}`,
        description: options.description || options.decisionReason || '',
        detail: summary(input),
        canAlways: Array.isArray(options.suggestions) && options.suggestions.length > 0,
      })
    })
  }

  // Le sessioni di Claude Code nella cartella di lavoro, le più recenti prima: quelle dell'app desktop comprese
  async sessions() {
    const { listSessions } = await loadSdk()
    const list = await listSessions({ dir: this.workdir, limit: 40 })
    return list.map((s) => ({
      id: s.sessionId,
      title: s.customTitle || s.summary || s.firstPrompt || '(senza titolo)',
      lastModified: s.lastModified,
    }))
  }

  // I messaggi di una sessione, solo il testo: le domande della persona e le risposte di Claude
  async history(sessionId) {
    const { getSessionMessages } = await loadSdk()
    const messages = await getSessionMessages(sessionId, { dir: this.workdir })
    return messages
      .filter((m) => (m.type === 'user' || m.type === 'assistant') && !m.parent_tool_use_id)
      .map((m) => ({ role: m.type, text: plainText(m.message) }))
      .filter((m) => m.text.trim() && !(m.role === 'user' && /^<(command|local-command|system-reminder|task-notification)/.test(m.text.trim())))
  }
}

module.exports = { ClaudeBridge }
