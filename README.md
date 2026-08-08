# SuperPrint

Generative coloring pages for adults, drawn in the browser and printable at home.

Every page is computed on demand from a seed — nothing is fetched from a library of
pre-made images, so the supply is effectively endless and no two pages are alike. The
whole site is static files with **no build step and no dependencies**, which makes it a
drop-in fit for GitHub Pages.

## Features

- **Twelve drawing styles** — Mandala, Kaleidoscope, Stained Glass, Botanical Wreath,
  Bloom Field, Frost Field, Folk Weave, Glyph Stela, Geometric Tiles, Celtic Weave,
  Pattern Bands and Contour Map.
- **Reproducible seeds.** A design is a pure function of `(style, seed, settings)`, so the
  same inputs always redraw the identical page. Seeds are human-readable
  (`amber-thistle-408`) and every design's URL carries its full recipe.
- **Print-ready output.** Print straight from the browser, export a 300 DPI PNG, or take
  the vector SVG for poster-size printing, Illustrator/Inkscape or a cutting machine.
- **Five paper sizes** (US Letter and A4 in both orientations, plus square), three line
  weights — the bold setting is aimed at markers and low-vision colouring — and four
  border treatments.
- **Private by design.** No server, no accounts, no analytics, no network calls after the
  page loads. Saved designs live in `localStorage`. It works offline.
- **Built for phones too.** On a narrow screen the studio pins the preview to the top of
  the viewport and scrolls the controls beneath it, so every setting you change stays
  visible — no scrolling back and forth between the dials and the design. The seed and
  detail controls ride along inside that pinned block, and tapping the preview fills the
  screen with it (tap anywhere to come back). Landscape phones get a side-by-side layout
  instead, where there is width but no height to spare.
- Light and dark themes, keyboard shortcuts, and layouts that hold together from 320px up.

## Running locally

Any static file server will do — ES modules need `http://`, so opening `index.html`
straight off the filesystem will not work.

```bash
npm run serve      # python3 -m http.server 8080
# then open http://localhost:8080
```

## Tests

```bash
npm test
```

Two suites, both plain Node with no test framework:

- `tests/generators.test.mjs` — renders every style across all complexity levels, paper
  sizes, line weights and borders, asserting well-formed SVG, no `NaN`/`undefined` in the
  output, a sane amount of linework, and byte-identical results for identical inputs.
- `tests/bounds.test.mjs` — asserts no artwork strays off the sheet. Off-page geometry is
  invisible on screen because the SVG clips it, but shows up as clipped or crossing lines
  on paper.

## Deploying to GitHub Pages

There are two ways to publish this, and which one is live depends on a repository
setting under **Settings → Pages → Build and deployment → Source**:

- **Deploy from a branch** (what this repo currently uses). GitHub runs its own built-in
  "pages build and deployment" job on every push to the selected branch and copies the
  repository as-is. Nothing in `.github/workflows` is involved.
- **GitHub Actions.** `.github/workflows/pages.yml` runs the tests and then publishes the
  repository root on pushes to `main`. It stays dormant under the other setting.

Either way `.github/workflows/ci.yml` runs the test suites on every branch.

Because the site is static, any of these works — `.nojekyll` is present so Jekyll leaves
the files alone, and all paths are relative, so it serves correctly from a project
subpath (`user.github.io/SuperPrint/`) as well as from a custom domain.

**Seeing a stale version after a deploy?** Pages serves files with `Cache-Control:
max-age=600`, so a browser can hold the old CSS and JavaScript for up to ten minutes.
Loading the site in a private window bypasses that entirely.

## How it works

```
index.html  studio.html  gallery.html  saved.html      pages
assets/js/core/   rng · sketch · shapes · render · export · store
assets/js/gen/    one module per drawing style
assets/js/pages/  per-page controllers
```

A generator receives a seeded RNG and a content box, and appends SVG markup to a
`Sketch`. It never touches the DOM, which is what lets the identical code path drive the
on-screen preview, the gallery thumbnails, the downloads and the print sheet — what you
see really is what prints.

Adding a style means writing one module with `{ id, name, blurb, tags, draw(sk, ctx) }`
and listing it in `assets/js/gen/index.js`; everything else (studio controls, gallery
filters, exports, saving) picks it up automatically.

Notes on a few of the algorithms:

- **Stained Glass** subdivides the page recursively, always cutting across each cell's
  longest axis so the tessellation cannot shed thin slivers, then insets each convex pane
  to form the lead came.
- **Celtic Weave** is a Truchet tiling where every tile connects the midpoints of all four
  edges, so any random tile assignment still yields continuous ribbons; crossings get an
  over/under break.
- **Contour Map** samples a field of Gaussian peaks and traces it with marching squares,
  picking levels at quantiles rather than even heights so the lines spread evenly instead
  of bunching on the steep slopes.
- **Folk Weave** works in the shared grammar of counted-thread textiles — kilim, Andean
  pallay, Nordic knitting, cross-stitch, sashiko — rather than copying any one tradition's
  patterns: motifs composed on a lattice, mirrored, and stacked into bands between guard
  stripes.
- **Frost Field** and **Bloom Field** both scatter by rejection sampling, largest shapes
  first. Frost Field follows how snow crystals actually grow: a crystal starts as a small
  hexagonal plate and its six branches sprout from that plate's corners, so arms begin at
  the hub rather than after a bare stem. Sidebranches leave at multiples of 60° and run
  parallel to their neighbours, and they stay short near the centre — squeezed into the
  gap between two arms competing for the same vapour — which is what makes a stellar
  dendrite read as a six-pointed star instead of a disc. Dendrites branch recursively and
  a second form draws nested Koch snowflake rings, both self-similar the way real crystals
  are. Fractal depth is derived from what the line width can resolve rather than picked by
  eye: a Koch edge is `r/3^depth` across, and left unchecked the smaller flakes fill in
  solid black. Every element is a closed outline — a bare stroke encloses no area, so
  there would be nothing to colour, which `tests/closed-shapes.test.mjs` asserts.
- **Glyph Stela** reproduces the *structure* of Classic Maya inscriptions and fills it
  with invented signs. **These are not real Maya glyphs and they spell nothing** — Maya
  script is a living heritage with a largely deciphered vocabulary, so inventing readable
  text would be a forgery and freehand "hieroglyphic-looking" doodles would be a
  caricature. What the generator follows is the documented grammar: glyph blocks square
  in outline but with rounded corners; one large main sign per block plus narrow affixes
  (roughly 2:1–3:1) in the superfix, prefix, postfix and subfix slots; main signs in
  either abstract or head-variant (profile) form; blocks laid out in paired columns,
  which read in a zigzag A1→B1→A2→B2; bar-and-dot coefficients (dot 1, bar 5, shell 0)
  attached as prefixes; and day signs set in a pedestalled cartouche. Sign interiors are
  assembled from the formal vocabulary the catalogues describe — enclosing outlines,
  crossed bands, scroll volutes, dotted bands, brackets, hatching and spots.

## Licence

MIT — see [LICENSE](LICENSE). Pages you generate are yours to use freely, including
commercially.
