# Home page highlight thumbnails

One image per highlighted work, named after its catalogue entry id:

    DYP-000024.webp
    DYP-000027.webp
    DYP-000087.webp

The shortlist of ids lives in the `CONFIG` block at the top of
`../../home.js`. Add an id there, drop the matching `.webp` in here.

A missing file is not an error: `home.js` removes the `<img>` and the
`.u-img-cover` placeholder behind it shows through, so the card still
renders with its title and credits.

**After the Webflow code export** these files go to `/images/home-highlights/`
at the site root, and `IMG_BASE` in `home.js` becomes `"/images/home-highlights/"`.
Until then the default resolves against the script's own URL, so the same
folder serves the Vercel sandbox, the Webflow site and the local harness.
