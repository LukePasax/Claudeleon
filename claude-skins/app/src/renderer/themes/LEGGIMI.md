# I temi

Ogni tema è una cartella con un `theme.js` (e, se serve, `theme.css` e altri file). Il nome della cartella è l'id
del tema e deve essere uguale al campo `id` del suo `theme.js`. I temi del programma stanno qui dentro (di serie
solo **Essenziale**); quelli importati da un file `.skin` stanno nella cartella `temi` dei dati dell'app, e la
pagina li carica da `skins-theme://<id>/`. Il tema si sceglie dalla finestra o dal vassoio (**Tema**).

Per scrivere un tema nuovo: si crea la sua cartella qui, si prova (vedi "Provare un tema"), poi dal selettore dei
temi "Esporta" lo mette in un file `.skin` da passare a chi vuole, che lo installa con "Importa un tema". Un tema di
soli colori si fa senza codice con l'editor dei temi. Oppure si chiede a Claude in una conversazione di
Claudeleon: l'app gli dà la skill `claudeleon-theme` (in `src/plugin/claudeleon/`, con la guida inglese
`docs/themes.md` copiata in `reference/guide.md` e tre esempi), e Claude scrive il tema nella cartella dei temi.

Un tema decide **tutto quello che si vede**, e non deve per forza essere in pixel art:
- la forma della finestra (il suo HTML e il suo CSS);
- i colori, le scritte e i disegni a pixel;
- la misura della finestra;
- il tono di Claude.

Il motore non sa se la finestra è un rotolo, un libro o una mappa. Trova i pezzi che gli servono attraverso gli
attributi `data-*`, ovunque il tema li metta.

Il tema si sceglie anche dalla finestra, col pulsante che ogni layout mette dove vuole (`data-action="themes"`).
Il cambio di tema avviene sul posto. L'HTML del nuovo tema prende il posto del vecchio, ma la conversazione, la
bozza nella penna e lo stato passano al nuovo tema. La finestra prende la misura del nuovo tema, e Claude ne prende
il tono dal messaggio successivo.

```
themes/
  essenziale/       kit moderno, chiaro o scuro come Windows (kit.adaptive): il tema di partenza
kits/
  pixel.css         lo stile pixel condiviso (caratteri, gradini, palette di carta): lo includono i temi pixel
  moderno.js        la struttura dei temi puliti (layout, agganci, icone SVG, anteprima): un tema dà solo i colori
  moderno.css       la forma dei temi puliti: un riquadro con l'ombra, barra laterale, fumetti, il punto che pulsa
```

Ogni cartella di tema ha il suo `theme.js` e, se serve, `theme.css` e altri file (immagini, caratteri, suoni).

## Il file `theme.js`

Lo stesso file viene letto sia dalla pagina (con `<script>`) sia, per i temi del programma, dal processo principale
(con `require`, per avere nome, misure e `persona`). Di un tema importato il processo principale non esegue mai il
codice: nome, descrizione, misure e `persona` li prende dal `theme.json` che "Esporta" scrive nel pacchetto. Per
questo comincia sempre con questo involucro:

```js
;(function (theme) {
  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})({
  id: 'mio-tema',
  name: 'Il mio tema',
  layout: `<div data-solid>...</div>`,
  // ...
})
```

Le funzioni dei disegni girano solo nella pagina, quindi possono usare `window.Pixel` e `document`. Fuori dalle
funzioni, a livello del file, invece no.

| Campo | Cosa fa | Se manca |
| --- | --- | --- |
| `id`, `name` | Identità e nome nel menu del vassoio | `id` è obbligatorio |
| `description` | Una riga per chi legge il codice | — |
| `layout` | L'HTML della finestra (vedi sotto) | Un riquadro d'avviso: serve sempre |
| `css: true` | Carica `theme.css` dalla cartella del tema | Solo lo stile comune |
| `kits` | Stili condivisi da includere prima del `theme.css`, per esempio `['pixel']` | Nessuno: lo stile neutro di `style.css` |
| `artScale` | Di quanto si ingrandiscono i disegni a pixel (`data-art`, `data-art-bg`) | 3 |
| `hooks` | Funzioni chiamate quando succede qualcosa (vedi sotto) | Nessuna |
| `window` | `{ width, height, minWidth, minHeight }` in pixel | 1080×760, minimo 360×480 |
| `persona` | Testo aggiunto al prompt di sistema di Claude Code: il tono delle risposte | Una frase neutra |
| `strings` | Le scritte dell'interfaccia (chiavi in `STRINGS` di `theming.js`) | Quelle di partenza |
| `date(d, plainDate)` | La data sotto il titolo della conversazione; `plainDate(d)` dà "26 novembre 2026" | `plainDate` |
| `scenes.notte`, `scenes.giorno` | `palette` per i disegni, `vars` per le variabili CSS | I colori di partenza |
| `art` | I disegni, per nome (vedi sotto) | Nessun disegno |

