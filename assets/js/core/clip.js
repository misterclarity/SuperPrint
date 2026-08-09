/*
 * Clipping: making overlapping motifs read as layered rather than transparent.
 *
 * Line art draws every stroke it is told to, including the parts hidden behind
 * whatever is in front. Draw a leaf across a berry and you get both outlines
 * complete, crossing each other, and the eye reads a tangle of small slivers
 * instead of a leaf lying on a berry. Real botanical line art solves this by
 * occlusion: the shape in front knocks out the part of the shape behind. That
 * is a boolean difference, and this file is the machinery for it.
 *
 * The approach is deliberately not a general polygon clipper. Because the
 * output here is *stroked* and never filled, only the boundary is wanted, and
 * that makes the problem much smaller than the textbook one:
 *
 *   - Split every subject segment wherever it crosses an occluder.
 *   - Drop the pieces whose midpoint lies inside an occluder.
 *   - Chain what survives back into runs.
 *
 * There are no winding rules to get right, no self-intersection normalisation,
 * no output ring nesting to untangle — the classic sources of subtle bugs in a
 * clipper. The union case falls out of the same three steps: the boundary of a
 * union is exactly the edges that are not inside any other member.
 *
 * Everything works on flattened polylines, so curves must be flattened first
 * (see path.js). At the tolerance used there the chords are far below one
 * printed dot.
 */

const EPS = 1e-9;
const EMPTY_LIST = [];
/** Points closer than this are the same point, in user units (100 per inch). */
const TOUCH = 1e-4;

/* --------------------------------------------------------------- bounds -- */

function boundsOf(points) {
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
  return { minX, minY, maxX, maxY };
}

const overlaps = (a, b, pad = 0) =>
  a.minX - pad <= b.maxX && a.maxX + pad >= b.minX && a.minY - pad <= b.maxY && a.maxY + pad >= b.minY;

/* ------------------------------------------------------------ occluders -- */

/**
 * An occluder set, prepared once and queried many times.
 *
 * Each polygon keeps its own bounds so a subject far away is rejected without
 * touching its edges, and all edges go into a uniform grid so a subject that is
 * nearby only tests the edges it could actually cross. Without the index this
 * is quadratic, and a wreath has enough motifs for that to be felt.
 */
class Occluders {
  constructor(polygons = []) {
    this.polys = [];
    this.edges = [];
    this.grid = null;
    this.stamp = 0;
    this.builtAt = 0;
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    this.add(polygons);
  }

  /**
   * Take on more polygons.
   *
   * Layering builds its mask up one motif at a time, so this has to be cheap to
   * extend. Rebuilding the index for every layer would make a page quadratic in
   * its number of motifs, which a wreath has more than enough of to notice.
   */
  add(polygons) {
    for (const points of polygons) {
      if (!points || points.length < 3) continue;
      const poly = { points, index: this.polys.length, bounds: boundsOf(points) };
      this.polys.push(poly);
      this.bounds = {
        minX: Math.min(this.bounds.minX, poly.bounds.minX),
        minY: Math.min(this.bounds.minY, poly.bounds.minY),
        maxX: Math.max(this.bounds.maxX, poly.bounds.maxX),
        maxY: Math.max(this.bounds.maxY, poly.bounds.maxY),
      };

      const n = points.length;
      for (let i = 0; i < n; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS) continue;
        const edge = { a, b };
        this.edges.push(edge);
        if (this.grid) this.place(edge);
      }
      if (this.grid) this.placePoly(poly);
    }

