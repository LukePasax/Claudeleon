// L'aggiornamento dal repo sul PC. L'app installata sa da quale clone è nata e a quale commit (skinsRepo, skinsCommit
// nel suo package.json, scritti da scripts/dist.js); quella lanciata dal repo lo trova da sé. Controllare: git fetch,
// poi quante novità ha il branch remoto e se il repo è più avanti dell'app installata. Aggiornare: git pull
// --ff-only, npm install se sono cambiate le dipendenze, e per l'app installata le prove (npm test) e un installer nuovo lanciato in
// silenzio (--updated /S --force-run: si installa sopra lasciando collegamenti e pulsante fissato, e riapre l'app); per quella dal repo basta riavviarsi.
const { execFile, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')

class Updater extends EventEmitter {
  constructor(app) {
    super()
    this.app = app
    this.state = { state: 'idle' }
    let meta = {}
    try { meta = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) } catch {}
    this.installed = app.isPackaged
    // L'app installata: il repo da cui è stata costruita. Quella dal repo: la cartella due livelli sopra l'app
    this.repo = this.installed ? meta.skinsRepo || null : path.resolve(app.getAppPath(), '..', '..')
    this.builtCommit = this.installed ? meta.skinsCommit || null : null
    this.appDir = this.repo ? path.join(this.repo, 'claude-skins', 'app') : null
    this.logFile = path.join(app.getPath('userData'), 'aggiornamento.log')
  }

  log(...parts) {
    try { fs.appendFileSync(this.logFile, `${new Date().toISOString()} ${parts.join(' ')}\n`) } catch {}
  }
  set(patch) {
    this.state = Object.assign({}, this.state, patch, { repo: this.repo, installed: this.installed })
    this.emit('state', this.state)
  }
  git(...args) {
    return new Promise((resolve, reject) => {
      execFile('git', ['-C', this.repo, ...args], { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 120000 }, (err, out, errOut) => {
        if (err) reject(new Error((errOut || err.message || '').trim().split('\n').pop()))
        else resolve(String(out).trim())
      })
    })
  }
  // Un comando lungo (npm), con l'uscita nel diario
  run(cmd, args, cwd) {
    return new Promise((resolve, reject) => {
      this.log('>', cmd, args.join(' '))
      const p = spawn(cmd, args, { cwd, shell: true, windowsHide: true })
      let tail = ''
      const keep = (d) => { const s = String(d); tail = (tail + s).slice(-4000); this.log(s.trimEnd()) }
      p.stdout.on('data', keep)
      p.stderr.on('data', keep)
      p.on('error', (err) => reject(err))
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(tail.trim().split('\n').slice(-3).join(' ') || `${cmd} è uscito con ${code}`))))
    })
  }

  // Ci sono novità? Le modifiche locali nel repo (escluso package-lock.json, che npm riscrive) bloccano l'aggiornamento
  async check() {
    if (!this.repo || !fs.existsSync(path.join(this.repo, '.git'))) {
      this.set({ state: 'unavailable', error: this.installed ? 'L\'app è stata installata senza sapere da quale repo: rifai l\'installer con crea-installer.cmd.' : 'La cartella dell\'app non è in un repo git.' })
      return this.state
    }
    if (this.state.state === 'updating') return this.state
    this.set({ state: 'checking', error: null })
    try {
      await this.git('fetch', '--quiet')
      const branch = await this.git('rev-parse', '--abbrev-ref', 'HEAD')
      let behind = 0
      let commits = []
      try {
        behind = Number(await this.git('rev-list', '--count', 'HEAD..@{u}')) || 0
        if (behind) commits = (await this.git('log', '--format=%s', '-n', '15', 'HEAD..@{u}')).split('\n').filter(Boolean)
      } catch {
        this.set({ state: 'error', error: `Il branch ${branch} non segue un branch remoto: aggiornalo a mano.`, checkedAt: Date.now() })
        return this.state
      }
      const head = await this.git('rev-parse', 'HEAD')
      // L'app installata è più indietro del repo (un pull fatto senza rifare l'installer)
      let local = 0
      if (this.installed && this.builtCommit && this.builtCommit !== head) {
        try { local = Number(await this.git('rev-list', '--count', `${this.builtCommit}..HEAD`)) || 0 } catch { local = 1 }
        if (local && !commits.length) commits = (await this.git('log', '--format=%s', '-n', '15', `${this.builtCommit}..HEAD`).catch(() => '')).split('\n').filter(Boolean)
      }
      const dirty = (await this.git('status', '--porcelain', '--untracked-files=no')).split('\n').filter((l) => l.trim() && !/package-lock\.json$/.test(l)).length > 0
      const count = behind + local
      this.set({ state: count ? 'available' : 'uptodate', behind, local, count, commits, branch, dirty: dirty && behind > 0, checkedAt: Date.now(), error: null })
    } catch (err) {
      this.log('controllo non riuscito:', err.message)
      this.set({ state: 'error', error: err.message, checkedAt: Date.now() })
    }
    return this.state
  }

  async update() {
    if (this.state.state === 'updating') return
    if (this.state.dirty) { this.set({ state: 'error', error: 'Nel repo ci sono modifiche non salvate: aggiorna a mano (git pull).' }); return }
    try { fs.writeFileSync(this.logFile, '') } catch {}
    try {
      const before = await this.git('rev-parse', 'HEAD')
      if (this.state.behind) {
        this.set({ state: 'updating', step: 'pull' })
        await this.git('pull', '--ff-only', '--quiet')
      }
      const after = await this.git('rev-parse', 'HEAD')
      const since = this.installed && this.builtCommit ? this.builtCommit : before
      const changed = since === after ? [] : (await this.git('diff', '--name-only', `${since}..${after}`).catch(() => '')).split('\n')
      const deps = changed.some((f) => /claude-skins\/app\/package(-lock)?\.json$/.test(f)) || !fs.existsSync(path.join(this.appDir, 'node_modules', 'electron-builder'))
      if (deps) {
        this.set({ state: 'updating', step: 'deps' })
        await this.run('npm', ['install', '--no-audit', '--no-fund'], this.appDir)
        // npm a volte riscrive package-lock.json: si rimette com'è nel repo, così il prossimo pull non si blocca
        await this.git('checkout', '--', 'claude-skins/app/package-lock.json').catch(() => {})
      }
      if (!this.installed) {
        this.set({ state: 'updating', step: 'restart' })
        this.log('riavvio dell\'app dal repo')
        this.app.relaunch()
        this.app.exit(0)
        return
      }
      // Prima di reinstallare, le prove della logica: se una fallisce l'app installata resta com'è
      this.set({ state: 'updating', step: 'test' })
      await this.run('npm', ['test'], this.appDir).catch((err) => { throw new Error(`Le prove automatiche non passano, l'aggiornamento si ferma: ${err.message}`) })
      this.set({ state: 'updating', step: 'build' })
      await this.run('npm', ['run', 'dist'], this.appDir)
      const dist = path.join(this.appDir, 'dist')
      const setup = fs.readdirSync(dist).filter((f) => /^Claude Skins Setup .*\.exe$/.test(f))
        .map((f) => ({ f, t: fs.statSync(path.join(dist, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0]
      if (!setup) throw new Error('L\'installer nuovo non c\'è nella cartella dist.')
      this.set({ state: 'updating', step: 'install' })
      this.log('installo', setup.f)
      // L'installer si stacca dall'app: si installa sopra (stessa cartella) e la riapre
      // --updated: è un aggiornamento, non un'installazione nuova (collegamenti e pulsante fissato nella barra delle
      // applicazioni restano dove sono); /S silenzioso; --force-run riapre l'app alla fine
      const child = spawn(path.join(dist, setup.f), ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true })
      child.unref()
      setTimeout(() => this.app.quit(), 800)
    } catch (err) {
      this.log('aggiornamento non riuscito:', err.message)
      this.set({ state: 'error', step: null, error: err.message })
    }
  }
}

module.exports = { Updater }