## Il layout

`layout` è una stringa HTML che finisce dentro `<div id="app">`, a tutta finestra. La finestra è trasparente:
dove il layout non disegna nulla si vede quello che c'è sotto.

### I pezzi che il motore cerca

Sono tutti facoltativi tranne `log` e `input`. Un pezzo che manca vuol dire semplicemente che quella funzione non
c'è.

| Attributo | Che cosa è |
| --- | --- |
| `data-part="log"` | Dove scorre la conversazione. Il motore vi aggiunge le voci (classe `item`); il resto del contenuto (per esempio il titolo della conversazione) resta |
| `data-part="input"` | La `textarea` dove si scrive. Invio spedisce, Maiusc+Invio va a capo |
| `data-part="input"` (menu) | Scrivendo `/` il motore apre il menu dei comandi (`.cmd-menu`, righe `.cmd`) sopra la penna, dentro il suo contenitore: il tema può ridisegnarlo nel suo CSS |
| `data-part="todos"` | Il riquadro delle attività di Claude (`.todos`, testata `.todos-head`, righe `.todo.pending/.in_progress/.completed`). Se manca, il motore lo crea subito prima del contenitore della penna |
| `data-part="tasks"` | Il pulsante delle attività in background (`.tasks-btn`, `.running` con la rotella), che apre il pannello (`.theme-picker.tasks-panel`, righe `.task-row`) |
| `data-part="files"` | Il pulsante dei file modificati (`.files-btn`, nascosto finché non ce ne sono), che apre il pannello (`.theme-picker.files-panel`, righe `.file-row`) |
| `data-part="git"` | Il pulsante di git (`.git-btn` col branch, `.dirty` se ci sono modifiche; nascosto fuori da un repo), che apre il pannello (`.theme-picker.git-panel`: branch, modifiche, commit, push, pull request). Se il tema non lo mette, il motore lo aggiunge dentro `data-part="folder"` |
| (commenti) | Su ogni riga di una differenza il pulsante `.dl-cm` (compare al passaggio), il riquadro `.dl-edit`, il commento `.dl-note`; in attesa sono `.attachment.review` nella striscia degli allegati e `.review-bar` nei pannelli; nel messaggio mandato `.sent-comments` |
| (editor dei temi) | Non è un pezzo del layout: il selettore ha la scheda `.theme-card.theme-new` ("Crea un tema") e, sui temi dell'editor, `.theme-card.mine` con `.theme-actions`; l'editor è `.theme-editor` (fuori da `#app`). I temi che crea usano il kit moderno (`SkinsKits.moderno.fromColors`) |
| (dettatura) | `data-action="dictate"` (facoltativo): il microfono. Senza, il motore mette `.attach-btn.dictate-btn` subito dopo `data-action="attach"`; c'è solo su Windows |
| (memoria) | `data-action="memory"` apre il pannello della memoria (`.theme-picker.mem-panel`: schede `.perm-tab`, editor `.mem-text`, anteprima `.mem-view`) |
| `data-part="preview"` | Facoltativo: dove va il pannello dell'anteprima (`.preview-pane`, con `.pv-bar`, `.pv-addr`, `.pv-frame`). Senza, il motore lo mette subito dopo il `<main>` del layout |
| `data-part="preview-btn"` | Facoltativo: dove va il pulsante "Anteprima · localhost:…" (`.preview-btn`); senza, sta in `data-part="tasks"`. `data-action="preview"` apre e chiude il pannello |
| `data-part="context"` | L'anello del contesto (`.context-btn`, `.warn` oltre l'80%), che apre il dettaglio (`.folder-menu.context-menu`) |
| `data-part="model"` | Il pulsante del modello e del ragionamento (`.model-btn`), che apre il menu (`.folder-menu.model-menu`) |
| `data-part="attachments"` | La striscia degli allegati (`.attachment.image`, `.attachment.file`, ognuno con `.attachment-remove`). Se manca, il motore la crea subito prima della `textarea`, nel suo contenitore |
| `data-part="folder"` | La cartella della conversazione: il motore ci mette un pulsante (`.folder-btn`) che apre il menu delle cartelle (`.folder-menu`) |
| `data-part="hint"` | Il suggerimento sotto la penna, che cambia mentre Claude lavora |
| `data-part="chapter-title"`, `data-part="chapter-date"` | Il titolo della conversazione (nuova o riaperta) e la sua data |
| `data-part="modes"` | Il selettore del modo dei permessi. Con `data-style="menu"` è un solo pulsante (`.mode-btn`) che apre il menu dei modi, come nell'app desktop; senza, il motore ci mette l'etichetta e un pulsante `.mode` per modo (`data-perm-mode`), quello attivo con `.active`. Anche `body[data-perm-mode]` dice il modo, per il CSS del tema |
| `data-part="sessions"` | Il pannello delle conversazioni salvate. Con `hidden` è in sovrimpressione: lo apre `data-action="sessions"`. Con `data-mode="always"` è sempre visibile, come la barra laterale dell'app desktop, e si aggiorna da solo |
| `data-part="sessions-search"` | Il campo di ricerca delle conversazioni (un `input`). Se manca, il motore ne crea uno (`.sessions-search`) subito sopra l'elenco |
| `data-part="sessions-list"` | Dentro il pannello: l'elenco delle conversazioni |

