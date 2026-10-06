# Dark theme — backup

Saved 2026-10-05, just before the dark theme was removed from the Webflow site
**Danny Yung Archive Design** (`6a9a35a2fff31509fd87b275`).

The client chose the light theme. This file records every dark-theme setting
that existed on the site, so it can be rebuilt if they change their mind.
Nothing here is live any more.

## What was changed on 2026-10-05

- **Theme variables.** All 11 Base values went from `light-dark(…)` to a plain
  link to their light primitive. Surface and Tag also had `light-dark()` in the
  Accent mode, and those are now light-only too. The rest of Accent mode is
  untouched.
- **Override block.** The theme-switching patch (section 3) was replaced by a
  `LIGHT ONLY` rule. It sets `color-scheme: light` and forces the Lightning CSS
  polyfill to its light half on `:root`, `html.u-mode-light` and
  `html.u-mode-dark`.
- **DS_CONFIG embed.** A `LIGHT ONLY` script now saves `'light'` under the
  theme key before the bundle loads. `theme-toggle.js` reads that first, so it
  always sets `u-mode-light` on `<html>` and never consults the OS.
- **`.u-mode-dark` class.** Its `color-scheme: dark` was removed, which leaves
  it identical to `.u-mode-light`. The class itself could not be deleted:
  Webflow refuses while elements use it, and neither the Data API nor the
  Designer tool can edit classes on `<body>`.

**Still to do by hand in the Designer:** on each of the 10 pages in section 2,
select Body and remove `u-mode-dark`. Then delete the class in the Style
Manager. Then publish.

## How the dark theme worked

Four pieces had to line up:

1. **Theme variables held both palettes.** Each colour token in the Webflow
   `Theme` collection was a `light-dark(light, dark)` expression.
