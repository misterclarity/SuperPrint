/*
 * Stained Glass — recursive convex subdivision of the page, then each pane is
 * inset to create the double "lead came" outline.
 *
 * Cuts are taken across each cell's *longest* axis, which is what stops the
 * subdivision from shedding long thin slivers: however lopsided a cell gets,
 * the next cut works against the elongation rather than with it. Every cut is
 * a straight line, so cells stay convex and a simple vertex-toward-centroid
 * inset is well behaved.
 */

import { TAU, polar, lerp, centroid, polyArea } from '../core/util.js';

/** Direction of the widest spread of a polygon. */
function longAxis(pts) {
  let best = -1;
  let dir = { x: 1, y: 0 };
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      const d = dx * dx + dy * dy;
      if (d > best) {
        best = d;
        const len = Math.sqrt(d) || 1;
        dir = { x: dx / len, y: dy / len };
      }
    }
  }
  return dir;
}

/** Split a convex polygon by the line through `p0` with normal `n`. */
function clipBoth(pts, p0, n) {
  const side = pts.map((p) => (p.x - p0.x) * n.x + (p.y - p0.y) * n.y);
  const neg = [];
  const pos = [];
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const a = side[i];
    const b = side[j];
    if (a <= 0) neg.push(pts[i]);
    if (a >= 0) pos.push(pts[i]);
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      const t = a / (a - b);
      const cross = { x: lerp(pts[i].x, pts[j].x, t), y: lerp(pts[i].y, pts[j].y, t) };
      neg.push(cross);
      pos.push(cross);
    }
  }
  return [neg, pos].filter((p) => p.length >= 3);
}

function subdivide(pts, minArea, rng, depth = 0) {
  const area = polyArea(pts);
  // A little randomness in the stopping point gives a mix of pane sizes
  // without ever leaving one enormous empty region.
  if (depth > 13 || area < minArea * rng.range(0.85, 1.6)) return [pts];

  const axis = longAxis(pts);
  const jitter = rng.range(-0.3, 0.3);
  const n = {
    x: axis.x * Math.cos(jitter) - axis.y * Math.sin(jitter),
    y: axis.x * Math.sin(jitter) + axis.y * Math.cos(jitter),
  };

  const c = centroid(pts);
  const proj = pts.map((p) => (p.x - c.x) * n.x + (p.y - c.y) * n.y);
  const lo = Math.min(...proj);
  const hi = Math.max(...proj);
  const t = lerp(lo, hi, rng.range(0.36, 0.64));
  const p0 = { x: c.x + n.x * t, y: c.y + n.y * t };

  const parts = clipBoth(pts, p0, n);
  if (parts.length < 2) return [pts];
  return parts.flatMap((p) => subdivide(p, minArea, rng, depth + 1));
}

/** Distance from a point to the nearest edge — the usable radius inside a pane. */
function inradius(pts, c) {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2));
    min = Math.min(min, Math.hypot(c.x - (a.x + dx * t), c.y - (a.y + dy * t)));
  }
  return min;
}

export default {
  id: 'stainedglass',
  name: 'Stained Glass',
  blurb: 'Leaded panes in irregular facets — every shape a separate colour decision.',
  tags: ['abstract', 'bold', 'beginner-friendly'],

  draw(sk, { rng, box, complexity }) {
    const lead = Math.min(box.w, box.h) * 0.011 + 1.5;
    const targetCells = 16 + complexity * complexity * 5;
    const minArea = (box.w * box.h) / targetCells;

    const round = rng.bool(0.35);
    let root;
    if (round) {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const R = Math.min(box.w, box.h) / 2;
      const n = 30;
      root = Array.from({ length: n }, (_, i) => polar(cx, cy, R, (i / n) * TAU));
    } else {
      root = [
        { x: box.x, y: box.y },
        { x: box.x + box.w, y: box.y },
        { x: box.x + box.w, y: box.y + box.h },
        { x: box.x, y: box.y + box.h },
      ];
    }

    for (const cell of subdivide(root, minArea, rng)) {
      const c = centroid(cell);
      const ir = inradius(cell, c);
      if (ir <= lead * 1.15) continue; // too slim to hold a visible pane

      const k = 1 - lead / ir; // uniform inset that keeps the pane convex
      const inner = cell.map((p) => ({ x: lerp(c.x, p.x, k), y: lerp(c.y, p.y, k) }));
      sk.poly(inner, true, sk.w(1));

      const r = ir - lead;
      if (r > lead * 4 && rng.bool(0.36)) {
        const kind = rng.next();
        if (kind < 0.45) {
          sk.circle(c.x, c.y, r * rng.range(0.4, 0.62), sk.w(0.85));
          if (rng.bool(0.45)) sk.circle(c.x, c.y, r * 0.22, sk.w(0.7));
        } else if (kind < 0.8) {
          const j = rng.range(0.45, 0.65);
          sk.poly(inner.map((p) => ({ x: lerp(c.x, p.x, j), y: lerp(c.y, p.y, j) })), true, sk.w(0.8));
        } else {
          const m = rng.int(3, 6);
          for (let i = 0; i < m; i++) {
            const p = polar(c.x, c.y, r * 0.55, (i / m) * TAU + rng.range(0, 1));
            sk.circle(p.x, p.y, r * 0.15, sk.w(0.7));
          }
        }
      }
    }

    sk.poly(root, true, sk.w(1.4));
  },
};