### I comandi: `data-action`

Su un qualunque elemento cliccabile (anche più di uno per azione):

| Azione | Che cosa fa |
| --- | --- |
| `send`, `stop` | Spedisce il messaggio; ferma Claude. Il motore mostra l'uno o l'altro (`hidden`) |
| `new` | Nuova conversazione |
| `sessions`, `sessions-close` | Apre e chiude le conversazioni salvate in sovrimpressione |
| `settings` | Apre il pannello delle impostazioni (`.theme-picker.settings-panel`, righe `.set-row`), sopra il layout come il selettore dei temi. Anche Ctrl+, |
| `artifacts` | Apre Impostazioni → Artifact: gli artifact di claude.ai pubblicati da questo computer (anche `/artifacts`) |
| `themes` | Apre il selettore dei temi: un pannello sopra il layout (dentro il primo elemento `data-solid`) con una scheda per tema, anteprima, nome e `description`. L'anteprima la disegna il motore coi disegni del tema: `paper`, poi `leather` o `roll` per la fascia in alto, e `trayIcon` |
| `scene` | Notte ↔ giorno. Se l'elemento è vuoto, il motore ci scrive il nome dell'altra scena |
| `attach` | Sceglie file o immagini dal disco da allegare al prossimo messaggio (incollare e trascinare funzionano sempre) |
| `hide`, `quit` | Riduce a icona la finestra; chiude l'app |
| `maximize`, `fullscreen` | Ingrandisce all'area di lavoro, o a tutto schermo; di nuovo, ripristina. Su un `.ctl.max` vuoto il motore disegna l'icona (un quadrato, due da ingrandita). Anche F11 e il doppio clic sulla testata |

### La finestra: `data-solid`, `data-drag`, `data-grip`

- `data-solid`: i clic sono per l'app sopra questi elementi e attraversano la finestra altrove. Di solito va sul
  contenitore principale e su ogni pezzo che sporge, come un segnalibro che pende sotto il libro.
- `data-drag`: tenendo premuto qui si sposta la finestra. Fanno eccezione i pulsanti, i campi, le righe delle
  conversazioni salvate e gli elementi con `data-no-drag`.
- `data-grip`: trascinando da qui si ridimensiona la finestra, dall'angolo in basso a destra.
- I **bordi**: il motore aggiunge da sé maniglie invisibili (`.edge`, `data-resize`) sui lati e sugli angoli del
  primo elemento `data-solid`, per ridimensionare come una finestra normale. Un tema che non le vuole mette
  `edges: false` nel `theme.js`.
