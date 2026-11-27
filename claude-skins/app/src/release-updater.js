// L'aggiornamento dalle release di GitHub, per chi ha installato Claudeleon dall'installer della release (i colleghi,
// chiunque): electron-updater legge latest.yml dell'ultima release, confronta la versione, scarica l'installer
// (controllando sha512) e lo lancia in silenzio (--updated /S --force-run, come l'aggiornamento dal repo: collegamenti
// e pulsante fissato restano). Stessa forma di updater.js per la finestra: state, check(), update(), evento 'state'.
// Lo stato: { state: idle | checking | uptodate | available | updating | error | unavailable, version, notes,
// commits (le righe delle note), step (download, install), percent, source: 'github' }
const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')

// Le note di una release in righe semplici (GitHub le dà in HTML o in markdown)
function noteLines(notes) {
  const text = Array.isArray(notes) ? notes.map((n) => n && n.note).join('\n') : String(notes || '')
  return text
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n')
    .map((l) => l.replace(/^\s*(#+|[-*]|\d+\.)\s*/, '').replace(/\*\*|__|`/g, '').trim())
    .filter((l) => l && !/^(what's changed|full changelog|novità)(\s|:|$)/i.test(l))
    .slice(0, 15)
}

class ReleaseUpdater extends EventEmitter {
  constructor(app, autoUpdater) {
    super()
    this.app = app
    this.state = { state: 'idle', source: 'github' }
    this.logFile = path.join(app.getPath('userData'), 'aggiornamento.log')
    this.au = autoUpdater || require('electron-updater').autoUpdater
    const au = this.au
    // Si scarica solo quando la persona dice "Aggiorna"; e non da solo all'uscita
    au.autoDownload = false
    au.autoInstallOnAppQuit = false
    au.allowPrerelease = false
    au.logger = { info: (m) => this.log(m), warn: (m) => this.log('attenzione:', m), error: (m) => this.log('errore:', m), debug: () => {} }
    au.on('checking-for-update', () => this.set({ state: 'checking', error: null }))
    au.on('update-not-available', () => this.set({ state: 'uptodate', checkedAt: Date.now(), error: null }))
    au.on('update-available', (info) => this.set({
      state: 'available', version: info.version, count: 1, notes: info.releaseNotes || '', commits: noteLines(info.releaseNotes),
      checkedAt: Date.now(), error: null,
    }))
    au.on('download-progress', (p) => this.set({ state: 'updating', step: 'download', percent: Math.round(p.percent || 0) }))
    au.on('update-downloaded', () => {
      this.set({ state: 'updating', step: 'install' })
      this.log('installo', this.state.version)
      // In silenzio e riaprendo l'app alla fine
      setTimeout(() => au.quitAndInstall(true, true), 800)
    })
    au.on('error', (err) => {
      this.log('errore:', err && (err.stack || err.message))
      this.set({ state: 'error', step: null, error: friendly(err), checkedAt: Date.now() })
    })
  }

  log(...parts) {
    try { fs.appendFileSync(this.logFile, `${new Date().toISOString()} ${parts.join(' ')}\n`) } catch {}
  }
  set(patch) {
    this.state = Object.assign({}, this.state, patch, { source: 'github', installed: true })
    this.emit('state', this.state)
  }

  async check() {
    if (!this.app.isPackaged) { this.set({ state: 'unavailable', error: 'Gli aggiornamenti dalle release valgono per l\'app installata.' }); return this.state }
    if (this.state.state === 'updating') return this.state
    try { await this.au.checkForUpdates() } catch (err) { this.set({ state: 'error', error: friendly(err), checkedAt: Date.now() }) }
    return this.state
  }

  async update() {
    if (this.state.state !== 'available') return
    try { fs.writeFileSync(this.logFile, '') } catch {}
    this.set({ state: 'updating', step: 'download', percent: 0 })
    try { await this.au.downloadUpdate() } catch (err) { this.set({ state: 'error', step: null, error: friendly(err) }) }
  }
}

// Gli errori più comuni detti in breve
function friendly(err) {
  const m = String((err && err.message) || err || '')
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR_/i.test(m)) return 'Nessuna connessione con GitHub.'
  if (/404|latest\.yml|Cannot find/i.test(m)) return 'Nessuna release trovata su GitHub (il repo è pubblico? c\'è almeno una release?).'
  if (/app-update\.yml/i.test(m)) return 'Questa installazione non sa dove cercare gli aggiornamenti: reinstalla dall\'ultima release.'
  if (/sha512|checksum/i.test(m)) return 'Il file scaricato non corrisponde: riprova più tardi.'
  return m.split('\n')[0].slice(0, 200) || 'Errore sconosciuto'
}

module.exports = { ReleaseUpdater, noteLines, friendly }
