// La finestra delle prove: la pagina vera dell'app, senza preload, quindi con l'API finta (vedi fakeApi in
// renderer.js) in modalità veloce. La lancia test/ui/finestra.test.js con playwright-core
const { app, BrowserWindow } = require('electron')
const path = require('path')

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1180, height: 780, show: true, webPreferences: { contextIsolation: true } })
  win.loadFile(path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'), { query: { tema: process.env.SKINS_TEMA || 'essenziale', scena: 'giorno', veloce: '1' } })
})
app.on('window-all-closed', () => app.quit())