    /*
     * Lay the grid out again when it has been outgrown.
     *
     * Layering feeds motifs in one at a time, so the first mask covers a single
     * motif and a grid sized to it would leave every later motif clamped into
     * the border cells — an index that indexes nothing, and slower than no
     * index at all. Rebuilding costs one pass over the edges and happens a
     * handful of times, so it stays linear overall.
     */
    if (this.edges.length >= 64
      && (!this.grid || this.edges.length >= this.builtAt * 2 || !this.gridCovers())) {
      this.buildGrid();
    }
    return this;
  }

  /** Does the laid-out grid still span everything it is indexing? */
  gridCovers() {
    const g = this.gridBounds;
    return this.bounds.minX >= g.minX && this.bounds.maxX <= g.maxX
      && this.bounds.minY >= g.minY && this.bounds.maxY <= g.maxY;
  }

  place(edge) {
    const { a, b } = edge;
    // Inlined rather than going through boundsOf: this runs once per edge per
    // rebuild, and the temporary array and object it would allocate showed up
    // as garbage collection in the profile.
    const c0 = this.col(a.x < b.x ? a.x : b.x);
    const c1 = this.col(a.x > b.x ? a.x : b.x);
    const r0 = this.row(a.y < b.y ? a.y : b.y);
    const r1 = this.row(a.y > b.y ? a.y : b.y);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) this.grid[r * this.cols + c].push(edge);
    }
  }

  placePoly(poly) {
    const [c0, r0, c1, r1] = this.cellRange(poly.bounds);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) this.polyGrid[r * this.cols + c].push(poly);
    }
  }

  buildGrid() {
    const n = this.edges.length;
    this.builtAt = n;

    /*
     * Lay the grid out over half again as much room as is currently needed.
     *
     * Layering adds motifs one at a time and they are spread across the page,
     * so a grid sized exactly to what has arrived so far is outgrown by almost
     * every addition — and rebuilding on each one puts the quadratic cost
     * straight back. The headroom means growth is absorbed, and with the
     * doubling rule the number of rebuilds stays logarithmic.
     */
    const pad = 0.5;
    const bw = Math.max(this.bounds.maxX - this.bounds.minX, EPS);
    const bh = Math.max(this.bounds.maxY - this.bounds.minY, EPS);
    this.gridBounds = {
      minX: this.bounds.minX - bw * pad,
      minY: this.bounds.minY - bh * pad,
      maxX: this.bounds.maxX + bw * pad,
      maxY: this.bounds.maxY + bh * pad,
    };
    const w = this.gridBounds.maxX - this.gridBounds.minX;
    const h = this.gridBounds.maxY - this.gridBounds.minY;
    // Aim for a handful of edges per cell.
    this.cols = Math.max(1, Math.min(96, Math.round(Math.sqrt(n / 2))));
    this.rows = this.cols;
    this.cw = w / this.cols;
    this.ch = h / this.rows;
    this.grid = Array.from({ length: this.cols * this.rows }, () => []);
    this.polyGrid = Array.from({ length: this.cols * this.rows }, () => []);
    for (const e of this.edges) this.place(e);
    for (const p of this.polys) this.placePoly(p);
  }

  /** Polygons that could contain this point. */
  around(p) {
    if (!this.polyGrid) return this.polys;
    const c = Math.floor((p.x - this.gridBounds.minX) / this.cw);
    const r = Math.floor((p.y - this.gridBounds.minY) / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return EMPTY_LIST;
    return this.polyGrid[r * this.cols + c];
  }

  col(v) {
    const c = Math.floor((v - this.gridBounds.minX) / this.cw);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  row(v) {
    const r = Math.floor((v - this.gridBounds.minY) / this.ch);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  cellRange(box) {
    return [this.col(box.minX), this.row(box.minY), this.col(box.maxX), this.row(box.maxY)];
  }

  /**
   * Edges that could cross the given box.
   *
   * An edge spanning several cells appears in each of them, so the result has
   * to be de-duplicated — and this runs once per segment of every subject, so
   * it is the hottest loop here. Marking edges with a visit stamp does it
   * without allocating a set per query, which profiling showed was most of the
   * cost of clipping a page.
   */
  near(box) {
    if (!this.grid) return this.edges;
    const [c0, r0, c1, r1] = this.cellRange(box);
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > this.cols * this.rows * 0.4) return this.edges;

    const stamp = ++this.stamp;
    const out = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.grid[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          if (e.seen === stamp) continue;
          e.seen = stamp;
          out.push(e);
        }
      }
    }
    return out;
  }

  /**
   * Is this point covered?
   *
   * A point sitting exactly on an occluder's outline normally counts as
   * outside: two motifs whose edges coincide — a leaf tucked flush against a
   * stem — should both keep their shared line rather than one of them vanishing
   * on a floating-point coin toss.
   *
   * A union needs the opposite, because there the coincident edge would be
   * emitted once per polygon and drawn twice over. Passing `rank` switches on a
   * tie-break: a shared edge belongs to the lowest-numbered polygon that has
   * it, so exactly one copy survives.
   */
  covers(p, { skip, rank } = {}) {
    for (const poly of this.around(p)) {
      if (poly === skip) continue;
      const b = poly.bounds;
      if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) continue;

      if (rank === undefined) {
        // Ray casting first: most points are plainly outside, and settling that
        // skips the outline scan entirely. A point that lands on the boundary
        // may be called either way, and whichever way it falls the shared edge
        // is kept — which is the rule anyway.
        if (!inside(p, poly.points)) continue;
        if (onOutline(p, poly.points)) continue;
        return true;
      }

      if (onOutline(p, poly.points)) {
        if (poly.index < rank) return true;
        continue;
      }
      if (inside(p, poly.points)) return true;
    }
    return false;
  }
}