2. **A class picked the palette.** `u-mode-dark` on `<html>` (set by the design
   system's `theme-toggle.js`) or on `<body>` (set by hand in the Designer)
   chose the dark half.
3. **A CSS patch made the switch actually work.** The design system's
   `theme-toggle.css` has a bug that leaves both halves active at once. The
   project override block in the `Custom Code Forked` component fixed it.
4. **The body class forced dark for the client preview.** Every page had
   `<body class="u-mode-dark">`, so the client saw dark whatever their OS said.

## 1. Theme variables

Collection `Theme` — `collection-7df4a73c-9a56-a8b7-efe4-68d0c5f0336d`.
Two modes: **Base** (`base`) and **Accent** (`mode-bf6faaa8-2bf5-9c53-b568-f9d802b7c009`).

### Base mode

The value was typed by hand in the Designer as a custom expression. It cannot
be written back through the Data API: `custom_value` writes fail there.

| Variable | CSS name | Exact Base value | Light | Dark |
|---|---|---|---|---|
| Primary/Background | `--primary--background` | `light-dark(var(--_color---neutral--200),var(--_color---neutral--800))` | Neutral/200 `#cccccc` | Neutral/800 `#262626` |
| Primary/Surface | `--primary--surface` | `light-dark(var(--_color---neutral--100),var(--_color---neutral--700))` | Neutral/100 `#dbdbdb` | Neutral/700 `#383838` |
| Primary/Text | `--primary--text` | `light-dark(var(--_color---neutral--900),var(--_color---neutral--white))` | Neutral/900 `#171717` | Neutral/White `#ffffff` |
| Primary/Text Invert | `--primary--text-invert` | `light-dark(var(--_color---neutral--white),var(--_color---neutral--900))` | Neutral/White `#ffffff` | Neutral/900 `#171717` |
| Primary/Title | `--primary--title` | `light-dark(var(--_color---red--550),var(--_color---red--500))` | Red/550 `#d60035` | Red/500 `#ff0a47` |
| Primary/Border | `--primary--border` | `light-dark(var(--_color---red--550),var(--_color---red--550))` | Red/550 `#d60035` | Red/550 `#d60035` |
| Primary/Accent Light | `--primary--accent-light` | `light-dark(var(--_color---red--550),var(--_color---red--400))` | Red/550 `#d60035` | Red/400 `#f53d6b` |
| Primary/Accent | `--primary--accent` | `light-dark(var(--_color---red--550),var(--_color---red--500))` | Red/550 `#d60035` | Red/500 `#ff0a47` |
| Primary/Button | `--primary--button` | `light-dark(var(--_color---red--550),var(--_color---red--500))` | Red/550 `#d60035` | Red/500 `#ff0a47` |
| Primary/Button Dark | `--primary--button-dark` | `light-dark(var(--_color---red--300),var(--_color---red--600))` | Red/300 `#f37292` | Red/600 `#9f032a` |
| Primary/Tag | `--primary--tag` | `light-dark(var(--_color---neutral--500),var(--_color---red--600))` | Neutral/500 `#808080` | Red/600 `#9f032a` |

Variable ids, in the same order:
`variable-9da3735a-3665-e4a7-0144-bd2d3cac66d2`,
`variable-8bb55795-dfd9-c90b-1a51-1ddff0e876ce`,
`variable-f3ad99f6-c570-2079-815f-5d1330cb061f`,
`variable-85c45d76-0748-2ed3-ec91-85acf442994a`,
`variable-fd1b343c-bbdf-c4d5-465e-a1e9c8b23a73`,
`variable-11024737-13f6-2e44-62c6-dbf07da4d227`,
`variable-aa6ea54f-876d-1716-67ca-8cba9db45366`,
`variable-509e6879-1afd-6ed5-a87a-b21acc301485`,
`variable-4dbb8bbe-80da-6280-760a-2133c30eaeae`,
`variable-a961bcf0-49c2-f8dd-291d-886c4a2afb3c`,
`variable-081604cc-1330-6afb-b138-cbd63c5df242`.

### Accent mode

Most Accent values were plain aliases, not light/dark pairs. Only two used
`light-dark()`.

| Variable | Accent value |
|---|---|
| Primary/Background | → Blue/900 `#031333` |
| Primary/Surface | `light-dark(var(--_color---neutral--100),var(--_color---neutral--700))` |
| Primary/Text | → Neutral/White |
| Primary/Text Invert | → Blue/900 |
| Primary/Title | → Neutral/White |
| Primary/Border | → Fire/500 `#fe3f14` |
| Primary/Accent Light | → Fire/500 |
| Primary/Accent | → Fire/500 |
| Primary/Button | → Fire/600 `#9d1e01` |
| Primary/Button Dark | → Fire/600 |
| Primary/Tag | `light-dark(var(--_color---neutral--500),var(--_color---red--600))` |

### Primitives the dark half used

All in the `Color` collection. None of them were deleted, so restoring only
needs the expressions above.

| Primitive | Value |
|---|---|
| Neutral/White | `#ffffff` |
| Neutral/700 | `#383838` |
| Neutral/800 | `hsla(0, 0%, 15%, 1)` = `#262626` |
| Neutral/900 | `#171717` |
| Red/400 | `#f53d6b` |
| Red/500 | `#ff0a47` |
| Red/550 | `#d60035` |
| Red/600 | `#9f032a` |

## 2. The mode classes (Webflow styles)

| Class | Properties |
|---|---|
| `.u-mode-dark` (`ad0439d0-2353-5fcd-a0d6-747241c0c9f8`) | `background-color: Primary/Background`, `color: Primary/Text`, `color-scheme: dark` |
| `.u-mode-light` (`4c7af59d-83b2-9b4c-4168-82b363e9c750`) | `background-color: Primary/Background`, `color: Primary/Text`, `color-scheme: light` |

`.u-mode-dark` was applied to `<body>` on every published page:

```
/                            /en/home
/catalogue                   /en/catalogue
/entry                       /en/entry
/dataviz                     /en/dataviz
/supplementary-materials     /en/supplementary-materials
```

## 3. The theme patch in the project override block

It lived in the `Custom Code Forked` component (`cc571fdd-0dde-aee2-8b21-191cd1bc33c6`),
embed `6624c52f-0842-8e32-c1a6-f9810e1c5893`, right after the
`design-system.css` link. Verbatim:

```css
  /* ---- THEME SWITCHING — patches a bug in the design system ----
     theme-toggle.css declares the Lightning CSS polyfill variables directly
     inside @media blocks with NO SELECTOR:

         @media (prefers-color-scheme: dark) {
           --lightningcss-light: ;        <- invalid, dropped by the browser
           --lightningcss-dark: initial;
         }

     Declarations must sit inside a rule, so the browser discards them, both
     variables stay empty, and every light-dark() token resolves to BOTH of
     its values at once (--primary--background computed to "white #1d1c1a").
     It also never defines what .u-mode-light / .u-mode-dark should do, so the
     class the toggle script sets on <html> changes nothing but the <select>
     arrow.

     Fixed here so the toggle works on this site. The real fix belongs in
     design-system/components/theme-toggle/theme-toggle.css — delete this
     block once that lands, it affects every project on the system. */
  @media (prefers-color-scheme: dark) {
    :root {
      --lightningcss-light: ;
      --lightningcss-dark: initial;
    }
  }
  @media (prefers-color-scheme: light) {
    :root {
      --lightningcss-light: initial;
      --lightningcss-dark: ;
    }
  }
  /* An explicit choice beats the OS preference: a class selector outranks
     :root, and media queries add no specificity. */
  html.u-mode-light {
    color-scheme: light;
    --lightningcss-light: initial;
    --lightningcss-dark: ;
  }
  html.u-mode-dark {
    color-scheme: dark;
    --lightningcss-light: ;
    --lightningcss-dark: initial;
  }
```

## 4. The toggle

- **Script.** `theme-toggle.js` ships inside the shared design-system bundle
  (`design-system.anniesit.link/bundles/design-system.js`). It reads
  `localStorage[DS_CONFIG.themeKey]` first. If nothing is saved, it follows the
  OS `prefers-color-scheme`. It then sets `u-mode-light` or `u-mode-dark` on
  `<html>`. The bundle is shared by every project, so it was not edited.
- **Key.** `DS_CONFIG.themeKey` = `'danny-yung-archive-theme'`, set in the
  `Custom Code Forked` embed `07a091b6-09bb-e6f6-cd0b-febbb565f309`.
- **Component.** `Theme Toggle` (`db2b0437-5c93-7264-4366-68fd2d8408a8`) has 17
  instances, most on the Mast style-guide pages and one in the catalogue head.
  `.theme-toggle-component` is `display: none` site-wide, so none of them show.

## 5. Dark settings outside Webflow (not removed)

- `dataviz.css` → "1b. tokens, dark" block, keyed on `html.u-mode-dark`. It is
  served from Vercel, and it goes inert once `<html>` can no longer get that
  class.
- `dataviz.js` and `DATAVIZ.md` describe the same dark keying.
- The `Invert` variants on Nav, Footer, Nav EN and Footer EN, and the Theme
  `Accent` mode, are colour variants, not the light/dark switch. They are
  listed here only because they are dark-looking.

## Restoring the dark theme

1. In the Designer, retype each Base value from the table in section 1.
2. Put the section 3 CSS back in the override block, replacing the light pin.
3. Remove the localStorage pin from the `DS_CONFIG` embed. It is the block
   commented "LIGHT ONLY", just above `window.DS_CONFIG`.
4. Add `u-mode-dark` back to `<body>` to force dark, or leave it off to let the
   OS decide.
