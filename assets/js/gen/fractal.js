/*
 * Fractal Forms — figures that are built by repeating one rule on their own
 * output, drawn deep enough to be interesting and no deeper.
 *
 * Six families, chosen because they colour well rather than because they are
 * famous. What a coloring page needs is enclosed regions of varied size, and
 * self-similar figures supply exactly that: a Sierpinski triangle is nothing
 * but nested triangles, an Apollonian gasket nothing but nested discs. The two
 * curves — the dragon and the Koch snowflake — earn their place differently,
 * one folding back on itself into pockets, the other closing into a ring.
 *
 * Recursion depth is never a free parameter. Every one of these doubles or
 * triples its detail per level, so one step too far and the figure fills in
 * solid black. Each family works out how deep it can go from the size of its
 * smallest feature against the widest pen the sheet might be drawn with, and
 * the detail dial only ever asks for less than that ceiling. Judging against
 * `refStroke` rather than the pen in use is what keeps the choice of pen from
 * changing the drawing (see tests/line-weight.test.mjs).
 */

import { TAU, poly, polar } from '../core/util.js';

/* --------------------------------------------------------------- fitting -- */

/** The largest centred rectangle of the given aspect that fits in `box`. */
function fitRect(box, aspect, pad = 0) {
  const w0 = box.w * (1 - pad * 2);
  const h0 = box.h * (1 - pad * 2);
  const w = Math.min(w0, h0 * aspect);
  const h = w / aspect;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/**
 * Scale and centre a point set into `box`, keeping its proportions.
 *
 * The curves are generated in whatever coordinates their construction gives —
 * a dragon curve walks off in unit steps and lands where it lands — so their
 * extent is only known after the fact.
 */
function fitPoints(points, box, pad = 0.02) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  const room = fitRect(box, w / h, pad);
  const k = Math.min(room.w / w, room.h / h);
  const ox = box.x + box.w / 2 - ((minX + maxX) / 2) * k;
  const oy = box.y + box.h / 2 - ((minY + maxY) / 2) * k;
  return points.map((p) => ({ x: p.x * k + ox, y: p.y * k + oy }));
}

/**
 * `want` levels, or as many as the pen can still resolve — whichever is fewer.
 *
 * `shrink` is what a feature loses per level: 2 halves it, 3 thirds it. Every
 * figure here is asked for an explicit depth rather than deriving one from the
 * detail dial, because the two are not the same thing: a quarter-page cell runs
 * out of room after four levels no matter what the dial says, and a progression
 * that wants to show levels one to four needs to ask for them directly.
 */
function capDepth(sk, size, shrink, want) {
  const floor = sk.refStroke * 3.2;
  let d = 0;
  let s = size;
  while (d < want && s / shrink >= floor) {
    s /= shrink;
    d++;
  }
  return d;
}

/* ------------------------------------------------------------ the figures -- */

/**
 * Sierpinski triangle — the classic. Only the surviving triangles are drawn;
 * the holes are the gaps between them, which is what makes the figure read.
 */
