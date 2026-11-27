// Il messaggero: comanda Claude Code con l'Agent SDK. Testo e azioni arrivano man mano; quando Claude chiede un
// permesso, la domanda passa alla finestra e la risposta torna indietro. La sessione continua con resume.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { EventEmitter } = require('events')

const CLAUDE = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')

// La personalità che si aggiunge al prompt di sistema viene dal tema (campo persona del suo theme.js); questa vale per
// un tema che non ne ha una
const FALLBACK_PERSONA = [
  'Le tue risposte compaiono in una finestra con un aspetto personalizzato.',
  'Resta preciso e conciso. Usa markdown leggero (grassetto, `codice`, blocchi di codice, elenchi).',
].join(' ')

// Il nome del server del titolo: lo stesso dell'app desktop, così istruzioni e skill scritte per lei funzionano qui
const TITLE_SERVER = 'ccd_session_mgmt'

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

// L'intenzione di un'azione, da mostrare a parole invece del comando: { text } quando Claude l'ha scritta lui (il campo
// description di Bash, Agent...), altrimenti { verb, target } che la pagina traduce con le scritte del tema
// (tool_read: "Legge {x}" ecc.)
function intent(name, input) {
  const i = input && typeof input === 'object' ? input : {}
  const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || String(p || '')
  const short = (t, n = 48) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
  if (typeof i.description === 'string' && i.description.trim()) return { text: short(i.description, 90) }
  switch (name) {
    case 'Read': case 'NotebookRead': return { verb: 'read', target: base(i.file_path || i.notebook_path) }
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return { verb: 'edit', target: base(i.file_path || i.notebook_path) }
    case 'Write': return { verb: 'write', target: base(i.file_path) }
    case 'Grep': return { verb: 'grep', target: short(i.pattern, 32) }
    case 'Glob': return { verb: 'glob', target: short(i.pattern, 40) }
    case 'Bash': case 'PowerShell': return { verb: 'run', target: short(i.command, 40) }
    case 'WebFetch': { let h = ''; try { h = new URL(i.url).hostname } catch {} return { verb: 'fetch', target: h || short(i.url, 40) } }
    case 'WebSearch': return { verb: 'search', target: short(i.query, 40) }
    case 'TodoWrite': return { verb: 'todo', target: '' }
    case 'Skill': return { verb: 'skill', target: String(i.skill || i.command || i.name || '') }
    case 'Agent': case 'Task': return { verb: 'agent', target: '' }
    case 'ExitPlanMode': return { verb: 'plan', target: '' }
    default: {
      // Gli strumenti dei server MCP si chiamano mcp__server__strumento
      const m = /^mcp__(.+?)__(.+)$/.exec(name || '')
      return m ? { verb: 'mcp', target: `${m[2]} (${m[1]})` } : { verb: 'other', target: name || '' }
    }
  }
}

// I modi dei permessi che la finestra offre. Fuori: 'bypassPermissions' (nessun controllo) e 'dontAsk' (nega tutto
// quello che non è già permesso, inutile con una finestra che può chiedere)
const MODES = ['auto', 'default', 'acceptEdits', 'plan']

// Il testo del piano proposto con ExitPlanMode: nel campo plan, o in un file indicato dallo strumento
function planText(input) {
  if (!input || typeof input !== 'object') return ''
  if (typeof input.plan === 'string') return input.plan
  const file = input.planFilePath || input.plan_file_path
  if (typeof file === 'string') {
    try { return fs.readFileSync(file, 'utf8') } catch { return '' }
  }
  return ''
}

// L'uscita di un comando locale (/usage, /context...) può avere i colori del terminale: via
function plainOutput(text) {
  return String(text || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r\n?/g, '\n').trim()
}

// Il testo di <local-command-stdout> in un messaggio, se c'è (così alcune versioni restituiscono l'uscita dei comandi)
function localStdout(message) {
  const content = message && message.content
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n') : ''
  const m = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/.exec(text)
  return m ? m[1] : null
}

// Oltre questa misura (prima o dopo) una modifica non si mostra riga per riga: basterebbe a bloccare la finestra
const MAX_CHANGE = 400 * 1024

