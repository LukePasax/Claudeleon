// Le prove della finestra, per ogni tema: la pagina vera con l'API finta veloce, dentro Electron, guidata da
// playwright-core. Controllano che le funzioni principali facciano quello che devono e che non ci siano errori
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { _electron } = require('playwright-core')

const TEMI = ['terra-di-mezzo', 'metrios', 'dream']
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
async function open(tema) {
  errors = []
  const url = require('url').pathToFileURL(INDEX).href + `?tema=${tema}&scena=giorno&veloce=1`
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

  test(`${tema}: impostazioni, estensioni, contesto, cambio di tema che tiene la conversazione`, async () => {
    await open(tema)
    await send('Ciao')
    await done()
    await page.keyboard.press('Control+,')
    await page.waitForSelector('.settings-panel .set-switch .switch')
    const box = await page.$eval('.settings-panel .set-switch .switch', (e) => e.getBoundingClientRect().width)
    assert.ok(box > 10, 'gli interruttori si vedono')
    await page.click('.set-row:has-text("Server MCP e plugin") .btn')
    await page.waitForSelector('.ext-panel .ext-dot')
    await page.keyboard.press('Escape')
    await page.evaluate(() => anteprima.contesto(64))
    await page.click('.context-btn')
    await page.waitForSelector('.context-menu .usage-row')
    await page.keyboard.press('Escape')
    const other = TEMI.find((x) => x !== tema)
    await page.evaluate((id) => anteprima.tema(id), other)
    await page.waitForFunction((id) => document.body.dataset.theme === id || !!document.querySelector('[data-part="log"] .convo .entry.you'), other)
    assert.equal(await convo('.entry.you'), 1)
    assert.deepEqual(errors, [])
  })
}
