// La ricerca dentro le conversazioni salvate di Claude Code (i file .jsonl in ~/.claude/projects/<cartella>/<id>.jsonl):
// le domande della persona e le risposte di Claude, senza strumenti, promemoria di sistema e sotto-agenti. La prima
// ricerca legge tutti i file e si ricorda il testo; le altre rileggono solo quelli cambiati (data e misura)
const fs = require('fs')
const os = require('os')
const path = require('path')

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function projectsDir() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects')
}

// Il testo di un messaggio: la stringa, o i blocchi di testo; i blocchi che la finestra aggiunge in fondo (file
// allegati, commenti sulle righe) e i messaggi di sistema restano fuori
function textOf(message) {
  const c = message && message.content
  let text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b && b.type === 'text' && b.text).map((b) => b.text).join('\n') : ''
  text = text.replace(/<(attached_files|diff_comments)>[\s\S]*?(<\/\1>|$)/g, '').trim()
  if (/^<(system-reminder|local-command|command-|task-notification)/.test(text)) return ''
  return text
}

const cache = new Map()
function parse(file) {
  const items = []
  let raw = ''
  try { raw = fs.readFileSync(file, 'utf8') } catch { return items }
  for (const line of raw.split('\n')) {
    if (!line || (line.indexOf('"type":"user"') < 0 && line.indexOf('"type":"assistant"') < 0)) continue
    let m
    try { m = JSON.parse(line) } catch { continue }
    if ((m.type !== 'user' && m.type !== 'assistant') || m.isSidechain || m.isMeta) continue
    const text = textOf(m.message)
    if (text) items.push({ role: m.type, text, folded: fold(text) })
  }
  return items
}
// I messaggi di ogni conversazione, dai file (rileggendo solo quelli cambiati)
function index() {
  const seen = new Set()
  let dirs = []
  try { dirs = fs.readdirSync(projectsDir(), { withFileTypes: true }).filter((d) => d.isDirectory()) } catch { return cache }
  for (const d of dirs) {
    let files = []
    try { files = fs.readdirSync(path.join(projectsDir(), d.name)).filter((f) => f.endsWith('.jsonl')) } catch { continue }
    for (const f of files) {
      const file = path.join(projectsDir(), d.name, f)
      const id = f.slice(0, -6)
      seen.add(id)
      let st
      try { st = fs.statSync(file) } catch { continue }
      const old = cache.get(id)
      if (old && old.mtime === st.mtimeMs && old.size === st.size) continue
      cache.set(id, { mtime: st.mtimeMs, size: st.size, items: parse(file) })
    }
  }
  for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id)
  return cache
}

// Un pezzo del messaggio attorno alla prima parola trovata
function snippet(text, folded, word) {
  const at = Math.max(0, folded.indexOf(word))
  const from = Math.max(0, at - 40)
  const to = Math.min(text.length, at + word.length + 90)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ').trim()}${to < text.length ? '…' : ''}`
}

// Le conversazioni che contengono tutte le parole cercate (in un messaggio o in messaggi diversi): per ciascuna
// quanti messaggi ne hanno almeno una e un pezzo del primo che le ha tutte (o della prima parola)
function search(query) {
  const words = fold(query).split(/\s+/).filter((w) => w.length >= 2)
  if (!words.length) return []
  const out = []
  for (const [id, entry] of index()) {
    let hits = 0
    const found = new Set()
    let best = null
    for (const it of entry.items) {
      const has = words.filter((w) => it.folded.includes(w))
      if (!has.length) continue
      hits++
      for (const w of has) found.add(w)
      if (!best || (has.length === words.length && best.n < words.length)) best = { it, n: has.length, w: has[0] }
    }
    if (found.size === words.length && best) out.push({ id, count: hits, snippet: snippet(best.it.text, best.it.folded, best.w), role: best.it.role })
  }
  return out.sort((a, b) => b.count - a.count)
}

module.exports = { search, warm: () => { try { index() } catch {} }, _internals: { textOf, fold, snippet, cache } }
