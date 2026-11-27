# Report: le conversazioni dell'app non fanno partire gli hook dell'utente

27/11/2026 — trovato usando l'app su Windows, insieme all'app desktop di Claude.

## Il problema

Chi ha degli hook in `~/.claude/settings.json` (ad esempio `SessionStart` e `SessionEnd` che creano un log di
sessione, sincronizzano file o fanno un backup) li vede partire nelle sessioni dell'app desktop o della CLI, ma
**non in quelle aperte da Claude Skins**. Non c'è nessun errore: semplicemente non succede niente, e ce ne si accorge
solo quando manca quello che l'hook avrebbe dovuto produrre.

## La causa

È voluto. `app/src/claude-bridge.js`, in `send()`, passa a `query()` dell'Agent SDK:

```js
// Queste conversazioni non fanno partire gli hook dell'utente (log di sessione, backup)
settings: { disableAllHooks: true },
```

La riga c'è dal commit `2e6f24b` ("Estrai Pergamena dallo zip"). La stessa opzione sta anche in `loadCommands()`, e lì
è giusta: quella chiamata serve solo a leggere l'elenco dei comandi, e non è una conversazione vera.

### Come si vede nei transcript

Nei file `~/.claude/projects/<cartella>/<sessione>.jsonl`:

| | Sessione dell'app desktop | Sessione di Claude Skins |
|---|---|---|
| `entrypoint` | `claude-desktop` | `sdk-ts` |
| Voci `hook_success` / `hook_additional_context` | presenti | assenti |

## Perché probabilmente è stato spento tutto

L'app apre un processo di Claude Code **a ogni messaggio**: prompt come stringa e `resume` sulla sessione. Ogni
risposta è quindi un avvio (`SessionStart`, origine `resume`) e una chiusura (`SessionEnd`). Con gli hook sempre
accesi, uno di backup partirebbe a ogni messaggio, con tempi e commit che si moltiplicano.

## Proposta di correzione

In `send()`, eseguire gli hook solo sul primo messaggio di una conversazione nuova:

```js
// Gli hook dell'utente partono una volta per conversazione: al primo messaggio. I messaggi successivi riprendono
// la sessione con un processo nuovo, e farli ripartire a ogni risposta moltiplicherebbe backup e log
settings: { disableAllHooks: !!resume },
```

- Il primo messaggio fa partire `SessionStart` con origine `startup` (log di sessione creato, contesto
  dell'hook passato a Claude) e, a fine risposta, `SessionEnd`.
- I messaggi successivi non eseguono hook.
- `loadCommands()` resta com'è.

Limite noto: `SessionEnd` gira alla fine della **prima** risposta, non alla fine della conversazione. Per un hook di
backup vuol dire che il lavoro dei messaggi successivi lo salva il prossimo avvio, non questa conversazione. Una
soluzione completa richiederebbe un processo che resta vivo per tutta la conversazione (prompt come stream invece che
come stringa), così da avere un solo avvio e una sola chiusura vera: è un cambio più grosso, da valutare a parte.

Alternativa più semplice, ma meno pulita: riaccendere sempre gli hook e lasciare all'utente il compito di filtrarli in
`settings.json` con `"matcher": "startup"` su `SessionStart`. Non copre però `SessionEnd`, che girerebbe comunque a
ogni messaggio.

## Altro da notare

L'app usa la CLI in `~/.local/bin/claude.exe` (costante `CLAUDE`), che può essere di una versione diversa da quella
dell'app desktop: nel caso osservato era 2.1.322 nell'app, 2.1.330 nel desktop. Comportamenti diversi fra le due
possono venire anche da qui.
