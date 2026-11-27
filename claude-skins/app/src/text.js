// Piccoli aiuti sul testo, usati dal processo principale (e dalle prove)

// Il testo di una risposta in poche parole: senza markdown né blocchi di codice
function plainSnippet(text) {
  const s = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+\s]+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > 180 ? `${s.slice(0, 179)}…` : s
}

module.exports = { plainSnippet }
