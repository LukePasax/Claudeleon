// La memoria di Claude Code, per il pannello della finestra: i file CLAUDE.md che legge all'avvio di una
// conversazione. Le istruzioni personali (~/.claude/CLAUDE.md, per tutti i progetti), quelle del progetto
// (CLAUDE.md nella cartella, o .claude/CLAUDE.md), quelle solo tue nel progetto (CLAUDE.local.md) e i CLAUDE.md delle
// cartelle sopra quella del progetto (Claude Code legge anche quelli). Si leggono e si scrivono solo questi file
const fs = require('fs')
const os = require('os')
const path = require('path')

const MAX = 1024 * 1024

function configDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function entry(id, file) {
  let exists = false
  let size = 0
  try { const st = fs.statSync(file); exists = st.isFile(); size = st.size } catch {}
  return { id, file: file.replace(/\\/g, '/'), exists, size }
}

// I file della memoria per una cartella di lavoro
function list(cwd) {
  const home = path.resolve(os.homedir())
  const dir = path.resolve(cwd || home)
  const out = [entry('user', path.join(configDir(), 'CLAUDE.md'))]
  if (dir !== home) {
    // Il progetto: CLAUDE.md, o .claude/CLAUDE.md se c'è solo quello
    const main = path.join(dir, 'CLAUDE.md')
    const hidden = path.join(dir, '.claude', 'CLAUDE.md')
    out.push(entry('project', !fs.existsSync(main) && fs.existsSync(hidden) ? hidden : main))
    out.push(entry('local', path.join(dir, 'CLAUDE.local.md')))
    // Le cartelle sopra (fino alla radice del disco), solo se hanno già il loro CLAUDE.md
    let up = path.dirname(dir)
    while (up && up !== path.dirname(up)) {
      const f = path.join(up, 'CLAUDE.md')
      if (fs.existsSync(f) && path.resolve(f) !== path.resolve(out[0].file)) out.push(Object.assign(entry('parent', f), { dir: path.basename(up) }))
      up = path.dirname(up)
    }
  }
  return { cwd: dir.replace(/\\/g, '/'), files: out }
}

// Un file è della memoria solo se sta nell'elenco di quella cartella
function allowed(cwd, file) {
  const want = path.resolve(String(file || ''))
  return list(cwd).files.some((f) => path.resolve(f.file) === want)
}

function read(cwd, file) {
  if (!allowed(cwd, file)) return { ok: false, error: 'Non è un file della memoria' }
  try {
    if (!fs.existsSync(file)) return { ok: true, text: '', exists: false }
    if (fs.statSync(file).size > MAX) return { ok: false, error: 'Il file è troppo grande per modificarlo qui' }
    return { ok: true, text: fs.readFileSync(file, 'utf8'), exists: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

function write(cwd, file, text) {
  if (!allowed(cwd, file)) return { ok: false, error: 'Non è un file della memoria' }
  text = String(text ?? '')
  if (Buffer.byteLength(text) > MAX) return { ok: false, error: 'Il testo è troppo lungo' }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { list, read, write }
