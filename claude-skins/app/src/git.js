// Git nella cartella di una conversazione, per il pannello della finestra (come nell'app desktop): il branch, i file
// modificati con le differenze, cambiare o creare un branch, commit, push e pull request (con gh se c'è, altrimenti
// la pagina di confronto del sito nel browser). Tutto passa dal comando git del sistema; niente qui chiede nulla da
// terminale (GIT_TERMINAL_PROMPT=0: le credenziali le chiede Git Credential Manager con la sua finestra, se serve)
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const MAX_DIFF = 2 * 1024 * 1024

function run(cmd, args, cwd, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      cwd, timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' }),
    }, (err, stdout, stderr) => {
      const out = String(stdout || '')
      const errText = String(stderr || '').trim() || (err ? err.message : '')
      resolve({ ok: !err, out, err: errText, code: err ? err.code : 0, missing: !!err && err.code === 'ENOENT' })
    })
  })
}
const git = (args, cwd, timeout) => run('git', args, cwd, timeout)

// Il messaggio di un errore di git, senza le righe di contorno ("hint: ...")
function clean(err) {
  const lines = String(err || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^hint:/i.test(l))
  return lines.slice(0, 6).join('\n') || 'git non ha funzionato'
}

async function rootOf(cwd) {
  if (!cwd || !fs.existsSync(cwd)) return null
  const r = await git(['rev-parse', '--show-toplevel'], cwd)
  return r.ok ? path.normalize(r.out.trim()) : null
}

// "## main...origin/main [ahead 1, behind 2]", "## No commits yet on main", "## HEAD (no branch)"
function parseHead(line) {
  const h = { branch: '', upstream: '', ahead: 0, behind: 0, detached: false, noCommits: false }
  let s = line.replace(/^## /, '')
  const m = s.match(/^(?:No commits yet on|Initial commit on) (.+)$/)
  if (m) { h.branch = m[1]; h.noCommits = true; return h }
  if (/^HEAD \(no branch\)/.test(s)) { h.detached = true; return h }
  const ab = s.match(/ \[(.*)\]$/)
  if (ab) {
    s = s.slice(0, ab.index)
    const a = ab[1].match(/ahead (\d+)/)
    const b = ab[1].match(/behind (\d+)/)
    if (a) h.ahead = Number(a[1])
    if (b) h.behind = Number(b[1])
  }
  const dots = s.indexOf('...')
  if (dots >= 0) { h.branch = s.slice(0, dots); h.upstream = s.slice(dots + 3) } else h.branch = s
  return h
}

// git status --porcelain=v1 -z: "XY percorso\0"; la prima voce è la testata col branch
function parseStatus(out) {
  const parts = out.split('\0').filter(Boolean)
  let head = parseHead('')
  const files = []
  for (const p of parts) {
    if (p.startsWith('## ')) { head = parseHead(p); continue }
    const x = p[0]
    const y = p[1]
    const file = p.slice(3)
    const status = x === '?' ? '?' : (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) ? 'U'
      : (x === 'D' || y === 'D') ? 'D' : x === 'A' ? 'A' : 'M'
    files.push({ path: file, x, y, status, staged: x !== ' ' && x !== '?', added: 0, removed: 0, binary: false })
  }
  return { head, files }
}

// git diff --numstat -z: "aggiunte\ttolte\tpercorso\0" ("-\t-" per i binari)
function parseNumstat(out) {
  const map = new Map()
  for (const rec of out.split('\0')) {
    const m = rec.match(/^(-|\d+)\t(-|\d+)\t(.+)$/)
    if (m) map.set(m[3], { added: m[1] === '-' ? 0 : Number(m[1]), removed: m[2] === '-' ? 0 : Number(m[2]), binary: m[1] === '-' })
  }
  return map
}

const isBinary = (buf) => buf.subarray(0, 8000).includes(0)

// Il sito del remoto: https://github.com/autore/progetto da git@github.com:autore/progetto.git e simili
function webOf(url) {
  const u = String(url || '').trim()
  let m = u.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?\/?$/)
  if (!m) m = u.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/)
  if (!m) return ''
  return `https://${m[1]}/${m[2]}`
}

