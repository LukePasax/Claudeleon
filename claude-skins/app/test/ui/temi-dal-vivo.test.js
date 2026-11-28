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

    await page.evaluate(() => window.skins.setTheme('dusk'))
    await page.waitForFunction(() => Theming.current && Theming.current.id === 'dusk', null, { timeout: 8000 })
    fs.rmSync(path.join(dir, 'terminal'), { recursive: true, force: true })
    await page.waitForFunction(() => !Theming.list().some((t) => t.id === 'terminal'), null, { timeout: 8000 })
    assert.deepEqual(errors, [])
  } finally {
    await app.close()
    fs.rmSync(home, { recursive: true, force: true })
  }
})
