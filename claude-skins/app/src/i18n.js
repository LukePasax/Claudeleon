// La lingua del processo principale (menu del vassoio, finestre di dialogo, notifiche, messaggi d'errore dei moduli,
// messaggi a Claude). Le frasi sono scritte in italiano nel codice: tr('frase con {x}', { x }) dà la frase nella
// lingua scelta (inglese, la lingua di partenza, o italiano). Le traduzioni inglesi stanno qui sotto, con la frase
// italiana come chiave; una frase senza traduzione resta in italiano (le prove controllano che non ne manchino).
let lang = 'en'

const EN = {
  // Vassoio
  'Riduci a icona': 'Minimize',
  'Mostra': 'Show',
  'Nuova conversazione': 'New conversation',
  'Tema': 'Theme',
  'Cartella di lavoro…': 'Working folder…',
  'Notifiche': 'Notifications',
  'Sempre in primo piano': 'Always on top',
  'Riporta al centro': 'Back to center',
  'Dimensione iniziale': 'Initial size',
  'Impostazioni…': 'Settings…',
  'Esci': 'Quit',
  // Finestre di dialogo
  'Dov\'è Claude Code': 'Where is Claude Code',
  'Programmi': 'Programs',
  'Cartella di lavoro di Claude': 'Claude’s working folder',
  'Esporta il tema': 'Export theme',
  'Tema di Claudeleon': 'Claudeleon theme',
  'Importa un tema': 'Import a theme',
  'Installa': 'Install',
  'Annulla': 'Cancel',
  'Installare il tema?': 'Install the theme?',
  'Installare il tema «{x}»?': 'Install the “{x}” theme?',
  'Questo tema contiene codice che girerà nella finestra di Claudeleon (può leggere le conversazioni e mandare messaggi a Claude). Installalo solo se viene da qualcuno di cui ti fidi.':
    'This theme contains code that will run in the Claudeleon window (it can read your conversations and send messages to Claude). Only install it if it comes from someone you trust.',
  'Sostituisci': 'Replace',
  'Tema già installato': 'Theme already installed',
  'Il tema «{x}» c\'è già. Sostituirlo con quello del file?': 'The “{x}” theme is already installed. Replace it with the one in the file?',
  'Allega file o immagini': 'Attach files or images',
  'Esporta la conversazione': 'Export conversation',
  'Conversazione': 'Conversation',
  'Elimina': 'Delete',
  'Eliminare la conversazione?': 'Delete the conversation?',
  'Eliminare «{x}»?': 'Delete “{x}”?',
  'Il transcript di Claude Code viene cancellato dal disco e non si può recuperare, nemmeno dall\'app desktop. Per toglierla solo dall\'elenco c\'è "Archivia".':
    'The Claude Code transcript is deleted from disk and cannot be recovered, not even from the desktop app. To just remove it from the list there is "Archive".',
  // Errori nel processo principale
  'Tema sconosciuto': 'Unknown theme',
  'Il file è troppo grande': 'The file is too large',
  'Il file non è un tema di Claudeleon': 'The file is not a Claudeleon theme',
  // Notifiche
  'Claude ha finito': 'Claude is done',
  'La risposta è pronta.': 'The reply is ready.',
  'Claude si è fermato': 'Claude stopped',
  'Claude propone un piano': 'Claude proposes a plan',
  'Da approvare per continuare.': 'Approve it to continue.',
  'Claude ti fa una domanda': 'Claude has a question',
  'Claude chiede il permesso': 'Claude asks for permission',
  'Claudeleon: aggiornamento disponibile': 'Claudeleon: update available',
  'È uscita la versione {v}': 'Version {v} is out',
  '{n} novità, fra cui: {x}': '{n} changes, including: {x}',
  '{n} novità': '{n} changes',
  // git.js
  'git non ha funzionato': 'git failed',
  'Non è un repo git': 'Not a git repo',
  '«{x}» non va bene come nome di un branch': '“{x}” is not a valid branch name',
  'Serve un messaggio per il commit': 'A commit message is needed',
  'Questo repo non ha un remoto (origin) dove fare il push': 'This repo has no remote (origin) to push to',
  'Serve un branch per la pull request': 'A branch is needed for the pull request',
  'Sei su {x}: crea prima un branch per la pull request': 'You are on {x}: create a branch first for the pull request',
  'Il repo non ha ancora commit: il worktree parte da un commit': 'The repo has no commits yet: a worktree starts from a commit',
  'Questa conversazione non lavora in un worktree': 'This conversation does not work in a worktree',
  'Ci sono modifiche senza commit nel worktree: fai prima il commit': 'The worktree has uncommitted changes: commit them first',
  'La cartella principale è su {x}, non su {y}: torna su {y} per unire': 'The main folder is on {x}, not on {y}: switch back to {y} to merge',
  'Unione non riuscita (conflitti o modifiche nella cartella principale), annullata:\n{x}': 'Merge failed (conflicts or changes in the main folder), aborted:\n{x}',
  // permissions.js
  'il file non contiene un oggetto JSON': 'the file does not contain a JSON object',
  'Posto sconosciuto': 'Unknown location',
  'Richiesta non valida': 'Invalid request',
  '«{x}» non sembra una regola: per esempio Bash(npm run test:*) o Read(./docs/**)': '“{x}” does not look like a rule: for example Bash(npm run test:*) or Read(./docs/**)',
  'Serve il percorso di una cartella': 'A folder path is needed',
  '{x} non si legge ({y}): sistemalo a mano prima': '{x} cannot be read ({y}): fix it by hand first',
  'La regola non c\'è più': 'The rule is no longer there',
  // memory.js
  'Non è un file della memoria': 'Not a memory file',
  'Il file è troppo grande per modificarlo qui': 'The file is too large to edit here',
  'Il testo è troppo lungo': 'The text is too long',
  // themes.js
  'Non è un tema di Claudeleon': 'Not a Claudeleon theme',
  'Il tema non ha i colori': 'The theme has no colors',
  'Tipo di tema sconosciuto': 'Unknown theme type',
  'L\'id del tema non va bene (minuscole, numeri e trattini)': 'The theme id is not valid (lowercase letters, digits and dashes)',
  'Manca theme.js': 'theme.js is missing',
  'File non ammesso: {x}': 'File not allowed: {x}',
  'Il tema è troppo grande (oltre 25 MB)': 'The theme is too large (over 25 MB)',
  'C\'è già un tema del programma con l\'id «{x}»': 'There is already a built-in theme with the id “{x}”',
  // Aggiornamenti
  'Gli aggiornamenti dalle release valgono per l\'app installata.': 'Updates from releases apply to the installed app.',
  'Nessuna connessione con GitHub.': 'No connection to GitHub.',
  'Nessuna release trovata su GitHub (il repo è pubblico? c\'è almeno una release?).': 'No release found on GitHub (is the repo public? is there at least one release?).',
  'Questa installazione non sa dove cercare gli aggiornamenti: reinstalla dall\'ultima release.': 'This installation does not know where to look for updates: reinstall from the latest release.',
  'Il file scaricato non corrisponde: riprova più tardi.': 'The downloaded file does not match: try again later.',
  'Errore sconosciuto': 'Unknown error',
  'L\'app è stata installata senza sapere da quale repo: rifai l\'installer con crea-installer.cmd.': 'The app was installed without knowing which repo it came from: rebuild the installer with crea-installer.cmd.',
  'La cartella dell\'app non è in un repo git.': 'The app folder is not in a git repo.',
  'Il branch {x} non segue un branch remoto: aggiornalo a mano.': 'The {x} branch does not track a remote branch: update it by hand.',
  'Nel repo ci sono modifiche non salvate: aggiorna a mano (git pull).': 'The repo has uncommitted changes: update by hand (git pull).',
  'Le prove automatiche non passano, l\'aggiornamento si ferma: {x}': 'The automated tests fail, the update stops: {x}',
  'L\'installer nuovo non c\'è nella cartella dist.': 'The new installer is not in the dist folder.',
  // claude-bridge.js: errori per la finestra
  'Claude Code non risponde: {x}': 'Claude Code is not responding: {x}',
  'Non trovo il messaggio da modificare nella sessione salvata.': 'I cannot find the message to edit in the saved session.',
  'Salvataggi dei file non disponibili.': 'File checkpoints are not available.',
  'Claude Code si è chiuso.': 'Claude Code closed.',
  'Claude Code si è fermato ({x}).': 'Claude Code stopped ({x}).',
  'Claude vuole usare {x}': 'Claude wants to use {x}',
  // claude-bridge.js: messaggi a Claude
  'La persona ha chiuso le domande senza rispondere: chiedile in un messaggio come vuole procedere.': 'The user closed the questions without answering: ask them in a message how they want to proceed.',
  'La persona non approva ancora il piano: continua a pianificare e chiedile che cosa vuole cambiare.': 'The user does not approve the plan yet: keep planning and ask them what they want to change.',
  'La persona ha negato il permesso.': 'The user denied permission.',
  'La persona ha fermato la risposta.': 'The user stopped the reply.',
  'Richiesta annullata.': 'Request cancelled.',
  'Nessuna sessione o titolo vuoto.': 'No session, or empty title.',
  'Titolo non salvato: {x}': 'Title not saved: {x}',
  // Esportazione in Markdown
  'Tu': 'You',
  '*File allegati:* {x}': '*Attached files:* {x}',
  '*Commenti sulle modifiche:*': '*Comments on the changes:*',
  'Commenti sulle modifiche': 'Comments on the changes',
  'File allegati': 'Attached files',
}

function setLanguage(l) {
  lang = l === 'it' ? 'it' : 'en'
}
function language() {
  return lang
}
function tr(text, vars) {
  const s = lang === 'en' && Object.prototype.hasOwnProperty.call(EN, text) ? EN[text] : text
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
}
// Il testo per lingua di un tema ({ en, it } o lo stesso per tutte): la personalità, il nome
function pick(v) {
  if (v && typeof v === 'object') return v[lang] || v.en || v.it || ''
  return v || ''
}

module.exports = { tr, setLanguage, language, pick, EN }