function sierpinski(sk, box, want, rng) {
  const room = fitRect(box, 2 / Math.sqrt(3), 0.01);
  const down = rng.bool(0.35); // apex at the bottom instead of the top
  const apex = { x: room.x + room.w / 2, y: down ? room.y + room.h : room.y };
  const b = { x: room.x, y: down ? room.y : room.y + room.h };
  const c = { x: room.x + room.w, y: down ? room.y : room.y + room.h };
  let depth = capDepth(sk, room.w, 2, want);

  /*
   * What goes inside the smallest triangles.
   *
   * Left plain, the figure is a field of empty triangles all the same size and
   * there is not much to do with it. A nested outline or an inscribed circle
   * gives every one of them a second region, which at depth five is several
   * hundred more places to put a colour.
   */
  const fill = rng.pick(['plain', 'nested', 'nested', 'circle', 'inverted']);

  /*
   * A decorated leaf needs room for two outlines, so one level of recursion is
   * given up to get it. That is the better trade for colouring: dropping a
   * level quarters the number of triangles but each one gains a second region,
   * and the regions left are big enough to actually put a pencil in.
   */
  if (fill !== 'plain') {
    while (depth > 1 && room.w / 2 ** depth < sk.refStroke * 7) depth--;
  }

  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const leaf = (p, q, r) => {
    sk.path(poly([p, q, r]));
    const side = Math.hypot(q.x - p.x, q.y - p.y);
    if (fill === 'plain' || side < sk.refStroke * 8) return;

    if (fill === 'circle') {
      const cx = (p.x + q.x + r.x) / 3;
      const cy = (p.y + q.y + r.y) / 3;
      sk.circle(cx, cy, side * 0.19, sk.w(0.75));
    } else if (fill === 'inverted') {
      sk.path(poly([mid(p, q), mid(q, r), mid(p, r)]), sk.w(0.75));
    } else {
      // A smaller copy of the same triangle, pulled in toward its centroid.
      const gx = (p.x + q.x + r.x) / 3;
      const gy = (p.y + q.y + r.y) / 3;
      const shrink = (t) => ({ x: gx + (t.x - gx) * 0.55, y: gy + (t.y - gy) * 0.55 });
      sk.path(poly([shrink(p), shrink(q), shrink(r)]), sk.w(0.75));
    }
  };

  /*
   * The holes are the largest blank areas on the sheet — the middle one alone
   * is a quarter of the whole triangle — so filling them with concentric
   * outlines is where most of the colouring space comes from. They are drawn
   * from the inside of the recursion, where each hole's corners are already to
   * hand as the midpoints of the triangle being split.
   */
  const holeRings = rng.pick([0, 0, 1, 2, 3]);
  const drawHole = (p, q, r) => {
    if (!holeRings) return;
    const gx = (p.x + q.x + r.x) / 3;
    const gy = (p.y + q.y + r.y) / 3;
    const side = Math.hypot(q.x - p.x, q.y - p.y);
    for (let i = 1; i <= holeRings; i++) {
      const k = 1 - i * (0.7 / holeRings);
      if (side * k < sk.refStroke * 6) break;
      const at = (t) => ({ x: gx + (t.x - gx) * k, y: gy + (t.y - gy) * k });
      sk.path(poly([at(p), at(q), at(r)]), sk.w(0.8));
    }
  };

  const recurse = (p, q, r, d) => {
    if (d === 0) {
      leaf(p, q, r);
      return;
    }
    const pq = mid(p, q);
    const qr = mid(q, r);
    const pr = mid(p, r);
    drawHole(pq, qr, pr);
    recurse(p, pq, pr, d - 1);
    recurse(pq, q, qr, d - 1);
    recurse(pr, qr, r, d - 1);
  };

  recurse(apex, b, c, depth);
  sk.path(poly([apex, b, c]), sk.w(1.3));
}

/*
 * Self-similar tilings — the Sierpinski carpet and its whole family.
 *
 * The carpet is one member of a much larger set: divide a square into n×n
 * cells, keep some, and repeat inside each of the ones kept. Which cells are
 * kept is the only thing that changes, and it changes everything — keep all but
 * the middle and you get the carpet, keep the plus and you get a Vicsek
 * fractal, keep the diagonals and you get a saltire.
 *
 * Masks are built with four-fold symmetry rather than drawn at random, because
 * a symmetric mask reads as a decision and an asymmetric one reads as a
 * mistake. Alongside the named classics that gives a large family of tilings
 * that are all recognisably of a kind.
 */
const CLASSIC_MASKS = {
  // true = recurse into this cell, false = it becomes a hole.
  carpet: [[1, 1, 1], [1, 0, 1], [1, 1, 1]],
  vicsek: [[0, 1, 0], [1, 1, 1], [0, 1, 0]],
  saltire: [[1, 0, 1], [0, 1, 0], [1, 0, 1]],
  corners: [[1, 0, 1], [0, 0, 0], [1, 0, 1]],
  lattice: [[1, 0, 1, 0, 1], [0, 1, 0, 1, 0], [1, 0, 1, 0, 1], [0, 1, 0, 1, 0], [1, 0, 1, 0, 1]],
  ring: [[1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 1, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1]],
};

