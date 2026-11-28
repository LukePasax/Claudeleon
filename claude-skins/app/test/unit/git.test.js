// Git nella cartella della conversazione: stato, differenze, branch, commit e push su un repo vero (con un remoto
// "nudo" in una cartella accanto), più le parti che leggono l'uscita di git
const { test } = require('node:test')
const assert = require('node:assert/strict')
// Queste prove controllano i messaggi in italiano
require('../../src/i18n').setLanguage('it')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const gitOps = require('../../src/git')
const { parseHead, webOf, compareUrl } = gitOps._internals

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
function tempRepo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-git-'))
  const repo = path.join(d, 'repo')
  const remote = path.join(d, 'remoto.git')
  fs.mkdirSync(repo)
  sh(d, 'init', '-q', '--bare', '-b', 'main', remote)
  sh(repo, 'init', '-q', '-b', 'main')
  sh(repo, 'config', 'user.name', 'Prova')
  sh(repo, 'config', 'user.email', 'prova@example.com')
  sh(repo, 'config', 'commit.gpgsign', 'false')
  sh(repo, 'remote', 'add', 'origin', remote)
  return { repo, remote }
}

test('git: la testata di git status', () => {
  assert.deepEqual(parseHead('## main...origin/main [ahead 2, behind 1]'), { branch: 'main', upstream: 'origin/main', ahead: 2, behind: 1, detached: false, noCommits: false })
  assert.equal(parseHead('## No commits yet on main').noCommits, true)
  assert.equal(parseHead('## HEAD (no branch)').detached, true)
  assert.deepEqual(parseHead('## fiumi'), { branch: 'fiumi', upstream: '', ahead: 0, behind: 0, detached: false, noCommits: false })
})

test('git: dal remoto al sito e alla pagina della pull request', () => {
  assert.equal(webOf('git@github.com:someone/MapEditor.git'), 'https://github.com/someone/MapEditor')
  assert.equal(webOf('https://token@github.com/someone/MapEditor.git'), 'https://github.com/someone/MapEditor')
  assert.equal(webOf('/una/cartella'), '')
  assert.equal(compareUrl('https://github.com/someone/MapEditor', 'main', 'feature/fiumi'), 'https://github.com/someone/MapEditor/compare/main...feature/fiumi?expand=1')
  assert.match(compareUrl('https://gitlab.com/someone/x', 'main', 'b'), /merge_requests\/new/)
  assert.equal(compareUrl('https://example.com/x', 'main', 'b'), '')
})

test('git: una cartella che non è un repo', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-nogit-'))
  assert.deepEqual(await gitOps.status(d), { repo: false, cwd: d })
})

test('git: stato, differenze, branch, commit e push', async () => {
  const { repo, remote } = tempRepo()
  fs.writeFileSync(path.join(repo, 'a.txt'), 'uno\ndue\n')
  let st = await gitOps.status(repo)
  assert.equal(st.noCommits, true)
  assert.deepEqual(st.files.map((f) => [f.path, f.status, f.added]), [['a.txt', '?', 2]])

  assert.deepEqual(await gitOps.commit(repo, ''), { ok: false, error: 'Serve un messaggio per il commit' })
  assert.deepEqual(await gitOps.commit(repo, 'Primo'), { ok: true })
  assert.deepEqual(await gitOps.push(repo), { ok: true })
  st = await gitOps.status(repo)
  assert.equal(st.upstream, 'origin/main')
  assert.equal(st.last.subject, 'Primo')
  assert.equal(st.base, 'main')

  // Una modifica, un file nuovo in una sottocartella, uno binario; lo stato si legge anche da una sottocartella
  fs.writeFileSync(path.join(repo, 'a.txt'), 'uno\nDUE\ntre\n')
  fs.mkdirSync(path.join(repo, 'src'))
  fs.writeFileSync(path.join(repo, 'src', 'b.js'), 'x\n')
  fs.writeFileSync(path.join(repo, 'img.bin'), Buffer.from([0, 1, 2, 3]))
  st = await gitOps.status(path.join(repo, 'src'))
  assert.deepEqual(st.files.map((f) => [f.path, f.status, f.added, f.removed, f.binary]), [['a.txt', 'M', 2, 1, false], ['img.bin', '?', 0, 0, true], ['src/b.js', '?', 1, 0, false]])
  assert.deepEqual(st.totals, { files: 3, added: 3, removed: 1 })
  const d = await gitOps.diff(repo, 'a.txt')
  assert.deepEqual(d.hunks, [{ before: 'uno\ndue\n', after: 'uno\nDUE\ntre\n', line: 1 }])
  assert.equal((await gitOps.diff(repo, 'src/b.js')).created, true)
  assert.equal((await gitOps.diff(repo, 'img.bin')).binary, true)
  assert.equal(await gitOps.diff(repo, '../fuori.txt'), null)

  // Un branch nuovo, il commit e il push (la prima volta lo collega a origin)
  assert.equal((await gitOps.checkout(repo, 'nome sbagliato', true)).ok, false)
  assert.deepEqual(await gitOps.checkout(repo, 'feature/fiumi', true), { ok: true })
  assert.deepEqual(await gitOps.commit(repo, 'I fiumi', true), { ok: true })
  st = await gitOps.status(repo)
  assert.equal(st.branch, 'feature/fiumi')
  assert.equal(st.upstream, 'origin/feature/fiumi')
  assert.equal(st.files.length, 0)
  assert.equal(sh(remote, 'log', '-1', '--format=%s', 'feature/fiumi').trim(), 'I fiumi')
  assert.deepEqual((await gitOps.branches(repo)).sort(), ['feature/fiumi', 'main'])
  assert.deepEqual(await gitOps.checkout(repo, 'main', false), { ok: true })
  assert.equal(fs.existsSync(path.join(repo, 'src', 'b.js')), false)

  // Sul branch principale niente pull request
  assert.match((await gitOps.createPr(repo)).error, /crea prima un branch/)
})

