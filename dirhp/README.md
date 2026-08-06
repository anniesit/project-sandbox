# dirhp — Digital Scholarship Grant pages (DIR site)

Assets for the four DSG pages on Webflow site `68b941f0b649bf28538221f0`, served from this
sandbox and linked from the Webflow pages' custom-code embeds.

| File | What it is |
|---|---|
| `dsg.css` | Page CSS — token bridge, plus the rules a Webflow class can't express |
| `dsg.js` | Funded-projects list: renders and filters `dsg-projects.json` |
| `dsg-projects.csv` | **The file you edit.** Open in Excel / Numbers |
| `dsg-projects.json` | Generated. What the page fetches — do not hand-edit |
| `build-projects.py` | `dsg-projects.csv` → `dsg-projects.json` |
| `tabs.css`, `tabs.js` | Copied verbatim from design-system `v0.4.5` (`1696217`) |
| `accordion.css`, `accordion.js` | Same — do not edit these four here |

## Updating the project list

```bash
python3 build-projects.py
```

Then commit and push; Vercel redeploys. The script warns about unknown tracks or statuses,
duplicate codes, and values in the URL columns that don't look like URLs.

## Load order in Webflow

In the page's **Page CSS** embed:

```html
<link rel="stylesheet" href="https://<sandbox-domain>/dirhp/tabs.css">
<link rel="stylesheet" href="https://<sandbox-domain>/dirhp/accordion.css">
<link rel="stylesheet" href="https://<sandbox-domain>/dirhp/dsg.css">
```

`dsg.css` must come **last** — it defines the tokens the other two resolve through.

In the **Page JS** embed (give it `.u-d-none` so it doesn't render as an alert block on canvas):

```html
<script src="https://<sandbox-domain>/dirhp/tabs.js" defer></script>
<script src="https://<sandbox-domain>/dirhp/accordion.js" defer></script>
<script src="https://<sandbox-domain>/dirhp/dsg.js" defer></script>
```

`dsg.js` is only needed on the two pages that carry a project list.

## The token bridge is temporary

`tabs.css` and `accordion.css` resolve through the design system's token names
(`--primary--text`, `--_layout---spacing--md`, …), which the DIR site does not define yet.
The `:root` block at the top of `dsg.css` aliases them onto the existing DIR palette.

When the Webflow token layer lands — see `MIGRATION.md` step 1 in the CTC Code repo — delete
that block. Nothing else changes.

## Notes

- `vercel.json` at the repo root grants `Access-Control-Allow-Origin: *` on `/dirhp/*`.
  `dsg.js` fetches the JSON cross-origin, so this is required; the CSS and JS `<link>`/`<script>`
  tags would work without it.
- The project list is client-rendered, so the 17 projects are not in the served HTML. If search
  engines need to index them, bake the rows in server-side during the PHP transform and leave
  `dsg.js` to handle filtering only.
