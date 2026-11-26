# Pergamena

Claude in una finestra in pixel art, grande come l'app desktop e (se si vuole) sempre in primo piano. Forma e
aspetto vengono dal tema. Quello di partenza è **Terra di Mezzo**: il Libro Rosso aperto, con gli annali a sinistra
e la conversazione a destra. C'è anche **Pergamena**, il rotolo fantasy senza un mondo preciso. Altri temi si
aggiungono come cartelle in `src/renderer/themes/`, ognuno con il proprio scheletro (guida:
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

- **Avvio:** doppio clic su `avvia.cmd`. La finestra compare al centro dello schermo, grande come l'app desktop
  (Terra di Mezzo 1180×780, Pergamena 1080×760, mai oltre il 92% dello schermo).
- **Spostare e allargare:** si trascina dalla testata (il capo alto del rotolo, la copertina del libro); la
  maniglia a gradini in basso a destra allarga e allunga. Posizione e dimensione restano, e la dimensione è
  ricordata per tema. Dal vassoio: "Riporta al centro" e "Dimensione iniziale".
- **Sempre in primo piano:** dal vassoio si può spegnere, ora che la finestra è grande.
- **Scorciatoia:** `Ctrl+Alt+P` mostra o nasconde la finestra da qualunque programma; c'è anche l'icona nel vassoio.
- **Tema:** dal vassoio, **Tema**. Cambia sul posto (forma della finestra compresa) senza perdere la conversazione;
  Claude prende il tono del nuovo tema dal messaggio successivo. Il pulsante "stelle"/"Contea" (o "notte"/"giorno")
  passa da una scena all'altra.
- **Conversazione:** Invio spedisce, Maiusc+Invio va a capo. "nuovo capitolo" ricomincia la conversazione; quella
  corrente prosegue fra un avvio e l'altro.
- **Claude Code:** comandato con l'Agent SDK (`@anthropic-ai/claude-agent-sdk`) sopra
  `%USERPROFILE%\.local\bin\claude.exe`, con il prompt di sistema di Claude Code più la "personalità" del tema (lo
  scriba di Gran Burrone per Terra di Mezzo, il cronista per Pergamena). Gli hook dell'utente sono spenti per queste
  conversazioni.
- **Permessi:** modo `auto` (un classificatore decide; quando non sa, la domanda compare nel rotolo con Permetti,
  Sempre, Nega). In `src/claude-bridge.js`, `this.mode = 'default'` fa chiedere ogni azione a rischio.
- **Cronache (annali):** l'elenco delle sessioni di Claude Code nella cartella di lavoro, comprese quelle dell'app
  desktop coi loro titoli. Nel Libro Rosso sono sempre visibili sulla pagina sinistra; nel rotolo si aprono col
  pulsante "cronache". Aprendone una si vedono gli ultimi scambi e i messaggi dopo continuano quella. Non aprire qui
  una sessione che è aperta anche nell'app desktop.
- **Configurazione:** `%APPDATA%\pergamena-app\config.json`: `workdir` (la cartella in cui lavora Claude e di cui si
  elencano le cronache; vuota, la cartella utente), posizione, dimensione per tema, scena, capitolo, sessione, tema,
  sempre in primo piano.
- **Prove:** `node_modules\electron\dist\electron.exe . --cattura <file.png> [notte|giorno] [chat|cronache]
  [LxA] [--tema <id>]` (senza LxA, la misura del tema) disegna una conversazione finta (con una domanda di permesso) o l'elenco delle cronache, salva
  uno screenshot della finestra ed esce, senza chiamare Claude. Per guardare un tema senza Electron basta aprire
  `src/renderer/index.html?tema=<id>` nel browser.

Caratteri: Pixelify Sans e Jacquarda Bastarda 9 (Google Fonts, licenza SIL Open Font License).
