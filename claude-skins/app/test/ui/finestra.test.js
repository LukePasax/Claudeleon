// Le prove della finestra, per ogni tema: la pagina vera con l'API finta veloce, dentro Electron, guidata da
// playwright-core. Controllano che le funzioni principali facciano quello che devono e che non ci siano errori
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { _electron } = require('playwright-core')

const TEMI = ['essenziale']
const INDEX = path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html')

let app = null
let page = null
let errors = []

before(async () => {
  app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.join(__dirname, 'finestra-di-prova.js'), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(e.message))
})
after(async () => { if (app) await app.close() })

// Una pagina pulita col tema dato
// Le prove leggono le scritte italiane; quella della lingua apre anche in inglese
async function open(tema, lingua = 'it', extra = '') {
  errors = []
  const url = require('url').pathToFileURL(INDEX).href + `?tema=${tema}&scena=giorno&veloce=1&lingua=${lingua}${extra}`
  await page.goto(url)
  await page.waitForSelector('[data-part="input"]')
  await page.waitForTimeout(150)
}
async function send(text) {
  await page.fill('[data-part="input"]', text)
  await page.keyboard.press('Enter')
}
const done = () => page.waitForFunction(() => !document.body.classList.contains('busy'), null, { timeout: 8000 })
const convo = (sel) => page.$$eval(`.convo:not([hidden]) ${sel}`, (els) => els.length)

