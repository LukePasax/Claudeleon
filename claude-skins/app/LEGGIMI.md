# Claude Skins

Claude in una finestra in pixel art, grande come l'app desktop e (se si vuole) sempre in primo piano. Forma e
aspetto vengono dal tema. Quello di partenza è **Terra di Mezzo**: il Libro Rosso aperto, con gli annali a sinistra
e la conversazione a destra. C'è anche **Pergamena**, il rotolo fantasy senza un mondo preciso, e **Moderno**,
pulito come un'app di oggi, senza pixel art. Altri temi si
aggiungono come cartelle in `src/renderer/themes/`, ognuno con il proprio scheletro (guida:
[`src/renderer/themes/LEGGIMI.md`](src/renderer/themes/LEGGIMI.md)).

## Installazione

Serve Windows con [Node.js](https://nodejs.org) LTS e Claude Code installato a parte, con il login fatto
(`irm https://claude.ai/install.ps1 | iex`, poi `claude` e `/login`).

Basta fare doppio clic su `avvia.cmd`, qui o quello nella cartella principale del repo, che fa lo stesso. La prima volta (e dopo ogni clone nuovo, perché `node_modules` non sta nel
repo) installa da sola le dipendenze ed Electron, in qualche minuto; le volte dopo parte subito.

A mano: `npm install` nella cartella dell'app. Lo script `postinstall` scarica anche il binario di Electron, che con
npm 11 altrimenti non arriva.

## Uso

- **Avvio:** doppio clic su `avvia.cmd`. La finestra compare al centro dello schermo, grande come l'app desktop
  (Terra di Mezzo 1180×780, Pergamena 1080×760, mai oltre il 92% dello schermo).
- **Spostare e allargare:** si trascina dalla testata (il capo alto del rotolo, la copertina del libro); la
  maniglia a gradini in basso a destra allarga e allunga. Posizione e dimensione restano, e la dimensione è
  ricordata per tema. Dal vassoio: "Riporta al centro" e "Dimensione iniziale".
- **Bordi e ingrandimento:** la finestra si ridimensiona da tutti i lati e gli angoli, come una finestra normale. Il
  pulsante accanto a "nascondi" (o il doppio clic sulla testata) la ingrandisce all'area di lavoro; F11 la porta a
  tutto schermo; di nuovo, si ripristina. Spostarla da ingrandita la riporta alla sua misura.
- **Sempre in primo piano:** dal vassoio si può spegnere, ora che la finestra è grande.
- **Scorciatoia:** `Ctrl+Alt+P` mostra o nasconde la finestra da qualunque programma; c'è anche l'icona nel vassoio.
- **Tema:** dalla finestra ("temi" sotto il rotolo, "altri libri" in fondo alla pagina sinistra del Libro Rosso,
  "Temi" in fondo alla barra laterale di Moderno), con
  un'anteprima di ogni tema, oppure dal vassoio, **Tema**. Cambia sul posto (forma della finestra compresa) senza perdere la conversazione;
  Claude prende il tono del nuovo tema dal messaggio successivo. Il pulsante "stelle"/"Contea" (o "notte"/"giorno")
  passa da una scena all'altra.
- **Conversazione:** Invio spedisce, Maiusc+Invio va a capo. "nuovo capitolo" ricomincia la conversazione; quella
  corrente prosegue fra un avvio e l'altro.
- **Claude Code:** comandato con l'Agent SDK (`@anthropic-ai/claude-agent-sdk`) sopra
  `%USERPROFILE%\.local\bin\claude.exe`, con il prompt di sistema di Claude Code più la "personalità" del tema (lo
  scriba di Gran Burrone per Terra di Mezzo, il cronista per Pergamena). Gli hook dell'utente sono spenti per queste
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
  laterale dell'app desktop (le sue comprese, coi loro titoli); accanto alla data c'è la cartella. Nel Libro Rosso
  sono sempre visibili sulla pagina sinistra; nel rotolo si aprono col pulsante "cronache". Aprendone una si vedono
  gli ultimi 40 messaggi con le azioni di Claude e il loro esito, le modifiche ai file (chiuse: si aprono con un
  clic sulla riga), i comandi con `/` e la loro uscita; i messaggi dopo la continuano nella sua cartella. Non aprire qui una sessione che è aperta
  anche nell'app desktop.
- **Cartella di lavoro:** dal vassoio, "Cartella di lavoro…": è dove nascono le conversazioni nuove (quelle riprese
  restano nella loro cartella).
- **Configurazione:** `%APPDATA%\Claude Skins\config.json`: `workdir` (la cartella in cui nascono le
  conversazioni nuove; vuota, la cartella utente), posizione, dimensione per tema, scena, capitolo, sessione e sua
  cartella, tema, modo dei permessi, sempre in primo piano. Al primo avvio riprende quella di `pergamena-app`.
- **Prove:** `node_modules\electron\dist\electron.exe . --cattura <file.png> [notte|giorno] [chat|cronache]
  [LxA] [--tema <id>]` (senza LxA, la misura del tema) disegna una conversazione finta (con una domanda di permesso) o l'elenco delle cronache, salva
  uno screenshot della finestra ed esce, senza chiamare Claude. Per guardare un tema senza Electron basta aprire
  `src/renderer/index.html?tema=<id>` nel browser.

Caratteri (tutti sotto SIL Open Font License): Pixelify Sans, Jacquarda Bastarda 9 e VT323 (per il codice) nel kit
pixel; Alegreya e Uncial Antiqua nel tema Terra di Mezzo; il tema Moderno usa quelli di sistema (Google Fonts, licenza SIL Open Font License).
