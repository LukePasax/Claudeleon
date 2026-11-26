# Pergamena — come è nata, per riprenderla ed espanderla

Questo documento è per Claude (Claude Code), che lo legge prima di lavorare sull'app nella cartella `pergamena-app/`.
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

L'app è divisa in un **motore** comune (finestra, conversazione, permessi, cronache, il disegno a pixel) e in
**temi** che ne cambiano scritte, colori, disegni e tono di Claude. La guida per scrivere un tema è
`src/renderer/themes/LEGGIMI.md`.

- `src/main.js` — processo principale: finestra trasparente, senza bordi, sempre in primo piano; i clic passano alle
  finestre sotto finché il mouse non è sul rotolo (`setIgnoreMouseEvents(true, { forward: true })`, la pagina dice
  quando attivarla). Spostamento e ridimensionamento seguiti dal processo principale col cursore a 60 Hz
  (`gesture:start/end`): con una finestra trasparente il trascinamento nativo (`-webkit-app-region`) e i bordi di
  ridimensionamento di Windows non sono affidabili. Vassoio, `Ctrl+Alt+P`, configurazione in
  `%APPDATA%\pergamena-app\config.json`, modalità `--cattura` per gli screenshot di prova.
- `src/claude-bridge.js` — il "messaggero": `query()` dell'Agent SDK con `cwd`, `pathToClaudeCodeExecutable` (la CLI
  installata, così valgono il suo login e la sua versione), `permissionMode: 'auto'`, `systemPrompt: { type:
  'preset', preset: 'claude_code', append: <tono da cronista> }`, `settings: { disableAllHooks: true }`,
  `includePartialMessages: true` (eventi `stream_event` con `text_delta`), `resume` per continuare la sessione,
  `canUseTool` che gira la domanda alla finestra e aspetta la risposta (`{ behavior: 'allow', updatedPermissions }`
  per "Sempre", con le `suggestions` ricevute; `{ behavior: 'deny', message }` per "Nega"). `Query.interrupt()` per
  Ferma. `listSessions({ dir, limit })` e `getSessionMessages(id, { dir })` per le cronache: `customTitle` è il titolo
  che l'app desktop dà alle sessioni. L'SDK è un modulo ES: dal processo principale CommonJS si carica con `import()`.
- `src/themes.js` — l'elenco dei temi per il processo principale (le cartelle di `src/renderer/themes/` con un
  `theme.js`, letto con `require`): nome per il sottomenu **Tema** del vassoio e `persona` per il prompt di sistema.
  `config.theme` ricorda la scelta; il cambio arriva alla pagina con `theme:apply` e al messaggero in
  `bridge.persona`.
- `src/preload.js` — il ponte tra pagina e processo principale (`contextBridge`), niente Node nella pagina.
- `src/renderer/` — la pagina.
  - `pixel.js` è il motore del disegno: attrezzi comuni (`bitmap`, `mirror`, `seeded`, `upscale`) e i disegni di
    partenza (grana della carta, capi del rotolo, divisore, icone 8×8 dei "mestieri", lume a candela, icona del
    vassoio). Disegna dal codice a bassa risoluzione e ingrandisce senza sfumature (`image-rendering: pixelated`).
  - `theming.js` carica i temi e risponde alla pagina con quello in uso: scritte (`t(chiave)`, con le scritte di
    partenza in `STRINGS`), palette per scena (unite a quelle di partenza), variabili CSS (in linea su `body`, così
    battono `style.css`), data del capitolo e disegni (quello del tema o quello di partenza).
  - `renderer.js` gestisce la conversazione con un markdown minimo, i permessi, le cronache, la scena giorno/notte
    e i gesti. Ogni scritta tiene la chiave in `data-s`: al cambio di tema `applyStrings()` riscrive tutto sul posto.
  - `style.css` contiene i valori di partenza di tutte le variabili, su `body` e `body.giorno`. Bordi e pulsanti
    sono a gradino con `box-shadow`, le barre di scorrimento a pixel.
  - `themes/<id>/theme.js` (più l'eventuale `theme.css`) sono i temi. **Terra di Mezzo**, il predefinito: il Libro
    Rosso in cuoio con fregi d'oro e spille a foglia, rune inventate come divisore, calendario della Contea,
    l'Anello come lume (lettere di fuoco mentre Claude lavora), palantír, fiala di luce, "Non passerai" per il
    rifiuto, uno scriba di Gran Burrone come persona. **Pergamena**: il rotolo di prima, senza ridefinire nulla.

## Lezioni pratiche (costate tempo)

- **Caratteri a pixel:** Pixelify Sans unisce "fi" in un segno che sembra una A ("file" → "Ale"): legature spente
  (`font-variant-ligatures: none`). Le misure fuori dal suo reticolo si deformano: testo a 16 px, note a 12-14.
  Jacquarda Bastarda 9 (gotico a pixel) va bene per le parole, non per i numeri romani ("III" sembra "333").
- **npm 11** non esegue lo script di installazione di Electron: `node node_modules/electron/install.js`.
- **`listSessions({ dir })`** vuole il percorso come Claude Code lo registra (`C:/cartella`); scritto in altro modo
  torna un elenco vuoto senza errore.
- **Permessi in modo `auto`:** il classificatore approva da solo le azioni chiare, quindi la domanda nella finestra
  compare di rado. Per provarla, `this.mode = 'default'`.
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
   - Una struttura sostituibile per tema: ora la forma rotolo + foglio è comune a tutti, e un libro aperto o una
     mappa a tutta finestra richiederebbero di cambiare `index.html`.
   - Caratteri propri per tema, già possibili con `@font-face` nel `theme.css`: per la Terra di Mezzo, un carattere
     a pixel in stile onciale o runico con licenza libera.
   - Suoni e personaggio per tema.
   - La scelta del tema anche dalla finestra, oltre che dal vassoio: `pergamena.setTheme(id)` c'è già nel preload.
1. **Più conversazioni in schede**, ognuna col suo `query()` e la sua sessione.
2. **Modifiche ai file**: mostrare le differenze degli `Edit`/`Write` (l'`input` dello strumento ha `old_string`,
   `new_string`, `content`) in un riquadro a pixel.
3. **Interruzione più fine e scelta del modo dei permessi** dalla finestra (auto / chiedi sempre / piano).
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
