// I temi dal lato del processo principale: quali ci sono (le cartelle di renderer/themes con un theme.js) e, di
// ciascuno, il nome per il menu, le misure della finestra e la "personalità" da aggiungere al prompt di sistema di
// Claude Code. Il resto del tema (layout, colori, scritte, disegni) lo usa solo la pagina.
const fs = require('fs')
const path = require('path')

const THEMES_DIR = path.join(__dirname, 'renderer', 'themes')
// Il tema di chi apre l'app la prima volta, e quello di riserva se il tema salvato non c'è più
const DEFAULT_THEME = 'terra-di-mezzo'

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
      if (t && t.id === dir) themes.push({ id: t.id, name: t.name || t.id, persona: t.persona || '', window: t.window || null })
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
  const taken = new Set([...BUILTIN(), ...userThemes(dir).map((t) => t.id)])
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
  if (!fs.existsSync(f)) return false
  fs.unlinkSync(f)
  return true
}

module.exports = { listThemes, DEFAULT_THEME, userThemes, userThemeInfo, saveUserTheme, deleteUserTheme }