function readText(file) {
  try {
    const st = fs.statSync(file)
    return st.isFile() && st.size <= MAX_CHANGE ? fs.readFileSync(file, 'utf8') : null
  } catch {
    return null
  }
}

// La riga (da 1) in cui comincia needle dentro text, o null
function lineOf(text, needle) {
  if (text == null || !needle) return null
  const i = text.indexOf(needle)
  return i < 0 ? null : text.slice(0, i).split('\n').length
}

// Il testo semplice di un messaggio salvato: le parti di testo, senza azioni né risultati
// I file allegati: in fondo al testo, un percorso per riga dentro <attached_files>. La pagina li riconosce e li mostra
// come etichette, nella conversazione e nelle cronache riaperte
function withFiles(text, files) {
  const list = files.map((f) => String(f || '').trim()).filter(Boolean)
  if (!list.length) return text
  return `${text.trim()}\n\n<attached_files>\n${list.join('\n')}\n</attached_files>`.trimStart()
}

// Un messaggio con le immagini: un flusso di un solo messaggio, coi blocchi immagine prima del testo (come l'app desktop)
function userMessage(text, images) {
  const content = images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }))
  if (text.trim()) content.push({ type: 'text', text })
  return (async function* () {
    yield { type: 'user', session_id: '', parent_tool_use_id: null, message: { role: 'user', content } }
  })()
}

// Le immagini di un messaggio salvato, come indirizzi data: per le miniature
function imagesOf(message) {
  const content = message && message.content
  if (!Array.isArray(content)) return []
  return content.filter((b) => b && b.type === 'image' && b.source && b.source.type === 'base64' && b.source.data)
    .map((b) => `data:${b.source.media_type};base64,${b.source.data}`)
}

function plainText(message) {
  const content = message && message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((b) => b && b.type === 'text' && b.text).map((b) => b.text).join('\n\n')
}

class ClaudeBridge extends EventEmitter {
  // session: getSession/setSession della conversazione corrente; workdir: la cartella in cui lavora Claude Code;
  // persona: il tono del tema in uso, si può cambiare fra un messaggio e l'altro; mode: il modo dei permessi
  constructor(session, workdir, persona, mode) {
    super()
    this.persona = persona
    this.session = session
    this.workdir = (workdir || os.homedir()).replace(/\\/g, '/')
    // La cartella della conversazione in corso: quella in cui è nata, perché Claude Code la riprende solo da lì.
    // Vuota per un capitolo nuovo, che nasce nella cartella di lavoro
    this.sessionCwd = null
    this.query = null
    this.pending = new Map()
    this.nextAsk = 1
    // auto: un classificatore decide e chiede solo quando non sa; default: chiede per ogni azione a rischio;
    // acceptEdits: le modifiche ai file passano, il resto si chiede; plan: Claude legge e propone un piano, senza
    // toccare nulla finché il piano non è approvato
    this.mode = MODES.includes(mode) ? mode : 'auto'
    // Il modo da riprendere quando si approva un piano
    this.beforePlan = null
    // Le domande che sono piani da approvare: id → input di ExitPlanMode
    this.plans = new Map()
    // I comandi con / di questa cartella (di Claude Code, skill, plugin, progetto), e quelli che funzionano solo
    // nel terminale, da non offrire
    this.commandList = []
    this.terminalOnly = new Set()
  }

  // Aggiorna l'elenco dei comandi e lo dice alla finestra
  setCommands(list) {
    if (!Array.isArray(list)) return
    this.commandList = list
      .filter((c) => c && c.name && !this.terminalOnly.has(c.name))
      .map((c) => ({ name: c.name, description: c.description || '', argumentHint: c.argumentHint || '', aliases: c.aliases || [], builtin: !!c.builtin }))
    this.emit('commands', this.commandList)
  }