// La pagina per aprire una pull request (o merge request) da branch verso base, per i siti noti
function compareUrl(web, base, branch) {
  if (!web || !branch) return ''
  // Le barre dei nomi dei branch (feature/x) restano barre: i siti non le leggono codificate
  const enc = (x) => encodeURIComponent(x).replace(/%2F/g, '/')
  const b = enc(base || '')
  const h = enc(branch)
  if (/\/\/github\.com\//.test(web)) return `${web}/compare/${base ? `${b}...` : ''}${h}?expand=1`
  if (/\/\/gitlab\./.test(web)) return `${web}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${h}${base ? `&merge_request%5Btarget_branch%5D=${b}` : ''}`
  if (/\/\/bitbucket\.org\//.test(web)) return `${web}/pull-requests/new?source=${h}${base ? `&dest=${b}` : ''}`
  return ''
}

let ghKnown = null
async function hasGh() {
  if (ghKnown === null) ghKnown = (await run('gh', ['--version'], process.cwd(), 10000)).ok
  return ghKnown
}

// Lo stato della cartella: { repo: false } se non è un repo
async function status(cwd) {
  const root = await rootOf(cwd)
  if (!root) return { repo: false, cwd }
  const st = await git(['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all', '--no-renames'], root)
  if (!st.ok) return { repo: true, root, error: clean(st.err), files: [], branch: '' }
  const { head, files } = parseStatus(st.out)
  // Le righe aggiunte e tolte rispetto all'ultimo commit (all'albero vuoto se non ce n'è ancora uno)
  const ns = await git(['diff', '--numstat', '-z', '--no-renames', head.noCommits ? EMPTY_TREE : 'HEAD'], root)
  const counts = ns.ok ? parseNumstat(ns.out) : new Map()
  for (const f of files) {
    const n = counts.get(f.path)
    if (n) Object.assign(f, n)
    else if (f.status === '?') {
      // I file nuovi non sono nel diff: si contano le righe
      try {
        const p = path.join(root, f.path)
        const size = fs.statSync(p).size
        if (size <= MAX_DIFF) {
          const buf = fs.readFileSync(p)
          if (isBinary(buf)) f.binary = true
          else { const s = buf.toString('utf8'); f.added = s ? s.split('\n').length - (s.endsWith('\n') ? 1 : 0) : 0 }
        }
      } catch {}
    }
  }
  const [remoteR, baseR, lastR] = await Promise.all([
    git(['remote', 'get-url', 'origin'], root),
    git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], root),
    head.noCommits ? Promise.resolve({ ok: false }) : git(['log', '-1', '--format=%h%x00%s'], root),
  ])
  const remote = remoteR.ok ? remoteR.out.trim() : ''
  let base = baseR.ok ? baseR.out.trim().replace(/^origin\//, '') : ''
  if (!base) {
    for (const b of ['main', 'master']) if ((await git(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], root)).ok) { base = b; break }
  }
  const [hash, subject] = lastR.ok ? lastR.out.trim().split('\0') : ['', '']
  const totals = files.reduce((t, f) => ({ files: t.files + 1, added: t.added + f.added, removed: t.removed + f.removed }), { files: 0, added: 0, removed: 0 })
  const web = webOf(remote)
  return {
    repo: true, root, ...head, files, totals, remote, web, base, last: hash ? { hash, subject } : null,
    compare: head.branch && base && head.branch !== base ? compareUrl(web, base, head.branch) : '',
    gh: await hasGh(),
  }
}

// Le differenze di un file rispetto all'ultimo commit, nel formato del pannello dei file toccati ({ file, hunks })
async function diff(cwd, file) {
  const root = await rootOf(cwd)
  if (!root) return null
  const rel = String(file || '').replace(/\\/g, '/')
  const abs = path.join(root, rel)
  if (path.relative(root, abs).startsWith('..')) return null
  const shown = rel
  const before = await new Promise((resolve) => {
    execFile('git', ['show', `HEAD:${rel}`], { cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, out) => resolve(err ? null : out))
  })
  let after = null
  try { if (fs.statSync(abs).isFile()) after = fs.readFileSync(abs) } catch {}
  if (before == null && after == null) return { file: shown, hunks: [] }
  if ((before && before.length > MAX_DIFF) || (after && after.length > MAX_DIFF)) return { file: shown, tooBig: true, hunks: [] }
  if ((before && isBinary(before)) || (after && isBinary(after))) return { file: shown, binary: true, hunks: [] }
  return {
    file: shown,
    created: before == null,
    deleted: after == null,
    hunks: [{ before: before ? before.toString('utf8') : '', after: after ? after.toString('utf8') : '', line: 1 }],
  }
}