test('worktree: il nome dalle prime parole del messaggio', () => {
  const { slug } = gitOps._internals
  assert.match(slug('Aggiungi i fiumi prima delle strade, però'), /^aggiungi-fiumi-prima-delle-[0-9a-f]{1,4}$/)
  assert.match(slug('Perché è così? Città'), /^perche-cosi-citta-[0-9a-f]{1,4}$/)
  assert.match(slug(''), /^sessione-[0-9a-f]{1,4}$/)
  assert.match(slug('<diff_comments>\nxx\n</diff_comments>'), /^sessione-/)
})

test('worktree: copia separata, unione nella cartella principale, eliminazione', async () => {
  const { repo } = tempRepo()
  fs.writeFileSync(path.join(repo, 'a.txt'), 'uno\n')
  await gitOps.commit(repo, 'Primo')
  const wt = await gitOps.createWorktree(repo, 'Aggiungi i fiumi')
  assert.equal(wt.ok, true)
  assert.match(wt.branch, /^claude\/aggiungi-fiumi-/)
  assert.equal(wt.base, 'main')
  assert.ok(fs.existsSync(path.join(wt.path, 'a.txt')))
  // La copia non compare fra le modifiche del repo principale
  assert.deepEqual((await gitOps.status(repo)).files, [])
  assert.equal((await gitOps.status(repo)).worktree, null)
  let st = await gitOps.status(wt.path)
  assert.equal(st.worktree.base, 'main')
  assert.equal(st.worktree.unmerged, 0)

  // Modifiche senza commit: niente unione, ed eliminare chiede conferma
  fs.writeFileSync(path.join(wt.path, 'b.txt'), 'due\n')
  assert.match((await gitOps.mergeWorktree(wt.path)).error, /fai prima il commit/)
  assert.deepEqual(await gitOps.removeWorktree(wt.path), { ok: false, needsForce: true, dirty: true, unmerged: 0 })
  await gitOps.commit(wt.path, 'Secondo')
  st = await gitOps.status(wt.path)
  assert.equal(st.worktree.unmerged, 1)
  assert.deepEqual(await gitOps.mergeWorktree(wt.path), { ok: true })
  assert.equal(fs.readFileSync(path.join(repo, 'b.txt'), 'utf8'), 'due\n')
  assert.equal((await gitOps.status(wt.path)).worktree.unmerged, 0)
  // Unito: si toglie senza chiedere, e il branch se ne va
  const rm = await gitOps.removeWorktree(wt.path)
  assert.equal(rm.ok, true)
  assert.equal(rm.branchKept, '')
  assert.equal(fs.existsSync(wt.path), false)
  assert.deepEqual(await gitOps.branches(repo), ['main'])

  // Una copia con un commit non unito, eliminata con force: il branch resta
  const wt2 = await gitOps.createWorktree(repo, 'Altro')
  fs.writeFileSync(path.join(wt2.path, 'c.txt'), 'tre\n')
  await gitOps.commit(wt2.path, 'Terzo')
  const rm2 = await gitOps.removeWorktree(wt2.path, true)
  assert.equal(rm2.ok, true)
  assert.equal(rm2.branchKept, wt2.branch)
})
