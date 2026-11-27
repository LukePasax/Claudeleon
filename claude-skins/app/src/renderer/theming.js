// I temi: ognuno è una cartella in themes/ con un theme.js (e, se vuole, un theme.css). Questo file li carica, tiene
// il tema in uso e risponde alla pagina con il suo layout, le sue scritte, i suoi colori e i suoi disegni. Le scritte
// e i colori che un tema non definisce vengono dai valori di partenza qui sotto e in style.css. Guida: themes/LEGGIMI.md.
(function () {
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

  // Le scritte dell'interfaccia. {s}, {dir} ecc. si sostituiscono con i valori del momento
  const STRINGS = {
    title: 'Claude Skins',
    chapter: 'Capitolo',
    placeholder: 'Intingi la penna e scrivi...',
    hint: 'Invio spedisce, Maiusc+Invio va a capo, / per i comandi',
    busyHint: 'Il messaggero è in viaggio...',
    send: 'Spedisci',
    stop: 'Ferma',
    stopped: 'Il messaggero è stato richiamato.',
    you: 'Tu scrivi:',
    claude: 'Claude scrive:',
    took: 'Vergato in {s} s',
    toolOk: 'ok',
    toolFail: 'errore',
    allow: 'Permetti',
    always: 'Sempre',
    deny: 'Nega',
    granted: 'Permesso concesso.',
    grantedAlways: 'Permesso concesso, anche per le prossime volte.',
    denied: 'Permesso negato.',
    cancelled: 'Richiesta annullata.',
    // Il selettore dei temi
    themes: 'temi',
    themesTitle: 'Scegli il tema',
    themesCurrent: 'in uso',
    themesClose: 'Chiudi',
    themesNew: 'Crea un tema',
    themesNewDesc: 'Colori, carattere e angoli a tua scelta, con l\'anteprima dal vivo',
    themesEdit: 'Modifica',
    themesDelete: 'Elimina',
    themesDeleteSure: 'Sicuro?',
    themesMine: 'tuo',
    // L'editor dei temi
    teTitleNew: 'Nuovo tema',
    teTitleEdit: 'Modifica il tema',
    teName: 'Nome',
    teNameDefault: 'Il mio tema',
    teDesc: 'Descrizione',
    teFrom: 'Parti da',
    teFromPick: 'scegli un tema…',
    teColors: 'Colori',
    teColor_bg: 'Sfondo',
    teColor_side: 'Barra laterale',
    teColor_surface: 'Casella e menu',
    teColor_ink: 'Testo',
    teColor_inkSoft: 'Testo tenue',
    teColor_accent: 'Accento',
    teColor_onAccent: 'Testo sull\'accento',
    teColor_line: 'Bordi',
    teColor_bubble: 'I tuoi messaggi',
    teAuto: 'automatico',
    teFont: 'Carattere',
    teFont_sistema: 'Sistema (Segoe UI)',
    teFont_moderno: 'Moderno (Bahnschrift)',
    teFont_serif: 'Serif (Georgia)',
    teFont_libro: 'Libro (Palatino)',
    teFont_mono: 'Monospaziato (Cascadia, Consolas)',
    teTextSize: 'Dimensione del testo',
    teRadius: 'Angoli',
    teSave: 'Salva e usa',
    teCancel: 'Annulla',
    teNote: 'L\'anteprima è dal vivo: la finestra dietro è già col tema nuovo. Si salva fra i tuoi temi (cartella temi nei dati dell\'app).',
    teSaveFail: 'Non salvato: {x}',
    // Che cosa fa Claude, a parole ({x}: il file, la ricerca, il sito...); quando Claude scrive lui la descrizione
    // (Bash, Agent) si usa quella
    tool_read: 'Legge {x}',
    tool_edit: 'Modifica {x}',
    tool_write: 'Scrive {x}',
    tool_grep: 'Cerca «{x}» nel codice',
    tool_glob: 'Cerca i file {x}',
    tool_run: 'Esegue un comando',
    tool_fetch: 'Legge una pagina di {x}',
    tool_search: 'Cerca sul web «{x}»',
    tool_todo: 'Aggiorna la lista delle cose da fare',
    tool_skill: 'Usa la skill {x}',
    tool_agent: 'Affida un compito a un aiutante',
    tool_plan: 'Propone un piano',
    tool_mcp: 'Usa {x}',
    tool_other: 'Usa {x}',
    // La cartella della conversazione
    folderPick: 'Scegli la cartella',
    folderTitle: 'Dove lavora Claude',
    folderFirst: 'In quale cartella lavoriamo? Scegline una e il messaggio parte.',
    folderNew: 'Una conversazione resta nella sua cartella: sceglierne un\'altra apre un capitolo nuovo.',
    folderOther: 'Scegli un\'altra cartella…',
    // Gli aggiornamenti
    updTitle: 'Aggiornamenti',
    updStatus: 'Stato',
    updIdle: 'Non ancora controllato.',
    updUnavailable: 'Non disponibile.',
    updChecking: 'Controllo il repo…',
    updUpToDate: 'Aggiornata',
    updAvailable: '{n} novità nel repo',
    updDirty: 'nel repo ci sono modifiche non salvate: aggiorna a mano con git pull',
    updError: 'Non riuscito',
    updCheck: 'Controlla ora',
    updApply: 'Aggiorna',
    updDetails: 'Dettagli',
    updLater: 'Più tardi',
    updBanner: 'Aggiornamento di Claude Skins: {n} novità',
    updAuto: 'Controlla da sola',
    updAutoNote: 'All\'avvio e ogni 6 ore guarda se il repo da cui è installata ha novità (git fetch).',
    updStep_pull: 'Scarico le novità dal repo…',
    updStep_deps: 'Installo le dipendenze…',
    updStep_test: 'Faccio le prove automatiche…',
    updStep_build: 'Creo l\'installer nuovo, qualche minuto…',
    updStep_install: 'Installo e riapro Claude Skins…',
    updStep_restart: 'Riavvio Claude Skins…',
    // Cercare nella conversazione e le scorciatoie
    findPlaceholder: 'Cerca nella conversazione',
    findCount: '{i} di {n}',
    findNone: 'nessuna',
    findPrev: 'Precedente (Maiusc+Invio)',
    findNext: 'Successiva (Invio)',
    findClose: 'Chiudi (Esc)',
    setKeys: 'Scorciatoie della finestra',
    setKeysList: 'Ctrl+N nuova conversazione · Ctrl+K cerca negli annali · Ctrl+F cerca nella conversazione · Ctrl+Maiusc+C copia l\'ultima risposta · Ctrl+Maiusc+P anteprima · Ctrl+, impostazioni · Esc ferma Claude · F11 schermo intero',
    // I messaggi precedenti di una cronaca
    olderLoad: 'Carica i messaggi precedenti ({n})',
    // Le estensioni
    setExtensions: 'Estensioni',
    setExtRow: 'Server MCP e plugin',
    setExtNote: 'Quali sono collegati; accenderli, spegnerli, riconnetterli.',
    setOpenPanel: 'Apri…',
    extTitle: 'Server MCP e plugin',
    extLoading: 'Chiedo a Claude Code…',
    extFailed: 'Claude Code non ha risposto. {err}',
    extMcp: 'Server MCP',
    extMcpNone: 'Nessun server MCP configurato.',
    extTools: '{n} strumenti',
    extStatus_connected: 'collegato',
    extStatus_failed: 'non si collega',
    'extStatus_needs-auth': 'serve l\'accesso',
    extStatus_pending: 'in collegamento',
    extStatus_disabled: 'spento',
    extReconnect: 'Riconnetti',
    extPlugins: 'Plugin',
    extPluginsNone: 'Nessun plugin installato.',
    extNotLoaded: 'acceso ma non caricato',
    extHowTo: 'Server e plugin nuovi si aggiungono da Claude Code (/mcp, /plugin in una conversazione, o claude mcp add nel terminale). Un plugin acceso o spento vale per tutte le conversazioni.',
    // Le attività in background
    tasksRunning: '{n} in background',
    tasksDone: '{n} attività',
    tasksTip: 'Le attività in background di questa conversazione (comandi, sotto-agenti)',
    tasksTitle: 'Attività in background',
    tasksNone: 'Nessuna attività in background in questa conversazione.',
    tasksBackgroundNow: 'Quello che Claude sta facendo adesso',
    tasksBackgroundNote: 'Un comando lungo o un sotto-agente continua in background, e Claude va avanti (come Ctrl+B nel terminale).',
    tasksBackgroundBtn: 'Manda in background',
    tasksAgent: 'sotto-agente {x}',
    tasksMonitor: 'monitor',
    tasksShell: 'comando',
    tasksTools: '{n} strumenti',
    tasksLast: 'ora: {x}',
    tasksStop: 'Ferma',
    tasksOutput: 'Uscita',
    taskStatus_running: 'in corso',
    taskStatus_completed: 'finita',
    taskStatus_failed: 'fallita',
    taskStatus_stopped: 'fermata',
    // Commenti sulle differenze
    reviewAddTip: 'Commenta questa riga',
    reviewPlaceholder: 'Un commento per Claude su {x}',
    reviewHint: 'Invio per aggiungere · parte col prossimo messaggio',
    reviewAdd: 'Commenta',
    reviewYours: 'Il tuo commento',
    reviewRemove: 'Togli',
    reviewOne: '1 commento pronto per Claude',
    reviewMany: '{n} commenti pronti per Claude',
    reviewSend: 'Manda a Claude',
    reviewClear: 'Togli tutti',
    // Avvio sicuro
    safe_config: 'La configurazione era rovinata: l\'app è ripartita da capo (la vecchia è in config.rotto.json).',
    safe_crash: 'Avvio sicuro: le ultime volte l\'app non partiva col tema «{x}», ora usa quello di partenza.',
    safe_timeout: 'Il tema «{x}» non finiva di caricarsi: ora usi quello di partenza.',
    safe_error: 'Il tema «{x}» ha dato un errore ({err}): ora usi quello di partenza.',
    safe_manual: 'Avvio sicuro: ora usi il tema di partenza; «Riprova» torna a quello di prima.',
    safe_gone: 'La finestra si era bloccata ed è ripartita. Le conversazioni sono negli annali.',
    safeRetry: 'Riprova «{x}»',
    safeLog: 'Errori',
    safeOk: 'Va bene',
    // Memoria (CLAUDE.md)
    setMemory: 'Memoria (CLAUDE.md)',
    setMemoryNote: 'Le istruzioni che Claude legge in ogni conversazione: le tue e quelle del progetto (anche con /memory)',
    memTitle: 'Memoria di Claude',
    memFile_user: 'Personale',
    memFile_project: 'Progetto',
    memFile_local: 'Solo tua qui',
    memFile_parent: 'Cartella {x}',
    memNote_user: 'Le tue istruzioni, per tutti i progetti. File: {x}',
    memNote_project: 'Le istruzioni del progetto, condivise col repo. File: {x}',
    memNote_local: 'Solo per te in questo progetto (va messo fra gli ignorati di git). File: {x}',
    memNote_parent: 'Da una cartella sopra il progetto: Claude legge anche questo. File: {x}',
    memNew: 'Il file non c\'è ancora: nasce salvando.',
    memPlaceholder: '# Istruzioni per Claude\n\n- Rispondi in italiano\n- Prima di modificare, spiega cosa farai',
    memSave: 'Salva',
    memRevert: 'Annulla le modifiche',
    memOpen: 'Apri nell\'editor',
    memPreview: 'Anteprima',
    memEdit: 'Modifica',
    memSaved: 'Salvato. Le conversazioni lo rileggono al prossimo messaggio.',
    memDirty: 'Modifiche non salvate',
    memNoProject: 'La conversazione non ha una cartella di progetto: qui c\'è solo la memoria personale.',
    // Regole dei permessi
    setPermissions: 'Regole dei permessi',
    setPermissionsNote: 'Cosa Claude può fare senza chiedere, cosa chiede sempre e cosa non può fare',
    permTitle: 'Regole dei permessi',
    permScope_user: 'Tutti i progetti',
    permScope_project: 'Questo progetto',
    permScope_local: 'Solo per te qui',
    permScopeNote_user: 'Valgono in ogni cartella. File: {x}',
    permScopeNote_project: 'Condivise col repo (vanno nel commit). File: {x}',
    permScopeNote_local: 'Solo su questo PC, in questo progetto (git le ignora). File: {x}',
    permNoProject: 'La conversazione non ha una cartella di progetto: scegline una per le regole del progetto.',
    permList_allow: 'Senza chiedere',
    permList_ask: 'Chiede sempre',
    permList_deny: 'Mai',
    permList_dirs: 'Cartelle in più dove può lavorare',
    permListNote_allow: 'Claude lo fa e basta',
    permListNote_ask: 'Chiede ogni volta, anche se un\'altra regola lo permetterebbe',
    permListNote_deny: 'Bloccato, sempre: vince su tutte le altre',
    permListNote_dirs: 'Oltre alla cartella della conversazione',
    permNone: 'Nessuna regola.',
    permNoneDirs: 'Nessuna.',
    permAddPh_allow: 'Bash(npm run test:*)',
    permAddPh_ask: 'Bash(git push:*)',
    permAddPh_deny: 'Read(./.env)',
    permAddDirPh: 'C:/percorso/della/cartella',
    permAdd: 'Aggiungi',
    permRemove: 'Togli',
    permMoveTip: 'Sposta in un\'altra lista',
    permExamples: 'Esempi: Bash(npm run test:*) · Bash(git status) · Read(./docs/**) · Edit(src/**) · WebFetch(domain:github.com) · WebSearch · mcp__github',
    permApplied: 'Le conversazioni ripartono con le regole nuove al prossimo messaggio.',
    permBroken: 'Questo file non si legge ({x}): sistemalo a mano, da qui non si tocca.',
    // Anteprima di un server locale
    previewBtn: 'Anteprima · {x}',
    previewTip: 'Apri {x} nella finestra (Ctrl+Maiusc+P)',
    previewReload: 'Ricarica',
    previewOpen: 'Apri nel browser',
    previewShot: 'Foto per Claude',
    previewShotTip: 'Allega al prossimo messaggio una foto di quello che si vede nell\'anteprima',
    previewClose: 'Chiudi l\'anteprima',
    previewAddress: 'Indirizzo o porta (es. 5173)',
    previewEmpty: 'Nessun server locale da mostrare. Quando Claude ne avvia uno (npm run dev e simili) il suo indirizzo compare qui; oppure scrivilo sopra.',
    previewGrip: 'Trascina per allargare o stringere l\'anteprima',
    previewShotFail: 'La foto dell\'anteprima non è riuscita.',
    // Worktree
    wtTag: 'worktree',
    wtTagNew: 'worktree',
    wtTagTip: 'Claude lavora in una copia separata del repo: {x}',
    wtPendingTip: 'Al primo messaggio Claude partirà in una copia separata del repo, su un branch suo',
    wtToggle: 'Una copia separata per ogni conversazione',
    wtToggleNote: 'Nei repo git: Claude lavora in un worktree, su un branch suo; poi unisci o apri una pull request',
    wtCreated: 'Lavoro in una copia separata del repo, sul branch {branch}.',
    wtFailed: 'Niente copia separata ({err}): lavoro nella cartella del repo.',
    wtSection: 'Copia separata (worktree)',
    wtLabel: 'Copia di {repo}',
    wtNote: 'Branch {branch}, partito da {base}. {x}',
    wtUnmerged: '{n} commit da unire',
    wtMerged: 'Niente da unire',
    wtMergeBtn: 'Unisci in {base}',
    wtMergedOk: 'Unito in {base} nella cartella principale.',
    wtNothing: 'Niente da unire: {base} ha già tutto.',
    wtRemoveBtn: 'Elimina la copia',
    wtRemoveWarn: 'Attenzione: {x}.',
    wtRemoveDirty: 'ci sono modifiche senza commit, che eliminando la copia si perdono',
    wtRemoveUnmerged: '{n} commit non sono ancora uniti (restano nel branch)',
    wtRemoveForce: 'Elimina comunque',
    wtRemoved: 'Copia separata eliminata. Questa conversazione non ha più la sua cartella: per continuare apri un nuovo capitolo.',
    wtBranchKept: 'Il branch {branch} resta nel repo.',
    setWorktree: 'Una copia separata per ogni conversazione',
    setWorktreeNote: 'Nei repo git ogni conversazione nuova lavora in un worktree, su un branch suo (cartella .claude/worktrees del repo)',
    // Git
    gitTip: 'Git: branch {branch}. Modifiche, commit, push e pull request',
    gitTitle: 'Git · {x}',
    gitDetached: 'nessun branch (HEAD staccato)',
    gitBranchSection: 'Branch',
    gitUpstream: '↑{ahead} ↓{behind} rispetto a {up}',
    gitNoUpstream: 'Non ancora pubblicato',
    gitNoRemote: 'Nessun remoto: il repo è solo su questo PC',
    gitNoCommits: 'Ancora nessun commit',
    gitSwitch: 'Passa a un altro branch',
    gitNewBranch: 'Nuovo branch',
    gitNewBranchPh: 'nome-del-branch',
    gitCreate: 'Crea',
    gitCancel: 'Annulla',
    gitChangesSection: 'Modifiche · {n} file (+{plus} −{minus})',
    gitClean: 'Nessuna modifica da salvare: tutto è già nell\'ultimo commit.',
    gitLast: 'Ultimo commit: {x}',
    gitCommitSection: 'Commit',
    gitCommitPh: 'Cosa cambia con queste modifiche',
    gitCommitBtn: 'Commit',
    gitCommitPushBtn: 'Commit e push',
    gitAskCommitBtn: 'Lo scrive Claude',
    gitAskCommit: 'Fai il commit di tutte le modifiche, con un messaggio chiaro che dica cosa cambia (guarda le differenze per capirlo).',
    gitPublishSection: 'Pubblica',
    gitPushBtn: 'Push',
    gitPushNote: '{n} commit da mandare a {up}',
    gitPushFirst: 'Il branch {branch} non è ancora su {remote}',
    gitPrBtn: 'Crea pull request',
    gitAskPrBtn: 'La scrive Claude',
    gitAskPr: 'Fai il push del branch {branch} e apri una pull request verso {base}, con un titolo e una descrizione che spieghino le modifiche.',
    gitPrNote: 'Verso {base}: titolo e descrizione dai commit',
    gitPrOpen: 'Pull request #{n} · {state}',
    gitPrState_OPEN: 'aperta',
    gitPrState_MERGED: 'unita',
    gitPrState_CLOSED: 'chiusa',
    gitPrDraft: 'bozza',
    gitOpenBtn: 'Apri',
    gitOnBase: 'Sei su {base}: per una pull request crea prima un branch',
    gitNoGh: 'Senza il comando gh la pull request si apre nel browser: il branch è già pubblicato.',
    gitCompareBtn: 'Apri nel browser',
    gitWorking: 'Un momento…',
    gitDone: 'Fatto.',
    gitStatus_M: 'modificato',
    gitStatus_A: 'aggiunto',
    gitStatus_D: 'eliminato',
    gitStatus_U: 'in conflitto',
    'gitStatus_?': 'nuovo',
    gitBinary: 'File binario: niente differenze da mostrare.',
    gitDeleted: 'Il file è stato eliminato.',
    // I file toccati
    filesOne: '1 file',
    filesMany: '{n} file',
    filesTip: 'I file modificati da Claude in questa conversazione',
    filesTitle: 'File modificati · {n} (+{plus} −{minus})',
    filesNew: 'nuovo',
    filesOpen: 'Apri',
    filesReveal: 'Cartella',
    filesMissing: 'Non c\'è più',
    filesNone: 'Claude non ha ancora modificato file in questa conversazione.',
    // Le impostazioni
    settings: 'Impostazioni',
    settingsTip: 'Impostazioni (Ctrl+,)',
    settingsTitle: 'Impostazioni',
    setLook: 'Aspetto',
    setTheme: 'Tema',
    setScene: 'Scena',
    setNight: 'Notte',
    setDay: 'Giorno',
    setChange: 'Cambia…',
    setReset: 'Predefinito',
    setWindow: 'Finestra',
    setOnTop: 'Sempre in primo piano',
    setLogin: 'Avvia con Windows',
    setLoginNote: 'Claude Skins si apre da sola all\'accensione del computer.',
    setPosition: 'Posizione e misura',
    setCenter: 'Riporta al centro',
    setSize: 'Dimensione iniziale',
    setNotifications: 'Notifiche',
    setNotify: 'Notifiche di Windows',
    setNotifyNote: 'Quando Claude finisce o ti chiede qualcosa e la finestra non è davanti, o la conversazione non è in vista.',
    setConversations: 'Conversazioni',
    setWorkdir: 'Cartella di lavoro',
    setWorkdirNone: 'La cartella utente (te la chiede al primo messaggio)',
    setMode: 'Permessi',
    setModel: 'Modello',
    setClaude: 'Claude Code',
    setClaudePath: 'Programma',
    setClaudeMissing: 'non trovato',
    setEntrypoint: 'Come si presentano le sessioni',
    setEntrypointNote: 'Come le vedono le altre app: con "Claude desktop" compaiono anche nell\'app desktop. Vale dal prossimo avvio di una conversazione.',
    setEntryCli: 'Claude Code (terminale)',
    setEntryDesktop: 'Claude desktop',
    setAbout: 'Informazioni',
    setVersion: 'Versione',
    setFromRepo: 'dal repo, non installata',
    setShortcut: 'Scorciatoia',
    setShortcutNote: 'mostra o riduce la finestra da qualunque programma',
    setData: 'Cartella dei dati',
    // Le domande di Claude con le opzioni
    qSubmit: 'Rispondi',
    qSkip: 'Salta',
    qOther: 'Altro: scrivi tu la risposta…',
    qAnswered: 'Risposto.',
    qSkipped: 'Domande saltate.',
    // La lista delle attività
    todosTitle: 'Attività · {done} di {total}',
    // Modello e ragionamento
    modelDefault: 'Modello predefinito',
    modelDefaultDesc: 'Quello scelto nelle impostazioni di Claude Code',
    modelTitle: 'Modello',
    modelNote: 'Le scelte valgono subito, anche per la conversazione in corso.',
    ultracode: 'Ultracode',
    ultracodeDesc: 'Orchestrazione dinamica dei flussi di lavoro, a qualunque livello di ragionamento',
    modelNone: 'L\'elenco dei modelli arriva da Claude Code poco dopo l\'avvio.',
    effortTitle: 'Ragionamento',
    // I livelli coi nomi dell'app desktop
    effortAuto: 'Predefinito',
    effort_low: 'Low',
    effort_medium: 'Medium',
    effort_high: 'High',
    effort_xhigh: 'Extra',
    effort_max: 'Max',
    // La riga "sta lavorando": un verbo a caso, separati da |
    workingVerbs: 'Claudando|Rimuginando|Elucubrando|Architettando|Cogitando|Ponderando|Arzigogolando|Macinando|Districando|Combinando',
    workingEsc: 'Esc per fermare',
    // Le risposte suggerite
    suggestionTip: 'Manda questa risposta (Tab la scrive nella casella)',
    // Il nome dell'app, per i temi che lo scrivono nella testata
    appTitle: 'Claude Skins',
    // I file da citare con @
    fileNone: 'Nessun file con questo nome nella cartella della conversazione.',
    // Modificare un messaggio
    editMessage: 'Modifica',
    editSend: 'Invia',
    editCancel: 'Annulla',
    editRestore: 'Riporta anche i file a prima di questo messaggio',
    rewindOk: 'File riportati a prima del messaggio: {n} (+{plus} −{minus} righe).',
    rewindFail: 'I file non si possono riportare indietro: {err}',
    // Copiare
    copy: 'Copia',
    copied: 'Copiato',
    copyCode: 'Copia il codice',
    copyReply: 'Copia la risposta',
    copyMessage: 'Copia il messaggio',
    // Il ragionamento di Claude
    thinkingNow: 'Sta ragionando…',
    thinkingDone: 'Ha ragionato per {s} s',
    thinkingPast: 'Ragionamento',
    // Il contesto
    contextTip: 'Contesto: {p}% ({used} di {max} token)',
    contextNone: 'Contesto: il conto arriva dopo la prima risposta',
    contextTitle: 'Contesto · {p}%',
    contextOf: '{used} di {max} token',
    contextCompact: 'Compatta ora',
    contextNote: 'Quando si riempie, Claude Code riassume da solo la conversazione per fare spazio.',
    ctx_system_prompt: 'Prompt di sistema',
    ctx_system_tools: 'Strumenti di Claude Code',
    ctx_mcp_tools: 'Strumenti MCP',
    ctx_mcp_instructions: 'Istruzioni dei server MCP',
    ctx_custom_agents: 'Agenti',
    ctx_memory_files: 'Memoria (CLAUDE.md)',
    ctx_skills: 'Skill',
    ctx_messages: 'Conversazione',
    ctx_autocompact_buffer: 'Riserva per la compattazione',
    ctx_compact_buffer: 'Riserva per la compattazione',
    ctx_free_space: 'Spazio libero',
    contextEstimate: 'circa {used} di {max} token, dall\'ultima risposta salvata',
    usageTitle: 'Utilizzo del piano',
    usage5h: 'Sessione (5 ore)',
    usageWeek: 'Settimana',
    usageWeekOpus: 'Settimana · Opus',
    usageWeekSonnet: 'Settimana · Sonnet',
    usageAt: 'si azzera {when}',
    usageNone: 'L\'utilizzo arriva da Claude Code poco dopo l\'avvio (solo con l\'abbonamento claude.ai).',
    contextEmpty: 'Il conto del contesto arriva dopo la prima risposta di questa conversazione.',
    // Gli annali: ricerca, gruppi, menu di ogni conversazione
    sessionsSearch: 'Cerca…',
    sessionsNoMatch: 'Nessuna conversazione con «{q}».',
    sessionsArchived: 'Archiviate ({n})',
    sessionsHideArchived: 'Nascondi le archiviate',
    groupToday: 'Oggi',
    groupYesterday: 'Ieri',
    groupWeek: 'Ultimi 7 giorni',
    groupMonth: 'Ultimi 30 giorni',
    groupOlder: 'Più vecchie',
    groupArchived: 'Archiviate',
    groupPinned: 'Fissate',
    sessionMenu: 'Altre azioni',
    sessionRename: 'Rinomina',
    sessionArchive: 'Archivia',
    sessionUnarchive: 'Ripristina',
    sessionPin: 'Fissa in alto',
    sessionUnpin: 'Togli dalle fissate',
    sessionExport: 'Esporta in Markdown…',
    exportDone: 'Conversazione esportata in {x}',
    exportFail: 'Esportazione non riuscita: {x}',
    exportNothing: 'Questa conversazione non è ancora salvata: manda prima un messaggio.',
    sessionDelete: 'Elimina…',
    // Gli allegati
    attachTip: 'Allega file o immagini (anche incollando o trascinando)',
    dictateTip: 'Detta: la digitazione vocale di Windows scrive nella casella (anche con Win+H; di nuovo per fermarla)',
    attachRemove: 'Togli',
    attachNoPath: '«{name}» non ha un percorso sul disco: trascinalo da Esplora file o sceglilo col pulsante +.',
    attachFailed: 'Non riesco a leggere l\'immagine «{name}».',
    // I comandi con /
    cmdNone: 'Nessun comando con questo nome.',
    cmdLoading: 'Chiedo i comandi a Claude Code...',
    cmdUnavailable: 'Claude Code non ha dato l\'elenco dei comandi; si possono scrivere lo stesso.',
    cmdCompacting: 'Riassumo la conversazione...',
    cmdCompacted: 'Conversazione riassunta: da {pre} a {post} token.',
    cmdCompactedShort: 'Conversazione riassunta.',
    // Il modo dei permessi
    modesLabel: 'Permessi:',
    modesTitle: 'Permessi',
    modeAuto: 'automatico',
    modeAutoTip: 'Un classificatore approva le azioni chiare e chiede solo quando non sa',
    modeDefault: 'chiedi sempre',
    modeDefaultTip: 'Chiede prima di ogni azione a rischio: comandi, modifiche ai file, rete',
    modeAcceptEdits: 'accetta modifiche',
    modeAcceptEditsTip: 'Le modifiche ai file passano senza chiedere; comandi e rete si chiedono',
    modePlan: 'piano',
    modePlanTip: 'Claude legge e propone un piano, senza toccare nulla finché non lo approvi',
    // Il piano proposto alla fine del modo piano
    planTitle: 'Claude propone un piano',
    planEmpty: 'Il piano è nella risposta qui sopra.',
    planApprove: 'Approva il piano',
    planKeep: 'Continua a pianificare',
    planApproved: 'Piano approvato: Claude procede.',
    planKept: 'Claude continua a pianificare.',
    // Le modifiche ai file
    diffMore: 'Mostra altre {n} righe',
    diffLess: 'Mostra meno',
    diffGap: '··· {n} righe uguali',
    diffNew: 'File nuovo.',
    diffWhole: 'Scritto per intero: ecco il contenuto.',
    diffThen: 'Il contenuto scritto allora (il file può essere cambiato da così).',
    diffAll: 'In tutte le occorrenze nel file.',
    diffTooBig: 'Modifica troppo grande da mostrare qui.',
    diffSame: 'Nessuna differenza.',
    newChapter: 'nuovo capitolo',
    sessions: 'cronache',
    sessionsTitle: 'Le cronache',
    sessionsLoading: 'Sfoglio le cronache...',
    sessionsEmpty: 'Nessuna cronaca: Claude Code non ha ancora conversazioni salvate su questo computer.',
    back: 'Torna',
    copying: 'Ricopio la cronaca...',
    continueHere: 'Da qui in poi si scrive nella stessa cronaca.',
    // Il pulsante della scena mostra il nome dell'altra
    notte: 'notte',
    giorno: 'giorno',
    hideTip: 'Riduci a icona',
    maxTip: 'Ingrandisci (F11: schermo intero)',
    restoreTip: 'Ripristina',
    quitTip: 'Chiudi',
    gripTip: 'Trascina per allargare o allungare la finestra',
  }

  // I colori della pixel art per scena. Un tema ridefinisce solo le chiavi che cambia; i colori dell'interfaccia
  // (variabili CSS) hanno i loro valori di partenza in style.css
  const PALETTES = {
    notte: {
      paper: ['#3a2f1f', '#342a1b', '#2f2618', '#403422'], paperEdge: '#1c160d',
      roll: ['#5a4526', '#7a5f35', '#9c7c46', '#b8955a', '#8a6c3c', '#5f4828', '#3d2e18'],
      knob: ['#5a3d10', '#9a6a1a', '#d4a338', '#ffe7a0'],
      ink: '#e8d9b5', inkSoft: '#a8946a', gold: '#d4a338', goldLight: '#ffe7a0', red: '#c0441e', blue: '#5b8590',
      flame: ['#ff6a2a', '#ffb347', '#ffe7a0'], wax: '#e8d9b5', waxShade: '#b8a684', iconDark: '#9a6a1a',
    },
    giorno: {
      paper: ['#ead9ad', '#e3cf9e', '#dcc690', '#f0e2bc'], paperEdge: '#a8783f',
      roll: ['#8a6a3a', '#b08a52', '#d4b07a', '#ecd3a0', '#c29c62', '#94723e', '#6b5230'],
      knob: ['#5a3d10', '#9a6a1a', '#c8963a', '#f6d98a'],
      ink: '#3a2a18', inkSoft: '#7b6343', gold: '#9a6a1a', goldLight: '#c8963a', red: '#a0381a', blue: '#3f6670',
      flame: ['#e0663a', '#f0a040', '#fff0b0'], wax: '#fff8e6', waxShade: '#d8c9a5', iconDark: '#5a3d10',
    },
  }

  function plainDate(d) {
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  }

  const registry = new Map()
  let current = { id: 'nessuno' }
  let setVars = []

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = resolve
      // Un tema rotto non blocca gli altri: semplicemente non compare
      s.onerror = () => { console.warn('Tema non caricato:', src); resolve() }
      document.head.appendChild(s)
    })
  }

  // ids: le cartelle dei temi. Ogni theme.js si registra in window.SkinsThemes
  async function load(ids) {
    window.SkinsThemes = window.SkinsThemes || []
    await Promise.all(ids.map((id) => loadScript(`themes/${id}/theme.js`)))
    // Nell'ordine dato (il predefinito per primo, poi per nome), non in quello in cui i file finiscono di caricarsi
    const loaded = new Map(window.SkinsThemes.filter((th) => th && th.id).map((th) => [th.id, th]))
    for (const id of [...ids, ...loaded.keys()]) if (loaded.has(id) && !registry.has(id)) registry.set(id, loaded.get(id))
    return [...registry.values()].map((th) => ({ id: th.id, name: th.name || th.id }))
  }

  // Sceglie il tema (se l'id non c'è, il primo caricato) e carica i suoi fogli al posto di quelli del tema
  // precedente: prima i kit che include (kits/<nome>.css, per esempio la pixel art), poi il suo theme.css. È attivo
  // un solo tema alla volta, quindi le sue regole non hanno bisogno di prefissi
  function use(id) {
    current = registry.get(id) || registry.values().next().value || { id: 'nessuno' }
    document.body.dataset.theme = current.id
    for (const old of document.querySelectorAll('link[data-theme-css]')) old.remove()
    const sheets = [...(current.kits || []).map((k) => `kits/${k}.css`), ...(current.css ? [`themes/${current.id}/theme.css`] : [])]
    return Promise.all(sheets.map((href) => new Promise((resolve) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.dataset.themeCss = ''
      link.onload = link.onerror = resolve
      document.head.appendChild(link)
    }))).then(() => current)
  }

  // Un file della cartella del tema (immagini, caratteri, suoni), come indirizzo per la pagina
  function asset(path, theme = current) {
    return `themes/${theme.id}/${String(path).replace(/^\.?\//, '')}`
  }

  // I disegni del tema sono ingranditi di questa scala (data-art-scale la cambia per un elemento)
  function artScale() {
    return Number(current.artScale) || Pixel.SCALE
  }

  // Le scene sono due, 'notte' e 'giorno'; un tema può definirne una sola o nessuna
  function scene(name, theme = current) {
    const key = name === 'giorno' ? 'giorno' : 'notte'
    return (theme.scenes && theme.scenes[key]) || {}
  }

  function paletteOf(theme, name) {
    return Object.assign({}, PALETTES[name === 'giorno' ? 'giorno' : 'notte'], scene(name, theme).palette || {})
  }

  // Le variabili CSS della scena, in linea su body: le precedenti si tolgono, così un tema non lascia colori a quello dopo
  function applyScene(name) {
    const root = document.body.style
    for (const v of setVars) root.removeProperty(v)
    setVars = []
    for (const [k, v] of Object.entries(scene(name).vars || {})) {
      const prop = k.startsWith('--') ? k : `--${k}`
      root.setProperty(prop, v)
      setVars.push(prop)
    }
    document.body.classList.toggle('giorno', name === 'giorno')
  }

  function t(key, vars) {
    const s = (current.strings && current.strings[key]) ?? STRINGS[key] ?? key
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s
  }

  // La data sotto il titolo del capitolo: un tema può avere il suo calendario
  function chapterDate(d) {
    return current.date ? current.date(d, plainDate) : plainDate(d)
  }

  // Un disegno del tema per nome (data-art, data-art-bg): restituisce un canvas, o null se il tema non ce l'ha
  const warned = new Set()
  function art(name, options) {
    const fn = current.art && current.art[name]
    if (typeof fn !== 'function') {
      if (!warned.has(current.id + name)) { warned.add(current.id + name); console.warn(`Il tema ${current.id} non disegna "${name}"`) }
      return null
    }
    try {
      return fn(options)
    } catch (err) {
      console.warn(`Tema ${current.id}, disegno "${name}":`, err)
      return null
    }
  }

  // L'icona di un mestiere, come { src, pixel }. Un tema la dà in art.icons in uno di questi modi: righe di una bitmap
  // (pixel art), un canvas, un SVG scritto nel codice ('<svg ...'), un file della sua cartella ('icone/leggere.svg')
  // o una funzione ({ pal, scene, craft }) che restituisce uno di questi. Senza, l'icona a pixel di partenza
  function icon(craft, pal, sceneName) {
    const icons = (current.art && current.art.icons) || {}
    // Un mestiere che il tema non disegna: per un tema pixel l'icona a pixel di partenza di quel mestiere, per gli
    // altri la loro icona "altro" (una bitmap in mezzo a icone SVG starebbe male)
    const pixelTheme = (current.kits || []).includes('pixel')
    let v = icons[craft] ?? (pixelTheme ? undefined : icons.altro)
    try {
      if (typeof v === 'function') v = v({ pal, scene: sceneName, craft })
    } catch {
      v = null
    }
    if (Array.isArray(v)) return { src: Pixel.bitmap(v, Pixel.iconColors(pal)).toDataURL(), pixel: true }
    if (v && typeof v.toDataURL === 'function') return { src: v.toDataURL(), pixel: v.width <= 16 }
    if (typeof v === 'string' && v.trim().startsWith('<svg')) return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(v)}`, pixel: false }
    if (typeof v === 'string' && v.startsWith('data:')) return { src: v, pixel: false }
    if (typeof v === 'string' && v) return { src: asset(v), pixel: false }
    return { src: Pixel.icon(craft, pal, Pixel.ICONS), pixel: true }
  }

  // Gli agganci del tema: funzioni che il motore chiama quando succede qualcosa (vedi themes/LEGGIMI.md); un errore
  // di un tema non ferma l'app
  function hook(name, ctx, ...args) {
    const fn = current.hooks && current.hooks[name]
    if (typeof fn !== 'function') return
    try {
      fn(ctx, ...args)
    } catch (err) {
      console.warn(`Tema ${current.id}, aggancio "${name}":`, err)
    }
  }

  // L'icona del vassoio, 32×32: quella del tema (un canvas 16×16) o il rotolino di partenza
  function trayIcon(pal) {
    const fn = current.art && current.art.trayIcon
    const drawn = typeof fn === 'function' ? fn({ pal }) : Pixel.lib.trayScroll()
    return Pixel.upscale(drawn, 32, 32)
  }

  // L'icona dell'app (barra delle applicazioni, menu Start), grande: lo stesso disegno del vassoio a 256 pixel. Un
  // disegno a misura libera (trayIcon({ size })) si disegna grande; uno a pixel si ingrandisce a pixel pieni
  function appIcon(pal, size = 256) {
    const fn = current.art && current.art.trayIcon
    let drawn = null
    try { drawn = typeof fn === 'function' ? fn({ pal, size }) : null } catch {}
    if (!drawn) drawn = Pixel.lib.trayScroll()
    return Pixel.upscale(drawn, size, size)
  }

  // L'anteprima di un tema qualunque (anche non in uso) per il selettore: 48×30 pixel con la sua carta, il suo
  // capo o la sua copertina (un tratto del disegno roll o leather), un filo d'oro e la sua icona del vassoio
  function preview(id, sceneName) {
    const theme = registry.get(id)
    if (!theme) return null
    const pal = paletteOf(theme, sceneName)
    const a = theme.art || {}
    // Un tema può disegnare la sua anteprima (144×90, o più piccola per la pixel art)
    if (typeof a.preview === 'function') {
      try {
        const own = a.preview({ pal, scene: sceneName, width: 144, height: 90 })
        if (own) return own
      } catch {}
    }
    const W = 48
    const H = 30
    const c = Pixel.canvas(W, H)
    const ctx = c.getContext('2d')
    const tryArt = (name, opts) => {
      try { return typeof a[name] === 'function' ? a[name](Object.assign({ pal, scene: sceneName, frame: 0, busy: false }, opts)) : null } catch { return null }
    }
    const paper = tryArt('paper', { width: 96, height: 96, w: 32, h: 32 }) || Pixel.lib.paperTile(pal)
    ctx.fillStyle = ctx.createPattern(paper, 'repeat')
    ctx.fillRect(0, 0, W, H)
    const band = tryArt('leather', { width: 72, height: 72, w: 24, h: 24 })
    if (band) {
      ctx.fillStyle = ctx.createPattern(band, 'repeat')
      ctx.fillRect(0, 0, W, 7)
    } else {
      const roll = tryArt('roll', { width: W * 3, height: 36, w: W, h: 12 }) || Pixel.lib.roll(W, pal)
      ctx.drawImage(roll, 0, 0, W, 12, 0, -3, W, 12)
    }
    ctx.fillStyle = pal.gold
    ctx.fillRect(0, 7, W, 1)
    let icon = null
    try { icon = typeof a.trayIcon === 'function' ? a.trayIcon({ pal }) : Pixel.lib.trayScroll() } catch {}
    if (icon) ctx.drawImage(icon, (W - icon.width) / 2, 10)
    return c
  }

  // I temi che non vengono da un file (quelli dell'editor dei temi): si aggiungono, si sostituiscono, si tolgono. Se è
  // quello in uso, il nuovo prende il suo posto (l'anteprima dell'editor cambia così a ogni colore)
  function register(theme) {
    if (!theme || !theme.id) return
    registry.set(theme.id, theme)
    if (current.id === theme.id) current = theme
  }
  function unregister(id) {
    registry.delete(id)
  }

  window.Theming = {
    register, unregister, get: (id) => registry.get(id),
    preview,
    // I temi caricati, per il selettore: id, nome, descrizione
    list: () => [...registry.values()].filter((th) => !String(th.id).startsWith('__')).map((th) => ({ id: th.id, name: th.name || th.id, description: th.description || '' })),
    load, use, applyScene, t, chapterDate, plainDate, art, icon, trayIcon, appIcon, hook, asset, artScale, MONTHS,
    get current() { return current },
    palette: (name) => paletteOf(current, name),
  }
})()
