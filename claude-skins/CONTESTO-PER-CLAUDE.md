# Claude Skins — come è nata, per riprenderla ed espanderla

Questo documento è per Claude (Claude Code), che lo legge prima di lavorare sull'app nella cartella `app/`.
L'app si chiamava **Pergamena** finché aveva un solo aspetto; con i temi è diventata **Claude Skins** (cartelle,
finestra, pacchetto e configurazione), e "Pergamena" è rimasto il nome del tema del rotolo.
Racconta cosa si voleva, quali strade sono state provate e perché sono state lasciate, com'è fatta l'app, cosa è stato
verificato e cosa resta da fare. I sorgenti sono la fonte di verità; questo è la mappa.

## L'obiettivo

Lavorare con Claude in un'interfaccia che non sembri né un terminale né l'app desktop standard: un tema ispirato al
Signore degli Anelli (pergamena, oro, inchiostro, mappe), senza copiare loghi, nomi, mappe o citazioni di Tolkien.
Poi, strada facendo: tutta in pixel art, in una finestra propria, sempre in primo piano, spostabile e
ridimensionabile; con le richieste di permesso nella finestra e la possibilità di riprendere le sessioni di Claude
Code. L'idea di fondo, ancora aperta: arrivare a un'interfaccia che sostituisca quella di Claude Code per una parte
del lavoro di ogni giorno. Il motore resta Claude Code: l'app ne cambia la faccia.

**Cambio di rotta (novembre 2026).** Strada facendo il rotolo era diventato un fantasy generico. L'utente lo vuole di
nuovo sulla strada del Signore degli Anelli: è un'app per uso personale, quindi riferimenti espliciti alla Terra di
Mezzo (nomi, luoghi, il Libro Rosso, l'Anello, il calendario della Contea) vanno bene. Restano fuori le cose prese di
peso: citazioni dai libri o dai film (anche la persona chiede a Claude di non farne), loghi, immagini e mappe dei
film o dei libri. Tutto si disegna a pixel dal codice. Il secondo obiettivo è un'app **a temi**: Terra di Mezzo è il
primo; il rotolo generico resta come tema "Pergamena", e se ne potranno aggiungere altri.

**Secondo passo (novembre 2026).** I temi non condividono più lo scheletro del rotolo: ogni tema porta il proprio
layout HTML e il proprio CSS, e il motore trova i suoi pezzi per attributo. La finestra di partenza è grande come
l'app desktop (circa 1100×760, centrata), con la misura ricordata per tema; "sempre in primo piano" si può spegnere
dal vassoio. Terra di Mezzo è diventato il Libro Rosso aperto: annali sempre visibili a sinistra (come la barra
laterale dell'app desktop), conversazione a destra.

## Le strade provate, in ordine

1. **Una mod per Claude desktop** (plugin con un modulo di hook, API `$.theme`, `ui.render`). La mappa come sfondo a
   tutta finestra era pronta, ma l'app desktop di allora non disegnava gli sfondi delle mod: `$.theme.set` rispondeva
   `isDrawn: false` ("no attached desktop or mobile client says it draws backdrops"), e nessun messaggio di tema
   arrivava all'interfaccia, quindi niente colori né caratteri dell'app. Restavano le righe della conversazione:
   cornici d'oro attorno alle risposte, capolettera, una fascia sopra il prompt col paesaggio e un motto, simboli
   accanto agli strumenti, una riga-capitolo per sessione, la mappa del viaggio in un pannello. Funzionava, ma
   restava l'app desktop decorata. Carattere con grazie per le risposte: dalle impostazioni dell'app ("Chat font").
2. **Claude Code nel terminale** (Windows Terminal): profilo con la mappa come immagine di sfondo, schema di colori
   seppia e oro, tema dei colori di Claude Code dentro la mod (cartella `themes/` del plugin, file
   `{ "name", "base": "dark"|"light", "overrides": { chiave: "#rrggbb" } }`, scelto con `/theme`), decorazioni
   testuali per la superficie `terminal`. Più libero del desktop, ma "si vedeva ancora che è un terminale".
3. **Una pagina web locale** in una finestra di Edge in modalità app, servita da un piccolo server Python che lanciava
   `claude -p --output-format stream-json`. Libertà grafica piena, ma una finestra normale.
4. **Un'app Electron** (l'attuale): la stessa idea di un collega, che aveva un avatar in pixel art sempre in primo
   piano con una chat. Da lì le idee: finestra trasparente senza bordi, testo che scorre mentre Claude scrive, hook
   dell'utente spenti per le conversazioni dell'app, una "personalità" nel prompt di sistema. Il codice dell'app è
   stato scritto da zero.

## Com'è fatta

L'app è divisa in un **motore** comune (finestra, conversazione, permessi, cronache, gli attrezzi del disegno a
pixel) e in **temi** che decidono tutto quello che si vede: forma della finestra (HTML e CSS), misura, scritte,
colori, disegni e tono di Claude. Il motore non conosce la forma: cerca i pezzi per attributo (`data-part="log"`,
`data-action="send"`, `data-drag`, `data-art`...) e delega gli eventi al documento, così un cambio di tema sostituisce
tutto l'HTML e la conversazione passa al nuovo layout. La guida per scrivere un tema è `src/renderer/themes/LEGGIMI.md`.

