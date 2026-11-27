// I temi dal lato del processo principale: quali ci sono (le cartelle di renderer/themes con un theme.js) e, di
// ciascuno, il nome per il menu, le misure della finestra e la "personalità" da aggiungere al prompt di sistema di
// Claude Code. Il resto del tema (layout, colori, scritte, disegni) lo usa solo la pagina.
const fs = require('fs')
const path = require('path')

const THEMES_DIR = path.join(__dirname, 'renderer', 'themes')
// Il tema di chi apre l'app la prima volta, e quello di riserva se il tema salvato non c'è più
const DEFAULT_THEME = 'essenziale'

function listThemes() {
  let dirs = []
  try {
    dirs = fs.readdirSync(THEMES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
  const themes = []
  for (const dir of dirs) {
    const file = path.join(THEMES_DIR, dir, 'theme.js')
    if (!fs.existsSync(file)) continue
    try {
      // theme.js si registra nella pagina, ma qui (CommonJS) esporta lo stesso oggetto
      const t = require(file)
      if (t && t.id === dir) themes.push({ id: t.id, name: t.name || t.id, description: t.description || '', persona: t.persona || '', window: t.window || null })
      else console.warn(`Tema ${dir}: l'id in theme.js deve essere uguale al nome della cartella`)
    } catch (err) {
      console.warn(`Tema ${dir} non leggibile: ${err.message}`)
    }
  }
  // Il tema predefinito in cima, gli altri in ordine di nome
  return themes.sort((a, b) => (a.id === DEFAULT_THEME ? -1 : b.id === DEFAULT_THEME ? 1 : a.name.localeCompare(b.name)))
}

// I temi fatti con l'editor: un file JSON per tema nella cartella dei dati dell'app (temi/<id>.json), con i colori
// di base; il kit moderno ne ricava il resto. Restano anche quando l'app si aggiorna
const kit = require('./renderer/kits/moderno.js')
const BUILTIN = () => new Set(listThemes().map((t) => t.id))

function userThemes(dir) {
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')) } catch { return [] }
  const out = []
  for (const f of files) {
    try {
      const spec = kit.normalizeSpec(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
      spec.id = f.slice(0, -5)
      if (validId(spec.id)) out.push(spec)
    } catch (err) {
      console.warn(`Tema ${f} non leggibile: ${err.message}`)
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
// Quello che serve al processo principale di un tema dell'editor (come per gli altri)
function userThemeInfo(spec) {
  const t = kit.fromColors(spec)
  return { id: spec.id, name: spec.name, persona: t.persona, window: t.window, custom: true }
}

const validId = (id) => /^[a-z0-9][a-z0-9-]{0,40}$/.test(id)
// L'id dal nome: minuscole senza accenti, coi trattini; diverso dai temi del programma e, per un tema nuovo, dagli
// altri dell'editor
function idFor(name, dir, keep) {
  if (keep && validId(keep) && !BUILTIN().has(keep)) return keep
  const base = String(name || 'tema').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'tema'
  const taken = new Set([...BUILTIN(), ...userThemes(dir).map((t) => t.id), ...installedThemes(dir).map((t) => t.id)])
  let id = base
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`
  return id
}
function saveUserTheme(dir, spec) {
  const n = kit.normalizeSpec(spec)
  n.id = idFor(n.name, dir, spec && spec.id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${n.id}.json`), JSON.stringify(n, null, 2) + '\n')
  return n
}
function deleteUserTheme(dir, id) {
  if (!validId(id)) return false
  const f = path.join(dir, `${id}.json`)
  const folder = path.join(dir, id)
  if (fs.existsSync(f)) { fs.unlinkSync(f); return true }
  if (fs.existsSync(path.join(folder, 'theme.json'))) { fs.rmSync(folder, { recursive: true, force: true }); return true }
  return false
}

// ------------------------------------------------------------------ temi importati ed esportati

// Un tema si passa in un file .skin: un JSON { format: 'claude-skins-theme', version: 1, kind, ... }. kind 'colors'
// ha spec (un tema dell'editor); kind 'code' ha manifest ({ id, name, description, persona, window }) e files
// ({ 'theme.js': base64, 'theme.css': ..., 'fonts/x.woff2': ... }). Un tema con codice importato sta in
// temi/<id>/ (i suoi file più theme.json col manifest) e la pagina lo carica da skins-theme://<id>/: il processo
// principale non esegue mai il suo codice, legge solo theme.json
const FORMAT = 'claude-skins-theme'
const ALLOWED = /\.(js|css|json|png|jpe?g|gif|webp|svg|woff2?|ttf|otf|txt|md)$/i
const MAX_BUNDLE = 25 * 1024 * 1024

const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '')
function cleanManifest(m, id) {
  const w = m && m.window && typeof m.window === 'object' ? m.window : null
  const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : undefined)
  const win = w ? { width: num(w.width, 400, 4000), height: num(w.height, 300, 3000), minWidth: num(w.minWidth, 300, 4000), minHeight: num(w.minHeight, 200, 3000) } : null
  if (win) for (const k of Object.keys(win)) if (win[k] === undefined) delete win[k]
  return { id, name: str(m && m.name, 60) || id, description: str(m && m.description, 300), persona: str(m && m.persona, 4000), window: win && Object.keys(win).length ? win : null }
}

// I temi con codice importati (cartelle con theme.json)
function installedThemes(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && validId(d.name)) } catch { return [] }
  const out = []
  for (const d of entries) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, d.name, 'theme.json'), 'utf8'))
      if (fs.existsSync(path.join(dir, d.name, 'theme.js'))) out.push(Object.assign(cleanManifest(m, d.name), { custom: true, code: true }))
    } catch {}
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function filesOf(root) {
  const files = {}
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(path.join(dir, e.name), r)
      else if (r !== 'theme.json' && ALLOWED.test(e.name)) files[r] = fs.readFileSync(path.join(dir, e.name)).toString('base64')
    }
  }
  walk(root, '')
  return files
}

