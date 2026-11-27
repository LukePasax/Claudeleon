# Report: Claude non può dare un nome alle conversazioni dell'app

27/11/2026 — trovato usando l'app su Windows, insieme all'app desktop di Claude.

## Il problema

Nell'app desktop Claude può rinominare la sessione in cui lavora: istruzioni e skill dell'utente lo usano per dare
alla conversazione un titolo che dica qualcosa nella barra laterale (es. `27/11 · <argomento>`), al posto del primo
messaggio ("Buongiorno"). Nelle conversazioni aperte da Claude Skins il titolo non cambia: Claude non ha lo strumento
per farlo, salta il passo, e nell'elenco delle cronache resta il primo messaggio.

## La causa

Il titolo dell'app desktop non è una funzione di Claude Code: lo strumento lo fornisce l'app desktop stessa, con un
server MCP suo, `ccd_session_mgmt`, che espone `set_session_title` (chiamato con `session_id: "self"`).

Nei transcript (`~/.claude/projects/<cartella>/<sessione>.jsonl`) l'effetto è una riga:

```json
{"type":"custom-title","customTitle":"26/11 · <argomento>","sessionId":"<id>"}
```

`listSessions()` dell'Agent SDK la legge come `customTitle`, e l'app la usa già: `sessions()` in
`app/src/claude-bridge.js` mostra `s.customTitle || s.summary || s.firstPrompt`. È per questo che le sessioni nate nel
desktop compaiono nelle cronache con il loro titolo. `send()` invece passa a `query()` solo gli strumenti di Claude
Code, quindi nelle conversazioni dell'app `set_session_title` non c'è.

## Proposta di correzione

Dare all'app il suo strumento di titolo, con un server MCP in-process dell'SDK (`createSdkMcpServer` + `tool`),
passato in `options.mcpServers` di `send()`:

- strumento `set_session_title({ title })`, con lo stesso nome e la stessa forma di quello del desktop, così che
  istruzioni e skill scritte per il desktop funzionino senza modifiche (eventualmente accettando e ignorando
  `session_id: "self"`);
- l'implementazione aggiunge al transcript della sessione corrente la riga `custom-title` qui sopra, oppure usa una
  funzione di rinomina dell'SDK se la versione in uso ne ha una (❓ da verificare);
- dopo la scrittura, l'app riemette l'elenco delle cronache, così il titolo nuovo compare subito anche nella finestra.

Da verificare:

- il nome con cui lo strumento arriva a Claude: nel desktop è `mcp__ccd_session_mgmt__set_session_title`. Per una
  compatibilità completa il server andrebbe chiamato `ccd_session_mgmt`, a meno che le istruzioni non citino solo
  `set_session_title`;
- se `canUseTool` chiede il permesso anche per questo strumento: va consentito senza domanda, perché è innocuo e
  serve proprio a non interrompere la persona;
- la scrittura sul `.jsonl` mentre il processo di Claude Code lo tiene aperto: una riga aggiunta in coda è quello che
  fa il desktop, ma conviene provarla durante una risposta in corso.

## Nota

Anche una rinoma fatta a mano dalla persona (un `/rename`, o un comando dell'app sulla cronaca) potrebbe scrivere la
stessa riga e riusare lo stesso codice.
