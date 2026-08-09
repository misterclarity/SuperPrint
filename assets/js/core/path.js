/*
 * Path geometry: turning the markup the generators emit back into points.
 *
 * Everything in this project is drawn as SVG path data, which is fine for
 * printing and useless for reasoning about. Anything that needs to know where
 * the ink actually is — clipping one motif behind another, measuring how a
 * design sits on the page — has to flatten those curves into polylines first.
 *
 * Flattening is lossy by nature, so the tolerance matters. It is expressed in
 * user units, of which there are 100 to the inch; the default of a fifth of a
 * unit is a five-hundredth of an inch, comfortably finer than a 300 DPI dot and
 * far finer than the thinnest pen on offer. Nobody will ever see the chords.
 */

import { f } from './util.js';

export const TOLERANCE = 0.2;

/** Distance from a point to a line segment. */
function pointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}

/* ------------------------------------------------------------- parsing -- */

const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Split path data into `{ cmd, args }` steps.
 *
 * Only the absolute forms this codebase emits are supported, plus the relative
 * ones for good measure; anything unrecognised is skipped rather than guessed
 * at, so a malformed path degrades to less geometry instead of wrong geometry.
 */
function parsePath(d) {
  const tokens = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const out = [];
  let i = 0;
  let cmd = null;

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) break; // numbers before any command: nothing sensible to do
    else if (cmd === 'M') cmd = 'L'; // repeated M coordinates are implicit L
    else if (cmd === 'm') cmd = 'l';

    const key = cmd.toUpperCase();
    const n = ARGS[key];
    if (n === undefined) break;
    if (i + n > tokens.length) break;

    const args = [];
    for (let k = 0; k < n; k++) args.push(Number(tokens[i++]));
    out.push({ cmd, args });
  }
  return out;
}

/* ---------------------------------------------------------- flattening -- */

/**
 * Subdivide a cubic until each piece is flat to within `tol`, then emit its
 * end point.
 *
 * `tol` is a real distance in user units, not a dimensionless fudge factor, and
 * the controls are measured against the chord as a *segment* rather than as an
 * infinite line. That distinction matters: a hairpin whose two endpoints nearly
 * meet has almost no chord to divide by, and the usual cross-product test calls
 * it flat while the curve loops far away. Measuring to the segment degrades
 * gracefully to "distance from the endpoint" as the chord collapses.
 *
 * The criterion — both offsets summing to under the tolerance — is stricter
 * than the curve's actual departure from its chord. tests/clip.test.mjs
 * measures that departure against the true curve for a range of shapes,
 * including the hairpin.
 */
function flattenCubic(out, x0, y0, x1, y1, x2, y2, x3, y3, tol, depth) {
  const flat = pointToSegment(x1, y1, x0, y0, x3, y3)
    + pointToSegment(x2, y2, x0, y0, x3, y3) <= tol;

  if (depth > 18 || flat) {
    out.push({ x: x3, y: y3 });
    return;
  }

  const x01 = (x0 + x1) / 2;
  const y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2;
  const y23 = (y2 + y3) / 2;
  const xa = (x01 + x12) / 2;
  const ya = (y01 + y12) / 2;
  const xb = (x12 + x23) / 2;
  const yb = (y12 + y23) / 2;
  const xm = (xa + xb) / 2;
  const ym = (ya + yb) / 2;

  flattenCubic(out, x0, y0, x01, y01, xa, ya, xm, ym, tol, depth + 1);
  flattenCubic(out, xm, ym, xb, yb, x23, y23, x3, y3, tol, depth + 1);
}

/** Endpoint-parameterised SVG arc, sampled finely enough to hide the chords. */
function flattenArc(out, x0, y0, rx, ry, rot, large, sweep, x, y, tol) {
  if (!rx || !ry) {
    out.push({ x, y });
    return;
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rot * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);

  // Step 1: the arc in a frame where the ellipse is a unit circle at the origin.
  const dx2 = (x0 - x) / 2;
  const dy2 = (y0 - y) / 2;
  const x1 = cos * dx2 + sin * dy2;
  const y1 = -sin * dx2 + cos * dy2;

  // An ellipse too small to reach both endpoints is scaled up until it does,
  // which is what the SVG specification requires.
  const check = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (check > 1) {
    const s = Math.sqrt(check);
    rx *= s;
    ry *= s;
  }

  const denom = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let factor = denom ? (rx * rx * ry * ry - denom) / denom : 0;
  factor = Math.sqrt(Math.max(0, factor));
  if (large === sweep) factor = -factor;

  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (x0 + x) / 2;
  const cy = sin * cx1 + cos * cy1 + (y0 + y) / 2;

  const angleOf = (ux, uy) => Math.atan2(uy, ux);
  const start = angleOf((x1 - cx1) / rx, (y1 - cy1) / ry);
  let sweepAngle = angleOf((-x1 - cx1) / rx, (-y1 - cy1) / ry) - start;
  if (!sweep && sweepAngle > 0) sweepAngle -= Math.PI * 2;
  if (sweep && sweepAngle < 0) sweepAngle += Math.PI * 2;

  // Chord error of a circular arc is r(1 - cos(θ/2)); invert for the step.
  const r = Math.max(rx, ry);
  const step = r > tol ? 2 * Math.acos(Math.max(-1, 1 - tol / r)) : Math.PI / 2;
  const steps = Math.max(2, Math.ceil(Math.abs(sweepAngle) / step));

  for (let k = 1; k <= steps; k++) {
    const a = start + (sweepAngle * k) / steps;
    const px = rx * Math.cos(a);
    const py = ry * Math.sin(a);
    out.push({ x: cos * px - sin * py + cx, y: sin * px + cos * py + cy });
  }
}