/** A mask with four-fold symmetry: one quadrant, mirrored into the rest. */
function symmetricMask(n, rng) {
  const half = Math.ceil(n / 2);
  for (let attempt = 0; attempt < 24; attempt++) {
    const m = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let r = 0; r < half; r++) {
      for (let c = 0; c < half; c++) {
        const on = rng.bool(0.62) ? 1 : 0;
        m[r][c] = on;
        m[r][n - 1 - c] = on;
        m[n - 1 - r][c] = on;
        m[n - 1 - r][n - 1 - c] = on;
      }
    }
    const kept = m.flat().filter(Boolean).length;
    const share = kept / (n * n);

    /*
     * Rejecting the masks that come out looking like an accident.
     *
     * A whole row or column of holes prints as a bare band across the figure,
     * and set against the finely divided rows either side of it the sheet looks
     * unbalanced rather than patterned. Keeping the share of surviving cells
     * near the middle avoids the two other poor outcomes: nearly all holes
     * leaves nothing to subdivide, nearly none leaves nothing to colour.
     */
    if (share < 0.32 || share > 0.72) continue;
    const rows = m.map((row) => row.some(Boolean));
    const cols = m[0].map((_, c) => m.some((row) => row[c]));
    if (!rows.every(Boolean) || !cols.every(Boolean)) continue;
    return m;
  }
  return CLASSIC_MASKS.carpet;
}

function tiling(sk, box, want, rng) {
  const room = fitRect(box, 1, 0.02);
  const named = rng.bool(0.45) ? rng.pick(Object.keys(CLASSIC_MASKS)) : null;
  const mask = named ? CLASSIC_MASKS[named] : symmetricMask(rng.pick([3, 3, 4, 5]), rng);
  const n = mask.length;
  const kept = mask.flat().filter(Boolean).length;

  /*
   * Two ceilings, and the tighter one wins. Cell size against the pen is the
   * usual one; the other is sheer count, because a mask that keeps twenty of
   * twenty-five cells multiplies by twenty per level and would bury the page in
   * a hundred thousand shapes long before the cells got too small to see.
   */
  let budget = want;
  for (let d = 1, cells = kept; d <= want; d++, cells *= kept) {
    if (cells > 2600) {
      budget = d - 1;
      break;
    }
  }
  const depth = Math.min(capDepth(sk, room.w, n, want), budget);

  const hole = rng.pick(['square', 'square', 'inset', 'circle', 'diamond']);
  // Outlining the surviving cells at the deepest level turns one large empty
  // field into a grid of small ones. It roughly doubles what there is to fill.
  const outlineLeaves = rng.bool(0.6);

  const drawHole = (x, y, s, weight) => {
    const w = sk.w(weight);
    if (hole === 'circle') sk.circle(x + s / 2, y + s / 2, s * 0.46, w);
    else if (hole === 'diamond') {
      sk.path(poly([
        { x: x + s / 2, y }, { x: x + s, y: y + s / 2 },
        { x: x + s / 2, y: y + s }, { x, y: y + s / 2 },
      ]), w);
    } else {
      sk.rect(x, y, s, s, 0, w);
      if (hole === 'inset' && s > sk.refStroke * 7) {
        sk.rect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56, 0, sk.w(weight * 0.8));
      }
    }
  };

  const recurse = (x, y, s, d) => {
    const t = s / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cx = x + c * t;
        const cy = y + r * t;
        if (!mask[r][c]) drawHole(cx, cy, t, d === depth ? 1 : 0.85);
        else if (d > 1) recurse(cx, cy, t, d - 1);
        // Only worth outlining while the cell is still big enough to colour in.
        else if (outlineLeaves && t > sk.refStroke * 5) sk.rect(cx, cy, t, t, 0, sk.w(0.7));
      }
    }
  };

  if (depth >= 1) recurse(room.x, room.y, room.w, depth);
  sk.rect(room.x, room.y, room.w, room.w, 0, sk.w(1.3));
}

