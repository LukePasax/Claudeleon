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

**Pergamena tolto (novembre 2026).** Il tema del rotolo generico era un residuo del Libro Rosso e tenerlo aggiornato
costava: l'utente l'ha fatto togliere. Resta nella storia del repo (commit precedenti a quello che lo toglie); il kit
pixel e `Pixel.lib` (carta, capo del rotolo, candela, rotolino del vassoio, sfere, rumore) restano, perché il Libro
Rosso e i valori di partenza li usano. Una configurazione con `theme: 'pergamena'` ripiega sul tema predefinito.

**Temi non solo pixel (novembre 2026).** Lo stile pixel non è più del motore: `style.css` è neutro (caratteri di
sistema, bordi sottili, `--radius`) e la pixel art sta nel kit `kits/pixel.css`, che Pergamena e Terra di Mezzo
includono (`kits: ['pixel']`). Un tema può dare icone SVG o immagini, disegni a qualunque scala (`artScale`,
`data-art-scale`, `data-art-smooth`), la sua anteprima nel selettore (`art.preview`) e agganci agli eventi
(`hooks`). Il tema **Moderno** lo dimostra: niente pixel, barra laterale, fumetti, icone SVG, un punto che pulsa con
l'azione in corso. La divisione del CSS è stata verificata confrontando pixel per pixel le foto dei due temi pixel
prima e dopo: identiche.

**Libro Rosso più leggibile.** I caratteri a pixel stancavano nella lettura: il tema Terra di Mezzo tiene la pixel
art nelle decorazioni (copertina, spille, rune, Anello, icone) ma il testo è in Alegreya (un carattere da libro), i
titoli in Uncial Antiqua (onciale da manoscritto), il codice nel monospaziato di sistema; i file sono nella cartella
del tema, licenza OFL. Il capolettera è una grande iniziale onciale rossa senza riquadro, e in tutti i temi compare
solo su un primo paragrafo lungo (classe `long-start`, da 160 caratteri): su una frase breve staccava la prima
lettera ("cco quanto mi chiedi"). Cuoio della copertina appena granulato.

**Lo scrittoio (27 novembre 2026).** Il libro non convinceva come struttura: dopo i mockup (mappa, scrittoio, pietra,
miniatura; quattro stili: pixel, vettoriale, acquerello, incisione) e una variante "soft" vicina all'app desktop,
l'utente ha scelto lo scrittoio di Casa Baggins. Terra di Mezzo è stato riscritto da capo: niente kit pixel, disegni
ad acquerello in SVG (feTurbulence + feDisplacementMap per i bordi rotti, mix-blend-mode multiply per le stesure,
grana della carta) generati come stringhe in `theme.js`. Pareti e finestra tonda sono immagini di sfondo `data:`;
il foglio dipende dalla misura, quindi si disegna in un canvas (SVG → Image → canvas) che il CSS allarga mentre si
ridimensiona, e si ridisegna 140 ms dopo che la misura si ferma. Gli indirizzi `blob:` non vanno: da una pagina
`file://` il CSS non li carica. La candela è SVG in linea: la fiamma tremola in CSS, più svelta con `body.busy`. La
mappa del viaggio, l'Anello e il resto della pixel art del libro sono stati tolti (stanno nella storia di git).

**Più Terra di Mezzo (novembre 2026, poi sostituito dallo scrittoio).** L'utente trovava il Libro Rosso poco riconoscibile. Aggiunti: la mappa del
viaggio sulla pagina sinistra (pixel art procedurale nello stile delle mappe dei libri, non copiata: mare, Contea,
Vecchia Foresta, Montagne Nebbiose, Bosco Atro, Lothlórien, Anduin, Mordor e il Monte Fato che arde), con il
viandante che avanza di una tappa a ogni messaggio del capitolo (Hobbiville, Brea, Colle Vento, Gran Burrone,
Moria, Lothlórien, Amon Hen, Paludi Morte, Ithilien, Cirith Ungol, Monte Fato) e la tappa scritta sotto; frasi di
cammino a caso al posto di "Lo scriba è in cammino" mentre Claude lavora. Solo nomi di luoghi e cose, nessuna
citazione. Il motore ha guadagnato l'aggancio `chapter` e `redraw()` nel contesto degli agganci.

