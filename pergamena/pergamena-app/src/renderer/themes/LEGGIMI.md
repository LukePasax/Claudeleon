# I temi

Ogni tema è una cartella qui dentro. Il nome della cartella è l'id del tema, e deve essere uguale al campo `id` del
suo `theme.js`. L'app trova da sola le cartelle all'avvio; si sceglie il tema dal vassoio (**Tema**). Il cambio
avviene sul posto: la conversazione resta e Claude prende il tono del nuovo tema dal messaggio successivo.

```
themes/
  pergamena/        il rotolo di partenza: non ridefinisce quasi nulla, è l'esempio minimo
    theme.js
  terra-di-mezzo/   il Libro Rosso: ridefinisce scritte, colori, disegni e calendario
    theme.js
    theme.css
```

## Il file `theme.js`

Lo stesso file viene letto sia dalla pagina (con un tag `<script>`) sia dal processo principale (con `require`,
per avere nome e `persona`). Per questo comincia sempre con questo involucro:

```js
;(function (theme) {
  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.PergamenaThemes = window.PergamenaThemes || []).push(theme)
})({
  id: 'mio-tema',
  name: 'Il mio tema',
  // ...tutto il resto è facoltativo
})
```

Le funzioni dei disegni girano solo nella pagina. Nel processo principale vengono definite ma mai chiamate, quindi
possono usare `window.Pixel` e `document`; a livello del file, fuori dalle funzioni, invece no.

| Campo | Cosa fa | Se manca |
| --- | --- | --- |
| `id`, `name` | Identità e nome nel menu del vassoio | `id` è obbligatorio |
| `description` | Una riga per chi legge il codice | — |
| `persona` | Testo aggiunto al prompt di sistema di Claude Code: il tono delle risposte | Una frase neutra in `claude-bridge.js` |
| `strings` | Le scritte dell'interfaccia (chiavi in `STRINGS` di `theming.js`) | Quelle del rotolo di partenza |
| `date(d, plainDate)` | La data sotto il titolo del capitolo; `plainDate(d)` dà "26 novembre 2026" | `plainDate` |
| `scenes.notte`, `scenes.giorno` | `palette` per la pixel art, `vars` per le variabili CSS | I colori di partenza |
| `art` | I disegni che il tema sostituisce (vedi sotto) | Quelli di `pixel.js` |
| `css: true` | Carica anche `theme.css` dalla cartella del tema | Nessun foglio in più |

### Scritte

Le chiavi sono quelle dell'oggetto `STRINGS` in `theming.js`, ciascuna con un commento. `{s}` e `{dir}` vengono
sostituiti con la durata e la cartella di lavoro. `notte` e `giorno` sono i nomi delle due scene; il pulsante sotto
il rotolo mostra il nome dell'altra scena.

### Colori: `palette` e `vars`

- `palette` è per i disegni a pixel. Contiene le chiavi di `PALETTES` in `theming.js` (`paper`, `roll`, `knob`,
  `gold`, `goldLight`, `inkSoft`, `red`, `flame`, `wax`…), più quelle che servono ai disegni del tema. Si scrivono
  solo le chiavi che cambiano; le altre restano quelle di partenza. `iconColors` aggiunge lettere di colore alle
  icone (vedi sotto).
- `vars` è per l'interfaccia: sono le variabili CSS elencate in cima a `style.css` (`ink`, `gold`, `edge`,
  `title-ink`, `btn-bg`, `deny-bg`, `font-body`, `font-display`…), scritte senza il `--` iniziale. Un tema può anche
  aggiungere variabili sue e usarle nel proprio `theme.css` (Terra di Mezzo aggiunge `green`).

### Disegni: `art`

Tutti si disegnano a un terzo della risoluzione: un pixel del disegno diventa 3×3 sullo schermo. Gli attrezzi
comuni sono in `window.Pixel`: `canvas`, `px`, `bitmap(righe, colori)`, `mirror`, `seeded`, `upscale`, `SCALE`.

| Funzione | Restituisce | Note |
| --- | --- | --- |
| `paperTile(pal)` | data URL | La grana del foglio, ripetuta sullo sfondo |
| `roll(larghezzaCss, pal, 'top'\|'bottom')` | canvas alto 12 | I due capi; il titolo sta sopra al centro del capo alto |
| `divider(larghezzaCss, pal)` | canvas | Sotto il titolo del capitolo; l'altezza la decide il disegno |
| `lamp(pal, fotogramma, occupato)` | canvas | Accanto alla penna, ridisegnato ogni 180 ms; la misura la decide il disegno |
| `trayIcon(pal)` | data URL 32×32 | L'icona del vassoio |
| `icons` | oggetto `{ mestiere: righe 8×8 }` | Solo le icone che cambiano |

I mestieri delle icone sono `leggere`, `scrivere`, `forgiare`, `cercare`, `messaggi`, `compagnia`, `mappa` e
`altro`; `craftOf` in `renderer.js` decide quale strumento va con quale. I colori di partenza delle icone sono
`o` inchiostro tenue, `p` carta chiara, `g` oro, `y` oro chiaro e `r` rosso; `palette.iconColors` ne aggiunge altri.

### `theme.css`

Ogni regola deve cominciare con `body[data-theme="<id>"]`, perché i fogli di tutti i temi sono caricati insieme.
Serve per quello che le variabili non coprono: bordi diversi, un capolettera speciale, un carattere in più.
Un carattere nuovo va nella cartella del tema e si dichiara con `@font-face` nel `theme.css`, con un percorso
relativo al file stesso. La politica di sicurezza della pagina accetta solo file locali.

## Provare un tema

- **Nel browser**, senza Electron e senza Claude: aprire `src/renderer/index.html?tema=<id>&scena=giorno`. Una
  conversazione finta risponde a quello che si scrive. Nella console, `anteprima.tema('<id>')` cambia tema sul
  posto e `anteprima.permesso()` mostra una domanda di permesso. L'elenco dei temi dell'anteprima è scritto in
  `fakeApi` in `renderer.js`: un tema nuovo va aggiunto lì per vederlo nel browser.
- **Nella finestra vera:** `electron . --cattura prova.png giorno chat 460x760 --tema <id>`.

## Cosa resta fuori dai temi, per ora

La forma della finestra (rotolo con due capi e foglio in mezzo), la disposizione degli elementi e i caratteri a
pixel di partenza sono comuni a tutti i temi. Per un tema con una forma diversa (ad esempio un libro aperto a due
pagine) il passo successivo è permettere a un tema di sostituire anche la struttura di `index.html`.
