# Claudeleon user guide

Claudeleon is a Windows app that drives [Claude Code](https://code.claude.com/docs/en/overview) through the Agent SDK,
in a window as large as the Claude desktop app, with a look that comes from a theme. This guide covers installing,
using and updating it. To write your own themes see [themes.md](themes.md).

## Install

You need Windows and Claude Code installed and signed in. If you do not have it yet, open PowerShell and run
`irm https://claude.ai/install.ps1 | iex`, then run `claude` in a terminal and type `/login`.

1. Download `Claudeleon-Setup-<version>.exe` from the
   [latest release](https://github.com/LukePasax/Claudeleon/releases/latest).
2. Run it. It installs for your user only (no administrator rights), adds Claudeleon to the Start menu and the
   desktop, and opens it at the end.
3. The installer is not code-signed, so Windows SmartScreen may say "Windows protected your PC": choose
   **More info → Run anyway**.

The first time, a **welcome** panel lets you pick the language (English or Italian) and checks that Claude Code is
installed and signed in. If something is missing it shows the command to copy, a **Choose the program…** button
(when Claude Code is installed somewhere unusual) and **Check again**. It shows up again at every start where Claude
Code or the sign-in is missing; **Continue anyway** closes it.

Claudeleon does not bundle Claude Code: it uses the one installed on the computer (`%USERPROFILE%\.local\bin\claude.exe`,
or the first `claude.exe` on the PATH, or the one you choose in Settings → Claude).

## Updates

At startup and every 6 hours Claudeleon checks the GitHub releases. When there is a new one, a banner at the top and
a Windows notification say so; **Update** downloads the installer (checking its fingerprint), installs it silently
and reopens the app, keeping your taskbar pin. After an update, a **What's new** panel shows the release notes.
Settings → Updates has **Check now** and the switch for automatic checks.

## The window

- **Move and resize:** drag the top bar; resize from any edge or corner. The size is remembered per theme. Double-
  click the top bar (or the maximize button) to fill the screen's work area; **F11** for full screen.
- **Like a normal app:** it lives in the taskbar and "–" minimizes it there. It is not always on top unless you turn
  that on. **Ctrl+Alt+P** brings it to the front from any program (or minimizes it).
- **Tray icon:** new conversation, theme, working folder, notifications, always on top, back to center, initial
  size, settings, quit.
- **Notifications:** when the window is not in front, Windows notifications tell you that Claude finished, asks for
  permission, a choice or a plan approval, or stopped. Click one to come back.

## Conversations

- **New conversation** (Ctrl+N) starts another one without stopping the previous one, which keeps working. You can
  have several open; a dot in the list marks the ones that are not in view (pulsing while they work, still when they
  have news or a question).
- **The conversation list** on the left shows Claude Code sessions from all folders (including the desktop app's),
  grouped by day, with folder and git branch. The search box (Ctrl+K) filters by title, folder and branch, and from
  three letters on also by the **text of the messages**: matches show a snippet with the words highlighted.
- Each conversation has a menu (**⋯** or right-click): **Rename**, **Pin to top**, **Export to Markdown…**,
  **Archive** (hidden from the list, kept on disk) and **Delete** (removes the transcript, asks first). `/export`
  exports the current one.
- Opening a saved conversation shows the last 40 messages; **Load earlier messages** brings the rest, 40 at a time.
  New messages continue it in its own folder.
- **Working folder:** the folder button under the input box shows where Claude works. Click it for recent folders
  and **Choose another folder…**. A conversation stays in its folder: choosing another one starts a new conversation.
  The first time, the first message asks for a folder.
- **A separate copy for each conversation (worktree):** with this on (folder menu or Settings → Conversations), in a
  git repo each new conversation works in its own copy of the repo (`.claude/worktrees/<name>`) on its own branch
  (`claude/<name>`), so several conversations on the same project do not step on each other. From the git panel you
  then **Merge into <base>** or open a pull request, and **Delete the copy** when done.

## Writing to Claude

- **Enter** sends, **Shift+Enter** for a new line. Lists continue by themselves (Shift+Enter on a "- " or "1. " line),
  Tab/Shift+Tab indent them, Ctrl+B and Ctrl+I add bold and italic.
- **Attachments:** paste a screenshot or copied files (Ctrl+V), drag files onto the window, or use **+**. Images
  are sent as images, other files as paths Claude opens with its tools.
- **`@` to mention a file:** type `@` for the files and folders of the conversation folder, filtered as you type.
- **`/` for commands:** Claude Code's commands, including your skills, plugins and project commands. `/clear` and
  `/new` start a new conversation, `/memory` opens the memory panel, `/export` exports the conversation.
- **Dictation:** the microphone next to **+** turns on Windows voice typing (the same as Win+H) in the input box.
- **Suggested replies:** after a reply Claude Code may suggest your next message: a button under the reply sends it,
  and Tab writes it into the empty box.
- **Edit a sent message:** hover it and click **Edit**. The conversation restarts from there (the old one stays in
  the list); **Also restore the files to before this message** puts the files back as they were.
- **Stop:** **Esc** (or the stop button) stops Claude. **Ctrl+B** sends a long command or subagent to the
  background so Claude can move on.

## What Claude does

- **Actions** read in plain words ("Reads MapView.cpp", "Searches the code for …"), grouped under the summary line
  Claude Code writes; click to expand. File changes show a **diff** (removed lines in red, added in green).
- **Reasoning:** "Thinking…" with the text scrolling below; afterwards "Thought for N s", click to reopen.
- **Questions and plans:** when Claude asks you to choose, a card shows the options; in plan mode the plan appears in
  a card with **Approve the plan** and **Keep planning**.
- **Permissions:** the mode selector under the input box: **automatic** (a classifier approves the clear actions),
  **always ask**, **accept edits**, **plan**. Questions appear with **Allow**, **Always** and **Deny**, with the diff
  when they touch a file.
- **Tasks:** Claude's to-do list sits above the input box, with the current step highlighted.
- **Background tasks:** commands left running, subagents and monitors: "N in background" opens the list, with
  **Stop** and **Output**.
- **Context and plan usage:** the ring next to **Send** shows how full the context is (red over 80%); click it for
  the detail, **Compact now**, and your plan usage (5-hour session and week, with a claude.ai subscription).
- **Copy:** every code block has a copy button; under each message **Copy** copies it whole. Ctrl+Shift+C copies the
  last reply.

## Changes, comments and git

- **Changed files:** "N files +a −r" lists the files Claude changed in the conversation, with their diffs, **Open**
  and **Folder**.
- **Comment on a line:** hover a line of any diff and click **+** to write a comment. Comments wait above the input
  box and go out with the next message, with file, line and code, so Claude knows exactly what you mean.
- **Git:** in a repo, the branch button (with the number of changed files and "↑N" commits to push) opens the git
  panel: switch or create branches, see the changes since the last commit, **Commit** (Ctrl+Enter) or **Commit and
  push**, **Push**, and **Create pull request** (with the GitHub CLI `gh` if installed; otherwise the branch is
  published and the browser opens the page to create it). **Let Claude write it** asks Claude to write the commit
  message or the pull request for you.

## Preview of local servers

When Claude starts a dev server (`npm run dev` and the like), its address is recognized and **Preview · localhost:5173**
appears under the input box. It opens the page in a panel next to the conversation, with an address bar, reload,
open in browser, and **Snapshot for Claude**, which attaches an image of what the preview shows to your next message.
Drag the left edge to resize. Links to localhost in replies open there (Ctrl+click opens the browser). Ctrl+Shift+P
toggles the panel.

## Artifacts

Claude can publish **artifacts**: pages on claude.ai (explainers, diagrams, dashboards, small tools) that stay private
until you share them, as in the Claude desktop app. Ask for one ("make me a page that explains this project", "a
dashboard of these numbers").

- A **card** in the conversation shows each published or updated artifact: **Open** shows it in the panel next to
  the conversation, **↗** in the browser, **Copy link** copies its address. Links to artifacts in replies open in the
  panel too (Ctrl+click opens the browser).
- The first time, the panel asks you to sign in to claude.ai; the sign-in stays in Claudeleon. If a sign-in method
  does not work there, use **↗** and the browser.
- While Claude writes an HTML page on your computer, **Preview · page.html** under the input box shows it in the same
  panel, and it reloads every time Claude changes the file.
- **Settings → Artifacts** (or `/artifacts`) lists the artifacts published from the conversations on this computer,
  with their conversation, and opens the claude.ai gallery with all of them. The switch there turns artifacts off.

## Settings

**Settings** (bottom of the sidebar, Ctrl+, or the tray) has categories on the left:

- **General:** language, theme (change, create, import), always on top, start with Windows, position and size,
  notifications.
- **Claude:** model, reasoning level (Low, Medium, High, Extra, Max), Ultracode, permission mode, which Claude Code
  program to use, how sessions present themselves to other apps.
- **Conversations:** working folder, a separate copy (worktree) for each conversation.
- **Permissions:** Claude Code's permission rules in the three places it reads them: all projects
  (`~/.claude/settings.json`), this project shared with the repo (`.claude/settings.json`) and just you in this
  project (`.claude/settings.local.json`, where "Always" answers go). For each: **Without asking**, **Always ask**,
  **Never** (wins over everything) and extra folders Claude can work in. Rules look like `Bash(npm run test:*)`,
  `Read(./docs/**)`, `WebFetch(domain:github.com)`.
- **Memory:** the `CLAUDE.md` files Claude reads in every conversation: personal (`~/.claude/CLAUDE.md`), the
  project's (`CLAUDE.md`), just yours in the project (`CLAUDE.local.md`) and those of the folders above. An editor with
  a Markdown preview; Ctrl+S saves.
- **Artifacts:** the artifacts published from this computer, the claude.ai gallery, on/off.
- **Extensions:** MCP servers (status, where they come from, tools; on/off, reconnect) and plugins (on/off for all
  conversations). New ones are added from Claude Code (`/mcp`, `/plugin`, `claude mcp add`).
- **Updates:** status, release notes, **Check now**, automatic checks.
- **About:** version, project page, data folder, error log, keyboard shortcuts.

Changes to permissions and memory apply from the next message.

## Themes

- **Themes** (bottom of the sidebar or the tray) shows every theme with a preview. Switching keeps the conversation.
- **Essential**, the built-in theme, is light or dark following Windows.
- **Create a theme** opens the theme editor: name, nine colors (background, sidebar, input box and menus, text, muted
  text, accent, text on accent, borders, your messages), font, text size and corners. The window behind is the live
  preview. **Save and use** keeps it among your themes; **Edit** and **Delete** are on its card.
- **Export** saves any theme to a `.skin` file; **Import a theme** installs one. Themes made with the editor are
  only colors; a theme with a shape of its own contains code that runs in the window, so Claudeleon asks for
  confirmation before installing it: only install themes from people you trust.
- **Ask Claude for a theme:** in a conversation, write for example "make me a theme like an old terminal" or "a
  theme with my company's colors, light and dark". Claude knows how (Claudeleon gives it the `claudeleon-theme`
  skill, also as the `/claudeleon:claudeleon-theme` command), writes the theme into the themes folder and it appears
  in Themes right away; while it is the theme in use, every change Claude makes shows up live. To write themes by
  hand see [themes.md](themes.md).

## Keyboard shortcuts

| Keys | |
| --- | --- |
| Ctrl+N | New conversation |
| Ctrl+K | Search conversations |
| Ctrl+F | Find in conversation |
| Ctrl+, | Settings |
| Ctrl+Shift+C | Copy the last reply |
| Ctrl+Shift+P | Open and close the preview |
| Ctrl+B | Send what Claude is doing to the background |
| Esc | Stop Claude |
| F11 | Full screen |
| Ctrl+Alt+P | Show or hide the window from any program |

## Troubleshooting

- **Safe start:** if a theme keeps the app from starting (an error, a page that does not load within 20 seconds, two
  failed starts in a row), Claudeleon goes back to Essential and says so, with **Retry** and **Errors**. A damaged
  `config.json` is set aside as `config.rotto.json`. You can also start it with `--avvio-sicuro`.
- **Error log:** `errori.log` in the data folder (Settings → About → Errors).
- **Data folder:** `%APPDATA%\Claudeleon` (configuration, imported themes, logs). Uninstalling does not delete it.
  Conversations are Claude Code's own sessions (`%USERPROFILE%\.claude\projects`).

## From the source

- `avvia.cmd` in the repo runs the app without installing (it installs the dependencies the first time; you need
  [Node.js](https://nodejs.org) LTS). `crea-installer.cmd` builds the installer in `claude-skins\app\dist`.
- An app installed from an installer built from the repo updates from the repo (git pull and a new installer);
  Settings → Updates → **Updates from** switches it to the GitHub releases.
- `prove.cmd` runs the automated tests.
- **Releasing:** raise the version in `claude-skins/app/package.json`, merge it to `main`, then on GitHub run
  **Actions → Release → Run workflow**. The action runs the tests, builds the installer on Windows and publishes the
  release with `latest.yml`, from which installed apps update. The pull request titles become the release notes.
