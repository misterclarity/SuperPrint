/*
 * Composition scoring — an automatic filter on the luck of the draw.
 *
 * Every seed is a fresh roll, and some rolls simply compose badly: a frost
 * field whose flakes all crowd into one corner, a glyph stela with a bare top
 * band. The drawing rules are sound; the particular roll is not. Rather than
 * tighten the generators until they can no longer surprise, this measures a
 * handful of candidate seeds and keeps the best-composed one.
 *
 * What it measures is deliberately narrow, and the narrowness is the point:
 *
 *   extent   — does the drawing use the sheet, or huddle in the middle?
 *   symmetry — is the ink spread across the page, or lopsided?
 *
 * Neither term has an opinion about *what* is drawn. An earlier version scored
 * absolute ink coverage instead, and it was quietly destructive: it ranked
 * every circular composition below every rectangular one, because a disc on
 * portrait paper can only ever cover ~78% of the sheet. It would have deleted
 * the rose windows from Stained Glass and preferred the fattest wreath over the
 * most delicate one. Coverage measures density, not composition; these two
 * measure composition and ignore density, which is what we actually want.
 *
 * This cannot tell a beautiful mandala from a dull one. It catches the rolls
 * that look like mistakes, which is most of the difference between a good
 * gallery page and a mediocre one.
 *
 * Candidates always share style, complexity and paper, so the comparison is
 * like for like: a sparse style is not punished for being sparse.
 */

import { buildSVG, PAPERS, normalize } from './render.js';
import { randomSeed } from './rng.js';
import { parseFragment } from './path.js';

/**
 * Every drawn point on the sheet, in page coordinates.
 *
 * The reading and flattening is path.js's job; all this adds is the run
 * boundaries. Points that begin a new run are flagged `move` so the caller can
 * measure segment lengths without inventing a stroke across a pen-up jump, and
 * a closed subpath gets its first point again at the end, because the closing
 * segment is ink like any other.
 */
/*
 * Curves are flattened far more coarsely here than for drawing.
 *
 * This measures where the ink sits on a whole sheet — which half is heavier,
 * how far the drawing reaches — and at that scale a chord error of a fiftieth
 * of an inch is invisible in the result while being many times cheaper to
 * compute. Print tolerance would generate tens of thousands of points per page
 * to answer a question decided by the first two significant figures, and the
 * scoring runs several times per click.
 */
const MEASURE_TOLERANCE = 2;

export function samplePoints(svg) {
  // Everything before the first styled group is the white page background,
  // which says nothing about layout.
  const body = svg.slice(svg.indexOf('stroke-linejoin'));
  const out = [];

  for (const sub of parseFragment(body, MEASURE_TOLERANCE)) {
    const pts = sub.points;
    if (pts.length < 2) continue;
    out.push({ x: pts[0].x, y: pts[0].y, move: true });
    for (let i = 1; i < pts.length; i++) out.push(pts[i]);
    if (sub.closed) out.push(pts[0]);
  }
  return out;
}

/* ---------------------------------------------------------- the measure -- */

// Matches the border inset in render.js. Points on or outside it are dropped:
// the frame is identical on every candidate, so counting it would only dilute
// the differences we are trying to see.
const MARGIN = 0.045;

/**
 * Turn a point stream into ink: each segment's length, carried at its midpoint.
 *
 * Weighting by length rather than counting points matters. A hatched band emits
 * hundreds of short segments and a large plain circle emits a handful of long
 * ones; by point count the band would look many times heavier than it looks on
 * paper.
 */
function inkSegments(points, page) {
  const mx = page.w * MARGIN;
  const my = page.h * MARGIN;
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (b.move) continue;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    if (x <= mx || x >= page.w - mx || y <= my || y >= page.h - my) continue;
    const w = Math.hypot(b.x - a.x, b.y - a.y);
    if (w > 0) out.push({ x, y, w });
  }
  return out;
}

