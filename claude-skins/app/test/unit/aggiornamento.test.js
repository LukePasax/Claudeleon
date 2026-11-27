// L'aggiornamento dal repo sul PC, con repo git veri creati al volo: un "remoto", il clone del PC, un altro clone
// che pubblica le novità
const { test } = require('node:test')
const assert = require('node:assert/strict')
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