/**
 * Flatten path data into subpaths.
 *
 * @returns {{points: {x:number,y:number}[], closed: boolean}[]}
 *   Closed subpaths do not repeat the first point at the end; `closed` says so
 *   instead. Callers that need the wrap-around segment can take index 0 again.
 */
export function flattenPath(d, tol = TOLERANCE) {
  const steps = parsePath(d);
  const subs = [];
  let cur = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  // Trailing control point of the previous curve, for the S and T shorthands.
  let px = 0;
  let py = 0;
  let prev = '';

  const start = () => {
    cur = { points: [{ x, y }], closed: false };
    subs.push(cur);
  };
  const to = (nx, ny) => {
    if (!cur) start();
    cur.points.push({ x: nx, y: ny });
    x = nx;
    y = ny;
  };

  for (const { cmd, args } of steps) {
    const rel = cmd >= 'a';
    const key = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;

    if (key === 'M') {
      x = args[0] + ox;
      y = args[1] + oy;
      sx = x;
      sy = y;
      start();
    } else if (key === 'L') {
      to(args[0] + ox, args[1] + oy);
    } else if (key === 'H') {
      to(args[0] + ox, y);
    } else if (key === 'V') {
      to(x, args[0] + oy);
    } else if (key === 'C' || key === 'S') {
      let c1x;
      let c1y;
      let c2x;
      let c2y;
      let ex;
      let ey;
      if (key === 'C') {
        [c1x, c1y, c2x, c2y, ex, ey] = args.map((v, i) => v + (i % 2 ? oy : ox));
      } else {
        // S reflects the previous curve's second control through the current point.
        const mirror = 'CS'.includes(prev);
        c1x = mirror ? 2 * x - px : x;
        c1y = mirror ? 2 * y - py : y;
        [c2x, c2y, ex, ey] = args.map((v, i) => v + (i % 2 ? oy : ox));
      }
      if (!cur) start();
      flattenCubic(cur.points, x, y, c1x, c1y, c2x, c2y, ex, ey, tol, 0);
      px = c2x;
      py = c2y;
      x = ex;
      y = ey;
    } else if (key === 'Q' || key === 'T') {
      let qx;
      let qy;
      let ex;
      let ey;
      if (key === 'Q') {
        [qx, qy, ex, ey] = args.map((v, i) => v + (i % 2 ? oy : ox));
      } else {
        const mirror = 'QT'.includes(prev);
        qx = mirror ? 2 * x - px : x;
        qy = mirror ? 2 * y - py : y;
        [ex, ey] = [args[0] + ox, args[1] + oy];
      }
      // Every quadratic is exactly a cubic, so there is only one flattener.
      if (!cur) start();
      flattenCubic(
        cur.points,
        x, y,
        x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y),
        ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey),
        ex, ey, tol, 0,
      );
      px = qx;
      py = qy;
      x = ex;
      y = ey;
    } else if (key === 'A') {
      const ex = args[5] + ox;
      const ey = args[6] + oy;
      if (!cur) start();
      flattenArc(cur.points, x, y, args[0], args[1], args[2], args[3], args[4], ex, ey, tol);
      x = ex;
      y = ey;
    } else if (key === 'Z') {
      if (cur) cur.closed = true;
      x = sx;
      y = sy;
      cur = null;
    }
    prev = key;
  }

  // A subpath of one point draws nothing and only confuses everything downstream.
  return subs.filter((s) => s.points.length > 1);
}

/* --------------------------------------------------- primitives as paths -- */

const ELLIPSE_STEPS = (rx, ry, tol) => {
  const r = Math.max(Math.abs(rx), Math.abs(ry));
  if (r <= tol) return 4;
  return Math.max(8, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tol / r))));
};

/** A circle or ellipse as a closed polygon. */
export function ellipsePoints(cx, cy, rx, ry, tol = TOLERANCE) {
  const n = ELLIPSE_STEPS(rx, ry, tol);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
}

/* ------------------------------------------------- markup as geometry -- */

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

const applyTo = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

const RAD = Math.PI / 180;