// Il pacchetto di un tema, da salvare in un file .skin: del programma, importato con codice o dell'editor
function bundleFor(id, userDir) {
  const head = { format: FORMAT, version: 1 }
  const color = userThemes(userDir).find((t) => t.id === id)
  if (color) { const spec = Object.assign({}, color); delete spec.id; return Object.assign(head, { kind: 'colors', spec }) }
  const inst = installedThemes(userDir).find((t) => t.id === id)
  if (inst) return Object.assign(head, { kind: 'code', manifest: cleanManifest(inst, id), files: filesOf(path.join(userDir, id)) })
  const builtin = listThemes().find((t) => t.id === id)
  if (builtin) return Object.assign(head, { kind: 'code', manifest: cleanManifest(builtin, id), files: filesOf(path.join(THEMES_DIR, id)) })
  return null
}

// Controlla un pacchetto letto da un file: { ok, kind, id, name, error }
function checkBundle(b) {
  if (!b || b.format !== FORMAT) return { ok: false, error: 'Non è un tema di Claudeleon' }
  if (b.kind === 'colors') return b.spec && typeof b.spec === 'object' ? { ok: true, kind: 'colors', name: kit.normalizeSpec(b.spec).name } : { ok: false, error: 'Il tema non ha i colori' }
  if (b.kind !== 'code') return { ok: false, error: 'Tipo di tema sconosciuto' }
  const id = b.manifest && b.manifest.id
  if (!validId(id)) return { ok: false, error: 'L\'id del tema non va bene (minuscole, numeri e trattini)' }
  const files = b.files && typeof b.files === 'object' ? b.files : {}
  if (typeof files['theme.js'] !== 'string') return { ok: false, error: 'Manca theme.js' }
  let size = 0
  for (const [rel, data] of Object.entries(files)) {
    const parts = rel.split('/')
    if (typeof data !== 'string' || !ALLOWED.test(rel) || rel.startsWith('/') || /[\\:]/.test(rel) || parts.some((x) => !x || x === '.' || x === '..')) return { ok: false, error: `File non ammesso: ${rel}` }
    size += data.length * 0.75
  }
  if (size > MAX_BUNDLE) return { ok: false, error: 'Il tema è troppo grande (oltre 25 MB)' }
  return { ok: true, kind: 'code', id, name: cleanManifest(b.manifest, id).name }
}

// Installa un pacchetto già controllato. I temi con codice vanno in temi/<id>/ (al posto di quello che c'era, se
// replace); quelli di colori diventano un tema dell'editor con un id nuovo dal nome
function installBundle(userDir, b, replace) {
  const c = checkBundle(b)
  if (!c.ok) return c
  if (c.kind === 'colors') {
    const spec = Object.assign({}, b.spec)
    delete spec.id
    const saved = saveUserTheme(userDir, spec)
    return { ok: true, kind: 'colors', id: saved.id, spec: saved }
  }
  if (BUILTIN().has(c.id)) return { ok: false, error: `C'è già un tema del programma con l'id «${c.id}»` }
  const target = path.join(userDir, c.id)
  const exists = fs.existsSync(target) || fs.existsSync(path.join(userDir, `${c.id}.json`))
  if (exists && !replace) return { ok: false, exists: true, id: c.id, name: c.name }
  fs.mkdirSync(userDir, { recursive: true })
  const tmp = path.join(userDir, `.nuovo-${c.id}-${process.pid}-${Date.now()}`)
  try {
    for (const [rel, data] of Object.entries(b.files)) {
      const f = path.join(tmp, ...rel.split('/'))
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(f, Buffer.from(data, 'base64'))
    }
    fs.writeFileSync(path.join(tmp, 'theme.json'), JSON.stringify(cleanManifest(b.manifest, c.id), null, 2) + '\n')
    fs.rmSync(target, { recursive: true, force: true })
    fs.rmSync(path.join(userDir, `${c.id}.json`), { force: true })
    fs.renameSync(tmp, target)
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true })
    return { ok: false, error: err.message }
  }
  return { ok: true, kind: 'code', id: c.id, name: c.name }
}

module.exports = { listThemes, DEFAULT_THEME, userThemes, userThemeInfo, saveUserTheme, deleteUserTheme, installedThemes, bundleFor, checkBundle, installBundle, THEMES_DIR }