/** One Koch iteration: every edge grows a triangular bump. */
function kochOnce(points) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const dx = (q.x - p.x) / 3;
    const dy = (q.y - p.y) / 3;
    const a = { x: p.x + dx, y: p.y + dy };
    const b = { x: p.x + dx * 2, y: p.y + dy * 2 };
    // Apex of the equilateral bump. The normal is taken as (dy, -dx) rather
    // than (-dy, dx) because the ring is wound clockwise on screen, where y
    // points down; the other sign turns every bump inward and gives the Koch
    // *anti*snowflake, which collapses into a knot once the rings nest.
    const peak = {
      x: a.x + dx * 0.5 + dy * (Math.sqrt(3) / 2),
      y: a.y + dy * 0.5 - dx * (Math.sqrt(3) / 2),
    };
    out.push(p, a, peak, b);
  }
  return out;
}

/**
 * Koch snowflake, nested. One flake is a single closed line with nothing
 * inside it, so a few concentric ones at falling depth give a page with
 * something to fill.
 */
function snowflake(sk, box, want, rng) {
  const R = Math.min(box.w, box.h) / 2;
  const sides = rng.pick([3, 3, 4, 6]);
  // Nested well in toward the middle rather than hugging the rim: one Koch
  // outline encloses a single empty region, and a page wants more than that.
  const rings = rng.int(3, 6);
  // Free rotation, and a little turn between rings so their points interleave
  // rather than stacking into spokes.
  const spin = rng.range(0, TAU);
  const twist = rng.bool(0.5) ? TAU / (sides * 2) : 0;

  const built = [];
  for (let i = 0; i < rings; i++) {
    const r = R * (1 - (i / rings) * 0.78);
    // An edge is a third of its length shorter each level, and the shortest
    // edge is what decides when the outline turns into a smudge.
    const edge = 2 * r * Math.sin(Math.PI / sides);
    const depth = capDepth(sk, edge, 3, want);

    let pts = [];
    const phase = spin + i * twist;
    for (let k = 0; k < sides; k++) pts.push(polar(0, 0, r, (k / sides) * TAU + phase));
    for (let d = 0; d < depth; d++) pts = kochOnce(pts);
    built.push(pts);
  }

  /*
   * Fitted afterwards rather than drawn straight into a square of side 2R,
   * because how much of that square a flake actually covers depends on how many
   * sides it started from — a triangle spans well under its own circumradius,
   * and a square-based flake left a fifth of the sheet unused on either side.
   */
  const all = fitPoints(built.flat(), box, 0.01);
  let i = 0;
  built.forEach((pts, ring) => {
    sk.path(poly(all.slice(i, i + pts.length)), sk.w(ring === 0 ? 1.2 : 0.95));
    i += pts.length;
  });
}

/**
 * Dragon curve, by the paper-folding rule: fold a strip in half repeatedly,
 * unfold every crease to a right angle, and this is the shape it takes. It
 * never crosses itself but it touches itself constantly, and the pockets that
 * makes are what there is to colour.
 */
