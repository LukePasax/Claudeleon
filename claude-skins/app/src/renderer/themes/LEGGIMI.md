# I temi

Ogni tema è una cartella qui dentro. Il nome della cartella è l'id del tema e deve essere uguale al campo `id` del
suo `theme.js`. L'app trova da sola le cartelle all'avvio, e il tema si sceglie dalla finestra o dal vassoio (**Tema**).

Un tema decide **tutto quello che si vede**:
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
  pergamena/        il rotolo: due capi arrotolati, foglio in mezzo, cronache in sovrimpressione
    theme.js
    theme.css
  terra-di-mezzo/   il Libro Rosso aperto: annali sempre visibili a sinistra, conversazione a destra
    theme.js
    theme.css
```

## Il file `theme.js`

Lo stesso file viene letto sia dalla pagina (con `<script>`) sia dal processo principale (con `require`, per avere
nome, misure e `persona`). Per questo comincia sempre con questo involucro:

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
| `window` | `{ width, height, minWidth, minHeight }` in pixel | 1080×760, minimo 360×480 |
| `persona` | Testo aggiunto al prompt di sistema di Claude Code: il tono delle risposte | Una frase neutra |
| `strings` | Le scritte dell'interfaccia (chiavi in `STRINGS` di `theming.js`) | Quelle di partenza |
| `date(d, plainDate)` | La data sotto il titolo del capitolo; `plainDate(d)` dà "26 novembre 2026" | `plainDate` |
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
| `data-part="log"` | Dove scorre la conversazione. Il motore vi aggiunge le voci (classe `item`); il resto del contenuto (per esempio il titolo del capitolo) resta |
| `data-part="input"` | La `textarea` dove si scrive. Invio spedisce, Maiusc+Invio va a capo |
| `data-part="input"` (menu) | Scrivendo `/` il motore apre il menu dei comandi (`.cmd-menu`, righe `.cmd`) sopra la penna, dentro il suo contenitore: il tema può ridisegnarlo nel suo CSS |
| `data-part="hint"` | Il suggerimento sotto la penna, che cambia mentre Claude lavora |
| `data-part="chapter-title"`, `data-part="chapter-date"` | Il titolo del capitolo, o della cronaca aperta, e la sua data |
| `data-part="modes"` | Il selettore del modo dei permessi: il motore ci mette l'etichetta e un pulsante `.mode` per modo (`data-perm-mode`), quello attivo con `.active`. Anche `body[data-perm-mode]` dice il modo, per il CSS del tema |
| `data-part="sessions"` | Il pannello delle cronache. Con `hidden` è in sovrimpressione: lo apre `data-action="sessions"`. Con `data-mode="always"` è sempre visibile, come la barra laterale dell'app desktop, e si aggiorna da solo |
| `data-part="sessions-list"` | Dentro il pannello: l'elenco delle cronache |

### I comandi: `data-action`

Su un qualunque elemento cliccabile (anche più di uno per azione):

| Azione | Che cosa fa |
| --- | --- |
| `send`, `stop` | Spedisce il messaggio; ferma Claude. Il motore mostra l'uno o l'altro (`hidden`) |
| `new` | Nuovo capitolo |
| `sessions`, `sessions-close` | Apre e chiude le cronache in sovrimpressione |
| `themes` | Apre il selettore dei temi: un pannello sopra il layout (dentro il primo elemento `data-solid`) con una scheda per tema, anteprima, nome e `description`. L'anteprima la disegna il motore coi disegni del tema: `paper`, poi `leather` o `roll` per la fascia in alto, e `trayIcon` |
| `scene` | Notte ↔ giorno. Se l'elemento è vuoto, il motore ci scrive il nome dell'altra scena |
| `hide`, `quit` | Nasconde la finestra; chiude l'app |

### La finestra: `data-solid`, `data-drag`, `data-grip`

- `data-solid`: i clic sono per l'app sopra questi elementi e attraversano la finestra altrove. Di solito va sul
  contenitore principale e su ogni pezzo che sporge, come il segnalibro del Libro Rosso.
- `data-drag`: tenendo premuto qui si sposta la finestra. Fanno eccezione i pulsanti, i campi, le righe delle
  cronache e gli elementi con `data-no-drag`.
- `data-grip`: trascinando da qui si ridimensiona la finestra, dall'angolo in basso a destra.

### Scritte

- `data-s="chiave"` mette il testo.
- `data-s-placeholder` e `data-s-title` mettono il placeholder e il tooltip.

Le chiavi sono quelle di `STRINGS` in `theming.js`, ciascuna con un commento; un tema le ridefinisce in `strings`.
Al cambio di tema il motore riscrive tutto.

### Disegni

| Attributo | Che cosa fa |
| --- | --- |
| `<canvas data-art="nome">` | Il disegno `art.nome` del tema, a pixel. La misura a schermo la decide il CSS del canvas; il disegno riceve quella misura divisa per 3 |
| `data-art-fit="natural"` | La misura la decide invece il disegno (ogni pixel diventa 3×3): per lumi, spille, segnalibri |
| `data-art-anim` | Ridisegnato ogni 180 ms con un fotogramma nuovo: per la candela o l'Anello |
| `data-art-arg="..."` | Un valore in più per il disegno, per esempio `destra` per specchiarlo |
| `data-art-bg="nome"` | Su qualunque elemento: il disegno come sfondo ripetuto, ingrandito a pixel pieni. Si usa per carta e cuoio |

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
- `w` e `h`: la stessa misura divisa per 3;
- `pal`: la palette della scena;
- `scene`: `'notte'` o `'giorno'`;
- `frame`, il fotogramma, e `busy`, che dice se Claude sta lavorando;
- `arg`: il valore di `data-art-arg`;
- `el`: l'elemento.

I nomi dei disegni sono liberi: sono quelli che il layout usa. Due nomi sono speciali:
- **`trayIcon()`** restituisce l'icona del vassoio, 16×16. Se manca, l'app usa il rotolino.
- **`icons`** non è una funzione ma un oggetto `{ mestiere: righe 8×8 }`, con solo le icone che cambiano. I
  mestieri sono `leggere`, `scrivere`, `forgiare`, `cercare`, `messaggi`, `compagnia`, `mappa` e `altro`;
  `craftOf` in `renderer.js` decide quale strumento va con quale. Le lettere di colore sono `o` inchiostro tenue,
  `p` carta chiara, `g` oro, `y` oro chiaro e `r` rosso; `palette.iconColors` ne aggiunge altre.

`window.Pixel` contiene:
- gli attrezzi: `canvas`, `px`, `bitmap(righe, colori)`, `mirror`, `seeded`, `upscale` e `SCALE`;
- i disegni pronti in `Pixel.lib`: `paperTile`, `roll`, `dashes`, `candle` e `trayScroll`.

## Colori: `palette` e `vars`

- `palette` serve ai disegni a pixel. Le chiavi di partenza sono in `PALETTES` di `theming.js`, a cui si
  aggiungono quelle che servono ai disegni del tema. Si scrivono solo le chiavi che cambiano.
- `vars` serve all'interfaccia. Sono le variabili CSS elencate in cima a `style.css` (`ink`, `gold`, `edge`,
  `btn-bg`, `deny-bg`, `font-body`…), scritte senza `--`. Fra queste ci sono anche `font-code`, il carattere del
  codice e delle differenze, e `add-bg`, `del-bg`, `plus` e `minus`, i colori delle righe aggiunte e tolte. Un tema
  può aggiungerne di sue e usarle nel proprio CSS.

## `theme.css` e `style.css`

- `style.css` vale per tutti i temi. Contiene le variabili, le voci della conversazione (domande, risposte, azioni,
  permessi, codice, differenze delle modifiche ai file), i pulsanti `.pix` e `.ctl`, le righe delle cronache e le barre di scorrimento. Non contiene
  nessuna forma di finestra.
- `theme.css` è attivo solo mentre il tema è in uso, quindi le regole non hanno bisogno di prefissi. Contiene la
  forma della finestra e può ridefinire qualunque cosa di `style.css`.
- Un carattere nuovo va nella cartella del tema e si dichiara con `@font-face` nel `theme.css`, con un percorso
  relativo. Sono ammessi solo file locali.

## Provare un tema

- **Nel browser**, senza Electron e senza Claude: aprire `src/renderer/index.html?tema=<id>&scena=giorno`. Una
  conversazione finta risponde a quello che si scrive e ci sono quattro cronache finte. Nella console,
  `anteprima.tema('<id>')` cambia tema sul posto e `anteprima.permesso()` mostra una domanda di permesso. Un tema
  nuovo va aggiunto all'elenco di `fakeApi` in `renderer.js`. Con gli strumenti di sviluppo del browser si prova
  anche la misura minima.
- **Nella finestra vera:** `electron . --cattura prova.png giorno chat --tema <id>`, con la misura del tema, oppure
  aggiungendo per esempio `900x640` dopo `chat`.
