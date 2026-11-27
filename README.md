# Claudeleon

Un'app a temi per lavorare con Claude Code: cambia pelle come un camaleonte, la conversazione resta quella.

**Per installarla:** scarica `Claudeleon-Setup-<versione>.exe` dall'[ultima release](https://github.com/LukePasax/Claude-desktop-skins/releases/latest)
e lancialo; poi si aggiorna da sola dalle release. Serve Claude Code installato, col login fatto.

Dal repo: doppio clic su `avvia.cmd` per aprirla senza installare, o su `crea-installer.cmd` per farsi l'installer
(`claude-skins\app\dist\Claudeleon-Setup-<versione>.exe`). Serve [Node.js](https://nodejs.org) LTS.

- [`claude-skins/`](claude-skins/) — **Claudeleon**: un'app Electron a temi, grande come l'app desktop, che
  comanda Claude Code con l'Agent SDK. Di serie ha un tema pulito, chiaro o scuro come Windows; altri temi si creano
  con l'editor o si importano da un file `.skin`, anche con una forma tutta loro.
  - [`app/LEGGIMI.md`](claude-skins/app/LEGGIMI.md): installazione e uso.
  - [`app/src/renderer/themes/LEGGIMI.md`](claude-skins/app/src/renderer/themes/LEGGIMI.md): come si scrive un tema.
  - [`CONTESTO-PER-CLAUDE.md`](claude-skins/CONTESTO-PER-CLAUDE.md): storia, scelte, prossimi passi.