function dragon(sk, box, want, rng) {
  /*
   * A dragon of order n has 2^n segments and spans roughly 2^(n/2) of them,
   * so once it is fitted to the page each step is about page/2^(n/2) long.
   * Push n too high and the steps fall below the pen: the folds close up and
   * the whole thing turns into a grey smudge with a fractal edge. Solving that
   * for the step width gives the ceiling directly.
   */
  const span = Math.min(box.w, box.h);
  const ceiling = Math.floor(2 * Math.log2(span / (sk.refStroke * 4.5)));

  /*
   * One, two or four dragons sharing a start point.
   *
   * Every dragon curve tiles the plane with copies of itself, so the rotated
   * copies interlock exactly rather than merely overlapping — two make the
   * twindragon, four close into a rosette. It is the same curve either way, but
   * the copies fold against each other and the enclosed pockets multiply, which
   * is the whole point on a page meant to be coloured in. Each extra copy costs
   * an order of detail, so the segments stay above the pen.
   */
  const copies = rng.pick([1, 2, 2, 4, 4]);
  const order = Math.max(6, Math.min(ceiling, want) - (copies === 4 ? 3 : 1));
  const steps = 2 ** order;

  const pts = [{ x: 0, y: 0 }];
  let dir = 0;
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  for (let i = 1; i <= steps; i++) {
    const last = pts[pts.length - 1];
    pts.push({ x: last.x + DX[dir], y: last.y + DY[dir] });
    // Turn left when the bit above the lowest set bit of i is clear.
    const turn = (((i & -i) << 1) & i) === 0 ? 1 : 3;
    dir = (dir + turn) % 4;
  }

  // A free starting angle as well, so two pages of the same arrangement still
  // do not sit the same way on the sheet.
  const phase = rng.range(0, TAU);
  const arms = [];
  for (let k = 0; k < copies; k++) {
    const a = phase + (k / copies) * TAU;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    arms.push(pts.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos })));
  }

  const all = fitPoints(arms.flat(), box, 0.03);
  let i = 0;
  for (const arm of arms) {
    sk.path(poly(all.slice(i, i + arm.length), false), sk.w(1.05));
    i += arm.length;
  }
}

/**
 * Pythagoras tree — a square, then two smaller squares leaning on a right
 * triangle built on its top edge, then the same again on each of those.
 */
function pythagoras(sk, box, want, rng) {
  /*
   * Two free parameters, and between them the whole character of the tree.
   *
   * `lean` is where the apex sits along the square's top edge — at a half the
   * tree is symmetrical, away from it one branch runs long while the other
   * stubs out. `rise` is how far the apex stands off that edge, and it is the
   * one that really matters: it sets how fast the branches shrink, so a low
   * rise gives a tight compact tree and a high one a wide sprawling canopy.
   * Fixing it at the right-angle value, as the textbook figure does, makes
   * every tree the same fan no matter what else changes.
   *
   * The children scale by √(lean² + rise²) and √((1−lean)² + rise²), both of
   * which have to stay under one or the tree grows without bound, so the rise
   * is capped against whichever branch is the longer.
   */
  const lean = rng.bool(0.4) ? rng.range(0.44, 0.56) : rng.range(0.26, 0.74);
  const longer = Math.max(lean, 1 - lean);
  const rise = rng.range(0.3, Math.sqrt(Math.max(0.1, 0.78 - longer * longer)));
  const depth = Math.min(12, want - rng.int(0, 2));
  // A second square inside each one: more to colour, and a denser bark texture.
  const inner = rng.bool(0.4);
  const showTriangles = rng.bool(0.75);
  const parts = [];

  const grow = (ax, ay, bx, by, d) => {
    // The square standing on segment a→b. The normal is (dy, −dx) so the tree
    // grows up the page: y increases downward here, and the other sign buries
    // the whole thing below its own trunk.
    const dx = bx - ax;
    const dy = by - ay;
    const cx = bx + dy;
    const cy = by - dx;
    const ex = ax + dy;
    const ey = ay - dx;
    parts.push({ pts: [{ x: ax, y: ay }, { x: bx, y: by }, { x: cx, y: cy }, { x: ex, y: ey }], d });
    if (d === 0) return;

    // The apex on the square's far edge, `lean` along it and `rise` above it.
    const px = ex + (cx - ex) * lean + (cy - ey) * rise;
    const py = ey + (cy - ey) * lean - (cx - ex) * rise;
    if (showTriangles) parts.push({ pts: [{ x: ex, y: ey }, { x: cx, y: cy }, { x: px, y: py }], d });
    grow(ex, ey, px, py, d - 1);
    grow(px, py, cx, cy, d - 1);
  };

  // Built at unit scale first and fitted afterwards: where a tree ends up
  // depends on its lean, and there is no way to know beforehand.
  grow(-0.5, 0, 0.5, 0, depth);
  const all = fitPoints(parts.flatMap((p) => p.pts), box, 0.02);

  /*
   * Now that the true scale is known, drop the branches too small to draw.
   * Pruning here rather than by a depth limit is what lets a lopsided tree keep
   * its long side: with a lean of 0.6 one branch shrinks by √0.6 per level and
   * the other by √0.4, so a single depth that suits one starves the other.
   */
  const floor = sk.refStroke * 4;
  let i = 0;
  for (const part of parts) {
    const pts = all.slice(i, i + part.pts.length);
    i += part.pts.length;
    const side = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    if (side < floor) continue;
    sk.path(poly(pts), sk.w(part.d === depth ? 1.2 : 0.9));

    // A concentric square inside the square, where there is room for one.
    if (inner && pts.length === 4 && side > sk.refStroke * 9) {
      const gx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
      const gy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
      sk.path(poly(pts.map((t) => ({ x: gx + (t.x - gx) * 0.6, y: gy + (t.y - gy) * 0.6 }))), sk.w(0.75));
    }
  }
}