/** Distance from a point to a segment, squared. */
function distSqToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  let t = len ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx - p.x;
  const qy = a.y + t * dy - p.y;
  return qx * qx + qy * qy;
}

function onOutline(p, points) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    if (distSqToSegment(p, points[i], points[(i + 1) % n]) <= TOUCH * TOUCH) return true;
  }
  return false;
}

/** Ray casting. The half-open rule on y keeps vertices from counting twice. */
function inside(p, points) {
  let hit = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = points[i];
    const b = points[j];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (p.x < x) hit = !hit;
    }
  }
  return hit;
}

/* ------------------------------------------------------------- clipping -- */

/**
 * Parameters along `p→q` where it crosses any of `edges`.
 *
 * Only proper crossings are collected. Touching an occluder vertex without
 * passing through it produces no split, which is right: the subject does not
 * change sides there, so no piece needs separating.
 */
function crossings(p, q, edges) {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const ts = [];

  for (const e of edges) {
    const sx = e.b.x - e.a.x;
    const sy = e.b.y - e.a.y;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < EPS) continue; // parallel, including collinear overlap

    const dx = e.a.x - p.x;
    const dy = e.a.y - p.y;
    const t = (dx * sy - dy * sx) / denom;
    const u = (dx * ry - dy * rx) / denom;
    if (t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS) ts.push(t);
  }

  ts.sort((a, b) => a - b);
  return ts;
}

const lerpPt = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

/**
 * Cut away every part of `subpaths` that lies inside `occluders`.
 *
 * @param {{points: {x,y}[], closed: boolean}[]} subpaths
 * @param {Occluders|{x,y}[][]} occluders  polygons, or a prepared set
 * @param {{skip?: object, rank?: number}} [opts]  `skip` ignores one polygon,
 *   for when a shape is clipped against a set it is itself a member of; `rank`
 *   enables the union tie-break described on `Occluders.covers`
 * @returns {{points: {x,y}[], closed: boolean}[]} surviving runs, mostly open
 */
