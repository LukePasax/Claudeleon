// I temi dal lato del processo principale: quali ci sono (le cartelle di renderer/themes con un theme.js) e, di
// ciascuno, il nome per il menu e la "personalità" da aggiungere al prompt di sistema di Claude Code. Il resto del
// tema (colori, scritte, disegni) lo usa solo la pagina.
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
      if (t && t.id === dir) themes.push({ id: t.id, name: t.name || t.id, persona: t.persona || '' })
      else console.warn(`Tema ${dir}: l'id in theme.js deve essere uguale al nome della cartella`)
    } catch (err) {
      console.warn(`Tema ${dir} non leggibile: ${err.message}`)
    }
  }
  // Il tema predefinito in cima, gli altri in ordine di nome
  return themes.sort((a, b) => (a.id === DEFAULT_THEME ? -1 : b.id === DEFAULT_THEME ? 1 : a.name.localeCompare(b.name)))
}

module.exports = { listThemes, DEFAULT_THEME }
