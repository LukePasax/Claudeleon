// I file di una cartella, per citarli con @ nella casella (li chiede la pagina al processo principale)
const fs = require('fs')
const path = require('path')

// I file della cartella di una conversazione, per citarli con @ nella penna: quelli di git (tracciati e nuovi, senza
// gli ignorati) se la cartella è un repo, altrimenti una visita delle cartelle senza quelle pesanti. Si ricordano per
// 30 secondi per cartella. Ci sono anche le cartelle, come nei suggerimenti di Claude Code
const fileLists = new Map()
const SKIP_DIRS = new Set(['node_modules', '.git', '.vs', '.idea', '.vscode', 'bin', 'obj', 'dist', 'out', '__pycache__', '.venv', 'venv', '.next', '.cache', 'packages'])
function listFiles(cwd) {
  const cached = fileLists.get(cwd)
  if (cached && Date.now() - cached.at < 30000) return cached.files
  const done = (files) => {
    const dirs = new Set()
    for (const f of files) { const parts = f.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/') + '/') }
    const all = [...dirs, ...files]
    fileLists.set(cwd, { at: Date.now(), files: all })
    return all
  }
  const p = new Promise((resolve) => {
    require('child_process').execFile('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, out) => {
      if (!err && out) return resolve(done(out.split(/\r?\n/).filter(Boolean)))
      // Senza git: le cartelle a mano, fino a 30.000 file
      const files = []
      const walk = (dir, rel, depth) => {
        if (files.length > 30000 || depth > 12) return
        let entries = []
        try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
        for (const e of entries) {
          if (e.name.startsWith('.') && e.name !== '.github') continue
          const r = rel ? `${rel}/${e.name}` : e.name
          if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), r, depth + 1) } else files.push(r)
        }
      }
      walk(cwd, '', 0)
      resolve(done(files))
    })
  })
  fileLists.set(cwd, { at: Date.now(), files: p })
  return p
}
// I file più adatti a quello che si è scritto dopo @: prima quelli il cui nome comincia così, poi quelli che lo
// contengono nel nome, poi nel percorso, poi le lettere in ordine sparse
function rankFiles(files, query) {
  const q = query.toLowerCase().replace(/\\/g, '/')
  if (!q) return files.filter((f) => !f.includes('/') || /^[^/]+\/$/.test(f)).slice(0, 15)
  const scored = []
  for (const f of files) {
    const l = f.toLowerCase()
    const name = l.replace(/\/$/, '').split('/').pop()
    let s = -1
    if (name.startsWith(q)) s = 0
    else if (name.includes(q)) s = 1
    else if (l.includes(q)) s = 2
    else {
      let i = 0
      for (const ch of l) if (ch === q[i]) i++
      if (i === q.length) s = 3
    }
    if (s >= 0) scored.push([s, f.length, f])
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return scored.slice(0, 15).map((x) => x[2])
}

module.exports = { listFiles, rankFiles }