**Pixel art più fine.** Pergamena e Terra di Mezzo disegnano a ×2 invece che a ×3 (`artScale: 2`), e i disegni sono
quasi tutti procedurali: carta a macchie morbide senza giunture (rumore a valori periodico, `Pixel.valueNoise`, con
le macchie che decidono solo la probabilità dei pixel chiari e scuri: le soglie nette facevano forme che si
ripetevano), capi del rotolo a 18 fasce con pomelli sferici (`Pixel.sphere`), candela a goccia, grana del cuoio,
spilla a foglia come lente inclinata, rune tracciate a linee (`Pixel.line`) con ombra, Anello 19×19, segnalibro in
seta. Le icone degli strumenti sono 12×12 a ×2 (24 px), generate con un piccolo script di forme.

L'app è divisa in un **motore** comune (finestra, conversazione, permessi, cronache, gli attrezzi del disegno a
pixel) e in **temi** che decidono tutto quello che si vede: forma della finestra (HTML e CSS), misura, scritte,
colori, disegni e tono di Claude. Il motore non conosce la forma: cerca i pezzi per attributo (`data-part="log"`,
`data-action="send"`, `data-drag`, `data-art`...) e delega gli eventi al documento, così un cambio di tema sostituisce
tutto l'HTML e la conversazione passa al nuovo layout. La guida per scrivere un tema è `src/renderer/themes/LEGGIMI.md`.

- `src/main.js` — processo principale: finestra trasparente, senza bordi, nella barra delle applicazioni (riduci a
  icona invece di nascondere; sempre in primo piano solo se acceso dal vassoio, `onTop: true`); i clic passano alle
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
  - `markdown.js` rende il markdown delle risposte: un piccolo parser a blocchi (titoli, paragrafi, elenchi annidati
    e con caselle, citazioni, tabelle con allineamento, codice con il linguaggio, linee) e in linea (codice, link,
    indirizzi, grassetto, corsivo, barrato). Tutto il testo è sfuggito; solo http, https e mailto diventano link, e
    si aprono nel browser di sistema (`link:open` → `shell.openExternal`, che ricontrolla il protocollo). `_` e `__`
    chiudono solo prima di spazio o punteggiatura, così `__init__.py` e `my_var` restano come sono. Funzioni pure,
    si provano con node.
  - `diff.js` calcola le differenze riga per riga (sottosequenza comune più lunga, dopo aver tolto le righe uguali
    in testa e in coda; oltre 4 milioni di celle mostra blocco tolto e blocco aggiunto) e le raggruppa con 3 righe
    di contesto. Funzioni pure, si provano con node.
  - `pixel.js` contiene gli attrezzi del disegno (`bitmap`, `mirror`, `seeded`, `upscale`), le icone 12×12 dei
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
  - `themes/<id>/` sono i temi. **Terra di Mezzo**, il predefinito: lo scrittoio di Casa Baggins ad acquerello
    (pareti di legno, finestra tonda sulla Contea, foglio coi bordi rotti, candela), con la struttura dell'app
    desktop; calendario della Contea, frasi del cammino, "Non passerai" per il rifiuto, uno scriba di Gran Burrone
    come persona. **Moderno**: pulito, barra laterale, icone SVG.

## Lezioni pratiche (costate tempo)

- **Caratteri a pixel:** Pixelify Sans unisce "fi" in un segno che sembra una A ("file" → "Ale"): legature spente
  (`font-variant-ligatures: none`). Le misure fuori dal suo reticolo si deformano: testo a 16 px, note a 12-14.
  Jacquarda Bastarda 9 (gotico a pixel) va bene per le parole, non per i numeri romani ("III" sembra "333").
- **Pixelify per il codice no:** il 5 sembra una S, il 2 una Z, e non è monospaziato. Codice, differenze e dettagli
  dei permessi usano VT323 (`--font-code`), a pixel e monospaziato, a 18-19 px perché è piccolo.
- **npm 11** non esegue lo script di installazione di Electron: `node node_modules/electron/install.js`.
- **`listSessions({ dir })`** vuole il percorso come Claude Code lo registra (`C:/cartella`); scritto in altro modo
  torna un elenco vuoto senza errore.
- **Le cronache sono di tutte le cartelle:** `listSessions({ limit })` senza `dir` le elenca tutte, ognuna con la
  sua `cwd`. Una sessione si riprende solo nella cartella in cui è nata: aprendone una, `session:open` passa la sua
  `cwd`, che diventa `bridge.sessionCwd` (e `config.sessionCwd`); un capitolo nuovo nasce in `workdir`. Prima le
  cronache erano solo di `workdir`, e dopo il cambio di nome dell'app (configurazione nuova, `workdir` vuota = la
  cartella utente) le sessioni dell'app desktop sparivano: ora la configurazione di `pergamena-app` si recupera al
  primo avvio, e la cartella di lavoro si sceglie dal vassoio.
- **Permessi in modo `auto`:** il classificatore approva da solo le azioni chiare, quindi la domanda nella finestra
  compare di rado. Per provarla, il modo "chiedi sempre" dal selettore sopra la penna.
