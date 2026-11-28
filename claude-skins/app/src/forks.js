// Le conversazioni derivate da un'altra (una modifica a un messaggio già mandato, un fork dell'app desktop o del
// terminale), per mostrarle sotto quella di partenza. Claude Code lo scrive nelle prime righe del loro .jsonl:
// "forkedFrom": { "sessionId": … } (forkSession, il fork dell'app desktop e del terminale), oppure, quando la
// conversazione riprende un'altra con forkSession (come fa Claudeleon modificando un messaggio), i messaggi copiati
// hanno "requestSessionId" con l'id di quella di partenza. L'inizio di un file non cambia più: ogni file si legge
// una volta sola, appena ha la prima risposta di Claude
const fs = require('fs')
const os = require('os')
const path = require('path')

const FORKED = /"forkedFrom"\s*:\s*\{\s*"sessionId"\s*:\s*"([0-9a-fA-F-]{8,})"/
const REQUESTED = /"requestSessionId"\s*:\s*"([0-9a-fA-F-]{8,})"/
const MESSAGE = /"type"\s*:\s*"(user|assistant)"/
const CHUNK = 65536
const MAX = 1024 * 1024

function projectsDir() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects')
}

// { parent, done }: la conversazione di partenza scritta all'inizio del file (o null), e se la risposta è sicura
// (c'è già la prima risposta di Claude; prima si riprova la volta dopo). Si legge a pezzi, al massimo 1 MB: il primo
// messaggio può avere immagini allegate
function parentIn(file, id = path.basename(file, '.jsonl')) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    let text = ''
    let pos = 0
    const buf = Buffer.alloc(CHUNK)
    while (pos < MAX) {
      const n = fs.readSync(fd, buf, 0, CHUNK, pos)
      if (!n) break
      pos += n
      text += buf.slice(0, n).toString('utf8')
      const lines = text.split('\n')
      // L'ultima riga può essere a metà: si guarda quando è intera
      const whole = n < CHUNK ? lines : lines.slice(0, -1)
      for (const line of whole) {
        const kind = MESSAGE.exec(line)
        if (!kind) continue
        const f = FORKED.exec(line)
        if (f && f[1] !== id) return { parent: f[1], done: true }
        const r = REQUESTED.exec(line)
        if (r && r[1] !== id) return { parent: r[1], done: true }
        if (kind[1] === 'assistant') return { parent: null, done: true }
      }
      if (n < CHUNK) break
    }
    return { parent: null, done: pos >= MAX }
  } catch {
    return { parent: null, done: false }
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch {}
  }
}

const cache = new Map()
// id della conversazione → id di quella da cui è partita, per tutte le conversazioni salvate
function parents() {
  const out = new Map()
  let dirs = []
  try { dirs = fs.readdirSync(projectsDir(), { withFileTypes: true }).filter((d) => d.isDirectory()) } catch { return out }
  for (const d of dirs) {
    let files = []
    try { files = fs.readdirSync(path.join(projectsDir(), d.name)).filter((f) => f.endsWith('.jsonl')) } catch { continue }
    for (const f of files) {
      const id = f.slice(0, -6)
      const file = path.join(projectsDir(), d.name, f)
      let r = cache.get(file)
      if (!r || !r.done) { r = parentIn(file, id); cache.set(file, r) }
      if (r.parent) out.set(id, r.parent)
    }
  }
  return out
}

module.exports = { parents, parentIn }
