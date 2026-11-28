// I temi dal vivo, nell'app vera (processo principale compreso): un tema messo nella cartella dei temi compare, quello
// in uso si ricarica quando un suo file cambia. Sono i temi d'esempio della skill. Solo su Linux, con una casa
// temporanea: su Windows l'app vera toccherebbe i collegamenti del menu Start e controllerebbe gli aggiornamenti
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { _electron } = require('playwright-core')

const ROOT = path.join(__dirname, '..', '..')
const EX = path.join(ROOT, 'src', 'plugin', 'claudeleon', 'skills', 'claudeleon-theme', 'examples')

test('temi dal vivo: compaiono e si ricaricano', { skip: process.platform !== 'linux' && 'solo su Linux' }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-vivo-'))
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [ROOT, '--no-sandbox'],
    env: Object.assign({}, process.env, { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), CLAUDE_CONFIG_DIR: path.join(home, '.claude') }),
  })
  try {
    const page = await app.firstWindow()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForSelector('[data-part="input"]')
    const dir = path.join(await app.evaluate(({ app }) => app.getPath('userData')), 'temi')
    assert.ok(dir.startsWith(home))
    const bg = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg').trim())

    fs.mkdirSync(dir, { recursive: true })
    fs.cpSync(path.join(EX, 'terminal'), path.join(dir, 'terminal'), { recursive: true })
    fs.copyFileSync(path.join(EX, 'dusk.json'), path.join(dir, 'dusk.json'))
    await page.waitForFunction(() => ['terminal', 'dusk'].every((id) => Theming.list().some((t) => t.id === id)), null, { timeout: 8000 })

    await page.evaluate(() => window.skins.setTheme('terminal'))
    await page.waitForFunction(() => Theming.current && Theming.current.id === 'terminal', null, { timeout: 8000 })
    await page.waitForSelector('[data-part="input"]')
    assert.equal(await bg(), '#050a05')

    const js = path.join(dir, 'terminal', 'theme.js')
    fs.writeFileSync(js, fs.readFileSync(js, 'utf8').replace("bg: '#050a05'", "bg: '#000814'"))
    await page.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--bg').trim() === '#000814', null, { timeout: 8000 })

    // Un file scritto a metà: il tema resta quello di prima, in uso, senza avviso; poi il file giusto si vede
    const good = fs.readFileSync(js, 'utf8')
    fs.writeFileSync(js, good.slice(0, Math.floor(good.length / 2)))
    await page.waitForTimeout(1500)
    assert.equal(await page.evaluate(() => Theming.current.id), 'terminal')
    assert.equal(await bg(), '#000814')
    assert.equal(await page.$('.update-banner.safe, .safe-banner'), null)
    fs.writeFileSync(js, good.replace("bg: '#000814'", "bg: '#101010'"))
    await page.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--bg').trim() === '#101010', null, { timeout: 8000 })

    await page.evaluate(() => window.skins.setTheme('dusk'))
    await page.waitForFunction(() => Theming.current && Theming.current.id === 'dusk', null, { timeout: 8000 })
    fs.rmSync(path.join(dir, 'terminal'), { recursive: true, force: true })
    await page.waitForFunction(() => !Theming.list().some((t) => t.id === 'terminal'), null, { timeout: 8000 })
    // (l'errore del file a metà è voluto)
    assert.deepEqual(errors.filter((e) => !/Unexpected|SyntaxError|missing|Invalid/i.test(e)), [])
  } finally {
    await app.close()
    fs.rmSync(home, { recursive: true, force: true })
  }
})

// Una pagina HTML del computer nell'anteprima: si vede coi suoi CSS e script, ma non arriva all'API dell'app, alla
// pagina della finestra né ai file fuori dalla sua cartella
test('anteprima di una pagina del computer: chiusa nella sua cartella', { skip: process.platform !== 'linux' && 'solo su Linux' }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-pagina-'))
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [ROOT, '--no-sandbox'],
    env: Object.assign({}, process.env, { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), CLAUDE_CONFIG_DIR: path.join(home, '.claude') }),
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-part="input"]')
    const site = path.join(home, 'sito')
    fs.mkdirSync(path.join(site, 'css'), { recursive: true })
    fs.writeFileSync(path.join(home, 'segreto.txt'), 'SEGRETO')
    fs.writeFileSync(path.join(site, 'css', 's.css'), '#r { color: rgb(0, 128, 0) }')
    fs.writeFileSync(path.join(site, 's.js'), 'window.extra = 42')
    const secret = require('url').pathToFileURL(path.join(home, 'segreto.txt')).href
    const html = path.join(site, 'pagina.html')
    fs.writeFileSync(html, `<link rel=stylesheet href=css/s.css><script src=s.js></script><h1 id=r>uno</h1><script>
      const out = []
      try { out.push('api:' + typeof parent.skins) } catch (e) { out.push('api:no') }
      try { out.push('doc:' + !!parent.document.body) } catch (e) { out.push('doc:no') }
      Promise.all([fetch('../segreto.txt').then((r) => r.ok ? 'si' : 'no').catch(() => 'no'), fetch('${secret}').then((r) => r.text()).then(() => 'si').catch(() => 'no')])
        .then(([a, b]) => { out.push('sopra:' + a, 'file:' + b); document.title = out.join(' ') })
    </script>`)
    await page.keyboard.press('Control+Shift+P')
    await page.waitForSelector('.pv-addr')
    await page.evaluate((u) => { const i = document.querySelector('.pv-addr'); i.value = u; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }, require('url').pathToFileURL(html).href)
    let frame = null
    for (let k = 0; k < 40 && !frame; k++) { frame = page.frames().find((f) => f.url().startsWith('skins-page:')); if (!frame) await page.waitForTimeout(100) }
    assert.ok(frame, 'la pagina non si è aperta')
    await frame.waitForFunction(() => document.title)
    assert.equal(await frame.evaluate(() => document.title), 'api:no doc:no sopra:no file:no')
    assert.deepEqual(await frame.evaluate(() => [getComputedStyle(document.getElementById('r')).color, window.extra]), ['rgb(0, 128, 0)', 42])
  } finally {
    await app.close()
    fs.rmSync(home, { recursive: true, force: true })
  }
})