/* ----------------------------------------------------- Apollonian gasket -- */

/*
 * Circles packed into the gaps between circles, forever. Descartes' theorem
 * gives the curvature of a circle tangent to three others,
 *
 *     k4 = k1 + k2 + k3 ± 2·√(k1k2 + k2k3 + k3k1)
 *
 * and its complex companion, with each centre written as a complex number and
 * weighted by its own curvature, gives where that circle sits. The outer circle
 * takes a negative curvature because it contains the others rather than
 * touching them from outside.
 */
const cAdd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const cSub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const cMul = (a, b) => ({ x: a.x * b.x - a.y * b.y, y: a.x * b.y + a.y * b.x });
const cScale = (a, k) => ({ x: a.x * k, y: a.y * k });

function cSqrt(a) {
  const r = Math.hypot(a.x, a.y);
  return { x: Math.sqrt((r + a.x) / 2), y: Math.sign(a.y || 1) * Math.sqrt((r - a.x) / 2) };
}

function gasket(sk, box, want, rng) {
  const room = fitRect(box, 1, 0.01);
  const R = room.w / 2;
  const centre = { x: room.x + R, y: room.y + R };
  const minR = sk.refStroke * 2.6;
  const depth = Math.min(9, want);
  const spin = rng.range(0, TAU);

  const start = [{ k: -1 / R, z: centre, r: R }];

  /*
   * Where the packing starts decides everything that follows, because every
   * later circle is forced by the three it touches. Three equal circles give
   * the familiar three-fold gasket; two unequal ones give a quite different
   * figure, with one broad disc and a cascade of smaller ones curling into the
   * gap beside it. The whole thing is then spun, since a packing that always
   * sits the same way up looks printed rather than drawn.
   */
  if (rng.bool(0.45)) {
    // Three equal circles snug inside the outer one.
    const r0 = R * (2 * Math.sqrt(3) - 3);
    for (let i = 0; i < 3; i++) {
      const a = spin + (i / 3) * TAU;
      start.push({ k: 1 / r0, z: polar(centre.x, centre.y, R - r0, a), r: r0 });
    }
  } else {
    // Two circles filling the outer one along a diameter: radii summing to R,
    // each internally tangent to the rim and externally tangent to the other.
    const a = R * rng.range(0.34, 0.5);
    const b = R - a;
    for (const [r, side] of [[a, -1], [b, 1]]) {
      start.push({ k: 1 / r, z: polar(centre.x, centre.y, (R - r) * side, spin), r });
    }
  }

  /** The fourth circle tangent to three, other than the one already known. */
  const fourth = (a, b, c, known) => {
    const k = a.k + b.k + c.k + 2 * Math.sqrt(Math.abs(a.k * b.k + b.k * c.k + c.k * a.k));
    if (!Number.isFinite(k) || k <= 0) return null;
    const sum = cAdd(cAdd(cScale(a.z, a.k), cScale(b.z, b.k)), cScale(c.z, c.k));
    const cross = cAdd(
      cAdd(cScale(cMul(a.z, b.z), a.k * b.k), cScale(cMul(b.z, c.z), b.k * c.k)),
      cScale(cMul(c.z, a.z), c.k * a.k),
    );
    const root = cScale(cSqrt(cross), 2);

    // Both signs solve the equation; the wanted one is whichever is not the
    // circle we already have.
    let best = null;
    for (const sign of [1, -1]) {
      const z = cScale(cAdd(sum, cScale(root, sign)), 1 / k);
      const cand = { k, z, r: 1 / k };
      if (known && Math.hypot(z.x - known.z.x, z.y - known.z.y) < known.r * 0.02) continue;
      // Keep the candidate that really is tangent to all three.
      const ok = [a, b, c].every((o) => {
        const d = Math.hypot(z.x - o.z.x, z.y - o.z.y);
        const inner = Math.abs(d - Math.abs(Math.abs(o.r) - cand.r));
        const outer = Math.abs(d - (Math.abs(o.r) + cand.r));
        return Math.min(inner, outer) < Math.abs(o.r) * 0.02 + 0.5;
      });
      if (ok && (!best || cand.r > best.r)) best = cand;
    }
    return best;
  };

  const recurse = (a, b, c, known, d) => {
    if (d === 0) return;
    const next = fourth(a, b, c, known);
    if (!next || !(next.r > minR)) return;
    sk.circle(next.z.x, next.z.y, next.r, sk.w(next.r > R * 0.1 ? 1 : 0.85));
    recurse(a, b, next, c, d - 1);
    recurse(b, c, next, a, d - 1);
    recurse(a, c, next, b, d - 1);
  };

  // The two-circle opening leaves a curved gap on either side; the circle that
  // fills it is not a choice but a consequence, so Descartes supplies it.
  if (start.length === 3) {
    const third = fourth(start[0], start[1], start[2], null);
    if (!third) return;
    start.push(third);
  }

  for (const c of start) sk.circle(c.z.x, c.z.y, c.r, sk.w(c.r === R ? 1.3 : 1));

  const [outer, c1, c2, c3] = start;
  recurse(c1, c2, c3, outer, depth);
  recurse(outer, c1, c2, c3, depth);
  recurse(outer, c2, c3, c1, depth);
  recurse(outer, c1, c3, c2, depth);
}