- Da ingrandita o a schermo intero il corpo ha la classe `maximized` o `fullscreen`: il tema può togliere margini
  trasparenti, angoli e ombre (il kit moderno lo fa). Le maniglie spariscono.

### Scritte

- `data-s="chiave"` mette il testo.
- `data-s-placeholder` e `data-s-title` mettono il placeholder e il tooltip.

Le chiavi sono quelle di `STRINGS` in `theming.js`, ciascuna con un commento; un tema le ridefinisce in `strings`.
Al cambio di tema il motore riscrive tutto.

### Disegni

| Attributo | Che cosa fa |
| --- | --- |
| `<canvas data-art="nome">` | Il disegno `art.nome` del tema. La misura a schermo la decide il CSS del canvas; il disegno riceve quella misura divisa per la scala. Mentre si ridimensiona la finestra si ridisegna solo se la sua misura è cambiata: conviene che sia veloce |
| `data-art-fit="natural"` | La misura la decide invece il disegno (ogni pixel diventa scala×scala): per lumi, spille, segnalibri |
| `data-art-scale="2"` | La scala di questo disegno, al posto di quella del tema. Con `1` il disegno è a piena risoluzione |
| `data-art-smooth` | Ingrandito con le sfumature invece che a pixel pieni: per disegni non pixel (curve, sfumature) |
| `data-art-anim` | Ridisegnato ogni 180 ms con un fotogramma nuovo: per la candela o l'Anello |
| `data-art-arg="..."` | Un valore in più per il disegno, per esempio `destra` per specchiarlo |
| `data-art-bg="nome"` | Su qualunque elemento: il disegno come sfondo ripetuto, ingrandito a pixel pieni. Si usa per carta e cuoio. Si disegna al montaggio e al cambio di scena, non mentre si ridimensiona (un riquadro ripetuto non dipende dalla misura); `data-art-bg-resize` lo ridisegna anche allora |

## I disegni: `art`

Ogni disegno è una funzione che riceve un oggetto e restituisce un **canvas** a bassa risoluzione:

```js
art: {
  paper: ({ pal }) => Pixel.lib.paperTile(pal),
  roll: ({ w, pal }) => Pixel.lib.roll(w, pal),
  lamp: ({ pal, frame, busy }) => Pixel.lib.candle(pal, frame, busy),
}
```

L'oggetto contiene:
- `width` e `height`: la misura dell'elemento in pixel dello schermo;
- `w` e `h`: la stessa misura divisa per la scala, e `scale`, la scala;
- `pal`: la palette della scena;
- `scene`: `'notte'` o `'giorno'`;
- `frame`, il fotogramma, e `busy`, che dice se Claude sta lavorando;
- `arg`: il valore di `data-art-arg`;
- `el`: l'elemento.

I nomi dei disegni sono liberi: sono quelli che il layout usa. Tre nomi sono speciali:
- **`trayIcon({ pal })`** restituisce l'icona del vassoio: un canvas 16×16 (pixel art, ingrandito a pixel pieni) o
  32×32. Se manca, l'app usa il rotolino.
- **`preview({ pal, scene, width, height })`** disegna l'anteprima del selettore dei temi (144×90; un canvas più
  grande per lo schermo ad alta densità, uno più piccolo è pixel art e si ingrandisce a pixel pieni). Se manca, il
  motore la compone coi disegni `paper`, `leather` o `roll`, e `trayIcon`.
- **`icons`** non è una funzione ma un oggetto `{ mestiere: icona }`. I mestieri sono `leggere`, `scrivere`,
  `forgiare`, `cercare`, `messaggi`, `compagnia`, `mappa` e `altro`; `craftOf` in `renderer.js` decide quale
  strumento va con quale. Un'icona può essere:
  - le righe di una bitmap a pixel, 12×12 come quelle di partenza (lettere di colore: `o` inchiostro tenue, `p`
    carta, `w` carta chiara, `s` ombra della carta, `g` oro, `y` oro chiaro, `d` oro scuro, `r` rosso, `k` bordo
    scuro, più quelle di `palette.iconColors`);
  - un SVG scritto nel codice (`'<svg ...>'`);
  - un file della cartella del tema (`'icone/leggere.svg'`, PNG compresi);
  - un canvas;
  - una funzione `({ pal, scene, craft })` che restituisce uno di questi (per esempio un SVG nei colori della scena).

  Un mestiere che il tema non disegna prende l'icona a pixel di partenza se il tema usa il kit pixel, altrimenti
  la sua icona `altro`.

