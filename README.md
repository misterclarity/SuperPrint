# SuperPrint

Generative coloring pages for adults, drawn in the browser and printable at home.

Every page is computed on demand from a seed — nothing is fetched from a library of
pre-made images, so the supply is effectively endless and no two pages are alike. The
whole site is static files with **no build step and no dependencies**, which makes it a
drop-in fit for GitHub Pages.

## Features

- **Twelve drawing styles** — Mandala, Kaleidoscope, Stained Glass, Botanical Wreath,
  Bloom Field, Frost Field, Folk Weave, Fractal Forms, Geometric Tiles, Celtic Weave,
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

Seven suites, all plain Node with no test framework:

- `tests/generators.test.mjs` — renders every style across all complexity levels, paper
  sizes, line weights and borders, asserting well-formed SVG, no `NaN`/`undefined` in the
  output, a sane amount of linework, and byte-identical results for identical inputs.
- `tests/bounds.test.mjs` — asserts no artwork strays off the sheet. Off-page geometry is
  invisible on screen because the SVG clips it, but shows up as clipped or crossing lines
  on paper.
- `tests/closed-shapes.test.mjs` — a bare stroke encloses no area, so Frost Field must be
  built entirely from closed outlines or there is nothing to put colour into.
- `tests/line-weight.test.mjs` — changing the pen must change only how thick the ink is,
  never what is drawn. Renders each design at every weight, strips the widths, and
  requires what is left to be identical.
- `tests/quality.test.mjs` — composition scoring, including the guarantee that it has no
  opinion about shape: a disc and a rectangle that both fill the sheet must score alike.
- `tests/clip.test.mjs` — path flattening and polygon clipping, against perimeters worked
  out in advance, with the awkward cases pinned: coincident edges, shapes touching only at
  a corner, a subject wholly hidden, one wholly clear.
- `tests/fractal.test.mjs` — recursion depth stops before the pen runs out, and the limit
  tracks the room available rather than being a hard-coded number.

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
                  path · clip · layer · quality   (geometry and composition)
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

Two passes sit between the generators and the page:

- **Layering.** Drawing is additive, so a leaf laid across a berry leaves both outlines
  complete and crossing — a tangle of slivers too small to put a pencil in, rather than a
  leaf on a berry. `layered()` draws back to front and lets each motif knock out what it
  covers, which is a boolean difference over the flattened outlines (`path.js` →
  `clip.js`). Only closed shapes occlude: a leaf's silhouette hides what is under it, its
  veins do not. Shapes nothing overlaps are emitted exactly as drawn, curves and all, so a
  page pays for clipping only where it shows. The same machinery unions a motif's own
  outlines into one silhouette where the pieces are meant to read as a single shape —
  that is what turns a serrated leaf's teeth from beads-on-a-line into a toothed edge.
- **Composition scoring.** Every seed is a fresh roll and some land badly — a frost field
  crowded into one corner, a scatter that leaves one half of the sheet bare. `quality.js`
  measures a few
  candidate seeds and keeps the best-composed one. It scores only *extent* (does the
  drawing use the sheet?) and *symmetry* (is the ink spread evenly?), never ink density:
  scoring density ranks every circular composition below every rectangular one, because a
  disc on portrait paper can only cover about 78% of it. The winner is an ordinary seed,
  so a shared URL still redraws exactly the same page. The search is bounded by time
  rather than by a candidate count, because the styles differ more than tenfold in cost.

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
- **Fractal Forms** draws six families that are each built by applying one rule to their
  own output: the Sierpinski triangle and carpet, nested Koch snowflakes, the dragon
  curve, a Pythagoras tree, and an Apollonian gasket. The gasket is packed using
  Descartes' circle theorem — given three mutually tangent circles, the curvature of a
  fourth tangent to all three is `k4 = k1 + k2 + k3 ± 2√(k1k2 + k2k3 + k3k1)`, and its
  complex companion places the centre; the outer circle carries a negative curvature
  because it contains the rest rather than touching them from outside. Depth is never a
  free parameter: detail multiplies two- or threefold per level, so one step too far
  fills a figure in solid, and each family derives its ceiling from the size of its own
  smallest feature against the widest pen on offer. `tests/fractal.test.mjs` checks that
  the ceiling really does track the space available — a depth limit that is merely a
  hard-coded number passes the obvious test and still fills in solid on a small tile.
  Which families can show their construction step by step was settled by measurement
  rather than taste: a quarter-page cell has room for about four levels of the fastest-
  shrinking figure and two or three of the rest, so only the triangle and the gasket
  visibly change at every step, and only those appear in the four-cell progressions.

## Licence

MIT — see [LICENSE](LICENSE). Pages you generate are yours to use freely, including
commercially.