/* ---------------------------------------------------------------- layout -- */

/**
 * The families, by name. Exported so tests can drive each one directly — the
 * thing worth asserting about a fractal is that it stops at the right depth,
 * and reaching it through a layout that picks at random makes that awkward.
 */
export const FIGURES = {
  sierpinski,
  tiling,
  snowflake,
  dragon,
  pythagoras,
  gasket,
};

const SOLO = ['sierpinski', 'tiling', 'snowflake', 'dragon', 'pythagoras', 'gasket'];
// The packings and the flake stay legible at a quarter size; the dragon does
// not, so it is kept out of the specimen grids.
const SMALL = ['sierpinski', 'tiling', 'snowflake', 'gasket', 'pythagoras'];

/*
 * Which families can show their construction step by step.
 *
 * Fewer than one might expect. A quarter-page cell only has room for about four
 * levels of the fastest-shrinking figure and two or three of the rest, so a
 * four-cell progression of, say, Koch snowflakes comes out as one plain ring
 * followed by three identical crenellated ones — which reads as a mistake
 * rather than as a sequence. Only these two visibly change at every step.
 */
const PROGRESSIVE = ['sierpinski', 'sierpinski', 'gasket'];

/*
 * Roughly how wide each family sits relative to its height.
 *
 * It decides how many of a figure go on a sheet. A Pythagoras tree is close to
 * twice as wide as it is tall, so one alone on portrait paper leaves the bottom
 * third bare; two stacked fill it and read as a deliberate pair. A gasket is a
 * disc and wants the page to itself.
 */
