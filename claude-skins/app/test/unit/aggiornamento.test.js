// L'aggiornamento dal repo sul PC, con repo git veri creati al volo: un "remoto", il clone del PC, un altro clone
// che pubblica le novità
const { test } = require('node:test')
const assert = require('node:assert/strict')
// Queste prove controllano i messaggi in italiano
require('../../src/i18n').setLanguage('it')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { Updater } = require('../../src/updater')

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
const who = ['-c', 'user.email=prova@prova', '-c', 'user.name=prova']

function repos() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-agg-'))
  git(d, 'init', '-q', '--bare', '-b', 'main', 'remoto.git')
  git(d, 'clone', '-q', 'remoto.git', 'pc')
  const pc = path.join(d, 'pc')
  fs.mkdirSync(path.join(pc, 'claude-skins', 'app'), { recursive: true })
  fs.writeFileSync(path.join(pc, 'claude-skins', 'app', 'package.json'), '{}')
  fs.writeFileSync(path.join(pc, 'README.md'), 'ciao\n')
  git(pc, 'add', '.')
  git(pc, ...who, 'commit', '-q', '-m', 'Inizio')
  git(pc, 'push', '-q', 'origin', 'HEAD:main')
  git(pc, 'branch', '-q', '--set-upstream-to=origin/main')
  git(d, 'clone', '-q', 'remoto.git', 'altro')
  const publish = (msg) => {
    const altro = path.join(d, 'altro')
    git(altro, 'pull', '-q')
    git(altro, ...who, 'commit', '-q', '--allow-empty', '-m', msg)
    git(altro, 'push', '-q')
  }
  return { d, pc, publish }
}
const fakeApp = (over) => Object.assign({ isPackaged: false, getAppPath: () => '', getPath: () => os.tmpdir(), relaunch() { this.relaunched = true }, exit() { this.exited = true }, quit() {} }, over)

test('dal repo: trova le novità, fa il pull e si riavvia', async () => {
  const r = repos()
  r.publish('Novità uno')
  // node_modules/electron-builder finto, così non parte npm install
  fs.mkdirSync(path.join(r.pc, 'claude-skins', 'app', 'node_modules', 'electron-builder'), { recursive: true })
  const app = fakeApp({ getAppPath: () => path.join(r.pc, 'claude-skins', 'app'), getPath: () => r.d })
  const u = new Updater(app)
  const s = await u.check()
  assert.equal(s.state, 'available')
  assert.equal(s.count, 1)
  assert.deepEqual(s.commits, ['Novità uno'])
  await u.update()
  assert.equal(git(r.pc, 'log', '-1', '--format=%s'), 'Novità uno')
  assert.ok(app.relaunched && app.exited)
  // Nell'app vera qui il processo è già finito; per controllare di nuovo si riparte da capo
  u.set({ state: 'idle' })
  assert.equal((await u.check()).state, 'uptodate')
})

test('installata: il repo più avanti dell\'app conta come novità; con modifiche locali non aggiorna', async () => {
  const r = repos()
  const built = git(r.pc, 'rev-parse', 'HEAD')
  git(r.pc, ...who, 'commit', '-q', '--allow-empty', '-m', 'Già scaricato')
  r.publish('Da scaricare')
  const inst = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-inst-'))
  fs.writeFileSync(path.join(inst, 'package.json'), JSON.stringify({ skinsRepo: r.pc, skinsCommit: built }))
  fs.appendFileSync(path.join(r.pc, 'README.md'), 'modifica\n')
  const u = new Updater(fakeApp({ isPackaged: true, getAppPath: () => inst, getPath: () => r.d }))
  const s = await u.check()
  assert.equal(s.state, 'available')
  assert.equal(s.behind, 1)
  assert.equal(s.local, 1)
  assert.equal(s.dirty, true)
  await u.update()
  assert.equal(u.state.state, 'error')
})

test('installata senza sapere da quale repo: lo dice', async () => {
  const inst = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-inst-'))
  fs.writeFileSync(path.join(inst, 'package.json'), '{}')
  const u = new Updater(fakeApp({ isPackaged: true, getAppPath: () => inst }))
  assert.equal((await u.check()).state, 'unavailable')
})

// ------------------------------------------------------------------ dalle release di GitHub

const { EventEmitter } = require('events')
const { ReleaseUpdater, noteLines, friendly } = require('../../src/release-updater')

// Un electron-updater finto: si decide noi cosa trova e cosa scarica
function fakeAutoUpdater(found) {
  const au = new EventEmitter()
  au.installed = null
  au.checkForUpdates = async () => {
    au.emit('checking-for-update')
    if (found instanceof Error) { au.emit('error', found); return null }
    if (found) au.emit('update-available', found)
    else au.emit('update-not-available', {})
    return {}
  }
  au.downloadUpdate = async () => { au.emit('download-progress', { percent: 42.4 }); au.emit('update-downloaded', {}) }
  au.quitAndInstall = (silent, run) => { au.installed = { silent, run } }
  return au
}
const packagedApp = (d) => ({ isPackaged: true, getPath: () => d })

test('release: le note in righe semplici, gli errori in breve', () => {
  assert.deepEqual(noteLines('<h2>What\'s Changed</h2><ul><li>Temi in file <code>.skin</code> by @luca</li><li>Essenziale</li></ul><p><strong>Full Changelog</strong>: v1...v2</p>'),
    ['Temi in file .skin by @luca', 'Essenziale'])
  assert.deepEqual(noteLines('## Novità\n- **Editor** dei temi\n- `/memory`\n'), ['Editor dei temi', '/memory'])
  assert.match(friendly(new Error('HttpError: 404 Not Found latest.yml')), /Nessuna release/)
  assert.match(friendly(new Error('net::ERR_INTERNET_DISCONNECTED')), /connessione/)
})

test('release: controllo, novità, scarico e installazione in silenzio', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-rel-'))
  const au = fakeAutoUpdater({ version: '1.2.0', releaseNotes: '- Anteprima\n- Dettatura' })
  const u = new ReleaseUpdater(packagedApp(d), au)
  assert.equal(au.autoDownload, false)
  const states = []
  u.on('state', (s) => states.push(s.state + (s.step ? `:${s.step}` : '')))
  const s = await u.check()
  assert.equal(s.state, 'available')
  assert.equal(s.version, '1.2.0')
  assert.equal(s.source, 'github')
  assert.deepEqual(s.commits, ['Anteprima', 'Dettatura'])
  await u.update()
  assert.equal(u.state.percent, 42)
  await new Promise((r) => setTimeout(r, 900))
  assert.deepEqual(au.installed, { silent: true, run: true })
  assert.deepEqual(states, ['checking', 'available', 'updating:download', 'updating:download', 'updating:install'])
})

test('release: niente di nuovo, errori, app non installata', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-rel-'))
  assert.equal((await new ReleaseUpdater(packagedApp(d), fakeAutoUpdater(null)).check()).state, 'uptodate')
  const err = await new ReleaseUpdater(packagedApp(d), fakeAutoUpdater(new Error('getaddrinfo ENOTFOUND github.com'))).check()
  assert.deepEqual([err.state, err.error], ['error', 'Nessuna connessione con GitHub.'])
  const dev = await new ReleaseUpdater({ isPackaged: false, getPath: () => d }, fakeAutoUpdater(null)).check()
  assert.equal(dev.state, 'unavailable')
})
