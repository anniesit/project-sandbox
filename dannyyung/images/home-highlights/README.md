# Home page highlight thumbnails

One image per highlighted work, named after its catalogue entry id:

    DYP-000024.webp
    DYP-000027.webp
    DYP-000087.webp

The shortlist of ids lives in the `CONFIG` block at the top of
`../../home.js`. Add an id there, drop the matching `.webp` in here.

**This folder stays where it is, next to `home.js`**, on every copy of the
site: the Vercel sandbox the Webflow site loads, and the exported UAT build
(`vendor/dannyyung/images/home-highlights/`). `home.js` finds it relative to
its own URL, so no path needs changing when the files move together.

Make them 560 × 420 px (4:3), like the current files. WebP keeps
them small.

A missing file is not an error: `home.js` removes the `<img>` and the
`.u-img-cover` placeholder behind it shows through, so the card still
renders with its title and credits.