const ASPECT = {
  sierpinski: 1,
  tiling: 1,
  snowflake: 1,
  gasket: 1,
  dragon: 1,
  pythagoras: 1.8,
};

/*
 * Depth to ask for, at each setting of the detail dial.
 *
 * The families are not on the same scale and cannot share a number: a
 * Sierpinski triangle at level 5 has 243 cells and is about right, a dragon at
 * level 5 is thirty-two segments and barely a squiggle. Whatever comes out here
 * is still cut back to what the pen can resolve.
 */
const DEPTH = {
  sierpinski: (c) => c + 3,
  tiling: (c) => c + 2,
  snowflake: (c) => c + 2,
  gasket: (c) => c + 4,
  dragon: (c) => c + 7,
  pythagoras: (c) => c + 6,
};

function inset(box, k) {
  return { x: box.x + box.w * k, y: box.y + box.h * k, w: box.w * (1 - 2 * k), h: box.h * (1 - 2 * k) };
}

/** Split a box into `n` bands along its longer axis. */
function bands(box, n) {
  const out = [];
  const vertical = box.h >= box.w;
  for (let i = 0; i < n; i++) {
    out.push(vertical
      ? { x: box.x, y: box.y + (box.h / n) * i, w: box.w, h: box.h / n }
      : { x: box.x + (box.w / n) * i, y: box.y, w: box.w / n, h: box.h });
  }
  return out;
}

export default {
  id: 'fractal',
  name: 'Fractal Forms',
  blurb: 'Shapes built by repeating one rule on their own output — triangles, packed circles, folded curves.',
  tags: ['geometric', 'mathematical', 'striking'],

  draw(sk, { rng, box, complexity }) {
    /*
     * Weighted toward the mixed layouts. A solo figure makes the stronger page,
     * but six families means one turns up about every sixth sheet, and seeing
     * the same family twice in a row reads as the generator repeating itself
     * even when the two drawings are quite different. A plate shows five or six
     * at once and never looks like the last one.
     */
    const layout = rng.pick(['solo', 'solo', 'plate', 'plate', 'progression']);

    if (layout === 'solo') {
      const name = rng.pick(SOLO);
      // How many copies it takes to use the sheet, given the figure's own
      // proportions and the paper's.
      const long = Math.max(box.w, box.h);
      const short = Math.min(box.w, box.h);
      const n = Math.max(1, Math.min(3, Math.round((long / short) * ASPECT[name])));
      for (const band of bands(inset(box, 0.01), n)) {
        FIGURES[name](sk, n > 1 ? inset(band, 0.02) : band, DEPTH[name](complexity), rng);
      }
      return;
    }

    if (layout === 'progression') {
      /*
       * The same rule at four depths, so the construction itself is on the
       * page. The levels are named outright rather than reached by running the
       * detail dial up, because a quarter-page cell hits the pen's limit after
       * four of them and the last cells would come out identical.
       */
      const name = rng.pick(PROGRESSIVE);
      const cols = box.w > box.h ? 4 : 2;
      const rows = 4 / cols;
      const cw = box.w / cols;
      const ch = box.h / rows;
      let step = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = inset({ x: box.x + c * cw, y: box.y + r * ch, w: cw, h: ch }, 0.05);
          FIGURES[name](sk, cell, step + 1, rng);
          step++;
        }
      }
      return;
    }

    // A plate of specimens: different rules, one per cell.
    const cols = box.w > box.h ? 3 : 2;
    const rows = Math.max(2, Math.round((box.h / box.w) * cols));
    const picks = rng.sample(SMALL, Math.min(SMALL.length, cols * rows));
    const cw = box.w / cols;
    const ch = box.h / rows;
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = inset({ x: box.x + c * cw, y: box.y + r * ch, w: cw, h: ch }, 0.06);
        const pick = picks[i % picks.length];
        FIGURES[pick](sk, cell, DEPTH[pick](Math.max(1, complexity - 1)), rng);
        i++;
      }
    }
  },
};
