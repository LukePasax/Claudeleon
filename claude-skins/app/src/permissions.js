// Le regole dei permessi di Claude Code, per il pannello della finestra: cosa può fare senza chiedere (allow), cosa
// chiede sempre (ask), cosa non può fare (deny) e le cartelle in più dove può lavorare (additionalDirectories). Stanno
// in tre file, come per Claude Code: le impostazioni dell'utente (tutti i progetti), quelle del progetto condivise
// col repo (.claude/settings.json) e quelle solo locali (.claude/settings.local.json). Si leggono e si scrivono qui
// toccando solo il campo permissions, il resto del file resta com'è
const { tr } = require('./i18n')
const fs = require('fs')
const os = require('os')
const path = require('path')

const LISTS = ['allow', 'ask', 'deny', 'dirs']

function configDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}
function files(cwd) {
  const base = cwd || os.homedir()
  return {
    user: path.join(configDir(), 'settings.json'),
    project: path.join(base, '.claude', 'settings.json'),
    local: path.join(base, '.claude', 'settings.local.json'),
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) return { data: {}, exists: false }
  const text = fs.readFileSync(file, 'utf8')
  if (!text.trim()) return { data: {}, exists: true }
  const data = JSON.parse(text)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(tr('il file non contiene un oggetto JSON'))
  return { data, exists: true }
}

const strings = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : [])

// Le regole dei tre posti. Un file che non si legge (JSON rotto) ha error e non si può modificare da qui
function read(cwd) {
  const f = files(cwd)
  const scopes = []
  for (const id of ['user', 'project', 'local']) {
    const s = { id, file: f[id], exists: false, allow: [], ask: [], deny: [], dirs: [], error: '' }
    // Senza una cartella di progetto (la home) i file del progetto non hanno senso
    if (id !== 'user' && path.resolve(cwd || os.homedir()) === path.resolve(os.homedir())) s.noProject = true
    try {
      const { data, exists } = readJson(f[id])
      const p = data.permissions && typeof data.permissions === 'object' ? data.permissions : {}
      Object.assign(s, { exists, allow: strings(p.allow), ask: strings(p.ask), deny: strings(p.deny), dirs: strings(p.additionalDirectories) })
    } catch (err) {
      s.error = err.message
    }
    scopes.push(s)
  }
  return { cwd: cwd || os.homedir(), scopes }
}

// Una regola: il nome di uno strumento (o di un server MCP, mcp__server__strumento), con un argomento fra parentesi
// facoltativo: Bash(npm run test:*), Read(./docs/**), WebFetch(domain:github.com)
function validRule(r) {
  return typeof r === 'string' && r.length <= 500 && !/[\r\n]/.test(r) && /^[A-Za-z0-9_*.-]+(\(.+\))?$/.test(r)
}

// op: { kind: 'add' | 'remove' | 'move', list, rule, to }. list e to sono allow, ask, deny o dirs (le cartelle)
function change(cwd, scope, op) {
  const f = files(cwd)[scope]
  if (!f) return { ok: false, error: tr('Posto sconosciuto') }
  if (!op || !LISTS.includes(op.list) || (op.kind === 'move' && (!LISTS.includes(op.to) || op.to === 'dirs' || op.list === 'dirs'))) return { ok: false, error: tr('Richiesta non valida') }
  const rule = String(op.rule || '').trim()
  if (op.kind === 'add' && op.list !== 'dirs' && !validRule(rule)) return { ok: false, error: tr('«{x}» non sembra una regola: per esempio Bash(npm run test:*) o Read(./docs/**)', { x: rule }) }
  if (op.kind === 'add' && op.list === 'dirs' && (!rule || /[\r\n]/.test(rule))) return { ok: false, error: tr('Serve il percorso di una cartella') }
  let doc
  try { doc = readJson(f).data } catch (err) { return { ok: false, error: tr('{x} non si legge ({y}): sistemalo a mano prima', { x: path.basename(f), y: err.message }) } }
  const perms = doc.permissions && typeof doc.permissions === 'object' ? doc.permissions : {}
  const key = (l) => (l === 'dirs' ? 'additionalDirectories' : l)
  const list = (l) => strings(perms[key(l)])
  const set = (l, v) => { if (v.length) perms[key(l)] = v; else delete perms[key(l)] }
  if (op.kind === 'add') {
    if (list(op.list).includes(rule)) return { ok: true }
    // Una regola sta in una sola lista
    if (op.list !== 'dirs') for (const l of ['allow', 'ask', 'deny']) if (l !== op.list) set(l, list(l).filter((x) => x !== rule))
    set(op.list, [...list(op.list), rule])
  } else if (op.kind === 'remove') {
    set(op.list, list(op.list).filter((x) => x !== rule))
  } else if (op.kind === 'move') {
    if (!list(op.list).includes(rule)) return { ok: false, error: tr('La regola non c\'è più') }
    set(op.list, list(op.list).filter((x) => x !== rule))
    if (!list(op.to).includes(rule)) set(op.to, [...list(op.to), rule])
  } else return { ok: false, error: tr('Richiesta non valida') }
  if (Object.keys(perms).length) doc.permissions = perms
  else delete doc.permissions
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n')
  } catch (err) {
    return { ok: false, error: err.message }
  }
  return { ok: true }
}

module.exports = { read, change, validRule, files }