- `src/main.js` — processo principale: finestra trasparente, senza bordi, sempre in primo piano; i clic passano alle
  finestre sotto finché il mouse non è sul rotolo (`setIgnoreMouseEvents(true, { forward: true })`, la pagina dice
  quando attivarla). Spostamento e ridimensionamento seguiti dal processo principale col cursore a 60 Hz
  (`gesture:start/end`): con una finestra trasparente il trascinamento nativo (`-webkit-app-region`) e i bordi di
  ridimensionamento di Windows non sono affidabili. Vassoio, `Ctrl+Alt+P`, configurazione in
  `%APPDATA%\Claude Skins\config.json`, modalità `--cattura` per gli screenshot di prova.
- `src/claude-bridge.js` — il "messaggero": `query()` dell'Agent SDK con `cwd`, `pathToClaudeCodeExecutable` (la CLI
  installata, così valgono il suo login e la sua versione), `permissionMode: 'auto'`, `systemPrompt: { type:
  'preset', preset: 'claude_code', append: <tono da cronista> }`, `settings: { disableAllHooks: true }`,
  `includePartialMessages: true` (eventi `stream_event` con `text_delta`), `resume` per continuare la sessione,
  `change()` che allega a `Edit`/`MultiEdit`/`Write`/`NotebookEdit` la modifica da mostrare (prima, dopo, riga
  d'inizio trovata nel file; il "prima" di un `Write` letto dal disco), negli eventi `tool` e nelle domande,
  `canUseTool` che gira la domanda alla finestra e aspetta la risposta (`{ behavior: 'allow', updatedPermissions }`
  per "Sempre", con le `suggestions` ricevute; `{ behavior: 'deny', message }` per "Nega"). `Query.interrupt()` per
  Ferma. `listSessions({ dir, limit })` e `getSessionMessages(id, { dir })` per le cronache: `customTitle` è il titolo
  che l'app desktop dà alle sessioni. L'SDK è un modulo ES: dal processo principale CommonJS si carica con `import()`.
- `src/themes.js` — l'elenco dei temi per il processo principale (le cartelle di `src/renderer/themes/` con un
  `theme.js`, letto con `require`): nome per il sottomenu **Tema** del vassoio, misure della finestra (`window`) e
  `persona` per il prompt di sistema. `config.theme` ricorda la scelta, `config.sizes[id]` la misura per tema; al
  cambio la finestra prende la misura del nuovo tema attorno allo stesso centro, la pagina riceve `theme:apply` e il
  messaggero il nuovo `bridge.persona`.
- `src/preload.js` — il ponte tra pagina e processo principale (`contextBridge`), niente Node nella pagina.
- `src/renderer/` — la pagina.
  - `index.html` è vuoto: solo `<div id="app">`, dove si monta il `layout` del tema.
  - `diff.js` calcola le differenze riga per riga (sottosequenza comune più lunga, dopo aver tolto le righe uguali
    in testa e in coda; oltre 4 milioni di celle mostra blocco tolto e blocco aggiunto) e le raggruppa con 3 righe
    di contesto. Funzioni pure, si provano con node.
  - `pixel.js` contiene gli attrezzi del disegno (`bitmap`, `mirror`, `seeded`, `upscale`), le icone 8×8 dei
    "mestieri" di partenza e una libreria di disegni pronti (`Pixel.lib`: carta, capo del rotolo, tratteggio,
    candela, rotolino del vassoio). Si disegna dal codice a bassa risoluzione e si ingrandisce senza sfumature.
  - `theming.js` carica i temi e risponde con quello in uso: layout, scritte (`t(chiave)`, partenza in `STRINGS`),
    palette per scena, variabili CSS (in linea su `body`, così battono `style.css`), data del capitolo, disegni per
    nome (`art(nome, opzioni)`). Tiene attivo un solo `theme.css` alla volta, quindi i temi non usano prefissi.
  - `renderer.js` monta il layout (`mount`), gestisce la conversazione con un markdown minimo, i permessi, le
    cronache (in sovrimpressione o fisse, `data-mode="always"`), la scena giorno/notte e i gesti. Ogni scritta tiene
    la chiave in `data-s`; i canvas `data-art` e gli sfondi `data-art-bg` si ridisegnano a ogni cambio di misura.
  - `style.css` è comune a tutti i temi ma senza forma: variabili, voci della conversazione, pulsanti, righe delle
    cronache, barre di scorrimento.
  - `themes/<id>/` sono i temi. **Terra di Mezzo**, il predefinito: il Libro Rosso aperto in cuoio con titolo
    d'oro e spille a foglia, pagina degli annali e pagina della conversazione, dorso cucito, segnalibro verde, rune
    inventate, calendario della Contea, l'Anello come lume (lettere di fuoco mentre Claude lavora), palantír, fiala
    di luce, "Non passerai" per il rifiuto, uno scriba di Gran Burrone come persona. **Pergamena**: il rotolo, con
    i disegni di `Pixel.lib`.