// I branch locali, i più recenti prima
async function branches(cwd) {
  const root = await rootOf(cwd)
  if (!root) return []
  const r = await git(['branch', '--format=%(refname:short)', '--sort=-committerdate'], root)
  return r.ok ? r.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : []
}

async function checkout(cwd, name, create) {
  const root = await rootOf(cwd)
  if (!root) return { ok: false, error: 'Non è un repo git' }
  name = String(name || '').trim()
  const valid = await git(['check-ref-format', '--branch', name], root)
  if (!name || !valid.ok) return { ok: false, error: `«${name}» non va bene come nome di un branch` }
  const r = await git(create ? ['checkout', '-b', name] : ['checkout', name], root)
  return r.ok ? { ok: true } : { ok: false, error: clean(r.err) }
}

// Commit di tutte le modifiche (come l'app desktop: anche i file nuovi), e a scelta il push
async function commit(cwd, message, andPush) {
  const root = await rootOf(cwd)
  if (!root) return { ok: false, error: 'Non è un repo git' }
  message = String(message || '').trim()
  if (!message) return { ok: false, error: 'Serve un messaggio per il commit' }
  const add = await git(['add', '-A'], root)
  if (!add.ok) return { ok: false, error: clean(add.err) }
  const c = await git(['commit', '-m', message], root, 120000)
  if (!c.ok) return { ok: false, error: clean(c.err || c.out) }
  if (andPush) return push(cwd)
  return { ok: true }
}

// Il push del branch; la prima volta lo collega a origin
async function push(cwd) {
  const root = await rootOf(cwd)
  if (!root) return { ok: false, error: 'Non è un repo git' }
  const up = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], root)
  if (!up.ok && !(await git(['remote', 'get-url', 'origin'], root)).ok) return { ok: false, error: 'Questo repo non ha un remoto (origin) dove fare il push' }
  const r = await git(up.ok ? ['push'] : ['push', '-u', 'origin', 'HEAD'], root, 180000)
  return r.ok ? { ok: true } : { ok: false, error: clean(r.err) }
}

// La pull request del branch, se c'è già (con gh)
async function prInfo(cwd) {
  const root = await rootOf(cwd)
  if (!root || !(await hasGh())) return null
  const r = await run('gh', ['pr', 'view', '--json', 'number,url,state,title,isDraft'], root, 20000)
  if (!r.ok) return null
  try { return JSON.parse(r.out) } catch { return null }
}

// Una pull request nuova verso base: push e poi gh pr create (titolo e descrizione dai commit). Senza gh, o se gh non
// ce la fa, resta l'indirizzo della pagina di confronto da aprire nel browser
async function createPr(cwd, opts = {}) {
  const st = await status(cwd)
  if (!st.repo) return { ok: false, error: 'Non è un repo git' }
  if (!st.branch || st.detached) return { ok: false, error: 'Serve un branch per la pull request' }
  if (st.base && st.branch === st.base) return { ok: false, error: `Sei su ${st.base}: crea prima un branch per la pull request` }
  const p = await push(cwd)
  if (!p.ok) return Object.assign(p, { compare: st.compare })
  if (!st.gh) return { ok: false, compare: st.compare, noGh: true }
  const args = ['pr', 'create', '--head', st.branch]
  if (st.base) args.push('--base', st.base)
  if (opts.title) args.push('--title', String(opts.title), '--body', String(opts.body || ''))
  else args.push('--fill')
  if (opts.draft) args.push('--draft')
  const r = await run('gh', args, st.root, 120000)
  if (!r.ok) return { ok: false, error: clean(r.err), compare: st.compare }
  const url = (r.out.match(/https?:\/\/\S+/) || [''])[0]
  return { ok: true, url }
}

module.exports = { status, diff, branches, checkout, commit, push, prInfo, createPr, _internals: { parseHead, parseStatus, parseNumstat, webOf, compareUrl, clean } }