`window.Pixel` contiene:
- gli attrezzi: `canvas`, `px`, `bitmap(righe, colori)`, `mirror`, `seeded`, `upscale` e `SCALE`;
- i disegni pronti in `Pixel.lib`: `paperTile`, `roll`, `dashes`, `candle` e `trayScroll`.

## Gli agganci: `hooks`

Funzioni che il motore chiama quando succede qualcosa, per animazioni, suoni o un personaggio. Ricevono per primo
un contesto `{ root, part(nome), all(selettore), scene, busy, theme, asset(percorso), t(chiave), Pixel, redraw() }`
(`redraw` ridisegna i disegni del tema, per esempio dopo aver cambiato un `data-*` che usano). `asset`
dà l'indirizzo di un file della cartella del tema, per esempio `new Audio(ctx.asset('penna.ogg')).play()`. Poi:

| Aggancio | Quando | Dopo il contesto |
| --- | --- | --- |
| `mount`, `unmount` | Il layout del tema è appena montato; sta per essere tolto (cambio di tema) | — |
| `busy` | Claude comincia o smette di lavorare | `true` o `false` |
| `reply` | Comincia una risposta scritta | — |
| `tool` | Claude usa uno strumento | `{ name, craft, summary, change }` |
| `toolDone` | Uno strumento ha finito | `{ error }` |
| `ask` | Arriva una domanda di permesso o un piano | la domanda |
| `done`, `error` | La risposta è finita; si è fermata con un errore | `{ durationMs }`; il messaggio |
| `scene` | Notte ↔ giorno | `'notte'` o `'giorno'` |
| `chapter` | Comincia una conversazione nuova o se ne apre una salvata (la conversazione nel log è cambiata) | — |

Mentre Claude lavora, in fondo alla conversazione c'è `.item.working` (`.w-spin`, `.w-verb`, `.w-dots`, `.w-time`); una risposta suggerita è `.item.suggestions` con un `.suggestion-chip`.

Il testo di una risposta ha la classe `long-start` quando il suo primo paragrafo è lungo: i temi che hanno un
capolettera lo mettono solo lì (`.entry.claude .text.long-start > p:first-child::first-letter`).

Lo stato si vede anche dal CSS: `body.busy` mentre Claude lavora, `body.giorno` di giorno, `body[data-perm-mode]`
col modo dei permessi, `body[data-theme]` col tema. Un aggancio che va in errore non ferma l'app.

## Colori: `palette` e `vars`

- `palette` serve ai disegni a pixel. Le chiavi di partenza sono in `PALETTES` di `theming.js`, a cui si
  aggiungono quelle che servono ai disegni del tema. Si scrivono solo le chiavi che cambiano.
- `vars` serve all'interfaccia. Sono le variabili CSS elencate in cima a `style.css` (`ink`, `gold`, `edge`,
  `btn-bg`, `deny-bg`, `font-body`…), scritte senza `--`. Fra queste ci sono anche `font-code`, il carattere del
  codice e delle differenze, e `add-bg`, `del-bg`, `plus` e `minus`, i colori delle righe aggiunte e tolte. Un tema
  può aggiungerne di sue e usarle nel proprio CSS.

## `theme.css` e `style.css`

- `style.css` vale per tutti i temi ed è neutro: caratteri di sistema, bordi sottili, angoli arrotondati
  (`--radius`), colori grigi con un accento. Contiene le variabili, le voci della conversazione (domande, risposte,
  azioni, permessi, codice, differenze, menu dei comandi, selettori), i pulsanti `.btn` e `.ctl`, le righe delle
  conversazioni salvate e le barre di scorrimento. Non contiene nessuna forma di finestra.
- Un **kit** (`kits/<nome>.css`) è uno stile intero condiviso da più temi. `kits/pixel.css` porta i caratteri a
  pixel, la palette di carta di partenza, angoli vivi e bordi a gradino, il capolettera, le barre a pixel.