## Lezioni pratiche (costate tempo)

- **Caratteri a pixel:** Pixelify Sans unisce "fi" in un segno che sembra una A ("file" → "Ale"): legature spente
  (`font-variant-ligatures: none`). Le misure fuori dal suo reticolo si deformano: testo a 16 px, note a 12-14.
  Jacquarda Bastarda 9 (gotico a pixel) va bene per le parole, non per i numeri romani ("III" sembra "333").
- **Pixelify per il codice no:** il 5 sembra una S, il 2 una Z, e non è monospaziato. Codice, differenze e dettagli
  dei permessi usano VT323 (`--font-code`), a pixel e monospaziato, a 18-19 px perché è piccolo.
- **npm 11** non esegue lo script di installazione di Electron: `node node_modules/electron/install.js`.
- **`listSessions({ dir })`** vuole il percorso come Claude Code lo registra (`C:/cartella`); scritto in altro modo
  torna un elenco vuoto senza errore.
- **Permessi in modo `auto`:** il classificatore approva da solo le azioni chiare, quindi la domanda nella finestra
  compare di rado. Per provarla, il modo "chiedi sempre" dal selettore sopra la penna.
- **Modi dei permessi:** `setPermissionMode()` sulla `Query` li cambia a risposta in corso; i messaggi `system`
  `init` e `status` portano `permissionMode`, e il messaggero ci si allinea (`setMode(mode, true)`). Il modo piano
  finisce con lo strumento `ExitPlanMode`, che passa da `canUseTool`: il piano è in `input.plan` (o in un file,
  `planFilePath`); approvarlo risponde `allow` con `updatedPermissions: [{ type: 'setMode', mode: <quello di
  prima>, destination: 'session' }]`. Non si offrono `bypassPermissions` né `dontAsk`.
- **Screenshot dell'app:** `webContents.capturePage()` a volte fallisce con `UnknownVizError` (GPU): si riprova.
- **Non aprire la stessa sessione** nel rotolo e nell'app desktop insieme: si pestano i piedi. Il desktop vede i
  messaggi nuovi solo riaprendo la sessione.
- **Gli strumenti propri dell'app desktop** (browser integrato, avvio di altre sessioni, pannelli) dal rotolo non ci
  sono: Claude ha quelli di base di Claude Code, più i server MCP e i plugin della configurazione dell'utente.

## Verificato

- Finestra vera fotografata con `--cattura`: due scene, a 460 e 760 px di larghezza, scheda di permesso, cronache.
- Chiamate vere: risposta in pochi secondi col login dell'abbonamento; ripresa della sessione; in modo `default` una
  scrittura chiesta, negata dal ponte, file non creato; elenco delle sessioni coi titoli dell'app desktop.
- Usata dall'utente: spostata e allargata, aperta una cronaca dell'app desktop.

## Prossimi passi possibili

0. **Temi.**
   - Caratteri propri per tema, già possibili con `@font-face` nel `theme.css`: per la Terra di Mezzo, un carattere
     a pixel in stile onciale o runico con licenza libera.
   - Suoni e personaggio per tema.
   - La scelta del tema anche dalla finestra, oltre che dal vassoio: `skins.setTheme(id)` c'è già nel preload.
   - Un'eredità fra temi (`extends`), se nasceranno varianti dello stesso scheletro.
1. **Più conversazioni in schede**, ognuna col suo `query()` e la sua sessione.
2. ~~**Modifiche ai file**~~: fatto (riquadro delle differenze nella conversazione e nei permessi). Restano: le
   modifiche anche nelle cronache riaperte (oggi si ricopia solo il testo), e un riepilogo dei file toccati nel
   capitolo.
3. ~~**Scelta del modo dei permessi**~~: fatto (selettore sopra la penna, scheda del piano). Resta l'interruzione
   più fine (fermare un solo strumento, non tutta la risposta).
4. **Comandi con `/`, skill e plugin**: il motore li carica già; servono un modo di scriverli e di mostrarne l'esito.
5. **Un personaggio** in pixel art accanto al rotolo (lo sprite si disegna come le icone, a griglia), che reagisce
   al mouse e a cosa sta facendo Claude. Per la Terra di Mezzo, uno stregone grigio o un hobbit con lo zaino.
6. **Suoni** (penna che scrive, sigillo) e la mappa del viaggio che avanza a ogni conversazione.
7. **Avvio con Windows** (`app.setLoginItemSettings`) e un pacchetto installabile (electron-builder) quando l'app
   sarà stabile.

## Da adattare su un'altra macchina

- `workdir` nel `config.json`: la cartella in cui lavora Claude e di cui si vedono le cronache.
- Il percorso della CLI in `claude-bridge.js` (`%USERPROFILE%\.local\bin\claude.exe`, quello dell'installer).
- La "personalità" nel prompt di sistema: il campo `persona` del `theme.js` di ogni tema.