- **Cronache riaperte:** `history()` ricostruisce la sessione da `getSessionMessages` in voci ordinate (domande,
  risposte, azioni con l'esito dal `tool_result`, comandi con `/` da `<command-name>`/`<command-args>`, uscite da
  `<local-command-stdout>`); i sottoagenti (`parent_tool_use_id`) restano fuori. Le differenze sono "del passato"
  (`change(..., true)`): di un `Write` il contenuto scritto allora, di un `Edit` la riga si cerca col testo nuovo.
- **Che cosa fa Claude, a parole:** `intent()` nel messaggero traduce ogni azione in `{ text }` (il campo
  `description` che Claude scrive per Bash, Agent...) o `{ verb, target }`, che la pagina rende con le scritte
  `tool_<verbo>`. Con `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES=1` nell'`env` della query, Claude Code manda messaggi
  `tool_use_summary` (`summary`, `preceding_tool_use_ids`): la pagina raccoglie quelle azioni in un gruppo chiuso sotto
  la frase. La variabile non è nei tipi pubblici dell'SDK (la si trova in `sdk.mjs`): se una versione non la onora,
  restano le frasi per azione.
- **La cartella della conversazione:** `data-part="folder"`, con il menu delle cartelle recenti (dalle cronache) e il
  dialogo di sistema (`workdir:choose`, `workdir:set`). `workdirChosen` dice se la persona ne ha scelta una: se no, il
  primo messaggio apre il menu e parte dopo la scelta.
- **Comandi con `/`:** si eseguono spedendo il testo `/nome argomenti` come prompt. L'elenco viene da
  `Query.supportedCommands()` (nome, descrizione, `argumentHint`, alias, `builtin`), aggiornato dai messaggi
  `system` `commands_changed`; quelli di `terminal_slash_commands` (nel messaggio `init`) non si offrono. Per averlo
  prima del primo messaggio, `loadCommands()` avvia una query con un prompt in streaming che non manda mai nulla,
  chiede i comandi e chiude: nessun costo. Cache in `commands.json` accanto a `config.json`. I comandi locali
  rispondono con `system` `local_command_output` (o con `<local-command-stdout>` in un messaggio utente, o solo nel
  `result`): il messaggero li gira come `commandOutput`. `/compact` manda `compact_boundary` e lo stato
  `compacting`. `/clear` e `/new` li intercetta la pagina: nuovo capitolo.
- **Modi dei permessi:** `setPermissionMode()` sulla `Query` li cambia a risposta in corso; i messaggi `system`
  `init` e `status` portano `permissionMode`, e il messaggero ci si allinea (`setMode(mode, true)`). Il modo piano
  finisce con lo strumento `ExitPlanMode`, che passa da `canUseTool`: il piano è in `input.plan` (o in un file,
  `planFilePath`); approvarlo risponde `allow` con `updatedPermissions: [{ type: 'setMode', mode: <quello di
  prima>, destination: 'session' }]`. Non si offrono `bypassPermissions` né `dontAsk`.
- **Finestra trasparente e ingrandimento:** `maximize()` di Electron non va con una finestra trasparente: lo fa il
  processo principale (`setWinMode`: area di lavoro, schermo intero, misura di prima in `restoreBounds`). I bordi
  sono maniglie (`.edge`) che il motore aggiunge al primo `data-solid`; il gesto `resize:<lati>` tiene fermo il lato
  opposto.
- **Ridimensionare senza scatti:** a ogni fotogramma si ridisegnano solo i canvas `data-art` la cui misura è
  cambiata, mai gli sfondi ripetuti (carta, cuoio: procedurali, costosi, e indipendenti dalla misura). Capi del
  rotolo a righe intere e sfere in cache: da 8-11 ms a 0,5-1 ms per fotogramma.
- **Provare i gesti su Linux (Xvfb):** `setIgnoreMouseEvents(true, { forward: true })` non inoltra il movimento su
  Linux, quindi la pagina non riceve nulla finché un movimento simulato (Playwright) non la sblocca; il cursore
  "vero" per il processo principale si muove con `xdotool`. Su Windows l'inoltro funziona.
- **Screenshot dell'app:** `webContents.capturePage()` a volte fallisce con `UnknownVizError` (GPU): si riprova.
- **Non aprire la stessa sessione** nel rotolo e nell'app desktop insieme: si pestano i piedi. Il desktop vede i
  messaggi nuovi solo riaprendo la sessione.
