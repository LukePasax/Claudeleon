# CSS variables of a Claudeleon theme

Set them in a scene's `vars` (without `--`), or in `theme.css` on `body`. Values below are the app defaults (dark);
`body.giorno` has a light set. Themes from the modern kit (`kit.fromColors`, `kit.adaptive`) derive all of them from
nine colors, so you rarely set them by hand there.

| Variable | What it colors |
| --- | --- |
| `font-body`, `font-display`, `font-code` | Body text, titles, code and diffs |
| `text-size`, `code-size`, `small-size` | Font sizes (15px, 13px, 12px) |
| `radius`, `radius-small`, `line` | Corner radius (8px, 5px) and border width (1px) |
| `ink`, `ink-soft`, `strong` | Text, muted text, emphasized text (bold, titles) |
| `gold`, `gold-light`, `gold-dark` | The accent and its lighter/darker variants (links, focus, active items) |
| `red` | Errors |
| `bg`, `surface`, `field`, `code` | Window background, panels/cards, input fields, code blocks and subtle fills |
| `edge`, `edge-light` | Strong and light borders |
| `btn-bg`, `btn-hover`, `btn-light`, `btn-dark`, `btn-ink`, `btn-ring` | Primary buttons (Send, Allow…) |
| `deny-bg`, `deny-light`, `deny-dark`, `deny-ink` | Secondary buttons (Deny, Cancel…) |
| `ctl-bg`, `ctl-hover`, `ctl-ink` | Window controls (minimize, maximize, close) |
| `add-bg`, `add-ink`, `del-bg`, `del-ink`, `plus`, `minus` | Added and removed lines in diffs, and their counts |
| `menu-bg`, `veil`, `shadow` | Menus and panels, the dimming behind panels, their shadow |
| `title-ink`, `title-glow`, `initial-ink`, `initial-bg` | Conversation title; drop cap (for book-like themes) |

Modern kit only (`kits/moderno.css`):

| Variable | What it colors |
| --- | --- |
| `side-bg` | The sidebar |
| `you-bg`, `you-edge` | Your message bubbles |
| `frame-radius`, `frame-shadow`, `box-shadow` | The window frame's corners and shadow, the input box shadow |

The nine colors of `kit.fromColors` / the theme editor: `bg` (background), `side` (sidebar), `surface` (input box
and menus), `ink` (text), `inkSoft` (muted text), `accent`, `onAccent` (text on accent; computed if omitted), `line`
(borders), `bubble` (your messages). Fonts: `sistema` (Segoe UI), `moderno` (Bahnschrift), `serif` (Georgia), `libro`
(Palatino), `mono` (Cascadia/Consolas). `textSize` 12–20, `radius` 0–20.
