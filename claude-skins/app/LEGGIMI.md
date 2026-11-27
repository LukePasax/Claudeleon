# Claude Skins

Claude in una finestra a temi, grande come l'app desktop, che si usa come un'app normale. Forma e
aspetto vengono dal tema. Quello di partenza è **Terra di Mezzo**: lo scrittoio di Casa Baggins ad acquerello,
con la struttura dell'app desktop (annali a sinistra sotto la finestra tonda, conversazione sul foglio, candela
accanto alla penna). Ci sono anche **Metrios** e **Dream**, puliti come un'app di oggi, coi colori dei due software (Metrios scuro con
l'azzurro, Dream chiaro col verde). Altri temi si
aggiungono come cartelle in `src/renderer/themes/`, ognuno con il proprio scheletro (guida:
[`src/renderer/themes/LEGGIMI.md`](src/renderer/themes/LEGGIMI.md)).

## Installazione

Serve Windows con [Node.js](https://nodejs.org) LTS e Claude Code installato a parte, con il login fatto
(`irm https://claude.ai/install.ps1 | iex`, poi `claude` e `/login`).

### Come app installata (consigliato)

Doppio clic su `crea-installer.cmd` (qui o nella cartella principale del repo). La prima volta scarica gli strumenti
(electron-builder), poi crea `dist\Claude Skins Setup <versione>.exe` e apre la cartella. Si lancia l'installer:
chiede dove installare (di partenza nella cartella dell'utente, senza diritti di amministratore), mette Claude Skins
nel menu Start e sul desktop con la sua icona, e alla fine lo apre. Si disinstalla da Impostazioni → App.

- L'installer non è firmato: Windows SmartScreen può dire "Windows ha protetto il PC". Si va avanti con
  "Ulteriori informazioni" → "Esegui comunque".
- Configurazione, temi scelti e conversazioni restano gli stessi della versione da `avvia.cmd`
  (`%APPDATA%\Claude Skins`, e le sessioni sono quelle di Claude Code). Disinstallare non li cancella.
- **Aggiornamenti:** l'app installata sa da quale clone del repo è nata e a quale commit (li scrive `npm run dist`).
  All'avvio e ogni 6 ore fa `git fetch` lì: se il branch ha novità, o il repo è più avanti dell'app installata (un
  pull fatto senza reinstallare), compare un avviso in alto, con una notifica, e "Aggiorna" fa da sola `git pull`,
  `npm install` se sono cambiate le dipendenze, l'installer nuovo, e lo lancia in silenzio: si installa sopra e
  riapre l'app. Nelle impostazioni, "Aggiornamenti": lo stato, le novità, "Controlla ora" e l'interruttore del
  controllo automatico. Con modifiche non salvate nel repo non aggiorna (si fa a mano). Il diario dell'ultimo
  aggiornamento è in `%APPDATA%\Claude Skins\aggiornamento.log`. Lanciata da `avvia.cmd`, l'app fa il pull e si
  riavvia.
- Il pacchetto non contiene Claude Code: usa quello installato (`~/.local/bin/claude.exe`).

### Dal repo, senza installare

Doppio clic su `avvia.cmd`, qui o quello nella cartella principale del repo, che fa lo stesso. La prima volta (e dopo
ogni clone nuovo, perché `node_modules` non sta nel repo) installa da sola le dipendenze ed Electron, in qualche
minuto; le volte dopo parte subito.

A mano: `npm install` nella cartella dell'app. Lo script `postinstall` scarica anche il binario di Electron, che con
npm 11 altrimenti non arriva. `npm run dist` crea l'installer (serve Windows, o Wine per l'icona dell'eseguibile);
`npm run pack` solo la cartella dell'app impacchettata.

## Uso

- **Avvio:** dal menu Start o dal desktop (app installata), o doppio clic su `avvia.cmd`. La finestra compare al centro dello schermo, grande come l'app desktop
  (Terra di Mezzo 1180×780, Metrios e Dream 1100×760, mai oltre il 92% dello schermo).
- **Spostare e allargare:** si trascina dalla testata (la trave in alto in Terra di Mezzo, la barra in alto di Metrios e Dream); la
  maniglia a gradini in basso a destra allarga e allunga. Posizione e dimensione restano, e la dimensione è
  ricordata per tema. Dal vassoio: "Riporta al centro" e "Dimensione iniziale".
- **Bordi e ingrandimento:** la finestra si ridimensiona da tutti i lati e gli angoli, come una finestra normale. Il
  pulsante accanto a "riduci a icona" (o il doppio clic sulla testata) la ingrandisce all'area di lavoro; F11 la porta a
  tutto schermo; di nuovo, si ripristina. Spostarla da ingrandita la riporta alla sua misura.
- **Come un'app:** la finestra sta nella barra delle applicazioni con l'icona del tema, e "–" la riduce a icona lì
  (non sparisce fra le icone nascoste). Non sta sopra le altre finestre, a meno di accendere "Sempre in primo
  piano" dal vassoio. Una domanda di permesso fa lampeggiare l'icona nella barra se la finestra è ridotta o dietro.
- **Scorciatoie:** Ctrl+N nuova conversazione, Ctrl+K cerca negli annali, Ctrl+F cerca nella conversazione (una barra
  in alto: le corrispondenze si evidenziano, Invio e Maiusc+Invio avanti e indietro, Esc chiude), Ctrl+Maiusc+C
  copia l'ultima risposta, Ctrl+B manda in background quello che Claude sta facendo, Ctrl+, impostazioni, Esc ferma Claude, F11 schermo intero. L'elenco è anche nelle
  impostazioni.
- **Impostazioni:** l'ingranaggio in fondo alla barra laterale (Terra di Mezzo) o "Impostazioni" in fondo alla barra (Metrios e
  Dream), Ctrl+, o il vassoio. Tutto vale subito: tema e scena; sempre in primo piano, avvio con Windows, riporta al
  centro e dimensione iniziale; notifiche; cartella di lavoro, permessi, modello, ragionamento e ultracode; il
  programma di Claude Code (percorso, se c'è e la sua versione, per sceglierne un altro) e come si presentano le
  sessioni alle altre app (`entrypoint`); versione, scorciatoia e cartella dei dati.
- **Server MCP e plugin:** dalle impostazioni, "Estensioni" → "Apri…". Per ogni server MCP lo stato (collegato,
  non si collega, serve l'accesso, spento), da dove viene e quanti strumenti ha; un interruttore lo accende o lo
  spegne e "Riconnetti" ritenta quelli in errore. Per i plugin quelli caricati, quelli spenti e quelli accesi che non
  si sono caricati, con un interruttore che li accende o spegne per tutte le conversazioni (`enabledPlugins` nelle
  impostazioni dell'utente di Claude Code, scritte da Claude Code stesso, poi i plugin si ricaricano). Le risposte le
  dà il Claude Code della conversazione in vista, o uno temporaneo. Server e plugin nuovi si aggiungono da Claude
  Code (`/mcp`, `/plugin`, `claude mcp add`).
- **Notifiche:** quando la finestra non è davanti (ridotta a icona o dietro ad altre), una notifica di Windows dice
  che Claude ha finito (con l'inizio della risposta), che chiede un permesso, una scelta o l'approvazione di un piano,
  o che si è fermato; nel titolo c'è il nome della conversazione. Un clic riporta davanti la finestra, e tornandoci le
  notifiche aperte si chiudono. Si spengono dal vassoio, "Notifiche". Perché Windows le mostri, all'avvio l'app crea
  (o aggiorna) il collegamento "Claude Skins" nel menu Start, con lo stesso identificativo dell'app.
- **Icona:** l'app ha la sua, uguale per tutti i temi (tre "pelli" sovrapposte con una stellina, `build/icon.ico`):
  eseguibile, installer, menu Start e barra delle applicazioni. Il tema cambia solo l'icona del vassoio e quella della
  finestra (Alt+Tab): per Terra di Mezzo la porta tonda, per Metrios e Dream il quadrato con la stellina.
- **Scorciatoia:** `Ctrl+Alt+P` riporta davanti la finestra da qualunque programma, o la riduce a icona se è già
  davanti; lo stesso fa un clic sull'icona del vassoio.
- **Tema:** dalla finestra ("Altre stanze" in fondo alla barra dello scrittoio,
  "Temi" in fondo alla barra laterale di Metrios e Dream), con
  un'anteprima di ogni tema, oppure dal vassoio, **Tema**. Cambia sul posto (forma della finestra compresa) senza perdere la conversazione;
  Claude prende il tono del nuovo tema dal messaggio successivo. Il pulsante "Accendi le stelle"/"Apri le imposte" (o "notte"/"giorno")
  passa da una scena all'altra.
- **Domande di Claude:** quando Claude chiede di scegliere (AskUserQuestion) compare una scheda con le opzioni da
  cliccare (una o più), la loro spiegazione, l'anteprima se c'è e un campo per rispondere a parole; "Rispondi"
  manda le scelte, "Salta" chiude senza rispondere. Con una sola domanda a scelta singola basta un clic.
- **Attività:** la lista dei passi di Claude (TodoWrite, TaskCreate/TaskUpdate) sta in un riquadro sopra la penna,
  con quello in corso in evidenza e quelli fatti barrati; chiuso mostra il conto e il passo in corso. Si chiude da sé
  quando è tutto fatto e torna con le cronache riaperte. Questi strumenti non compaiono come righe nella conversazione.
- **Modello e ragionamento:** accanto alla cartella, il pulsante del modello apre l'elenco dei modelli che Claude Code
  mette a disposizione (letto all'avvio, poi ricordato), i livelli di ragionamento coi nomi dell'app desktop (Low,
  Medium, High, Extra, Max) e l'interruttore **Ultracode** (orchestrazione dinamica dei flussi di lavoro). Valgono
  subito, anche a conversazione accesa, e si ricordano (`model`, `effort`, `ultracode` in config.json). I modi dei permessi stanno in un menu a tendina, come nell'app desktop.
- **La penna:** Invio spedisce, Maiusc+Invio va a capo. Su una riga di lista ("- …", "* …", "1. …", anche "- [ ] …")
  Maiusc+Invio apre la voce dopo (coi numeri che crescono), e su una voce vuota la lista finisce; Tab e Maiusc+Tab
  rientrano la voce; Ctrl+B e Ctrl+I mettono grassetto e corsivo. La casella cresce col testo. Tutto si annulla con
  Ctrl+Z.
- **@ per citare un file:** scrivendo `@` (all'inizio o dopo uno spazio) sopra la casella compare l'elenco dei file
  e delle cartelle della cartella della conversazione, filtrato da quello che si scrive dopo (prima il nome, poi il
  percorso). Frecce per scegliere, Tab o Invio per mettere il percorso; una cartella lascia l'elenco aperto per
  scendere dentro. L'elenco viene da `git ls-files` se la cartella è un repo (senza i file ignorati), altrimenti dalle
  cartelle, senza quelle pesanti (`node_modules`, `bin`, `obj`…). Claude riceve `@percorso` come in Claude Code.
- **Modificare un messaggio:** sotto un tuo messaggio, passandoci sopra, "Modifica" lo riapre sul posto. Spedito,
  la conversazione riparte da prima di quel messaggio e quello che veniva dopo sparisce; la conversazione di prima
  resta negli annali com'era (la nuova è una sessione biforcata). Con "Riporta anche i file a prima di questo
  messaggio" Claude Code rimette i file com'erano a quel punto (vale per le modifiche fatte con l'app da ora in poi,
  che salva una copia dei file prima di ogni modifica). Non si modifica mentre Claude lavora.
- **Risposte suggerite:** dopo una risposta Claude Code prevede il prossimo messaggio (`promptSuggestions`): sotto la
  risposta compare un pulsante che lo manda con un clic, e nella casella vuota il testo in grigio, che Tab scrive
  nella casella. Non c'è al primo turno né in modo piano (lo decide Claude Code).
- **Claude sta lavorando:** in fondo alla conversazione una riga con un verbo a caso ("Rimuginando", "Elucubrando"…;
  in Terra di Mezzo lo scriba), i puntini che si accendono e i secondi, finché la risposta non è finita. I verbi sono
  la scritta `workingVerbs` del tema, separati da `|`.
- **Copiare:** ogni blocco di codice ha un pulsante "copia" nell'angolo (passandoci sopra) che copia solo il suo
  contenuto, per esempio una bozza da incollare in una mail; sotto ogni risposta e ogni domanda, passandoci sopra,
  "Copia" copia il messaggio intero (le risposte col loro markdown).
- **Ragionamento:** quando Claude ragiona prima di rispondere compare una riga "Sta ragionando…" col testo che
  scorre sotto; finito, diventa "Ha ragionato per N s" e si riapre con un clic. Anche nelle cronache riaperte. Il
  testo è il riassunto che Claude Code chiede all'API (`showThinkingSummaries`): con un modello che non lo manda
  resta solo la riga.
- **Attività in background:** i comandi che Claude lascia girare, i sotto-agenti e i monitor. Accanto ai file
  modificati compare "N in background" (con la rotella finché qualcosa è in corso); un clic apre l'elenco: cosa fa,
  stato, da quanto, quanti strumenti ha usato, l'ultimo e il riassunto finale, con "Ferma" e "Uscita" (il file con
  l'uscita). Mentre Claude lavora, "Manda in background" (o Ctrl+B) sposta in background il comando o il sotto-agente
  in corso, come nel terminale, e Claude va avanti. Con attività in corso la conversazione non si spegne da sola.
- **Copia separata per ogni conversazione (worktree):** nel menu della cartella (o nelle impostazioni) si accende
  "Una copia separata per ogni conversazione". Da lì, nei repo git, il primo messaggio di una conversazione nuova crea
  una copia del repo in `.claude/worktrees/<nome>` (nome dalle prime parole del messaggio) su un branch suo,
  `claude/<nome>`, partito dal branch della cartella principale; Claude lavora lì, e la cartella principale non si tocca.
  Più conversazioni sullo stesso progetto non si pestano i piedi. Il pulsante del branch prende il colore della copia;
  nel pannello di git, oltre a commit, push e pull request, "Unisci in <base>" porta i commit della copia nella
  cartella principale (serve che lì si sia sulla base e che nella copia sia tutto committato; con un conflitto
  l'unione si annulla) e "Elimina la copia" la toglie (chiede conferma se ci sono modifiche senza commit o commit non
  uniti, che restano comunque nel branch). La cartella `.claude/worktrees/` è esclusa da git solo in locale
  (`.git/info/exclude`).
- **Commenti sulle differenze:** passando su una riga di una differenza (nella conversazione, nei file modificati, nel
  pannello di git) compare un "+": un clic apre un commento su quella riga (Invio per aggiungerlo). I commenti restano
  in attesa come etichette sopra la penna (× per toglierne uno) e, nei pannelli, in una barra con "Manda a Claude";
  partono con il prossimo messaggio, anche vuoto, con file, riga e codice, e nel messaggio mandato si vedono come una
  lista. Valgono per la conversazione in cui li scrivi.
- **Git:** se la cartella della conversazione è un repo, accanto alla cartella compare il branch (con il numero di
  file modificati e "↑N" per i commit non ancora mandati). Un clic apre il pannello: cambiare branch o crearne uno
  nuovo; le modifiche rispetto all'ultimo commit, file per file con le differenze; il commit di tutto (Ctrl+Invio nel
  messaggio), anche con il push subito dopo; il push (la prima volta collega il branch a origin) e la pull request
  verso il branch principale, con titolo e descrizione presi dai commit. La pull request si crea col comando `gh`
  (GitHub CLI) se è installato e collegato; senza, il branch viene pubblicato e si apre la pagina del sito per
  crearla. "Lo scrive Claude" e "La scrive Claude" chiedono invece a Claude, nella conversazione, di fare il commit o
  la pull request scrivendo lui messaggio, titolo e descrizione. Lo stato si rilegge a fine risposta, cambiando
  conversazione e tornando alla finestra.
- **File modificati:** quando Claude modifica dei file, accanto al contesto compare "N file +a −r". Un clic apre
  l'elenco dei file della conversazione, con le righe aggiunte e tolte e un segno per quelli nuovi; un clic su un file
  mostra tutte le sue modifiche, e "Apri" e "Cartella" lo aprono col programma di sistema o in Esplora file. Vale per
  le modifiche viste nella conversazione (anche nelle cronache riaperte); quelle fallite non contano, e modificando un
  messaggio restano solo quelle di prima.
- **Contesto:** accanto a "Spedisci" un anello dice quanto è pieno il contesto della conversazione (rosso oltre
  l'80%); passandoci sopra la percentuale e i token, con un clic il dettaglio per categoria (prompt di sistema,
  strumenti, memoria, conversazione, riserva, spazio libero) e "Compatta ora" (`/compact`). Si aggiorna a fine di
  ogni risposta e dopo una compattazione (`getContextUsage` dell'SDK). Per una cronaca appena riaperta c'è subito una
  stima, dai token dell'ultima risposta salvata; il conto vero arriva dopo la prima risposta. Nello stesso riquadro
  c'è l'**utilizzo del piano**, come nell'app desktop: la sessione di 5 ore e la settimana (e per modello, se ci
  sono), con la percentuale e quando si azzerano. Lo dà Claude Code all'avvio e dopo le risposte (un'interfaccia
  ancora sperimentale dell'SDK; solo con l'abbonamento claude.ai).
- **Allegati:** immagini e file, come nell'app desktop. Si incolla uno screenshot (Ctrl+V) o dei file copiati in
  Esplora file, si trascinano file sulla finestra, o si sceglie col pulsante "+" accanto ai modi. Sopra la penna
  compaiono come miniature ed etichette, ciascuna con la sua ×. Le immagini partono come immagini (rimpicciolite oltre
  1568 px di lato); gli altri file partono come percorsi in fondo al messaggio (`<attached_files>`) e Claude li apre
  coi suoi strumenti. Nella conversazione e nelle cronache riaperte le immagini restano in miniatura.
- **Conversazione:** Invio spedisce, Maiusc+Invio va a capo. "nuovo capitolo" ricomincia la conversazione; quella
  corrente prosegue fra un avvio e l'altro.
- **Claude Code:** comandato con l'Agent SDK (`@anthropic-ai/claude-agent-sdk`) sopra
  `%USERPROFILE%\.local\bin\claude.exe`, con il prompt di sistema di Claude Code più la "personalità" del tema (lo
  scriba di Gran Burrone per Terra di Mezzo, diretto e conciso per Metrios e Dream). Gli hook dell'utente sono spenti per queste
  conversazioni.
- **Comandi con `/`:** scrivendo `/` all'inizio della penna si apre l'elenco dei comandi di Claude Code, comprese
  le tue skill, i plugin e i comandi del progetto (con la tacca verde). Si filtra scrivendo; frecce per scegliere,
  Tab o Invio per completare, Invio di nuovo per spedire, Esc per chiudere. I comandi locali come `/usage` e
  `/context` rispondono in un riquadro a parte; `/compact` lascia una nota con i token prima e dopo; `/clear` (o
  `/new`) apre un nuovo capitolo. L'elenco si aggiorna a ogni avvio senza spedire messaggi, e resta in cache.
- **Risposte:** markdown completo (titoli, elenchi annidati, tabelle, citazioni, caselle, codice). I link si aprono
  nel browser di sistema, mai dentro la finestra; le immagini restano link.
- **Modifiche ai file:** quando Claude usa `Edit`, `MultiEdit` o `Write`, sotto la riga dello strumento compare il
  riquadro delle differenze (righe tolte in rosso, aggiunte in verde, numeri di riga del file quando si trovano) e
  nella riga il conto `+N −M`; un clic sulla riga lo chiude e lo riapre, oltre le 16 righe c'è "mostra altre N
  righe". La stessa vista compare nella domanda di permesso, così si vede cosa si sta approvando. Per un `Write` il
  "prima" si legge dal disco: se il file è già stato scritto si vede il contenuto intero.
- **Permessi:** sopra la penna si sceglie il modo, che resta fra un avvio e l'altro e vale anche per la risposta in
  corso:
  - **automatico**: un classificatore approva le azioni chiare e chiede solo quando non sa;
  - **chiedi sempre**: chiede prima di ogni azione a rischio (comandi, modifiche, rete);
  - **accetta modifiche**: le modifiche ai file passano, comandi e rete si chiedono;
  - **piano**: Claude legge e propone un piano senza toccare nulla. Il piano compare in una scheda con "Approva il
    piano" (Claude procede, nel modo di prima) e "Continua a pianificare".

  Le domande compaiono nella conversazione con Permetti, Sempre e Nega, e con le differenze se riguardano un file.
- **Cronache (annali):** le sessioni di Claude Code di tutte le cartelle, le più recenti prima, come nella barra
  laterale dell'app desktop (le sue comprese, coi loro titoli), raggruppate per giorno (oggi, ieri, ultimi 7 e 30
  giorni, più vecchie); accanto all'ora c'è la cartella e il branch git. In cima un campo di ricerca filtra per
  titolo, cartella e branch. Ogni conversazione ha un menu ("⋯" passandoci sopra, o il tasto destro): **Rinomina**
  (sul posto, Invio salva), **Archivia** (resta sul disco e sparisce dall'elenco; le archiviate si vedono in fondo)
  ed **Elimina** (chiede conferma e cancella il transcript). Sono sempre
  visibili nella barra laterale. Aprendone una si vedono
  gli ultimi 40 messaggi (in cima "Carica i messaggi precedenti" porta gli altri, 40 alla volta, senza spostare
  quello che si sta leggendo) con le azioni di Claude e il loro esito, le modifiche ai file (chiuse: si aprono con un
  clic sulla riga), i comandi con `/` e la loro uscita; i messaggi dopo la continuano nella sua cartella. Non aprire qui una sessione che è aperta
  anche nell'app desktop.
- **Cartella di lavoro:** accanto ai permessi c'è la cartella della conversazione; un clic apre le cartelle recenti
  (prese dalle cronache) e "Scegli un'altra cartella…". Cambiarla a conversazione iniziata apre un capitolo nuovo,
  perché una conversazione resta nella sua cartella. Se non ne hai mai scelta una, il primo messaggio la chiede. C'è
  anche nel vassoio, "Cartella di lavoro…".
- **Che cosa fa Claude:** ogni azione si legge a parole ("Legge MapView.cpp", "Cerca «DrawRoads» nel codice", o la
  descrizione che Claude ha scritto per un comando), col dettaglio tecnico accanto. Quando Claude Code manda la frase
  che riassume un gruppo di azioni, le azioni si raccolgono sotto di lei e si aprono con un clic.
- **Configurazione:** `%APPDATA%\Claude Skins\config.json`: `workdir` (la cartella in cui nascono le
  conversazioni nuove; vuota, la cartella utente), posizione, dimensione per tema, scena, capitolo, sessione e sua
  cartella, tema, modo dei permessi, sempre in primo piano; `entrypoint` (come si presentano le sessioni a Claude
  Code, normalmente `cli`: così compaiono nel `/resume` del terminale e negli elenchi delle altre app). Al primo
  avvio riprende quella di `pergamena-app`.
- **Più conversazioni insieme:** come nell'app desktop. "Nuovo capitolo" apre una conversazione nuova senza fermare
  quella di prima, che continua a lavorare; dagli annali si passa da una all'altra, e quelle aperte restano come le
  si era lasciate (anche a metà risposta). Negli annali un punto segna quelle che non sono in vista: pulsa mentre
  lavorano, è rosso se aspettano un permesso o una risposta, pieno (col titolo in grassetto) se hanno una risposta
  nuova. Le notifiche arrivano anche per una conversazione che non è in vista, e un clic porta a lei. Le
  conversazioni rimaste vuote se ne vanno da sole.
- **Un solo Claude Code per conversazione:** resta acceso dal primo messaggio finché la conversazione cambia (capitolo
  nuovo, cronaca aperta), si esce dall'app o resta ferma 30 minuti; poi il messaggio dopo lo riaccende riprendendo la
  sessione. Le risposte partono prima, e si può scrivere mentre Claude lavora: il messaggio entra nel turno in corso,
  come nell'app desktop. Gli hook dell'utente funzionano come altrove: `SessionStart` all'accensione, `SessionEnd`
  allo spegnimento. "Ferma" interrompe la risposta senza spegnere. Il tema cambiato vale dalla prossima accensione;
  modello, ragionamento, ultracode e modo dei permessi subito.
- **Titolo della conversazione:** l'app dà a Claude lo strumento `set_session_title` con lo stesso nome dell'app
  desktop (`mcp__ccd_session_mgmt__set_session_title`, server MCP in-process); scrive la riga `custom-title` nel
  transcript con `renameSession` dell'SDK, senza chiedere il permesso, e le cronache si ricaricano.
- **Prove automatiche:** doppio clic su `prove.cmd` (qui o nella cartella principale), o `npm run test:all`.
  `npm test` sono le prove della logica (ponte con un Claude Code finto e sessioni scritte su disco, file per @,
  aggiornamento con repo git creati al volo: `test/unit`, col test runner di Node), un paio di secondi;
  `npm run test:ui` quelle della finestra (la pagina vera con l'API finta veloce, `?veloce`, dentro Electron, guidata da
  playwright-core, per ogni tema: `test/ui`), una ventina di secondi. L'aggiornamento automatico lancia `npm test`
  prima di creare l'installer e si ferma se una prova non passa.
- **Prove a mano:** `node_modules\electron\dist\electron.exe . --cattura <file.png> [notte|giorno] [chat|cronache]
  [LxA] [--tema <id>]` (senza LxA, la misura del tema) disegna una conversazione finta (con una domanda di permesso) o l'elenco delle cronache, salva
  uno screenshot della finestra ed esce, senza chiamare Claude. Per guardare un tema senza Electron basta aprire
  `src/renderer/index.html?tema=<id>` nel browser.

Caratteri (tutti sotto SIL Open Font License): Pixelify Sans, Jacquarda Bastarda 9 e VT323 (per il codice) nel kit
pixel; Alegreya e Uncial Antiqua nel tema Terra di Mezzo; i temi Metrios e Dream usano quelli di sistema (Google Fonts, licenza SIL Open Font License).