- **Gli strumenti propri dell'app desktop** (browser integrato, avvio di altre sessioni, pannelli) dal rotolo non ci
  sono: Claude ha quelli di base di Claude Code, più i server MCP e i plugin della configurazione dell'utente.

- **Allegati:** con immagini, `send()` passa a `query()` un flusso di un solo `SDKUserMessage` (blocchi `image` base64
  prima del testo); senza, una stringa (che questa versione dell'SDK scrive comunque come messaggio utente su stdin,
  quindi i server MCP in-process funzionano anche così). I file vanno come percorsi in `<attached_files>` in fondo al
  testo, e la pagina li rimostra come etichette. Il percorso di un file trascinato o incollato viene da
  `webUtils.getPathForFile` nel preload (`File.path` non c'è più). Da verificare su Windows: con la finestra che lascia
  passare i clic (`setIgnoreMouseEvents`), il trascinamento da Esplora file potrebbe non arrivare se il cursore non è
  già "dentro" una parte disegnata; incolla e "+" funzionano comunque.
- **Sessioni e app desktop** (dai report del 27/11, poi tolti): senza `CLAUDE_CODE_ENTRYPOINT` l'SDK segna le
  sessioni `sdk-ts`, e gli elenchi (il `/resume` del terminale, le app) le scartano come programmatiche: ora il ponte
  passa `cli` (configurabile con `entrypoint` in config.json). Le sessioni del desktop sono `claude-desktop`; se il
  desktop mostrasse solo quelle, la prova successiva è `"entrypoint": "claude-desktop"`. Hook accesi solo al primo
  messaggio (`disableAllHooks: !!resume`); la soluzione completa è un processo che resta vivo per la conversazione
  (prompt come stream). Titolo con il server in-process `ccd_session_mgmt`. La CLI in `~/.local/bin` può essere di
  una versione diversa da quella del desktop.

## Verificato

- Finestra vera fotografata con `--cattura`: due scene, a 460 e 760 px di larghezza, scheda di permesso, cronache.
- Chiamate vere: risposta in pochi secondi col login dell'abbonamento; ripresa della sessione; in modo `default` una
  scrittura chiesta, negata dal ponte, file non creato; elenco delle sessioni coi titoli dell'app desktop.
- Usata dall'utente: spostata e allargata, aperta una cronaca dell'app desktop.

## Prossimi passi possibili

0. **Temi.**
   - Terra di Mezzo, altre idee di riferimenti non ancora fatte: un hobbit a pixel che fuma la pipa accanto alla
     mappa e fa anelli di fumo mentre Claude lavora; un'iscrizione in segni "elfici" inventati che compare
     sull'Anello; suoni leggeri (penna, pagina che si gira).
   - Caratteri propri per tema, già possibili con `@font-face` nel `theme.css`: per la Terra di Mezzo, un carattere
     a pixel in stile onciale o runico con licenza libera.
   - Suoni e personaggio per tema.
   - ~~La scelta del tema dalla finestra~~: fatto (`data-action="themes"`, pannello con le anteprime).
   - Un'eredità fra temi (`extends`), se nasceranno varianti dello stesso scheletro.
1. **Più conversazioni in schede**, ognuna col suo `query()` e la sua sessione.
2. ~~**Modifiche ai file**~~: fatto (riquadro delle differenze nella conversazione, nei permessi e nelle cronache
   riaperte). Resta un riepilogo dei file toccati nel capitolo.
3. ~~**Scelta del modo dei permessi**~~: fatto (selettore sopra la penna, scheda del piano). Resta l'interruzione
   più fine (fermare un solo strumento, non tutta la risposta).
4. ~~**Comandi con `/`, skill e plugin**~~: fatto (menu sopra la penna, uscita dei comandi locali). Resta da provare
   con i comandi veri su Windows quali escono come testo e quali come risposta di Claude.
5. **Un personaggio** in pixel art accanto al rotolo (lo sprite si disegna come le icone, a griglia), che reagisce
   al mouse e a cosa sta facendo Claude. Per la Terra di Mezzo, uno stregone grigio o un hobbit con lo zaino.
6. **Suoni** (penna che scrive, sigillo) e la mappa del viaggio che avanza a ogni conversazione.
7. **Avvio con Windows** (`app.setLoginItemSettings`) e un pacchetto installabile (electron-builder) quando l'app
   sarà stabile.

## Da adattare su un'altra macchina

- `workdir` nel `config.json`: la cartella in cui lavora Claude e di cui si vedono le cronache.
- Il percorso della CLI in `claude-bridge.js` (`%USERPROFILE%\.local\bin\claude.exe`, quello dell'installer).
- La "personalità" nel prompt di sistema: il campo `persona` del `theme.js` di ogni tema.
