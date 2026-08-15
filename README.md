# SuperPrint

Generative coloring pages for adults, drawn in the browser and printable at home.

Every page is computed on demand from a seed — nothing is fetched from a library of
pre-made images, so the supply is effectively endless and no two pages are alike. The
whole site is static files with **no build step and no dependencies**, which makes it a
drop-in fit for GitHub Pages.

## Features

- **Twelve drawing styles** — Mandala, Kaleidoscope, Stained Glass, Botanical Wreath,
  Bloom Field, Frost Field, Folk Weave, Fractal Forms, Animals, Celtic Weave,
  Pattern Bands and Contour Map.
- **Reproducible seeds.** A design is a pure function of `(style, seed, settings)`, so the
  same inputs always redraw the identical page. Seeds are human-readable
  (`amber-thistle-408`) and every design's URL carries its full recipe.
- **Print-ready output.** Print straight from the browser, export a 300 DPI PNG, or take
  the vector SVG for poster-size printing, Illustrator/Inkscape or a cutting machine.
- **Colour it in, by finger or by mouse.** Tap or click an area to fill it, brush in
  shading, zoom into the fine detail, and print or save the result at 300 DPI. Work in
  progress survives leaving the page. See [Colouring](#colouring).
- **Five paper sizes** (US Letter and A4 in both orientations, plus square), three line
  weights — the bold setting is aimed at markers and low-vision colouring — and four
  border treatments.
- **Private by design.** No server, no accounts, no analytics, no network calls after the
  page loads. Saved designs live in `localStorage`. The one exception is opt-in, off until
  you configure it, and goes to a machine you own — see below.
- **Describe a page in words**, to a language model you are running yourself. Off by
  default; nothing is sent anywhere until you enter your own model's address. See
  [Describing a page to a local model](#describing-a-page-to-a-local-model).
- **Installable, and works with no network.** A service worker caches the whole site on
  first visit, so it opens and draws on a plane or in a waiting room. Browsers that offer
  installation put it on the home screen or in the dock, where it runs in its own window
  with no address bar.
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

Ten suites, all plain Node with no test framework:

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
  a corner, a subject wholly hidden, one wholly clear. Keeping the inside and keeping the
  outside must partition the subject exactly, with nothing lost or counted twice.
- `tests/fractal.test.mjs` — recursion depth stops before the pen runs out, and the limit
  tracks the room available rather than being a hard-coded number.
- `tests/paint.test.mjs` — the flood fill, on bitmaps whose right answer is known by
  construction: a fill covers its region exactly, a tap on a line is not a region, a
  broken outline leaks (and should), and growing the mask to hide the anti-aliasing does
  not reach through a stroke into the shape next door.
- `tests/llm.test.mjs` — reading a language model's answer. The model itself cannot be
  tested — it is on someone else's machine and says something different every time — but
  everything downstream of it can, and that is where the value is: JSON buried in
  apologies and code fences, `"Stained Glass"` where an id was asked for, `"very
  intricate"` where a number was, and replies with no JSON in them at all. Every case ends
  with a drawable page rather than an error.
- `tests/pwa.test.mjs` — walks the repository and requires the service worker's precache
  list to match it exactly: everything shipped is cached, everything cached exists. It
  also catches the failures a browser never reports — an absolute `start_url`, a missing
  maskable icon, a page that forgets the manifest — because the only symptom of those is
  an install button that quietly never appears.

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
max-age=600`, so a browser can hold the old CSS and JavaScript for up to ten minutes, and
the service worker will have cached whatever it was given. Loading the site in a private
window bypasses both.

## Colouring

`color.html` opens a design in a colouring mode: tap an area to fill it, brush in shading,
pinch to zoom into the detail, then print or save the result.

**Why it fills pixels, not shapes.** The obvious way to make an SVG colourable is to let
people tap the shapes and set their `fill`. It does not work here. A region on one of these
pages is almost never one closed path — it is the space enclosed by a ring, two petals and
a stem, each drawn independently and none of them aware of the others. Tapping a shape
would colour a whole chain of petals, or nothing at all. So the artwork is rasterised once,
and a flood fill spreads across a paint layer beneath it, stopped wherever there is ink.
What gets coloured is the region a person can see, which is the only definition that
matters. Counted across the twelve styles, that gives between 27 and 976 distinct fillable
regions on a single sheet.

Two consequences worth knowing:

- **The threshold matters more than it looks.** Rasterised strokes are anti-aliased, so a
  line is a ramp rather than an edge. Treat only solid pixels as walls and fills seep out
  through the corners where two lines cross; treat the faintest tint as a wall and every
  filled region gets a white halo. The wall sits at just over a third of full opacity, and
  the finished mask is then grown by one pixel so the colour slides *under* the stroke,
  where the artwork is drawn on top of it and hides the join.
- **A gap in the outline leaks, and that is correct.** Line art with a break in it has no
  enclosed region, so a fill that helpfully stopped somewhere would be inventing a boundary
  the reader cannot see. Undo is the answer to a leak, not a guess.

**Gestures.** A finger is not a mouse, and a single finger must never have an ambiguous
job. With the fill tool one finger taps to fill and drags to pan; with the brush or eraser
one finger draws; two fingers always pinch and pan, and a second finger arriving mid-stroke
rewinds the stroke it interrupted rather than smearing it.

**On a desktop** the same page gets what a mouse and a keyboard can offer and a finger
cannot. The wheel zooms about the pointer, so what you were looking at stays where it was.
The brush shows a ring of the size it will actually paint — guessing and undoing is a poor
substitute for seeing it, and the question does not arise on a phone because a finger
covers the answer. `f`, `b` and `e` switch tools, `0` fits the sheet back to the window,
and undo has a redo beside it (`⌘Z` / `⇧⌘Z`, or `Ctrl+Z` / `Ctrl+Shift+Z` — the page prints
whichever pair your keyboard actually has). Redo is keyboard-only: it earns its place next
to a shortcut that is easy to press twice, and not a fourth button on a phone's toolbar.

Every instruction on the page is written twice and chosen at runtime, because telling a
mouse to pinch is worse than saying nothing.

**Layout.** The sheet is fitted to the stage by measurement rather than by CSS: fitting a
fixed ratio inside a box needs both a width and a height constraint to resolve, and a
percentage height has nothing definite to resolve against inside a flex column. It fails
silently — the sheet simply runs off the bottom of a wide window — which is exactly how it
shipped until a desktop screenshot showed the bottom third of the page missing. Landscape
phones, where the palette would otherwise take half the window, stand the tools up as a
rail beside the sheet instead.

**Resolution.** The sheet is coloured at a raster sized so that even the finest pen draws a
wall at least two pixels thick — the paper's own units are far too coarse for that, and
print resolution would be eight million pixels of work per tap. The artwork you look at is
the SVG itself rather than that raster, so it stays sharp however far in you zoom; the
raster is kept off-screen purely as the fill's walls. Exports composite fresh at 300 DPI,
redrawing the line art from the SVG rather than scaling the screen copy up.

Work in progress is saved to `localStorage` (the paint layer only — the artwork under it is
a pure function of the URL) and restored when you come back, because on a phone leaving a
page is rarely a decision.

## Describing a page to a local model

The studio has a **Describe a page** box that asks a language model — one you are running
yourself — to choose the settings for you. "A calm page of autumn leaves, for markers"
becomes Botanical Wreath, detail 2, bold pen, and a seed called `autumn-ember`.

**It is off until you configure it.** With no model set the field is disabled and no
request is made to anything, which is checked in the browser as part of testing this. There
is no hosted service behind it and no API key: the address you enter is the only place
anything is sent, it is stored in your browser's own storage, and **Forget** removes it.

**What the model actually does.** It does not draw. It reads your description and sets the
same dials the panel already has — style, detail, paper, pen, border — and names the seed.
The linework is still the generator's, identical to what you would get by setting those
dials by hand. That is worth knowing because it tells you what to ask for: requests about
*mood, subject and who the page is for* are answered well, because those really are
questions about the dials. "A mandala with exactly seven petals" is not, and no amount of
prompting will make it so.

Two details make it behave rather than misbehave:

- **What the model did not understand keeps its old value.** A reply naming only a style
  changes only the style; the paper size you chose by hand survives it. The box then says
  what was taken — "Set: style, detail" — because a model that quietly ignored half your
  request should not look like it obeyed all of it.
- **The seed is a family, not a roll.** The model is good at naming `autumn-ember` and has
  no idea which particular roll of that seed lands lopsided, since it never sees the
  drawing. So a name without a number becomes a family, and the composition filter picks
  the member that uses the sheet best. A model that returned a complete seed is obeyed
  exactly — that is someone reproducing a specific page.

Anything else a model says is treated as a suggestion from something unreliable: parsed out
of whatever prose it arrived wrapped in, mapped onto the vocabulary the site has, then
clamped. A model that returns nonsense produces a valid page, not an error.

### Setting it up

Click **Connect** in the box. Enter the address, press Connect, pick a model, Save. It
speaks both the OpenAI-compatible API (Ollama, LM Studio, llama.cpp, vLLM, Jan) and
Ollama's own, and works out which is which by asking.

Two things have to be true, and both have unhelpful symptoms if they are not.

**1. The server has to allow this page's origin.** Browsers refuse cross-origin requests
that the server has not opted into, and report the refusal identically to "the machine is
switched off". For Ollama:

```bash
# listen beyond localhost, and accept the page's origin
OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS='https://misterclarity.github.io' ollama serve
```

LM Studio has a CORS toggle beside its server switch; `llama-server` has `--host` and its
own CORS flag. Use your real origin rather than `*` if the machine is reachable by anyone
else on the tailnet.

**2. If SuperPrint is served over HTTPS, the model must be too.** A page on
`https://…github.io` cannot make requests to a plain `http://` address — the browser blocks
it before it leaves, with no useful error. SuperPrint checks for this itself and says so
rather than letting you wonder.

Tailscale solves it: with MagicDNS and HTTPS certificates enabled for your tailnet, it will
put a real certificate in front of a local port.

```bash
tailscale serve --bg 11434        # then use https://<machine>.<tailnet>.ts.net
tailscale serve status            # confirms what is being served where
```

(The exact `serve` syntax has changed across Tailscale versions; `tailscale serve --help`
is authoritative for yours.) The alternative, if you would rather not, is to run SuperPrint
from `http://localhost` — browsers exempt loopback from the mixed-content rule, so a plain
`http://` model works there, and SuperPrint knows that too.

Nothing about this is required. The site works exactly as it did without it.

## Offline and installation

The site is a progressive web app: `manifest.webmanifest` describes it to the browser and
`sw.js` caches it.

The strategy is stale-while-revalidate throughout — answer from the cache immediately,
then refresh it in the background for next time. For a site that computes everything
locally that is the right trade: pages open instantly and work with no network at all, and
an update lands one visit later rather than being blocked on a round trip. Nobody is left
sitting on an old version, though: when a new worker has finished installing, a small bar
offers the new version and reloads on request.

Two things about it are less obvious than they look:

- **Every path is relative** — in the manifest (`start_url`, `scope`, `id`), in the
  precache list, and in the page `<link>`s. An absolute `/` works perfectly at a custom
  domain and breaks silently under `user.github.io/SuperPrint/`, where the only symptom is
  that the browser stops offering to install.
- **The precache list is written by hand**, because there is no build step to generate it.
  A hand-written list of every file in a project is the definition of something that rots —
  add a generator, forget the list, and the site passes every test and works perfectly in
  the browser right up until someone opens it on a train and one module 404s. That is what
  `tests/pwa.test.mjs` exists to prevent.

Query strings are dropped from cache keys, since a design's whole recipe lives in the URL:
`studio.html?style=mandala&seed=amber-thistle-408` is the same document as `studio.html`,
and keying on the full URL would store a copy of the page for every design anyone opened.

## How it works

```
index.html  studio.html  gallery.html  saved.html      pages
color.html                                            colouring mode
sw.js  manifest.webmanifest                           offline and installation
assets/js/core/   rng · sketch · shapes · render · export · store
                  path · clip · layer · quality   (geometry and composition)
                  paint                           (the flood fill)
                  llm                             (optional, opt-in, local only)
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
- **Animals** builds cats, dogs and fish from parts rather than tracing photographs.
  Everything is authored in unit space at the origin, so every proportion is a plain
  fraction of the animal's size and reading the numbers tells you the face. Cats and dogs
  are head-and-shoulders portraits facing the viewer, separated where they actually
  differ: a cat's head is one rounded mass, wider at the cheeks than it is tall, with high
  triangular ears and whisker pads meeting under a small wedge nose; a dog's skull narrows
  at the cheeks and a snout steps forward *out of the silhouette*, which is the difference
  between a dog and a cat with a big nose. Coats — tabby bars, a blaze, an eye patch,
  spots — are chosen once and carried onto both face and chest.

  A fish gets a different treatment: face-on it is a sliver with two eyes and no
  silhouette worth the name, so it is drawn in profile, whole, and swims across the page
  in a shoal with bubbles and weed. Its scales are the point — rows of overlapping arcs,
  each one big enough to hold a pencil.

  Every marking is clipped to the shape it is painted on, which is `clip.js` run inverted:
  keep what falls inside rather than cut away what falls behind.

- **Fractal Forms** draws six families that are each built by applying one rule to their
  own output: the Sierpinski triangle, self-similar tilings, nested Koch snowflakes, the
  dragon curve, a Pythagoras tree, and an Apollonian gasket. The gasket is packed using
  Descartes' circle theorem — given three mutually tangent circles, the curvature of a
  fourth tangent to all three is `k4 = k1 + k2 + k3 ± 2√(k1k2 + k2k3 + k3k1)`, and its
  complex companion places the centre; the outer circle carries a negative curvature
  because it contains the rest rather than touching them from outside.

  Every family is parameterised, because a fractal that takes no parameters draws the same
  picture on every seed. The tilings are the clearest case: the Sierpinski carpet is only
  one member of a family that divides a square into n×n cells and keeps some, so the mask
  is what varies — the named classics (carpet, Vicsek, saltire, lattice) alongside
  four-fold symmetric masks generated per seed, with square, inset, round or diamond holes.
  Dragons come in ones, twos and fours about a shared origin, which interlock exactly
  because the curve tiles the plane with copies of itself. Pythagoras trees vary in where
  the apex sits along the square's top edge *and* how far it stands off it — the second is
  what changes a tree's silhouette from a tight spire to a sprawling canopy, and fixing it
  at the textbook right-angle value makes every tree the same fan.

  Depth is never a free parameter: detail multiplies two- or threefold per level, so one
  step too far fills a figure in solid, and each family derives its ceiling from the size
  of its own smallest feature against the widest pen on offer.
  `tests/fractal.test.mjs` checks that the ceiling really does track the space available —
  a depth limit that is merely a hard-coded number passes the obvious test and still fills
  in solid on a small tile. Which families can show their construction step by step was
  settled by measurement rather than taste: a quarter-page cell has room for about four
  levels of the fastest-shrinking figure and two or three of the rest, so only the triangle
  and the gasket visibly change at every step, and only those appear in the four-cell
  progressions.

## Licence

MIT — see [LICENSE](LICENSE). Pages you generate are yours to use freely, including
commercially.
