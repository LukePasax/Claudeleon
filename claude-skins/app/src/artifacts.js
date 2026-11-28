// Gli artifact di claude.ai: le pagine che Claude pubblica con lo strumento Artifact di Claude Code (private finché
// la persona non le condivide). Qui: riconoscere una pubblicazione riuscita (dall'ingresso e dal risultato dello
// strumento) e l'elenco di quelle fatte dalle conversazioni salvate su questo computer (~/.claude/projects/*/*.jsonl)
const fs = require('fs')
const os = require('os')
const path = require('path')

const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/
const GALLERY = 'https://claude.ai/code/artifacts'

const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || ''

// Il <title> di una pagina HTML (nei primi 8 KB, come fa lo strumento)
function htmlTitle(file) {
  if (!file || !/\.html?$/i.test(file)) return ''
  try {
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(8192)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    fs.closeSync(fd)
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(buf.slice(0, n).toString('utf8'))
    return m ? m[1].replace(/\s+/g, ' ').trim() : ''
  } catch { return '' }
}

// Il testo del risultato di uno strumento (stringa o blocchi)
function resultText(content) {
  if (typeof content === 'string') return content
  return Array.isArray(content) ? content.map((c) => (c && c.text) || '').join('\n') : ''
}

// Una pubblicazione riuscita: { url, title, updated, file, icon }, altrimenti null. Solo publish (l'azione di
// partenza): elenchi, letture, file caricati e cancellazioni no. result è il risultato strutturato, se c'è
function artifactOf(input, result, text) {
  const i = input && typeof input === 'object' ? input : {}
  const action = i.action || 'publish'
  if (action !== 'publish' || i.asset) return null
  const r = result && typeof result === 'object' && !Array.isArray(result) ? result : {}
  const url = (typeof r.url === 'string' && ARTIFACT_URL.test(r.url) && r.url) || ((ARTIFACT_URL.exec(String(text || '')) || [])[0])
  if (!url) return null
  const file = i.file_path || r.path || ''
  const title = String(r.title || i.title || htmlTitle(file) || base(file).replace(/\.[^.]+$/, '') || 'Artifact')
  return { url, title, updated: !!(r.updated || i.url), file: file || null, icon: r.icon || i.icon || null }
}

function projectsDir() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects')
}

// Le pubblicazioni di un file di sessione: [{ url, title, file, at, sessionId, cwd }]
function parse(file, sessionId) {
  let raw = ''
  try { raw = fs.readFileSync(file, 'utf8') } catch { return [] }
  if (raw.indexOf('"Artifact"') < 0) return []
  const inputs = new Map()
  const out = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const isUse = line.indexOf('"Artifact"') >= 0
    if (!isUse && !inputs.size) continue
    let m
    try { m = JSON.parse(line) } catch { continue }
    const content = m && m.message && Array.isArray(m.message.content) ? m.message.content : []
    if (m.type === 'assistant') {
      for (const b of content) if (b && b.type === 'tool_use' && b.name === 'Artifact') inputs.set(b.id, b.input)
    } else if (m.type === 'user') {
      const results = content.filter((b) => b && b.type === 'tool_result' && inputs.has(b.tool_use_id))
      for (const b of results) {
        const input = inputs.get(b.tool_use_id)
        inputs.delete(b.tool_use_id)
        if (b.is_error) continue
        const a = artifactOf(input, results.length === 1 ? m.toolUseResult : null, resultText(b.content))
        if (a) out.push({ url: a.url, title: a.title, file: a.file, at: Date.parse(m.timestamp) || 0, sessionId: m.sessionId || sessionId, cwd: m.cwd || null })
      }
    }
  }
  return out
}

const cache = new Map()
// Gli artifact pubblicati da qui, uno per indirizzo (l'ultima pubblicazione: titolo, data, conversazione), dal più
// recente; quante volte è stato pubblicato in versions
function list() {
  const seen = new Set()
  let dirs = []
  try { dirs = fs.readdirSync(projectsDir(), { withFileTypes: true }).filter((d) => d.isDirectory()) } catch {}
  for (const d of dirs) {
    let files = []
    try { files = fs.readdirSync(path.join(projectsDir(), d.name)).filter((f) => f.endsWith('.jsonl')) } catch { continue }
    for (const f of files) {
      const file = path.join(projectsDir(), d.name, f)
      seen.add(file)
      let st
      try { st = fs.statSync(file) } catch { continue }
      const old = cache.get(file)
      if (old && old.mtime === st.mtimeMs && old.size === st.size) continue
      cache.set(file, { mtime: st.mtimeMs, size: st.size, items: parse(file, f.slice(0, -6)) })
    }
  }
  for (const k of [...cache.keys()]) if (!seen.has(k)) cache.delete(k)
  const byUrl = new Map()
  for (const { items } of cache.values()) {
    for (const it of items) {
      const cur = byUrl.get(it.url)
      if (!cur) byUrl.set(it.url, Object.assign({ versions: 1 }, it))
      else {
        cur.versions++
        if (it.at >= cur.at) Object.assign(cur, it, { versions: cur.versions })
      }
    }
  }
  return [...byUrl.values()].sort((a, b) => b.at - a.at)
}

module.exports = { artifactOf, resultText, list, htmlTitle, ARTIFACT_URL, GALLERY, ARTIFACT_TOOLS: ['Artifact', 'ArtifactComments', 'ArtifactData'] }
