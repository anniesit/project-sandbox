# About page (項目介紹 / About)

| | Chinese | English |
|---|---|---|
| URL | `/about` | `/en/about` |
| Webflow page id | `6ac5aed330eb71dead31b41b` | `6ac5ebfdab70365ca96517fe` |
| `.page-wrapper` `lang` | `zh-Hant` | `en` |
| Nav / Footer | `Nav` / `Footer` | `Nav EN` / `Footer EN` |

Static content, no data file and no page script. Three tabs: About the Project,
Terms of Use, Contact Us. The first tab is still placeholder text in both
languages.

## The tabs are a detached copy of the design-system Tabs component

The layout puts the tab list and the panes in two separate columns, which the
Tabs component cannot do, so it was unlinked into plain elements. The design
system's `tabs.js` still drives it, but only if these attributes survive:

| Attribute | Lives on |
|---|---|
| `data-tabs-component` | `.about-tab-wrap` (wraps both columns) |
| `data-tabs-menu` | `.tabs-menu` |
| `data-tabs-menu-dropdown-menu` + `data-tabs-menu-wrapper` | `.tabs-menu_dropdown-menu` |
| `data-tabs-link` / `data-tabs-link-button` | each `Tabs Link` instance (inside the component) |
| `data-tabs-pane` | each `.tabs-pane`, in the same order as the links |

**If any one is missing, `tabs.js` exits silently and clicks do nothing.** No
console error. Restructuring in the Designer has deleted them twice: unlinking
the component dropped the outer wrapper's attribute, and later deleting the
`.slot.cc-tabs-menu` div took `data-tabs-menu-wrapper` with it. Check this
table first whenever the tabs stop working.

`data-wf--tabs-menu--settings-alignment="vertical"` on `.tabs-menu` is the
component's Vertical setting; `tabs.css` keys the left-border style on it.

## Page CSS: bottom border between 480px and 767px

In that range the tab links sit in a row, so the `Page CSS` embed swaps the
vertical left border for a bottom border. It has to be an embed: the left
border comes from a `tabs.css` rule (attribute + class) that a Webflow class
cannot outrank, and Webflow has no breakpoint for "480–767 only". Scoped to
`.about-tab-wrap` so no other tabs are affected. Both pages carry the same
embed.

## Content notes

- The citation examples keep the source text's placeholders (`Dr. XXX`,
  `…/XXX` URLs, `Author, A. A. (2025)`, `January 1, 2025`); only the site
  title was filled in.
- The Chinese "引用指定網頁" example has the site title where the page name
  should be, and `《網站名稱》` where the site title should be — the reverse of
  the English. Needs a content decision.