for (const tema of TEMI) {
  test(`${tema}: si monta, senza errori, con i pezzi principali`, async () => {
    await open(tema)
    for (const part of ['log', 'input', 'modes', 'folder', 'model', 'context', 'files']) assert.ok(await page.$(`[data-part="${part}"]`), `manca ${part}`)
    assert.ok(await page.$('[data-action="settings"]'))
    assert.deepEqual(errors, [])
  })

  test(`${tema}: un messaggio, la risposta, la riga "sta lavorando", la risposta suggerita, i file modificati`, async () => {
    await open(tema)
    await send('Aggiungi i fiumi')
    await page.waitForSelector('.item.working')
    await done()
    assert.equal(await convo('.entry.you'), 1)
    assert.ok(await convo('.entry.claude') >= 1)
    assert.equal(await convo('.item.working'), 0)
    await page.waitForSelector('.suggestion-chip')
    assert.match(await page.textContent('.files-btn'), /1 file/)
    assert.deepEqual(errors, [])
  })

  test(`${tema}: allegati incollati e menu di / e @`, async () => {
    await open(tema)
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 40; c.height = 30
      c.getContext('2d').fillRect(0, 0, 40, 30)
      const blob = await new Promise((r) => c.toBlob(r))
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'image.png', { type: 'image/png' }))
      const input = document.querySelector('[data-part="input"]')
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await page.waitForSelector('.attachments .attachment.image')
    await page.fill('[data-part="input"]', '/comp')
    await page.dispatchEvent('[data-part="input"]', 'input')
    await page.waitForSelector('.cmd-menu .cmd')
    await page.fill('[data-part="input"]', 'Guarda @map')
    await page.dispatchEvent('[data-part="input"]', 'input')
    await page.waitForSelector('.cmd-menu.files .cmd')
    await page.keyboard.press('Tab')
    assert.match(await page.inputValue('[data-part="input"]'), /^Guarda @src\/MapView\.cpp $/)
    assert.deepEqual(errors, [])
  })

  test(`${tema}: le liste nella casella`, async () => {
    await open(tema)
    await page.click('[data-part="input"]')
    await page.keyboard.type('- uno')
    await page.keyboard.press('Shift+Enter'); await page.keyboard.type('due')
    await page.keyboard.press('Shift+Enter'); await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('1. a'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('b')
    // Su una voce vuota la lista finisce: il segno se ne va e si scrive su quella riga
    assert.equal(await page.inputValue('[data-part="input"]'), '- uno\n- due\n1. a\n2. b')
  })

  test(`${tema}: due conversazioni insieme, segni negli annali`, async () => {
    await open(tema)
    await send('Prima conversazione')
    await page.waitForSelector('.item.working')
    await page.keyboard.press('Control+n')
    await page.waitForFunction(() => document.querySelectorAll('.convo').length === 2)
    await page.waitForSelector('.session-row.running, .session-row.attention, .session-row.unread', { timeout: 8000 })
    await page.click('.session-row >> text=Prima conversazione')
    await page.waitForFunction(() => document.querySelector('.convo:not([hidden]) .entry.you'))
    assert.deepEqual(errors, [])
  })

  test(`${tema}: modificare un messaggio toglie quello che veniva dopo`, async () => {
    await open(tema)
    await send('Uno')
    await done()
    await page.hover('.convo:not([hidden]) .entry.you')
    await page.click('.convo:not([hidden]) .entry.you .edit-btn')
    await page.fill('.edit-box textarea', 'Uno, corretto')
    await page.click('.edit-send')
    await done()
    const you = await page.$$eval('.convo:not([hidden]) .entry.you .text', (els) => els.map((e) => e.textContent))
    assert.deepEqual(you, ['Uno, corretto'])
    assert.deepEqual(errors, [])
  })

  test(`${tema}: cronaca lunga, messaggi precedenti, ricerca`, async () => {
    await open(tema)
    await page.click('.session-row >> text=Backup delle note')
    await page.waitForSelector('.older-btn')
    assert.equal(await convo('.entry'), 40)
    await page.click('.older-btn')
    assert.equal(await convo('.entry'), 80)
    await page.keyboard.press('Control+f')
    await page.keyboard.type('messaggio 4')
    await page.waitForFunction(() => /di/.test(document.querySelector('.find-count').textContent))
    // Caricati i messaggi da 41 a 120: "messaggio 4" li trova da 41 a 49
    assert.match(await page.textContent('.find-count'), /^\d+ di 9$/)
    await page.keyboard.press('Escape')
    assert.equal(await page.$('.find-bar'), null)
  })

  test(`${tema}: attività in background`, async () => {
    await open(tema)
    await page.evaluate(() => anteprima.background())
    await page.waitForSelector('.tasks-btn.running')
    assert.match(await page.textContent('.tasks-btn'), /1 in background/)
    await page.click('.tasks-btn')
    await page.waitForSelector('.tasks-panel .task-row')
    assert.equal(await page.$$eval('.tasks-panel .task-row', (r) => r.length), 2)
    assert.ok(await page.$('.tasks-panel .task-row.running .btn'))
    assert.deepEqual(errors, [])
  })

  test(`${tema}: git, dal branch al commit`, async () => {
    await open(tema)
    await page.waitForSelector('.git-btn:not([hidden])')
    assert.match(await page.textContent('.git-btn'), /fiumi.*3.*↑1/s)
    await page.click('.git-btn')
    await page.waitForSelector('.git-panel .file-row')
    assert.equal(await page.$$eval('.git-panel .file-row', (r) => r.length), 3)
    await page.click('.git-panel .file-row .fr-head')
    await page.waitForSelector('.git-panel .fr-diffs .diff')
    await page.fill('.git-panel .git-msg', 'I fiumi prima delle strade')
    await page.click('.git-panel .git-btns .btn:first-child')
    await page.waitForFunction(() => !document.querySelector('.git-panel .file-row'))
    assert.match(await page.textContent('.git-btn'), /↑2/)
    // Un branch nuovo
    await page.click('.git-panel .git-branch .btn')
    await page.fill('.git-panel .git-input', 'sentieri-nuovi')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => /sentieri-nuovi/.test(document.querySelector('.git-btn').textContent))
    assert.deepEqual(errors, [])
  })

  test(`${tema}: commenti sulle righe delle differenze, mandati col messaggio`, async () => {
    await open(tema)
    await page.click('.git-btn')
    await page.click('.git-panel .file-row .fr-head')
    await page.waitForSelector('.git-panel .diff .dl.add')
    await page.hover('.git-panel .diff .dl.add')
    await page.click('.git-panel .diff .dl.add .dl-cm')
    await page.keyboard.type('Prima i laghi')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.git-panel .dl-note')
    assert.match(await page.textContent('.git-panel .review-bar'), /1 commento/)
    // Un commento tolto e uno rimesso
    await page.click('.git-panel .dl-note .btn')
    assert.equal(await page.$$eval('.git-panel .dl-note', (n) => n.length), 0)
    await page.hover('.git-panel .diff .dl.ctx')
    await page.click('.git-panel .diff .dl.ctx .dl-cm')
    await page.keyboard.type('E qui?')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    assert.equal(await page.$$eval('.attachments .attachment.review', (n) => n.length), 1)
    await send('Sistema')
    await page.waitForSelector('.convo:not([hidden]) .entry.you .sent-comments .dl-note')
    assert.match(await page.textContent('.convo:not([hidden]) .entry.you'), /src\/MapView\.cpp:1.*E qui\?.*Sistema/s)
    assert.equal(await page.$$eval('.attachments .attachment.review', (n) => n.length), 0)
    await done()
    assert.deepEqual(errors, [])
  })

  test(`${tema}: copia separata (worktree) per una conversazione nuova`, async () => {
    await open(tema)
    await page.click('.folder-btn')
    await page.click('.wt-toggle input')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.folder-btn .wt-tag.pending')
    await send('Aggiungi i fiumi')
    await page.waitForSelector('.git-btn.worktree')
    assert.match(await page.textContent('.folder-btn'), /MapEditor/)
    assert.match(await page.textContent('.convo:not([hidden])'), /copia separata.*claude\/aggiungi-fiumi/s)
    await done()
    await page.click('.git-btn')
    await page.click('.git-panel >> text=Elimina la copia')
    await page.waitForSelector('.git-panel .git-note.error >> text=Elimina comunque')
    await page.click('.git-panel >> text=Unisci in fiumi')
    await page.waitForFunction(() => /Unito in fiumi/.test(document.querySelector('.git-panel .git-note').textContent))
    assert.deepEqual(errors, [])
  })

  test(`${tema}: anteprima di un server locale`, async () => {
    await open(tema)
    const srv = require('http').createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<h1 id="t">MapEditor web</h1>') }).listen(0)
    const port = srv.address().port
    try {
      await page.evaluate((p) => anteprima.risposta(`Il server gira su http://localhost:${p}/ (Vite).`), port)
      await page.waitForSelector('.preview-btn:not([hidden])')
      assert.match(await page.textContent('.preview-btn'), new RegExp(`localhost:${port}`))
      await page.click('.preview-btn')
      await page.waitForSelector('.preview-pane:not([hidden]) .pv-frame')
      await page.waitForFunction((p) => [...document.querySelectorAll('.pv-frame')].some((f) => f.src === `http://localhost:${p}/`), port)
      const frame = await (await page.$('.pv-frame')).contentFrame()
      await frame.waitForSelector('#t')
      assert.equal(await frame.textContent('#t'), 'MapEditor web')
      assert.ok(await page.isHidden('.preview-btn'))
      // La foto va fra gli allegati; la barra dell'indirizzo accetta anche solo la porta
      await page.click('.pv-shot')
      await page.waitForSelector('.attachments .attachment.image')
      await page.fill('.pv-addr', String(port))
      await page.press('.pv-addr', 'Enter')
      assert.equal(await page.inputValue('.pv-addr'), `http://localhost:${port}`)
      // Ctrl+Maiusc+P chiude e riapre
      await page.keyboard.press('Control+Shift+P')
      assert.ok(await page.isHidden('.preview-pane'))
      await page.keyboard.press('Control+Shift+P')
      assert.ok(await page.isVisible('.preview-pane'))
      assert.deepEqual(errors, [])
    } finally { srv.close() }
  })

  test(`${tema}: regole dei permessi`, async () => {
    await open(tema)
    await page.keyboard.press('Control+,')
    await page.waitForSelector('.settings-panel')
    await page.click('.settings-panel .set-nav-item[data-page="permissions"]')
    await page.waitForSelector('.perm-panel .perm-rule')
    await page.click('.perm-tab:has-text("Questo progetto")')
    await page.fill('.perm-allow .perm-input', 'Bash(cmake --build:*)')
    await page.press('.perm-allow .perm-input', 'Enter')
    await page.waitForFunction(() => [...document.querySelectorAll('.perm-allow .perm-rule code')].some((c) => c.textContent === 'Bash(cmake --build:*)'))
    // Spostata in "Mai", poi tolta
    await page.selectOption('.perm-allow .perm-rule:has-text("cmake") select', 'deny')
    await page.waitForSelector('.perm-deny .perm-rule:has-text("cmake")')
    await page.click('.perm-deny .perm-rule:has-text("cmake") .btn')
    await page.waitForFunction(() => !document.querySelector('.perm-rule code') || ![...document.querySelectorAll('.perm-rule code')].some((c) => /cmake/.test(c.textContent)))
    // Una regola che non va bene: l'errore resta in cima
    await page.fill('.perm-ask .perm-input', 'npm test')
    await page.press('.perm-ask .perm-input', 'Enter')
    await page.waitForSelector('.perm-panel .git-note.error')
    assert.deepEqual(errors, [])
  })

  test(`${tema}: memoria (CLAUDE.md), anche con /memory`, async () => {
    await open(tema)
    await page.fill('[data-part="input"]', '/memory')
    await page.keyboard.press('Escape')
    await page.focus('[data-part="input"]')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.mem-panel .mem-text')
    assert.match(await page.inputValue('.mem-text'), /# MapEditor/)
    assert.equal(await convo('.entry.you'), 0)
    await page.click('.mem-text')
    await page.keyboard.press('Control+End')
    await page.keyboard.type('- Le prove prima del commit')
    assert.match(await page.textContent('.perm-tab.on'), /•/)
    await page.keyboard.press('Control+s')
    await page.waitForSelector('.mem-panel .git-note:has-text("Salvato")')
    // La scheda che non c'è ancora, e l'anteprima
    await page.click('.perm-tab:has-text("Solo tua qui")')
    assert.equal(await page.inputValue('.mem-text'), '')
    await page.click('.perm-tab:has-text("Progetto")')
    await page.click('.mem-row .btn:has-text("Anteprima")')
    assert.match(await page.textContent('.mem-view'), /Le prove prima del commit/)
    assert.deepEqual(errors, [])
  })

  test(`${tema}: conversazioni fissate in cima ed esportazione`, async () => {
    await open(tema)
    await page.waitForSelector('.session-row[data-id="s2"]')
    await page.click('.session-row[data-id="s2"]', { button: 'right' })
    await page.click('.session-menu .folder-item:has-text("Fissa in alto")')
    await page.waitForFunction(() => { const g = document.querySelector('.session-group'); return g && /Fissate/.test(g.textContent) && g.nextElementSibling.dataset.id === 's2' })
    await page.click('.session-row[data-id="s2"]', { button: 'right' })
    await page.click('.session-menu .folder-item:has-text("Esporta")')
    await page.waitForSelector('.convo:not([hidden]) .item:has-text("esportata")')
    await page.click('.session-row[data-id="s2"]', { button: 'right' })
    await page.click('.session-menu .folder-item:has-text("Togli dalle fissate")')
    await page.waitForFunction(() => !/Fissate/.test(document.querySelector('.session-group').textContent))
    assert.deepEqual(errors, [])
  })

  test(`${tema}: dettatura, il microfono mette il cursore nella casella`, async () => {
    await open(tema)
    await page.fill('[data-part="input"]', 'Ciao')
    await page.click('.dictate-btn')
    assert.equal(await page.evaluate(() => document.activeElement.dataset.part), 'input')
    assert.equal(await page.evaluate(() => document.activeElement.selectionStart), 4)
    assert.ok(await page.$('.dictate-btn.on'))
    assert.deepEqual(errors, [])
  })

  test(`${tema}: editor dei temi, dal nuovo tema alla modifica`, async () => {
    await open(tema)
    await send('Ciao')
    await done()
    await page.click('[data-action="themes"]')
    await page.click('.theme-new')
    await page.waitForSelector('.theme-editor .te-name')
    // L'anteprima è la finestra: il tema in prova è già montato, e la conversazione c'è ancora
    assert.equal(await page.evaluate(() => Theming.current.id), '__bozza')
    assert.equal(await convo('.entry.you'), 1)
    await page.fill('.te-name', 'Città di notte')
    await page.$eval('.te-color[data-key="bg"]', (i) => { i.value = '#101820'; i.dispatchEvent(new Event('input', { bubbles: true })) })
    await page.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--bg').trim() === '#101820')
    // L'accento cambia anche il testo sull'accento, finché è automatico
    await page.$eval('.te-color[data-key="accent"]', (i) => { i.value = '#f2aa4c'; i.dispatchEvent(new Event('input', { bubbles: true })) })
    assert.equal(await page.$eval('.te-color[data-key="onAccent"]', (i) => i.value), '#10131a')
    await page.selectOption('.te-font', 'libro')
    await page.click('.te-save')
    await page.waitForFunction(() => Theming.current.id === 'citta-di-notte' && !document.querySelector('.theme-editor'))
    assert.equal(await convo('.entry.you'), 1)
    // Fra i temi, coi suoi pulsanti; Annulla nell'editor torna a quello di prima
    await page.click('[data-action="themes"]')
    await page.click('.theme-card.mine:has-text("Città di notte") .btn:has-text("Modifica")')
    await page.waitForSelector('.theme-editor')
    assert.equal(await page.inputValue('.te-name'), 'Città di notte')
    await page.click('.te-cancel')
    await page.waitForFunction(() => Theming.current.id === 'citta-di-notte' && !document.querySelector('.theme-editor'))
    assert.deepEqual(errors, [])
  })

  test(`${tema}: avviso dell'avvio sicuro, con "Riprova"`, async () => {
    await open(tema)
    await page.evaluate(() => anteprima.avvioSicuro())
    await page.waitForSelector('.safe-banner')
    assert.match(await page.textContent('.safe-banner'), /Notturno.*errore/)
    assert.equal(await page.$$eval('.update-banner', (b) => b.length), 1)
    await page.click('.safe-banner .btn:has-text("Riprova")')
    await page.waitForFunction(() => Theming.current.id === 'notturno' && !document.querySelector('.safe-banner'))
    // Chiuso l'avviso, torna quello degli aggiornamenti
    await page.waitForSelector('.update-banner:not(.safe-banner)')
    assert.deepEqual(errors, [])
  })

  test(`${tema}: chiaro o scuro come il sistema; temi da esportare e importare`, async () => {
    await open(tema)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--bg').trim() === '#17191c')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--bg').trim() === '#fafafa')
    await page.click('[data-action="themes"]')
    // Il tema di partenza si esporta ma non si elimina; quelli tuoi sì
    assert.ok(await page.$('.theme-card.current .btn:has-text("Esporta")'))
    assert.equal(await page.$('.theme-card.current .btn:has-text("Elimina")'), null)
    assert.ok(await page.$('.theme-card.mine:has-text("Notturno") .btn:has-text("Elimina")'))
    await page.click('.theme-card.current .btn:has-text("Esporta")')
    await page.waitForSelector('.convo:not([hidden]) .item:has-text("Tema esportato")')
    await page.click('[data-action="themes"]')
    await page.click('.theme-import')
    await page.waitForFunction(() => Theming.current.id === 'citta-di-sera')
    assert.deepEqual(errors, [])
  })

  test(`${tema}: in inglese di partenza, e il cambio di lingua dalle impostazioni`, async () => {
    await open(tema, 'en')
    assert.equal(await page.getAttribute('[data-part="input"]', 'placeholder'), 'Write to Claude…')
    assert.equal(await page.textContent('[data-action="send"]'), 'Send')
    await page.keyboard.press('Control+,')
    await page.waitForSelector('.set-nav-item[data-page="general"]:has-text("General")')
    await page.click('.set-nav-item[data-page="general"]')
    await page.selectOption('.settings-panel .set-row:has-text("Language") select', 'it')
    // Tutto si ridisegna in italiano, e le impostazioni restano aperte
    await page.waitForFunction(() => document.querySelector('[data-part="input"]').placeholder === 'Scrivi a Claude…')
    await page.waitForSelector('.set-nav-item[data-page="general"]:has-text("Generale")')
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'it')
    assert.deepEqual(errors, [])
  })

  test(`${tema}: benvenuto senza Claude Code, poi le novità della versione`, async () => {
    await open(tema, 'it', '&benvenuto=si&claude=manca&novita=si')
    await page.waitForSelector('.welcome-panel')
    assert.match(await page.textContent('.welcome-panel'), /irm https:\/\/claude\.ai\/install\.ps1 \| iex/)
    assert.equal(await page.$$eval('.welcome-panel .wel-step.todo', (x) => x.length), 2)
    // Le novità aspettano che il benvenuto sia chiuso
    assert.equal(await page.$('.news-panel'), null)
    await page.click('.welcome-panel .wel-foot .btn:has-text("Continua comunque")')
    await page.waitForSelector('.news-panel')
    assert.match(await page.textContent('.news-panel'), /Claudeleon 1\.1\.0/)
    await page.click('.news-panel .btn:has-text("Va bene")')
    assert.equal(await page.$('.theme-picker'), null)
    assert.deepEqual(errors, [])
  })

  test(`${tema}: un tema con una forma sua riceve da Claudeleon i pulsanti che non ha`, async () => {
    await open(tema)
    await page.evaluate(() => {
      Theming.register({
        id: 'forma-sua', name: 'Forma sua', description: 'Un layout scritto a mano, prima degli artifact', engine: '1.1.0',
        layout: '<div data-solid class="fs"><main><div data-part="log"></div><textarea data-part="input"></textarea><nav><button class="pulsantino" data-action="themes">Temi</button><button class="pulsantino" data-action="settings">Impostazioni</button></nav></main></div>',
        scenes: { notte: { palette: {}, vars: {} }, giorno: { palette: {}, vars: {} } },
      })
      window.anteprima.tema('forma-sua')
    })
    await page.waitForSelector('[data-action="artifacts"][data-added]')
    // Prima del pulsante dei temi, con la sua classe e una scritta
    assert.deepEqual(await page.$eval('[data-action="artifacts"]', (b) => [b.className, b.textContent, b.nextElementSibling.dataset.action]), ['pulsantino', 'Artifact', 'themes'])
    await page.click('[data-action="artifacts"]')
    await page.waitForSelector('.set-nav-item.on[data-page="artifacts"]')
    await page.click('.settings-panel .theme-picker-head button')
    // Nel selettore: cosa si aggiorna da sé e cosa no
    await page.click('[data-action="themes"]')
    await page.waitForSelector('.theme-card .theme-kind')
    const cards = await page.$$eval('.theme-card', (cs) => Object.fromEntries(cs.map((c) => [c.querySelector('.theme-name').textContent, [(c.querySelector('.theme-kind') || {}).textContent || '', (c.querySelector('.theme-missing') || {}).textContent || '']])))
    assert.deepEqual(cards['Essenziale'], ['Si aggiorna da sé', ''])
    assert.deepEqual(cards['Forma sua'], ['Forma sua · fatto per Claudeleon 1.1.0', 'Aggiunti da Claudeleon: Artifact'])
    await page.click('.theme-picker-head button')
    // Un tema che il pulsante ce l'ha già: niente copia
    await page.evaluate(() => {
      Theming.register({ id: 'forma-nuova', name: 'Forma nuova', layout: '<div data-solid><main><div data-part="log"></div><textarea data-part="input"></textarea><button data-action="artifacts">A</button><button data-action="settings">I</button></main></div>', scenes: { notte: { palette: {}, vars: {} }, giorno: { palette: {}, vars: {} } } })
      window.anteprima.tema('forma-nuova')
    })
    await page.waitForFunction(() => Theming.current.id === 'forma-nuova')
    await page.waitForTimeout(200)
    assert.equal(await page.$$eval('[data-action="artifacts"]', (b) => b.length), 1)
    assert.deepEqual(errors, [])
  })

  test(`${tema}: le conversazioni derivate stanno sotto quella di partenza`, async () => {
    await open(tema)
    await page.waitForSelector('.session-row.child')
    const rows = await page.$$eval('.sessions-list > *', (r) => r.map((x) => [x.dataset.id || x.textContent, x.classList.contains('child')]))
    const at = (id) => rows.findIndex(([x]) => x === id)
    // Subito sotto, rientrata
    assert.equal(at('s7'), at('s1') + 1)
    assert.equal(rows[at('s7')][1], true)
    // Una famiglia vecchia con una derivata recente sale nel gruppo della derivata
    assert.equal(at('s8'), at('s5') + 1)
    assert.equal(rows[at('s5') - 1][0], 'Ultimi 7 giorni')
    // Cercando solo la derivata, sta da sola
    await page.fill('.sessions-search, [data-part="sessions-search"]', 'rclone')
    await page.waitForFunction(() => document.querySelectorAll('.session-row:not(.note)').length === 1)
    assert.equal(await page.$eval('.session-row:not(.note)', (r) => [r.dataset.id, r.classList.contains('child')].join()), 's8,false')
    assert.deepEqual(errors, [])
  })

  test(`${tema}: la ricerca trova anche le parole nei messaggi`, async () => {
    await open(tema)
    await page.fill('.sessions-search, [data-part="sessions-search"]', 'guadi')
    await page.waitForSelector('.session-row[data-id="s2"] .session-snippet mark')
    assert.equal(await page.textContent('.session-row[data-id="s2"] .session-snippet mark'), 'guadi')
    assert.equal(await page.$$eval('.session-row:not(.note)', (r) => r.length), 1)
    assert.deepEqual(errors, [])
  })

  test(`${tema}: artifact, la scheda, il pannello di claude.ai e l'elenco con /artifacts`, async () => {
    await open(tema)
    await page.click('.session-row[data-id="s2"]')
    await page.waitForSelector('.artifact-card')
    assert.match(await page.textContent('.artifact-card .art-title'), /Come si disegnano i fiumi/)
    assert.match(await page.textContent('.artifact-card .art-sub'), /pubblicato/)
    await page.click('.artifact-card .art-open')
    await page.waitForSelector('.preview-pane:not([hidden]) webview.pv-web')
    assert.equal(await page.inputValue('.pv-addr'), 'https://claude.ai/code/artifact/fiumi-1234')
    assert.equal(await page.$eval('.pv-web', (w) => w.getAttribute('partition')), 'persist:claudeai')
    assert.equal(await page.$eval('.pv-frame', (f) => f.hidden), true)
    // Un indirizzo locale torna nell'iframe; il webview resta, nascosto, per quando si torna all'artifact
    await page.fill('.pv-addr', '5173')
    await page.press('.pv-addr', 'Enter')
    assert.equal(await page.$eval('.pv-web', (w) => w.hidden), true)
    assert.equal(await page.$eval('.pv-frame', (f) => f.hidden), false)
    await page.click('.pv-close')
    await page.fill('[data-part="input"]', '/artifacts')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.art-row')
    assert.equal(await page.$$eval('.art-row', (r) => r.length), 2)
    assert.match(await page.textContent('.art-row'), /2 versioni/)
    assert.equal(await page.inputValue('[data-part="input"]'), '')
    // Anche dal pulsante in fondo alla barra laterale
    await page.click('.settings-panel .theme-picker-head button')
    await page.click('[data-action="artifacts"]')
    await page.waitForSelector('.set-nav-item.on[data-page="artifacts"]')
    await page.waitForSelector('.art-row')
    // L'interruttore
    await page.click('.set-row:has-text("Claude può pubblicare artifact") .set-switch')
    await page.waitForSelector('.set-row:has-text("Claude può pubblicare artifact") .set-switch:not(.on)')
    await page.click('.set-row:has-text("Claude può pubblicare artifact") .set-switch')
    await page.click('.settings-panel .theme-picker-head button')
    assert.deepEqual(errors, [])
  })

  test(`${tema}: impostazioni, estensioni, contesto, cambio di tema che tiene la conversazione`, async () => {
    await open(tema)
    await send('Ciao')
    await done()
    await page.keyboard.press('Control+,')
    await page.click('.settings-panel .set-nav-item[data-page="general"]')
    await page.waitForSelector('.settings-panel .set-switch .switch')
    const box = await page.$eval('.settings-panel .set-switch .switch', (e) => e.getBoundingClientRect().width)
    assert.ok(box > 10, 'gli interruttori si vedono')
    await page.click('.settings-panel .set-nav-item[data-page="extensions"]')
    await page.waitForSelector('.ext-panel .ext-dot')
    await page.keyboard.press('Escape')
    await page.evaluate(() => anteprima.contesto(64))
    await page.click('.context-btn')
    await page.waitForSelector('.context-menu .usage-row')
    await page.keyboard.press('Escape')
    // L'altro tema: quello dell'editor che la versione finta ha già salvato
    const other = 'notturno'
    await page.evaluate((id) => anteprima.tema(id), other)
    await page.waitForFunction((id) => document.body.dataset.theme === id || !!document.querySelector('[data-part="log"] .convo .entry.you'), other)
    assert.equal(await convo('.entry.you'), 1)
    assert.deepEqual(errors, [])
  })
}
