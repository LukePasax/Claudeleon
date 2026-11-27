// Crea l'installer (npm run dist). Scrive nell'app impacchettata la cartella del repo da cui nasce e il suo commit
// (extraMetadata: skinsRepo, skinsCommit): l'app installata li usa per controllare gli aggiornamenti e per rifarsi da
// sola. Senza argomenti l'installer NSIS per Windows; con argomenti, quelli (per esempio --linux dir per le prove)
const { execFileSync, spawnSync } = require('child_process')
const path = require('path')

const appDir = path.join(__dirname, '..')
const git = (...a) => execFileSync('git', a, { cwd: appDir, encoding: 'utf8', windowsHide: true }).trim()
let repo = ''
let commit = ''
try {
  repo = git('rev-parse', '--show-toplevel')
  commit = git('rev-parse', 'HEAD')
} catch {
  console.log('Non è un repo git: l\'app installata non potrà aggiornarsi da sola.')
}
const target = process.argv.slice(2).length ? process.argv.slice(2) : ['--win', 'nsis']
const args = ['electron-builder', ...target]
if (repo) args.push(`"-c.extraMetadata.skinsRepo=${repo}"`, `"-c.extraMetadata.skinsCommit=${commit}"`)
const r = spawnSync('npx', args, { cwd: appDir, stdio: 'inherit', shell: true })
process.exit(r.status == null ? 1 : r.status)