/** Parse a transform list: translate, rotate (with or without a centre), scale. */
function parseTransform(text) {
  let m = IDENTITY;
  const re = /(translate|rotate|scale|matrix)\(([^)]*)\)/g;
  let hit;
  while ((hit = re.exec(text))) {
    const a = hit[2].trim().split(/[\s,]+/).map(Number);
    if (hit[1] === 'translate') {
      m = compose(m, [1, 0, 0, 1, a[0] || 0, a[1] || 0]);
    } else if (hit[1] === 'scale') {
      m = compose(m, [a[0] ?? 1, 0, 0, a.length > 1 ? a[1] : a[0] ?? 1, 0, 0]);
    } else if (hit[1] === 'matrix') {
      m = compose(m, [a[0], a[1], a[2], a[3], a[4], a[5]]);
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

const ATTR = (src, name) => {
  const hit = src.match(new RegExp(`\\b${name}="([^"]*)"`));
  return hit ? hit[1] : null;
};
const NUM = (src, name) => Number(ATTR(src, name) || 0);

/**
 * Read a fragment of drawing markup back into polylines.
 *
 * Generators emit strings, so anything that needs to reason about the drawing —
 * clipping a motif behind another, measuring how the ink sits on the page — has
 * to read those strings back. Group transforms are applied, because several
 * styles draw a motif once and re-emit it rotated; ignoring that would pile
 * every point at the origin.
 *
 * Each result carries `attrs`: the element's presentational attributes with the
 * geometry ones removed, so a caller that reshapes the geometry can put it back
 * with the pen it was drawn with.
 *
 * @returns {{points: {x,y}[], closed: boolean, tag: string, attrs: string}[]}
 */
// Anchored on whitespace rather than a word boundary: `\b` would match inside
// `stroke-width`, quietly stripping the pen from every shape it touched.
const GEOMETRY_ATTRS = /(^|\s)(d|cx|cy|r|rx|ry|x|y|x1|y1|x2|y2|width|height|points|transform)="[^"]*"/g;

/** Presentational attributes only, ready to splice back into a new element. */
function cleanAttrs(attrs) {
  const kept = attrs.replace(/\/\s*$/, '').replace(GEOMETRY_ATTRS, ' ').trim();
  return kept ? ` ${kept}` : '';
}

export function parseFragment(markup, tol = TOLERANCE) {
  const out = [];
  const stack = [IDENTITY];
  const re = /<(\/?)(g|path|circle|ellipse|line|rect|polygon|polyline)\b([^>]*)>/g;
  let hit;

  const push = (points, closed, tag, m, attrs) => {
    if (points.length < 2) return;
    out.push({
      points: m === IDENTITY ? points : points.map((p) => applyTo(m, p)),
      closed,
      tag,
      // The transform is already baked into the points; carrying it would apply it twice.
      attrs: cleanAttrs(attrs),
    });
  };

  while ((hit = re.exec(markup))) {
    const [, closing, tag, attrs] = hit;
    if (tag === 'g') {
      if (closing) {
        if (stack.length > 1) stack.pop();
      } else {
        stack.push(compose(stack[stack.length - 1], parseTransform(ATTR(attrs, 'transform') || '')));
      }
      continue;
    }

    let m = stack[stack.length - 1];
    const own = ATTR(attrs, 'transform');
    if (own) m = compose(m, parseTransform(own));

    if (tag === 'path') {
      for (const sub of flattenPath(ATTR(attrs, 'd') || '', tol)) push(sub.points, sub.closed, tag, m, attrs);
    } else if (tag === 'circle') {
      push(ellipsePoints(NUM(attrs, 'cx'), NUM(attrs, 'cy'), NUM(attrs, 'r'), NUM(attrs, 'r'), tol), true, tag, m, attrs);
    } else if (tag === 'ellipse') {
      push(ellipsePoints(NUM(attrs, 'cx'), NUM(attrs, 'cy'), NUM(attrs, 'rx'), NUM(attrs, 'ry'), tol), true, tag, m, attrs);
    } else if (tag === 'line') {
      push([
        { x: NUM(attrs, 'x1'), y: NUM(attrs, 'y1') },
        { x: NUM(attrs, 'x2'), y: NUM(attrs, 'y2') },
      ], false, tag, m, attrs);
    } else if (tag === 'rect') {
      const x = NUM(attrs, 'x');
      const y = NUM(attrs, 'y');
      const w = NUM(attrs, 'width');
      const h = NUM(attrs, 'height');
      push([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], true, tag, m, attrs);
    } else if (tag === 'polygon' || tag === 'polyline') {
      const nums = (ATTR(attrs, 'points') || '').trim().split(/[\s,]+/).map(Number);
      const pts = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
      push(pts, tag === 'polygon', tag, m, attrs);
    }
  }
  return out;
}

/* ---------------------------------------------------------- emitting -- */

/** Path data for a polyline, closing it if asked. */
export function pointsToPath(points, closed) {
  if (!points || points.length < 2) return '';
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < points.length; i++) d += `L${f(points[i].x)} ${f(points[i].y)}`;
  return closed ? `${d}Z` : d;
}
