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

/* ------------------------------------------------------- affine helpers -- */

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** SVG matrix composition: apply `m` first, then `n`. */
function compose(n, m) {
  return [
    n[0] * m[0] + n[2] * m[1],
    n[1] * m[0] + n[3] * m[1],
    n[0] * m[2] + n[2] * m[3],
    n[1] * m[2] + n[3] * m[3],
    n[0] * m[4] + n[2] * m[5] + n[4],
    n[1] * m[4] + n[3] * m[5] + n[5],
  ];
}

function apply(m, x, y) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

const RAD = Math.PI / 180;

/**
 * Parse the transform forms this codebase emits: translate, rotate (with and
 * without a centre) and scale, in sequence.
 */
function parseTransform(text) {
  let m = IDENTITY;
  const re = /(translate|rotate|scale)\(([^)]*)\)/g;
  let hit;
  while ((hit = re.exec(text))) {
    const a = hit[2].trim().split(/[\s,]+/).map(Number);
    if (hit[1] === 'translate') {
      m = compose(m, [1, 0, 0, 1, a[0] || 0, a[1] || 0]);
    } else if (hit[1] === 'scale') {
      m = compose(m, [a[0] ?? 1, 0, 0, a.length > 1 ? a[1] : a[0] ?? 1, 0, 0]);
    } else {
      const c = Math.cos((a[0] || 0) * RAD);
      const s = Math.sin((a[0] || 0) * RAD);
      let r = [c, s, -s, c, 0, 0];
      if (a.length >= 3) {
        // rotate(deg cx cy) == translate(c) · rotate(deg) · translate(-c)
        r = compose([1, 0, 0, 1, a[1], a[2]], compose(r, [1, 0, 0, 1, -a[1], -a[2]]));
      }
      m = compose(m, r);
    }
  }
  return m;
}

/* --------------------------------------------------------- path sampling -- */

const ARGS = { M: 2, L: 2, C: 6, Q: 4, A: 7, Z: 0 };

/**
 * Points along a path, including curve midpoints so bows are not missed.
 *
 * Points that begin a new run are flagged `move`, so a consumer measuring
 * segment lengths does not invent a stroke across a pen-up jump.
 */
function pathPoints(d, out, m) {
  const tokens = d.match(/[MLCQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const push = (x, y, move) => {
    const p = apply(m, x, y);
    if (move) p.move = true;
    out.push(p);
  };

  while (i < tokens.length) {
    const cmd = tokens[i++].toUpperCase();
    const n = ARGS[cmd];
    if (n === undefined) continue;
    const a = [];
    for (let k = 0; k < n; k++) a.push(Number(tokens[i++]));

    if (cmd === 'M') {
      [cx, cy] = a;
      sx = cx;
      sy = cy;
      push(cx, cy, true);
    } else if (cmd === 'L') {
      [cx, cy] = a;
      push(cx, cy);
    } else if (cmd === 'C') {
      // Midpoint of the cubic, so a long bow contributes where it actually is.
      const mx = (cx + 3 * a[0] + 3 * a[2] + a[4]) / 8;
      const my = (cy + 3 * a[1] + 3 * a[3] + a[5]) / 8;
      push(mx, my);
      cx = a[4];
      cy = a[5];
      push(cx, cy);
    } else if (cmd === 'Q') {
      push((cx + 2 * a[0] + a[2]) / 4, (cy + 2 * a[1] + a[3]) / 4);
      cx = a[2];
      cy = a[3];
      push(cx, cy);
    } else if (cmd === 'A') {
      // Sampled by its chord: enough to place the arc, and the arcs this
      // codebase draws are shallow enough that the error is small.
      cx = a[5];
      cy = a[6];
      push(cx, cy);
    } else if (cmd === 'Z') {
      // The closing stroke is real ink, so it is emitted like any other line.
      cx = sx;
      cy = sy;
      push(cx, cy);
    }
  }
}

const ATTR = (src, name) => {
  const hit = src.match(new RegExp(`${name}="([^"]*)"`));
  return hit ? hit[1] : null;
};
const NUM = (src, name) => Number(ATTR(src, name) || 0);

/**
 * Every drawn point on the sheet, in page coordinates.
 *
 * Group transforms are honoured: several styles draw their content once in
 * local coordinates and re-emit it rotated, and ignoring that would pile every
 * sample at the origin and make the measurement meaningless.
 */
export function samplePoints(svg) {
  // Everything before the first styled group is the white page background,
  // which says nothing about layout.
  const body = svg.slice(svg.indexOf('stroke-linejoin'));
  const out = [];
  const stack = [IDENTITY];
  const re = /<(\/?)(g|path|circle|ellipse|line|rect)\b([^>]*)>/g;
  let hit;

  while ((hit = re.exec(body))) {
    const [, closing, tag, attrs] = hit;
    if (tag === 'g') {
      if (closing) stack.pop();
      else stack.push(compose(stack[stack.length - 1], parseTransform(ATTR(attrs, 'transform') || '')));
      continue;
    }

    let m = stack[stack.length - 1];
    const own = ATTR(attrs, 'transform');
    if (own) m = compose(m, parseTransform(own));

    if (tag === 'path') {
      pathPoints(ATTR(attrs, 'd') || '', out, m);
    } else if (tag === 'circle' || tag === 'ellipse') {
      const x = NUM(attrs, 'cx');
      const y = NUM(attrs, 'cy');
      const rx = tag === 'circle' ? NUM(attrs, 'r') : NUM(attrs, 'rx');
      const ry = tag === 'circle' ? NUM(attrs, 'r') : NUM(attrs, 'ry');
      // Enough samples that the chords approximate the circumference closely.
      const STEPS = 24;
      for (let k = 0; k <= STEPS; k++) {
        const a = (k / STEPS) * Math.PI * 2;
        const p = apply(m, x + rx * Math.cos(a), y + ry * Math.sin(a));
        if (k === 0) p.move = true;
        out.push(p);
      }
    } else if (tag === 'line') {
      const a = apply(m, NUM(attrs, 'x1'), NUM(attrs, 'y1'));
      a.move = true;
      out.push(a, apply(m, NUM(attrs, 'x2'), NUM(attrs, 'y2')));
    } else if (tag === 'rect') {
      const x = NUM(attrs, 'x');
      const y = NUM(attrs, 'y');
      const w = NUM(attrs, 'width');
      const h = NUM(attrs, 'height');
      const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
      corners.forEach(([px, py], k) => {
        const p = apply(m, px, py);
        if (k === 0) p.move = true;
        out.push(p);
      });
    }
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
 * @param {string[]} [opts.seeds]   fixed pool, for tests; ignores the budget
 */
export function pickBest(params, { budgetMs = 120, max = 8, seeds } = {}) {
  const started = now();
  let best = null;
  let tested = 0;

  while (tested < (seeds ? seeds.length : max)) {
    const seed = seeds ? seeds[tested] : randomSeed();
    const result = { seed, ...measureDesign({ ...params, seed }) };
    tested++;
    if (!best || result.score > best.score) best = result;
    // Always judge at least two, so the filter is never a no-op, but stop as
    // soon as the budget is gone.
    if (!seeds && tested >= 2 && now() - started >= budgetMs) break;
  }
  return best;
}

/** As `pickBest`, when only the seed is wanted. */
export function pickBestSeed(params, opts) {
  return pickBest(params, opts).seed;
}
