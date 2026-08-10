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
function sierpinski(sk, box, want) {
  const room = fitRect(box, 2 / Math.sqrt(3), 0.01);
  const a = { x: room.x + room.w / 2, y: room.y };
  const b = { x: room.x, y: room.y + room.h };
  const c = { x: room.x + room.w, y: room.y + room.h };
  const depth = capDepth(sk, room.w, 2, want);

  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const recurse = (p, q, r, d) => {
    if (d === 0) {
      sk.path(poly([p, q, r]));
      return;
    }
    recurse(p, mid(p, q), mid(p, r), d - 1);
    recurse(mid(p, q), q, mid(q, r), d - 1);
    recurse(mid(p, r), mid(q, r), r, d - 1);
  };

  recurse(a, b, c, depth);
  sk.path(poly([a, b, c]), sk.w(1.3));
}

/**
 * Sierpinski carpet — the square cousin. Here it is the removed middles that
 * are drawn, each one a colourable well inside the next.
 */
function carpet(sk, box, want) {
  const room = fitRect(box, 1, 0.02);
  const depth = capDepth(sk, room.w, 3, want);

  const recurse = (x, y, s, d) => {
    if (d === 0) return;
    const t = s / 3;
    sk.rect(x + t, y + t, t, t, 0, sk.w(d >= depth ? 1 : 0.85));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 1 && c === 1) continue;
        recurse(x + c * t, y + r * t, t, d - 1);
      }
    }
  };

  recurse(room.x, room.y, room.w, depth);
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

  const built = [];
  for (let i = 0; i < rings; i++) {
    const r = R * (1 - (i / rings) * 0.78);
    // An edge is a third of its length shorter each level, and the shortest
    // edge is what decides when the outline turns into a smudge.
    const edge = 2 * r * Math.sin(Math.PI / sides);
    const depth = capDepth(sk, edge, 3, want);

    let pts = [];
    for (let k = 0; k < sides; k++) pts.push(polar(0, 0, r, (k / sides) * TAU - Math.PI / 2));
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
function dragon(sk, box, want) {
  /*
   * A dragon of order n has 2^n segments and spans roughly 2^(n/2) of them,
   * so once it is fitted to the page each step is about page/2^(n/2) long.
   * Push n too high and the steps fall below the pen: the folds close up and
   * the whole thing turns into a grey smudge with a fractal edge. Solving that
   * for the step width gives the ceiling directly.
   */
  const span = Math.min(box.w, box.h);
  const ceiling = Math.floor(2 * Math.log2(span / (sk.refStroke * 3.6)));
  const order = Math.max(6, Math.min(ceiling, want));
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

  sk.path(poly(fitPoints(pts, box, 0.03), false), sk.w(1.05));
}

/**
 * Pythagoras tree — a square, then two smaller squares leaning on a right
 * triangle built on its top edge, then the same again on each of those.
 */
function pythagoras(sk, box, want, rng) {
  const lean = rng.range(0.38, 0.62); // where the right angle sits, along the top
  const depth = Math.min(12, want);
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

    // The apex of a right triangle on the square's far edge. Sitting at `lean`
    // along that edge, its height is √(lean·(1−lean)) — which makes the two
    // child squares scale by √lean and √(1−lean).
    const h = Math.sqrt(lean * (1 - lean));
    const px = ex + (cx - ex) * lean + (cy - ey) * h;
    const py = ey + (cy - ey) * lean - (cx - ex) * h;
    parts.push({ pts: [{ x: ex, y: ey }, { x: cx, y: cy }, { x: px, y: py }], d });
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
    if (Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) < floor) continue;
    sk.path(poly(pts), sk.w(part.d === depth ? 1.2 : 0.9));
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

function gasket(sk, box, want) {
  const room = fitRect(box, 1, 0.01);
  const R = room.w / 2;
  const centre = { x: room.x + R, y: room.y + R };
  const minR = sk.refStroke * 1.45;
  const depth = Math.min(9, want);

  // Three equal circles snug inside the outer one.
  const r0 = R * (2 * Math.sqrt(3) - 3);
  const start = [{ k: -1 / R, z: centre, r: R }];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    start.push({ k: 1 / r0, z: polar(centre.x, centre.y, R - r0, a), r: r0 });
  }

  for (const c of start) sk.circle(c.z.x, c.z.y, c.r, sk.w(c.r === R ? 1.3 : 1));

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
  carpet,
  snowflake,
  dragon,
  pythagoras,
  gasket,
};

const SOLO = ['sierpinski', 'carpet', 'snowflake', 'dragon', 'pythagoras', 'gasket'];
// The packings and the flake stay legible at a quarter size; the dragon does
// not, so it is kept out of the specimen grids.
const SMALL = ['sierpinski', 'carpet', 'snowflake', 'gasket', 'pythagoras'];

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
  carpet: 1,
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
  carpet: (c) => c + 2,
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
    const layout = rng.pick(['solo', 'solo', 'solo', 'plate', 'progression']);

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