export function clipOut(subpaths, occluders, opts = {}) {
  const occ = occluders instanceof Occluders ? occluders : new Occluders(occluders);
  if (!occ.polys.length) return subpaths;

  const out = [];

  for (const sub of subpaths) {
    const pts = sub.points;
    if (pts.length < 2) continue;

    // Nothing near it: keep the whole subpath untouched, curves and all.
    if (!overlaps(boundsOf(pts), occ.bounds, TOUCH)) {
      out.push(sub);
      continue;
    }

    const limit = sub.closed ? pts.length : pts.length - 1;
    let run = null;

    for (let i = 0; i < limit; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const box = boundsOf([p, q]);
      const ts = overlaps(box, occ.bounds, TOUCH) ? crossings(p, q, occ.near(box)) : [];

      // Walk the segment piece by piece between crossings.
      let from = p;
      for (let k = 0; k <= ts.length; k++) {
        const to = k < ts.length ? lerpPt(p, q, ts[k]) : q;
        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const hidden = occ.covers(mid, opts);

        if (hidden) {
          run = null;
        } else if (run) {
          run.points.push(to);
        } else {
          run = { points: [from, to], closed: false };
          out.push(run);
        }
        from = to;
      }
    }

    // A closed subject that was never cut comes back closed, not as a run that
    // happens to end where it started.
    if (out.length && sub.closed) {
      const last = out[out.length - 1];
      const first = last.points[0];
      const end = last.points[last.points.length - 1];
      if (Math.hypot(first.x - pts[0].x, first.y - pts[0].y) < TOUCH
        && Math.hypot(end.x - pts[0].x, end.y - pts[0].y) < TOUCH) {
        last.points.pop();
        last.closed = true;
      }
    }
  }

  return out.filter((s) => s.points.length >= 2 && runLength(s) > TOUCH * 10);
}

function runLength(sub) {
  let len = 0;
  for (let i = 1; i < sub.points.length; i++) {
    len += Math.hypot(sub.points[i].x - sub.points[i - 1].x, sub.points[i].y - sub.points[i - 1].y);
  }
  return len;
}

/* ---------------------------------------------------------------- union -- */

/**
 * The outline of several overlapping polygons merged into one silhouette.
 *
 * The boundary of a union is exactly those edges that are not inside any other
 * member, so this is `clipOut` with each polygon clipped against its siblings,
 * followed by chaining the surviving pieces back into closed loops.
 */
export function unionOutline(polygons) {
  const occ = new Occluders(polygons);
  const pieces = [];
  for (const poly of occ.polys) {
    pieces.push(
      ...clipOut([{ points: poly.points, closed: true }], occ, { skip: poly, rank: poly.index }),
    );
  }
  return chain(pieces);
}

/**
 * Join runs that meet end to end, closing the loops that come back on
 * themselves. Fragments of a union always meet at the crossing points they
 * were cut at, so this recovers whole rings.
 */
function chain(subpaths) {
  const open = subpaths.filter((s) => !s.closed);
  const out = subpaths.filter((s) => s.closed);
  const used = new Array(open.length).fill(false);

  const key = (p) => `${Math.round(p.x / TOUCH)},${Math.round(p.y / TOUCH)}`;
  const starts = new Map();
  open.forEach((s, i) => {
    const k = key(s.points[0]);
    if (!starts.has(k)) starts.set(k, []);
    starts.get(k).push(i);
  });

  const take = (k) => {
    const bucket = starts.get(k);
    if (!bucket) return -1;
    while (bucket.length) {
      const i = bucket.pop();
      if (!used[i]) return i;
    }
    return -1;
  };

  for (let i = 0; i < open.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const points = open[i].points.slice();

    for (;;) {
      const next = take(key(points[points.length - 1]));
      if (next < 0) break;
      used[next] = true;
      // The shared endpoint is already present; skip its duplicate.
      for (let k = 1; k < open[next].points.length; k++) points.push(open[next].points[k]);
      if (points.length > 100000) break; // never spin on malformed input
    }

    const first = points[0];
    const last = points[points.length - 1];
    const closed = Math.hypot(first.x - last.x, first.y - last.y) < TOUCH;
    if (closed) points.pop();
    out.push({ points, closed });
  }

  return out;
}

export { Occluders };
