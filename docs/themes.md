# Writing a Claudeleon theme

A theme decides **everything you see**: the shape of the window (its HTML and CSS), colors, texts, drawings, the
window size and Claude's tone. The engine does not know whether the window is a scroll, a book or a map: it finds the
pieces it needs through `data-*` attributes, wherever the theme puts them.

There are three ways to make a theme:
- **The theme editor** (Themes → Create a theme): nine colors, font, text size and corners, no code. It saves a
  "colors" theme based on the modern kit.
- **The modern kit in a few lines** of `theme.js`, for a clean theme with your own colors (see below).
- **A theme of your own:** a folder with `theme.js` (and `theme.css`, fonts, images…) with its own layout.

Every theme can be **exported** to a `.skin` file (Themes → Export) and **imported** elsewhere (Themes → Import a
theme).

## Where themes live

Built-in themes are folders in `claude-skins/app/src/renderer/themes/` (only `essenziale` ships with the app).
Imported themes live in the app data folder (`%APPDATA%\Claudeleon\temi\<id>\`) and the window loads them from
`skins-theme://<id>/`. The folder name is the theme id and must match the `id` in its `theme.js`.

To write a new theme: create its folder in `src/renderer/themes/`, try it (see "Trying a theme"), then export it from
the theme picker and share the `.skin` file.

```
themes/
  essenziale/       modern kit, light or dark like Windows (kit.adaptive): the default theme
kits/
  pixel.css         the shared pixel style (fonts, stepped borders, paper palette)
  moderno.js        the structure of clean themes (layout, hooks, SVG icons, preview): a theme only gives colors
  moderno.css       the shape of clean themes: a framed window with a shadow, sidebar, bubbles, the pulsing dot
```

## The `theme.js` file

The same file is read by the window (with `<script>`) and, for built-in themes, by the main process (with `require`,
for name, size and `persona`). The main process never runs the code of an imported theme: it reads name, description,
size and persona from the `theme.json` that Export writes into the package. So the file always starts with this
wrapper:

```js
;(function (theme) {
  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})({
  id: 'my-theme',
  name: 'My theme',
  layout: `<div data-solid>...</div>`,
  // ...
})
```

Drawing functions only run in the window, so they can use `window.Pixel` and `document`; top-level code cannot.

| Field | What it does | If missing |
| --- | --- | --- |
| `id`, `name` | Identity and name in menus | `id` is required |
| `names`, `descriptions` | The name and description per language, e.g. `{ it: '…' }` | `name`, `description` |
| `description` | One line shown in the theme picker | — |
| `layout` | The window HTML (see below) | A warning box: it is always needed |
| `css: true` | Loads `theme.css` from the theme folder | Only the common style |
| `kits` | Shared styles to include before `theme.css`, e.g. `['pixel']` | None: the neutral `style.css` |
| `artScale` | How much pixel drawings are scaled up (`data-art`, `data-art-bg`) | 3 |
| `hooks` | Functions called when something happens (see below) | None |
| `window` | `{ width, height, minWidth, minHeight }` in pixels | 1080×760, at least 360×480 |
| `persona` | Text added to Claude Code's system prompt: the tone of replies. A string, or `{ en, it }` | A neutral sentence |
| `strings` | Interface texts (keys of `STRINGS` in `theming.js` and `lang/en.js`), the same for all languages or `{ en: {…}, it: {…} }` | The engine's texts in the chosen language |
| `date(d, plainDate)` | The date under the conversation title; `plainDate(d)` gives "November 26, 2026" | `plainDate` |
| `scenes.notte`, `scenes.giorno` | `palette` for drawings, `vars` for CSS variables, for the night and day scenes | The default colors |
| `followSystem` | Night/day follow Windows' dark/light setting | Fixed scene, or the scene button |
| `art` | Drawings by name (see below) | No drawings |
| `edges: false` | No invisible resize handles on the window edges | Handles on |

## The layout

`layout` is an HTML string placed inside `<div id="app">`, filling the window. The window is transparent: where the
layout draws nothing you see what is behind it.

### The pieces the engine looks for

All optional except `log` and `input`. A missing piece simply means that feature is not there.

| Attribute | What it is |
| --- | --- |
| `data-part="log"` | Where the conversation scrolls. The engine adds the entries (class `item`); other content (e.g. the conversation title) stays |
| `data-part="input"` | The `textarea` you write in. Typing `/` or `@` opens a menu (`.cmd-menu`, rows `.cmd`) above it, inside its container |
| `data-part="todos"` | Claude's task list (`.todos`, header `.todos-head`, rows `.todo.pending/.in_progress/.completed`). If missing, the engine creates it right before the input's container |
| `data-part="tasks"` | The background tasks button (`.tasks-btn`, `.running` with a spinner), which opens `.theme-picker.tasks-panel` |
| `data-part="files"` | The changed-files button (`.files-btn`, hidden until there are some), which opens `.theme-picker.files-panel` |
| `data-part="git"` | The git button (`.git-btn` with the branch, `.dirty` with changes, `.worktree` in a separate copy; hidden outside a repo), which opens `.theme-picker.git-panel`. If missing, the engine adds it inside `data-part="folder"` |
| `data-part="preview"` | Optional: where the preview panel goes (`.preview-pane`, `.pv-bar`, `.pv-addr`, `.pv-frame`). If missing, right after the layout's `<main>` |
| `data-part="preview-btn"` | Optional: where the "Preview · localhost:…" button goes (`.preview-btn`); if missing, inside `data-part="tasks"` |
| `data-part="context"` | The context ring (`.context-btn`, `.warn` over 80%), which opens `.folder-menu.context-menu` |
| `data-part="model"` | The model and reasoning button (`.model-btn`), which opens `.folder-menu.model-menu` |
| `data-part="attachments"` | The attachments strip (`.attachment.image`, `.attachment.file`, `.attachment.review`, each with `.attachment-remove`). If missing, the engine creates it right before the `textarea` |
| `data-part="folder"` | The conversation folder: the engine puts a `.folder-btn` here that opens `.folder-menu` |
| `data-part="hint"` | The hint under the input, which changes while Claude works |
| `data-part="chapter-title"`, `data-part="chapter-date"` | The conversation title and its date |
| `data-part="modes"` | The permission mode selector. With `data-style="menu"` it is one button (`.mode-btn`) opening a menu, like the desktop app; without, one `.mode` button per mode (`data-perm-mode`), the active one `.active`. `body[data-perm-mode]` also tells the mode to the CSS |
| `data-part="sessions"` | The saved conversations panel. With `hidden` it is an overlay opened by `data-action="sessions"`; with `data-mode="always"` it is always visible, like the desktop app's sidebar |
| `data-part="sessions-search"` | The search field (an `input`). If missing, the engine creates `.sessions-search` above the list |
| `data-part="sessions-list"` | The list of conversations (rows `.session-row`, groups `.session-group`, snippets `.session-snippet`) |

Other things the engine adds, which a theme can restyle: line comments on diffs (`.dl-cm`, `.dl-edit`, `.dl-note`,
`.review-bar`, `.sent-comments`), the dictation button (`.attach-btn.dictate-btn` after `data-action="attach"`, or
your own `data-action="dictate"`, Windows only), the panels (`.theme-picker` with `.settings-box`: settings,
permissions `.perm-panel`, memory `.mem-panel`, welcome `.welcome-panel`, what's new `.news-panel`), the theme editor
(`.theme-editor`, outside `#app`), the working line (`.item.working` with `.w-spin`, `.w-verb`, `.w-dots`, `.w-time`)
and suggested replies (`.item.suggestions`, `.suggestion-chip`).

### Commands: `data-action`

On any clickable element (also more than one per action):

| Action | What it does |
| --- | --- |
| `send`, `stop` | Sends the message; stops Claude. The engine shows one or the other (`hidden`) |
| `new` | New conversation |
| `sessions`, `sessions-close` | Opens and closes the saved conversations overlay |
| `settings` | Opens settings (also Ctrl+,) |
| `themes` | Opens the theme picker: a panel over the layout (inside the first `data-solid` element) with a card per theme |
| `scene` | Night ↔ day. If the element is empty, the engine writes the name of the other scene |
| `attach` | Picks files or images to attach (pasting and dragging always work) |
| `dictate` | Windows voice typing in the input box |
| `memory`, `preview` | Opens the memory panel; toggles the preview panel |
| `hide`, `quit` | Minimizes the window; quits the app |
| `maximize`, `fullscreen` | Fills the work area, or the whole screen; again to restore. On an empty `.ctl.max` the engine draws the icon |

### The window: `data-solid`, `data-drag`, `data-grip`

- `data-solid`: clicks belong to the app over these elements and go through the window elsewhere. Usually on the main
  container and on every piece that sticks out.
- `data-drag`: hold here to move the window (except buttons, fields, conversation rows and `data-no-drag` elements).
- `data-grip`: drag here to resize from the bottom-right corner.
- **Edges:** the engine adds invisible handles (`.edge`, `data-resize`) on the sides and corners of the first
  `data-solid` element. `edges: false` in `theme.js` turns them off.
- Maximized or full screen, `body` has the class `maximized` or `fullscreen`: the theme can drop transparent margins,
  corners and shadows (the modern kit does).

### Texts

- `data-s="key"` sets the text.
- `data-s-placeholder` and `data-s-title` set the placeholder and the tooltip.

Keys are those of `STRINGS` in `theming.js` (Italian) and `lang/en.js` (English); a theme overrides them in `strings`.
On a theme or language change the engine rewrites everything.

### Drawings

| Attribute | What it does |
| --- | --- |
| `<canvas data-art="name">` | The theme's `art.name` drawing. Its on-screen size comes from the canvas CSS; the drawing gets that size divided by the scale. While resizing it is redrawn only if its size changed: keep it fast |
| `data-art-fit="natural"` | The drawing decides the size (each pixel becomes scale×scale) |
| `data-art-scale="2"` | This drawing's scale instead of the theme's. With `1` the drawing is full resolution |
| `data-art-smooth` | Scaled smoothly instead of with crisp pixels: for non-pixel drawings |
| `data-art-anim` | Redrawn every 180 ms with a new frame: for a candle, a flame… |
| `data-art-arg="..."` | An extra value for the drawing, e.g. to mirror it |
| `data-art-bg="name"` | On any element: the drawing as a repeated background (paper, leather). Drawn on mount and scene change; `data-art-bg-resize` also redraws it on resize |

## Drawings: `art`

Each drawing is a function receiving an object and returning a **canvas**:

```js
art: {
  paper: ({ pal }) => Pixel.lib.paperTile(pal),
  roll: ({ w, pal }) => Pixel.lib.roll(w, pal),
  lamp: ({ pal, frame, busy }) => Pixel.lib.candle(pal, frame, busy),
}
```

The object holds `width` and `height` (screen pixels), `w` and `h` (divided by the scale) and `scale`, `pal` (the
scene palette), `scene` (`'notte'` or `'giorno'`), `frame` and `busy` (whether Claude is working), `arg`
(`data-art-arg`) and `el` (the element).

Drawing names are free: they are those the layout uses. Three are special:
- **`trayIcon({ pal })`** returns the tray icon: a 16×16 canvas (pixel art, scaled up crisply) or 32×32.
- **`preview({ pal, scene, width, height })`** draws the theme picker preview (144×90). If missing, the engine composes
  one from `paper`, `leather` or `roll`, and `trayIcon`.
- **`icons`** is an object `{ craft: icon }` for the action icons. Crafts are `leggere` (read), `scrivere` (write),
  `forgiare` (build), `cercare` (search), `messaggi` (messages), `compagnia` (agents), `mappa` (plan) and `altro`
  (other). An icon can be rows of a 12×12 pixel bitmap, an SVG string (`'<svg …>'`), a file in the theme folder
  (`'icons/read.svg'`), a canvas, or a function `({ pal, scene, craft })` returning one of these.

`window.Pixel` has the tools (`canvas`, `px`, `bitmap(rows, colors)`, `mirror`, `seeded`, `upscale`, `SCALE`) and
ready-made drawings in `Pixel.lib` (`paperTile`, `roll`, `dashes`, `candle`, `trayScroll`).

## Hooks

Functions the engine calls when something happens, for animations, sounds or a character. They first receive a
context `{ root, part(name), all(selector), scene, busy, theme, asset(path), t(key), Pixel, redraw() }`; `asset` gives
the address of a file in the theme folder, e.g. `new Audio(ctx.asset('pen.ogg')).play()`. Then:

| Hook | When | After the context |
| --- | --- | --- |
| `mount`, `unmount` | The theme layout was just mounted; is about to be removed | — |
| `busy` | Claude starts or stops working | `true` or `false` |
| `reply` | A written reply starts | — |
| `tool` | Claude uses a tool | `{ name, craft, summary, change }` |
| `toolDone` | A tool finished | `{ error }` |
| `ask` | A permission question or a plan arrives | the question |
| `done`, `error` | The reply finished; stopped with an error | `{ durationMs }`; the message |
| `scene` | Night ↔ day | `'notte'` or `'giorno'` |
| `chapter` | A new conversation starts or a saved one opens | — |
| `preview` | The preview panel opens | the address |

The state is also visible to CSS: `body.busy` while Claude works, `body.giorno` by day, `body[data-perm-mode]`,
`body[data-theme]`, `body.has-preview`. A hook that throws does not stop the app.

## Colors: `palette` and `vars`

- `palette` is for drawings. Default keys are in `PALETTES` in `theming.js`; add the ones your drawings need.
- `vars` is for the interface: the CSS variables listed at the top of `style.css` (`ink`, `gold` — the accent —,
  `edge`, `btn-bg`, `deny-bg`, `font-body`, `font-code`, `radius`, `add-bg`, `del-bg`, `plus`, `minus`…), written
  without `--`. A theme can add its own and use them in its CSS.

## `theme.css` and `style.css`

- `style.css` applies to every theme and is neutral: system fonts, thin borders, rounded corners, gray with one
  accent. It styles the conversation entries, diffs, menus, panels, buttons (`.btn`, `.ctl`) and scrollbars. It has no
  window shape.
- A **kit** (`kits/<name>.css`) is a whole style shared by several themes; it can also have a JS structure
  (`kits/<name>.js`). `kits/moderno.js` is `kit({ id, name, description, look })` returning a whole theme (layout,
  hooks, icons, preview, tray): the theme only gives `look.palette` and `look.vars`. `kits/moderno.css` also reads
  `side-bg`, `frame-shadow`, `box-shadow`, `you-bg` and `you-edge`.
- `theme.css` is active only while the theme is in use, so rules need no prefixes. It holds the window shape and can
  override anything in `style.css`.
- A new font goes in the theme folder, declared with `@font-face` in `theme.css` with a relative path
  (`url('fonts/x.woff2')`). Only local files are allowed.

## A modern-kit theme in a few lines

```js
;(function () {
  const kit = typeof module === 'object' && module.exports ? require('../../kits/moderno.js') : window.SkinsKits.moderno
  const theme = kit.adaptive({
    id: 'harbor', name: 'Harbor', description: 'Sea blues, light or dark like Windows.',
    light: { colors: { bg: '#f7fafc', side: '#e8f0f5', surface: '#ffffff', ink: '#16202a', inkSoft: '#5f6e7a', accent: '#1f6fb2', line: '#d7e1e8', bubble: '#e2eef8' }, font: 'sistema', radius: 10 },
    dark: { colors: { bg: '#0f1720', side: '#14202b', surface: '#1b2733', ink: '#e3ebf2', inkSoft: '#8ea0ae', accent: '#5aa9e6', line: '#2a3846', bubble: '#1d3550' }, font: 'sistema', radius: 10 },
  })
  if (typeof module === 'object' && module.exports) module.exports = theme
  else (window.SkinsThemes = window.SkinsThemes || []).push(theme)
})()
```

`kit.fromColors({ id, name, colors: { bg, side, surface, ink, inkSoft, accent, onAccent, line, bubble }, font,
textSize, radius })` makes a single-look theme; `kit.adaptive({ …, light, dark })` one that follows Windows. Fonts:
`sistema`, `moderno`, `serif`, `libro`, `mono`. All other variables are derived from these colors.

## Sharing a theme: the `.skin` file

**Export** saves a JSON `{ format: 'claude-skins-theme', version: 1, kind, … }`:
- `kind: 'code'`: a `manifest` (`id`, `name`, `description`, `persona`, `window`) and `files`, every file of the
  folder in base64 (`theme.js`, `theme.css`, `fonts/…`). Allowed: js, css, json, images (png, jpg, gif, webp, svg),
  fonts (woff, woff2, ttf, otf), txt and md, up to 25 MB, no paths outside the folder.
- `kind: 'colors'`: `spec`, an editor theme (nine colors, font, text size, corners).

**Import a theme** checks the file, asks for confirmation for a theme with code (it runs in the window, with access
to conversations), and installs it in `temi/<id>/` (replacing one with the same id after asking). The id cannot be a
built-in theme's.

## Trying a theme

- **In a browser**, without Electron and without Claude: open
  `claude-skins/app/src/renderer/index.html?tema=<id>&scena=giorno`. A fake conversation answers what you type and
  there are some fake conversations; add `&lingua=en` or `&lingua=it` for the language. In the console,
  `anteprima.tema('<id>')` switches theme in place and `anteprima.permesso()` shows a permission question. A new
  built-in theme must be added to the `fakeApi` list in `renderer.js`.
- **In the real window:** `electron . --cattura test.png giorno chat --tema <id>` (from `claude-skins/app`) saves a
  screenshot at the theme's size, or add e.g. `900x640` after `chat`.