  // Chiede i comandi a Claude Code senza spedire nessun messaggio (nessun costo): si avvia, risponde, si chiude.
  // Serve all'avvio dell'app, prima del primo messaggio
  loadCommands() {
    if (this.commandsLoading) return this.commandsLoading
    this.commandsLoading = (async () => {
      const { query } = await loadSdk()
      let release
      const idle = new Promise((resolve) => { release = resolve })
      async function* nothing() { await idle }
      const q = query({
        prompt: nothing(),
        options: { cwd: this.workdir, pathToClaudeCodeExecutable: CLAUDE, permissionMode: this.mode, settings: { disableAllHooks: true } },
      })
      try {
        const list = await Promise.race([q.supportedCommands(), new Promise((_, reject) => setTimeout(() => reject(new Error('tempo scaduto')), 60000))])
        this.setCommands(list)
      } finally {
        release()
        try { q.close() } catch {}
      }
    })().catch(() => { if (!this.commandList.length) this.emit('commandsError') }).finally(() => { this.commandsLoading = null })
    return this.commandsLoading
  }

  // Cambia modo, anche mentre Claude lavora: vale da subito per la conversazione in corso
  setMode(mode, fromClaude) {
    if (!MODES.includes(mode) || mode === this.mode) return
    if (mode === 'plan') this.beforePlan = this.mode
    this.mode = mode
    if (this.query && !fromClaude) this.query.setPermissionMode(mode).catch(() => {})
    this.emit('mode', mode)
  }

  // La modifica che uno strumento fa a un file, da mostrare riga per riga: { file, created?, whole?, tooBig?,
  // hunks: [{ before, after, line, all }] }. line è la riga d'inizio nel file, se si trova. Il "prima" di un Write
  // si legge dal disco: se il file è già stato scritto (uguale al nuovo contenuto) si mostra il contenuto intero
  // Per una cronaca riaperta (past: true) il file su disco può essere cambiato da allora: di un Write si mostra il
  // contenuto scritto allora, di un Edit si cerca la riga del testo nuovo
  change(toolName, input, past) {
    if (!input || typeof input !== 'object') return null
    const file = input.file_path || input.notebook_path
    if (!file || !/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(toolName)) return null
    const abs = path.isAbsolute(file) ? file : path.join(this.sessionCwd || this.workdir, file)
    const shown = summary(input)
    const big = (...texts) => texts.some((t) => typeof t === 'string' && t.length > MAX_CHANGE)
    if (toolName === 'Edit' || toolName === 'MultiEdit') {
      const edits = toolName === 'Edit' ? [input] : Array.isArray(input.edits) ? input.edits : []
      if (big(...edits.flatMap((e) => [e.old_string, e.new_string]))) return { file: shown, tooBig: true, hunks: [] }
      const current = readText(abs)
      return {
        file: shown,
        hunks: edits.map((e) => ({
          before: String(e.old_string ?? ''),
          after: String(e.new_string ?? ''),
          // Prima della modifica si trova il vecchio testo, dopo il nuovo
          line: past ? lineOf(current, e.new_string) ?? lineOf(current, e.old_string) : lineOf(current, e.old_string) ?? lineOf(current, e.new_string),
          all: !!e.replace_all,
        })),
      }
    }
    if (toolName === 'Write') {
      const content = String(input.content ?? '')
      if (big(content)) return { file: shown, tooBig: true, hunks: [] }
      if (past) return { file: shown, then: true, hunks: [{ before: '', after: content, line: 1 }] }
      const current = readText(abs)
      if (current == null) {
        // Il file c'è ma non si legge (troppo grande, binario, bloccato): niente confronto
        if (fs.existsSync(abs)) return { file: shown, tooBig: true, hunks: [] }
        return { file: shown, created: true, hunks: [{ before: '', after: content, line: 1 }] }
      }
      if (current === content) return { file: shown, whole: true, hunks: [{ before: '', after: content, line: 1 }] }
      return { file: shown, hunks: [{ before: current, after: content, line: 1 }] }
    }
    // NotebookEdit: la cella nuova
    return { file: shown, hunks: [{ before: '', after: String(input.new_source ?? ''), line: null }] }
  }

