# Pergamena

Claude in una finestra a rotolo di pergamena, in pixel art, sempre in primo piano. L'aspetto viene da un tema:
quello di partenza è **Terra di Mezzo**, una pagina del Libro Rosso. C'è anche **Pergamena**, il rotolo fantasy
senza un mondo preciso. Altri temi si aggiungono come cartelle in `src/renderer/themes/` (guida:
[`src/renderer/themes/LEGGIMI.md`](src/renderer/themes/LEGGIMI.md)).

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
- **Tema:** dal vassoio, **Tema**. Cambia sul posto, senza perdere la conversazione; Claude prende il tono del nuovo
  tema dal messaggio successivo. Sotto il rotolo, il primo pulsante passa dalla scena di notte a quella di giorno.
- **Conversazione:** Invio spedisce, Maiusc+Invio va a capo. "nuovo capitolo" ricomincia la conversazione; quella
  corrente prosegue fra un avvio e l'altro.
- **Claude Code:** comandato con l'Agent SDK (`@anthropic-ai/claude-agent-sdk`) sopra
  `%USERPROFILE%\.local\bin\claude.exe`, con il prompt di sistema di Claude Code più la "personalità" del tema (lo
  scriba di Gran Burrone per Terra di Mezzo, il cronista per Pergamena). Gli hook dell'utente sono spenti per queste
  conversazioni.
- **Permessi:** modo `auto` (un classificatore decide; quando non sa, la domanda compare nel rotolo con Permetti,
  Sempre, Nega). In `src/claude-bridge.js`, `this.mode = 'default'` fa chiedere ogni azione a rischio.
- **Cronache:** l'elenco delle sessioni di Claude Code nella cartella di lavoro, comprese quelle dell'app desktop
  coi loro titoli; aprendone una si vedono gli ultimi scambi e i messaggi dopo continuano quella. Non aprire nel
  rotolo una sessione che è aperta anche nell'app desktop.
- **Configurazione:** `%APPDATA%\pergamena-app\config.json`: `workdir` (la cartella in cui lavora Claude e di cui si
  elencano le cronache; vuota, la cartella utente), posizione, dimensione, scena, capitolo, sessione, tema.
- **Prove:** `node_modules\electron\dist\electron.exe . --cattura <file.png> [notte|giorno] [chat|cronache]
  [LxA] [--tema <id>]` disegna una conversazione finta (con una domanda di permesso) o l'elenco delle cronache, salva
  uno screenshot della finestra ed esce, senza chiamare Claude. Per guardare un tema senza Electron basta aprire
  `src/renderer/index.html?tema=<id>` nel browser.

Caratteri: Pixelify Sans e Jacquarda Bastarda 9 (Google Fonts, licenza SIL Open Font License).
