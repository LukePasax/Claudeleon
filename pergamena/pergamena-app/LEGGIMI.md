# Pergamena

Claude in una finestra a rotolo di pergamena, in pixel art, sempre in primo piano.

## Installazione

Serve Windows con [Node.js](https://nodejs.org) LTS e Claude Code installato a parte, con il login fatto
(`irm https://claude.ai/install.ps1 | iex`, poi `claude` e `/login`).

```powershell
npm install
node node_modules/electron/install.js   # solo se manca node_modules\electron\dist\electron.exe
```

Con npm 11 lo script di installazione di Electron non parte da solo: la seconda riga scarica il binario.

## Uso

- **Avvio:** doppio clic su `avvia.cmd`. La finestra compare in basso a destra.
- **Spostare e allargare:** si trascina dal capo alto; la maniglia a gradini sotto il rotolo, in basso a destra, lo
  allarga e lo allunga. Posizione e dimensione restano; dal vassoio "Riporta in basso a destra" e "Dimensione
  iniziale".
- **Scorciatoia:** `Ctrl+Alt+P` mostra o nasconde il rotolo da qualunque programma; c'è anche l'icona nel vassoio.
- **Conversazione:** Invio spedisce, Maiusc+Invio va a capo. "nuovo capitolo" ricomincia la conversazione; quella
  corrente prosegue fra un avvio e l'altro.
- **Claude Code:** comandato con l'Agent SDK (`@anthropic-ai/claude-agent-sdk`) sopra
  `%USERPROFILE%\.local\bin\claude.exe`, con il prompt di sistema di Claude Code più un tocco da cronista. Gli hook
  dell'utente sono spenti per queste conversazioni.
- **Permessi:** modo `auto` (un classificatore decide; quando non sa, la domanda compare nel rotolo con Permetti,
  Sempre, Nega). In `src/claude-bridge.js`, `this.mode = 'default'` fa chiedere ogni azione a rischio.
- **Cronache:** l'elenco delle sessioni di Claude Code nella cartella di lavoro, comprese quelle dell'app desktop
  coi loro titoli; aprendone una si vedono gli ultimi scambi e i messaggi dopo continuano quella. Non aprire nel
  rotolo una sessione che è aperta anche nell'app desktop.
- **Configurazione:** `%APPDATA%\pergamena-app\config.json`: `workdir` (la cartella in cui lavora Claude e di cui si
  elencano le cronache; vuota, la cartella utente), posizione, dimensione, scena, capitolo, sessione.
- **Prove:** `node_modules\electron\dist\electron.exe . --cattura <file.png> [notte|giorno] [chat|cronache]
  [LxA]` disegna una conversazione finta (con una domanda di permesso) o l'elenco delle cronache, salva uno
  screenshot della finestra ed esce, senza chiamare Claude.

Caratteri: Pixelify Sans e Jacquarda Bastarda 9 (Google Fonts, licenza SIL Open Font License).