- Un kit può avere anche la sua struttura in JS (`kits/<nome>.js`), quando più temi hanno la stessa forma e cambiano
  solo i colori. `kits/moderno.js` è una funzione `kit({ id, name, description, look })` che restituisce il tema
  intero: layout, agganci, icone, anteprima e vassoio vengono dal kit, il tema dà solo `look.palette` (i colori dei
  disegni) e `look.vars` (le variabili CSS). Lo carica `index.html` prima dei temi; un `theme.js` lo prende da
  `window.SkinsKits.moderno` nella pagina e con `require('../../kits/moderno.js')` nel processo principale. I temi
  del kit hanno un aspetto solo, chiaro o scuro, per tutte e due le scene, e non mostrano il pulsante notte/giorno.
  Oltre alle variabili di `style.css`, `kits/moderno.css` legge `side-bg`, `frame-shadow`, `box-shadow`, `you-bg` e
  `you-edge` (fondo della barra laterale, ombre, fumetto delle domande).
- `theme.css` è attivo solo mentre il tema è in uso, quindi le regole non hanno bisogno di prefissi. Contiene la
  forma della finestra e può ridefinire qualunque cosa di `style.css`.
- Un carattere nuovo va nella cartella del tema e si dichiara con `@font-face` nel `theme.css`, con un percorso
  relativo. Sono ammessi solo file locali.

## Lingue

L'app è in inglese o in italiano. Le `strings` di un tema possono essere per lingua (`strings: { en: {...}, it:
{...} }`) o le stesse per tutte; quelle che il tema non dà vengono dal motore nella lingua scelta. Anche nome e
descrizione possono avere la versione per lingua (`names: { it: '...' }`, `descriptions: { it: '...' }`) e la
`persona` può essere `{ en: '...', it: '...' }`.

## Passare un tema ad altri: il file `.skin`

"Esporta" (sulla scheda del tema, nel selettore) salva un JSON `{ format: 'claude-skins-theme', version: 1, kind, … }`:
- `kind: 'code'`: `manifest` (`id`, `name`, `description`, `persona`, `window`) e `files`, tutti i file della cartella
  in base64 (`theme.js`, `theme.css`, `fonts/…`). Sono ammessi solo js, css, json, immagini (png, jpg, gif, webp,
  svg), caratteri (woff, woff2, ttf, otf), txt e md, fino a 25 MB, senza percorsi che escono dalla cartella.
- `kind: 'colors'`: `spec`, un tema dell'editor (nove colori, carattere, dimensione del testo, angoli).

"Importa un tema" controlla il file, chiede conferma per un tema con codice (gira nella finestra, con accesso alle
conversazioni) e lo installa in `temi/<id>/` (uno con lo stesso id si sostituisce, chiedendo). L'id non può essere
quello di un tema del programma. I file del tema si raggiungono con percorsi relativi: `url('fonts/x.woff2')` nel
`theme.css`, `ctx.asset('penna.ogg')` negli agganci (dà `themes/<id>/…` o `skins-theme://<id>/…` secondo dove sta).

## Un tema del kit moderno in due righe

Per un tema pulito basta il kit: `kit.fromColors({ id, name, colors: { bg, side, surface, ink, inkSoft, accent,
onAccent, line, bubble }, font, textSize, radius })` ricava tutte le variabili, e `kit.adaptive({ id, name,
description, light, dark })` fa un tema chiaro/scuro che segue Windows (`followSystem`), come Essenziale.

## Provare un tema

- **Nel browser**, senza Electron e senza Claude: aprire `src/renderer/index.html?tema=<id>&scena=giorno`. Una
  conversazione finta risponde a quello che si scrive e ci sono alcune conversazioni finte. Nella console,
  `anteprima.tema('<id>')` cambia tema sul posto e `anteprima.permesso()` mostra una domanda di permesso. Un tema
  nuovo va aggiunto all'elenco di `fakeApi` in `renderer.js`. Con gli strumenti di sviluppo del browser si prova
  anche la misura minima.
- **Nella finestra vera:** `electron . --cattura prova.png giorno chat --tema <id>`, con la misura del tema, oppure
  aggiungendo per esempio `900x640` dopo `chat`.
- **Dal vivo, nell'app installata:** si mette il tema nella cartella `temi` dei dati dell'app
  (`%APPDATA%\Claudeleon\temi\<id>\` con `theme.json` e `theme.js`, oppure un solo `<id>.json`). Compare nel
  selettore entro un secondo; se è il tema in uso, ogni file salvato lì si ricarica nella finestra. È così che lavora
  Claude con la skill.