/**
 * Composition statistics.
 * @returns {{extent:number, symmetry:number, ink:number}}
 *   extent   — how far the drawing reaches, as a fraction of the usable sheet,
 *              taken over the *longer* axis. A disc as wide as portrait paper
 *              is already as large as it can be, and scores accordingly.
 *   symmetry — 1 minus the worst ink imbalance across four axes through the
 *              centre (vertical, horizontal, both diagonals). This is what
 *              catches a bald quarter or a corner-heavy scatter.
 */
export function measurePoints(points, page) {
  const ink = inkSegments(points, page);
  let total = 0;
  for (const p of ink) total += p.w;
  if (!total) return { extent: 0, symmetry: 0, ink: 0 };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of ink) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const extent = Math.max(
    (maxX - minX) / (page.w * (1 - 2 * MARGIN)),
    (maxY - minY) / (page.h * (1 - 2 * MARGIN)),
  );

  const cx = page.w / 2;
  const cy = page.h / 2;
  let worst = 0;
  for (let axis = 0; axis < 4; axis++) {
    let a = 0;
    let b = 0;
    for (const p of ink) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const side = axis === 0 ? dx : axis === 1 ? dy : axis === 2 ? dx + dy : dx - dy;
      if (side < 0) a += p.w;
      else b += p.w;
    }
    const imbalance = Math.abs(a - b) / total;
    if (imbalance > worst) worst = imbalance;
  }

  return { extent, symmetry: 1 - worst, ink: total };
}

/** Composition score in [0, 1]. Higher reaches further and sits more evenly. */
export function scoreOf({ extent, symmetry }) {
  return Math.min(1, extent) * symmetry;
}

/**
 * Measure one design end to end.
 *
 * The rendered SVG comes back with the metrics: the caller usually wants to
 * draw the winner, and re-rendering it would double the cost of the search for
 * nothing.
 */
export function measureDesign(params) {
  const p = normalize(params);
  const svg = buildSVG(p);
  const metrics = measurePoints(samplePoints(svg), PAPERS[p.paper]);
  return { ...metrics, score: scoreOf(metrics), svg };
}

const now = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

/**
 * Roll candidate seeds and return the best-composed one.
 *
 * The winner is an ordinary seed: it still redraws exactly the same page from
 * its URL, and nothing about reproducibility changes. All this does is skip
 * past the rolls that would have looked like mistakes.
 *
 * The work is bounded by time rather than by a candidate count, because the
 * styles differ by more than tenfold in cost — a Celtic weave scores in about a
 * millisecond, a dense contour map in thirty — and a phone is several times
 * slower than a laptop besides. A deadline spends whatever the device can
 * afford: many candidates on a fast machine, two or three on a slow one, and a
 * button that always responds at once.
 *
 * @param {object} params      style, complexity, paper… (seed is replaced)
 * @param {object} [opts]
 * @param {number} [opts.budgetMs]  wall-clock ceiling for the search
 * @param {number} [opts.max]       never test more than this many
 * @param {number} [opts.min]       test this many even if the budget is spent.
 *   Two is right where the page is the point, so the filter is never a no-op.
 *   One suits a wall of thumbnails: the costliest styles take longer to draw
 *   than the whole budget, and insisting on a second candidate there doubles
 *   the wait for the one tile least likely to be looked at closely.
 * @param {string[]} [opts.seeds]   fixed pool, for tests; ignores the budget
 */
export function pickBest(params, { budgetMs = 120, max = 8, min = 2, seeds } = {}) {
  const started = now();
  let best = null;
  let tested = 0;

  while (tested < (seeds ? seeds.length : max)) {
    const seed = seeds ? seeds[tested] : randomSeed();
    const result = { seed, ...measureDesign({ ...params, seed }) };
    tested++;
    if (!best || result.score > best.score) best = result;
    if (!seeds && tested >= min && now() - started >= budgetMs) break;
  }
  return best;
}

/** As `pickBest`, when only the seed is wanted. */
export function pickBestSeed(params, opts) {
  return pickBest(params, opts).seed;
}