  // Ferma la risposta in corso; le domande di permesso aperte diventano un rifiuto
  cancel() {
    for (const resolve of this.pending.values()) resolve({ behavior: 'deny', message: 'La persona ha fermato il messaggero.', interrupt: true })
    this.pending.clear()
    this.plans.clear()
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
    const plan = this.plans.get(id)
    this.plans.delete(id)
    if (plan) {
      // Un piano approvato: Claude esce dal modo piano e torna a quello di prima (se era già piano, chiedi sempre)
      if (!allow) return resolve({ behavior: 'deny', message: 'La persona non approva ancora il piano: continua a pianificare e chiedile che cosa vuole cambiare.' })
      const back = this.beforePlan && this.beforePlan !== 'plan' ? this.beforePlan : 'default'
      resolve({ behavior: 'allow', updatedInput: plan, updatedPermissions: [{ type: 'setMode', mode: back, destination: 'session' }] })
      this.beforePlan = null
      this.mode = back
      this.emit('mode', back)
      return
    }
    resolve(allow ? { behavior: 'allow', updatedPermissions: always ? this.suggestions.get(id) : undefined } : { behavior: 'deny', message: 'La persona ha negato il permesso.' })
  }

  // Il messaggio della persona: testo, immagini ({ mediaType, data } in base64) e file (percorsi, che Claude apre da
  // sé con i suoi strumenti). Con le immagini il messaggio parte come blocchi di contenuto, altrimenti come testo
  async send(payload) {
    this.cancel()
    const msg = typeof payload === 'string' ? { text: payload } : payload || {}
    const images = (msg.images || []).filter((i) => i && i.data && /^image\/(png|jpeg|gif|webp)$/.test(i.mediaType))
    const text = withFiles(String(msg.text || ''), msg.files || [])
    if (!text.trim() && !images.length) return
    const prompt = images.length ? userMessage(text, images) : text
    let current = null
    this.suggestions = this.suggestions || new Map()
    try {
      const { query } = await loadSdk()
      const resume = this.session.getSession()
      // Una conversazione si riprende nella sua cartella; una nuova nasce nella cartella di lavoro
      const cwd = (resume && this.sessionCwd) || this.workdir
      current = query({
        prompt,
        options: {
          cwd,
          pathToClaudeCodeExecutable: CLAUDE,
          permissionMode: this.mode,
          systemPrompt: { type: 'preset', preset: 'claude_code', append: this.persona || FALLBACK_PERSONA },
          // Gli hook dell'utente partono una volta per conversazione, al primo messaggio: i successivi riprendono la
          // sessione con un processo nuovo, e farli ripartire a ogni risposta moltiplicherebbe backup e log
          settings: { disableAllHooks: !!resume },
          env: Object.assign({}, process.env, {
            // Claude Code manda anche una frase che riassume ogni gruppo di azioni (come nell'app desktop)
            CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES: '1',
            // Senza questa l'SDK segna la sessione come "programmatica" (sdk-ts) e gli elenchi delle sessioni di
            // Claude (il /resume del terminale, le app) la nascondono
            CLAUDE_CODE_ENTRYPOINT: this.entrypoint || 'cli',
          }),
          // Lo strumento con cui Claude dà un titolo alla conversazione, con lo stesso nome che ha nell'app desktop
          mcpServers: { [TITLE_SERVER]: await this.titleServer() },
          includePartialMessages: true,
          resume: resume || undefined,
          canUseTool: (toolName, input, options) => this.ask(toolName, input, options),
        },
      })
      this.query = current
      // L'elenco dei comandi di questa conversazione (può cambiare con la cartella e i plugin)
      current.supportedCommands().then((list) => { if (this.query === current) this.setCommands(list) }).catch(() => {})
      let sawDelta = false
      let wroteText = false
      let sawOutput = false
      for await (const msg of current) {
        if (this.query !== current) break
        if (msg.session_id) {
          this.sessionCwd = cwd
          this.session.setSession(msg.session_id, cwd)
        }
        // Claude Code dice in che modo è (all'inizio di ogni turno e quando cambia): la finestra si allinea
        if (msg.type === 'system' && (msg.subtype === 'init' || msg.subtype === 'status') && msg.permissionMode) this.setMode(msg.permissionMode, true)
        if (msg.type === 'system') {
          if (msg.subtype === 'init' && Array.isArray(msg.terminal_slash_commands)) this.terminalOnly = new Set(msg.terminal_slash_commands)
          else if (msg.subtype === 'commands_changed') this.setCommands(msg.commands)
          else if (msg.subtype === 'local_command_output') { sawOutput = true; this.emit('commandOutput', plainOutput(msg.content)) }
          else if (msg.subtype === 'compact_boundary') this.emit('compacted', { pre: msg.compact_metadata?.pre_tokens || 0, post: msg.compact_metadata?.post_tokens || 0 })
          else if (msg.subtype === 'status') this.emit('status', msg.status || null)
        }
        // La frase che riassume le azioni appena fatte
        if (msg.type === 'tool_use_summary' && msg.summary) this.emit('toolSummary', { summary: String(msg.summary), ids: msg.preceding_tool_use_ids || [] })
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
            if (block.type === 'tool_use') this.emit('tool', { id: block.id, name: block.name, summary: summary(block.input), intent: intent(block.name, block.input), change: this.change(block.name, block.input) })
            else if (block.type === 'text' && !sawDelta && block.text) {
              this.emit('delta', (wroteText ? '\n\n' : '') + block.text)
              wroteText = true
            }
          }
          sawDelta = false
        } else if (msg.type === 'user') {
          const out = localStdout(msg.message)
          if (out != null && !sawOutput) { sawOutput = true; this.emit('commandOutput', plainOutput(out)) }
          for (const block of Array.isArray(msg.message?.content) ? msg.message.content : []) {
            if (block.type === 'tool_result') this.emit('toolDone', { id: block.tool_use_id, error: !!block.is_error })
          }
        } else if (msg.type === 'result') {
          if (msg.is_error || msg.subtype !== 'success') this.emit('error', msg.result || `Il messaggero si è fermato (${msg.subtype}).`)
          else {
            // Un comando che non ha fatto scrivere Claude né mandato un'uscita: il suo esito è nel risultato
            if (!wroteText && !sawOutput && msg.result) this.emit('commandOutput', plainOutput(msg.result))
            this.emit('done', { durationMs: msg.duration_ms || 0 })
          }
        }
      }
    } catch (err) {
      if (this.query === current) this.emit('error', `Claude Code non risponde: ${err.message}`)
    } finally {
      if (this.query === current) this.query = null
    }
  }

  // Il server MCP in-process con set_session_title. Scrive la riga custom-title nel transcript (come fa il desktop),
  // che listSessions legge come customTitle; poi la finestra ricarica le cronache
  async titleServer() {
    if (this.titles) return this.titles
    const { createSdkMcpServer, tool, renameSession } = await loadSdk()
    const { z } = require('zod')
    this.titles = createSdkMcpServer({
      name: TITLE_SERVER,
      version: '1.0.0',
      tools: [tool(
        'set_session_title',
        'Imposta il titolo della conversazione corrente, quello che compare nell\'elenco delle sessioni.',
        { title: z.string().describe('Il titolo nuovo, breve'), session_id: z.string().optional().describe('"self" o assente: la sessione corrente') },
        async ({ title, session_id }) => {
          const id = session_id && session_id !== 'self' ? session_id : this.session.getSession()
          const clean = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 200)
          if (!id || !clean) return { content: [{ type: 'text', text: 'Nessuna sessione o titolo vuoto.' }], isError: true }
          try {
            await renameSession(id, clean, this.sessionCwd ? { dir: this.sessionCwd } : {})
              .catch(() => renameSession(id, clean))
          } catch (err) {
            return { content: [{ type: 'text', text: `Titolo non salvato: ${err.message}` }], isError: true }
          }
          this.emit('title', { id, title: clean })
          return { content: [{ type: 'text', text: `Titolo impostato: ${clean}` }] }
        },
      )],
    })
    return this.titles
  }

  // Una domanda di permesso: va alla finestra e si aspetta la risposta della persona
  ask(toolName, input, options) {
    // Dare un titolo alla conversazione è innocuo: non si chiede
    if (toolName === `mcp__${TITLE_SERVER}__set_session_title`) return Promise.resolve({ behavior: 'allow', updatedInput: input })
    const id = this.nextAsk++
    this.suggestions.set(id, options.suggestions)
    if (toolName === 'ExitPlanMode') return this.askPlan(id, input, options)
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
        change: this.change(toolName, input),
        canAlways: Array.isArray(options.suggestions) && options.suggestions.length > 0,
      })
    })
  }

  // La fine del modo piano: la finestra mostra il piano proposto, con Approva o Continua a pianificare
  askPlan(id, input, options) {
    this.plans.set(id, input)
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      options.signal?.addEventListener('abort', () => {
        this.plans.delete(id)
        if (this.pending.delete(id)) resolve({ behavior: 'deny', message: 'Richiesta annullata.' })
        this.emit('askClosed', { id })
      })
      this.emit('ask', { id, kind: 'plan', plan: planText(input) })
    })
  }

  // Le sessioni di Claude Code di tutte le cartelle, le più recenti prima, come nella barra laterale dell'app
  // desktop (le sue comprese, coi loro titoli); ognuna con la sua cartella, che serve per riprenderla
  async sessions() {
    const { listSessions } = await loadSdk()
    const list = await listSessions({ limit: 80 })
    return list.map((s) => ({
      id: s.sessionId,
      title: s.customTitle || s.summary || s.firstPrompt || '(senza titolo)',
      lastModified: s.lastModified,
      cwd: s.cwd ? s.cwd.replace(/\\/g, '/') : null,
    }))
  }

  // Una sessione salvata, nell'ordine in cui è andata: le domande della persona (anche i comandi con /), le risposte
  // di Claude, le sue azioni con l'esito e, per le modifiche ai file, le differenze; l'uscita dei comandi locali.
  // Voci: { role: 'user' | 'assistant' | 'output', text } e { role: 'tool', id, name, summary, change, error }
  async history(sessionId, cwd) {
    const { getSessionMessages } = await loadSdk()
    const messages = await getSessionMessages(sessionId, cwd ? { dir: cwd } : {})
    const items = []
    const tools = new Map()
    for (const m of messages) {
      // Le conversazioni dei sottoagenti restano fuori: si vede l'azione che li ha lanciati
      if ((m.type !== 'user' && m.type !== 'assistant') || m.parent_tool_use_id) continue
      const content = m.message && m.message.content
      const blocks = Array.isArray(content) ? content : [{ type: 'text', text: typeof content === 'string' ? content : '' }]
      if (m.type === 'assistant') {
        const text = plainText(m.message)
        if (text.trim()) items.push({ role: 'assistant', text })
        for (const b of blocks) {
          if (b.type !== 'tool_use') continue
          const item = { role: 'tool', id: b.id, name: b.name, summary: summary(b.input), intent: intent(b.name, b.input), change: this.change(b.name, b.input, true), error: null }
          tools.set(b.id, item)
          items.push(item)
        }
        continue
      }
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const t = tools.get(b.tool_use_id)
          if (t) t.error = !!b.is_error
        }
      }
      const text = plainText(m.message).trim()
      const pics = imagesOf(m.message)
      if (!text && !pics.length) continue
      // Un comando con /: si mostra come lo si era scritto
      const name = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/.exec(text)
      if (name) {
        const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)
        items.push({ role: 'user', text: `/${name[1]}${args && args[1].trim() ? ` ${args[1].trim()}` : ''}` })
        continue
      }
      const out = localStdout(m.message)
      if (out != null) {
        if (plainOutput(out)) items.push({ role: 'output', text: plainOutput(out) })
        continue
      }
      // Promemoria di sistema e notifiche non sono della persona
      if (/^<(command|local-command|system-reminder|task-notification)/.test(text)) continue
      items.push(pics.length ? { role: 'user', text, images: pics } : { role: 'user', text })
    }
    return items
  }
}

module.exports = { ClaudeBridge, MODES, intent }
