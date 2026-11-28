---
name: claudeleon-theme
description: Create, edit or fix a theme (skin) for Claudeleon, the themeable desktop app this conversation runs in. Use when the user asks for a new look, colors, a theme, a skin, a style "like X", or to change or fix the current Claudeleon theme. Themes are written straight into Claudeleon's themes folder and show up in the app live.
---

# Claudeleon themes

You are running inside **Claudeleon**, a desktop app for Claude Code whose whole look comes from a theme. You can
make themes for it. The app watches its themes folder: a theme you write there appears in **Themes** right away, and
if it is the theme in use, every file you save shows up in the window immediately. So work in small steps and let
the user look.

**Where:** the folder is in the environment variable `CLAUDELEON_THEMES_DIR` (on Windows usually
`%APPDATA%\Claudeleon\temi`). Read it with `echo $CLAUDELEON_THEMES_DIR` (bash) or `$env:CLAUDELEON_THEMES_DIR`
(PowerShell). Never write theme files anywhere else, and never touch files there that you did not create unless the
user asks you to edit that theme.

## 1. Pick the kind of theme

- **Colors only** (most requests: "a dark blue theme", "colors like my company's", "warmer"): one JSON file,
  `<id>.json`, in the themes folder. No code. The user can then also tweak it in Themes → Edit.
- **Light and dark following Windows**, or a few touches beyond colors (texts, Claude's tone, small CSS changes):
  a folder `<id>/` with `theme.js` built on the modern kit, plus `theme.json`, and optionally `theme.css`.
- **A shape of its own** (a book, a terminal, a game screen…): a folder with `theme.js` that has its own `layout`
  HTML, `theme.css`, maybe drawings, fonts and hooks. Read `reference/guide.md` first: it lists every piece the app
  needs (`data-part="log"` and `data-part="input"` are required) and how drawings, hooks, colors and texts work.

Ask only what you cannot decide yourself (for example "light, dark or both?"). The `id` is lowercase letters,
digits and dashes, and must not be `essenziale`; the name can be anything.

## 2. Write it

**Colors only** — `<themes dir>/<id>.json`:

```json
{
  "name": "Dusk",
  "description": "Warm evening colors with an amber accent",
  "colors": { "bg": "#1b1a20", "side": "#221f28", "surface": "#2a2631", "ink": "#ece6dc", "inkSoft": "#a59d93",
              "accent": "#e8a04c", "onAccent": "#1b1a20", "line": "#3a3442", "bubble": "#3b2f2a" },
  "font": "sistema", "textSize": 15, "radius": 10
}
```

The nine colors are background, sidebar, input box and menus, text, muted text, accent, text on the accent
(omit it to have it computed), borders and the user's message bubbles. Fonts: `sistema`, `moderno`, `serif`, `libro`,
`mono`. Check the contrast: `ink` on `bg` and `onAccent` on `accent` must be easy to read (aim for 4.5:1).

**A folder theme** — `<themes dir>/<id>/`:
- `theme.json`, which the app reads (it never runs your code outside the window):
  `{ "id": "<id>", "name": "…", "description": "…", "persona": "…", "window": { "width": 1100, "height": 760, "minWidth": 560, "minHeight": 440 } }`.
  `persona` is an optional sentence added to Claude's system prompt for the tone of replies (empty for none).
- `theme.js`, with the wrapper every theme uses (see the examples). Its `id` must equal the folder name and
  `theme.json`'s id. In an installed theme, take the modern kit from `window.SkinsKits.moderno`.
- `theme.css` if `theme.css = true` (or `css: true`), fonts and images with relative paths.
- In `theme.js`, set `engine` to the Claudeleon version you are writing for: it is in the environment variable
  `CLAUDELEON_VERSION` (e.g. `engine: '1.2.0'`). The theme picker shows it.

Prefer keeping the modern kit's `layout` when the request allows it (colors, fonts, CSS, texts, hooks): such a theme
updates by itself when Claudeleon adds buttons. Write your own `layout` only for a shape of its own, and then include
every command in the guide's tables, including the newest ones ("What changed for themes").

Start from an example and change it:
- `examples/harbor/` — modern kit, light and dark following Windows (`kit.adaptive`): only colors.
- `examples/terminal/` — modern kit plus its own `theme.css`, texts in English and Italian, a persona and a hook.
- `examples/dusk.json` — a colors-only theme.

`reference/variables.md` lists the CSS variables and the nine kit colors.

## 3. Let the user see it

Tell the user to open **Themes** (bottom of the sidebar) and click the new theme. From then on it is the theme in
use: each time you save one of its files the window reloads it, so you can adjust it together ("darker sidebar",
"rounder corners") and they see the result at once. If something breaks badly, Claudeleon falls back to its default
theme and shows the error; fix the file and choose the theme again.

When it is done, mention that **Themes → Export** saves it to a `.skin` file they can share, and **Import a theme**
installs one.

## Updating a theme to a newer Claudeleon

When asked to update a theme (the theme picker's **Update with Claude** asks it this way): read the theme's
`theme.js`, then the "What changed for themes" table in `reference/guide.md`. For each piece from a version newer
than its `engine` (or all of them, if it has no `engine`) that its `layout` lacks, add it where it fits the theme's
style, usually next to the theme's other buttons, styled like them. Then set `engine` to `CLAUDELEON_VERSION`. Change
nothing else unless asked. The theme reloads as you save; Claudeleon stops adding its own copy of a button as soon
as the layout has it.

## Rules

- Only write inside the themes folder, and only the theme you are making or were asked to edit.
- Keep everything local: no external URLs for scripts, styles, fonts or images (they are blocked anyway).
- Do not copy logos, artwork or exact branding of companies or franchises; a theme "inspired by" a mood or palette
  is fine.
- Answer in the language the user writes in.
