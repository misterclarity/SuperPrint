/*
 * Kaleidoscope — a random doodle drawn inside one narrow wedge, then mirrored
 * and rotated around the centre. Because the wedge content is unconstrained,
 * every seed produces a genuinely different composition (unlike the mandala,
 * which always reads as rings).
 */

import { TAU, f, polar, smooth } from '../core/util.js';
import { radialCorners, scallops } from '../core/shapes.js';

function wedgeContent(sk, R, half, rng, complexity) {
  const strokes = 3 + complexity * 2 + rng.int(0, 2);
  const r0 = R * 0.2;

  // Radii sampled uniformly by *area*, not by radius: picking r evenly would
  // crowd everything into the narrow tip of the wedge and leave the rim bare.
  const rr = (loFrac = r0 / R, hiFrac = 1) =>
    R * Math.sqrt(rng.range(loFrac * loFrac, hiFrac * hiFrac));

  for (let s = 0; s < strokes; s++) {
    const kind = rng.next();

    if (kind < 0.44) {
      // Flowing curve from somewhere inside the wedge out toward the rim.
      const pts = [];
      const n = rng.int(3, 6);
      const aStart = rng.range(0, half);
      const aEnd = rng.range(0, half);
      const rStart = rr(r0 / R, 0.6);
      const rEnd = rr(0.55, 0.99);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = aStart + (aEnd - aStart) * t + Math.sin(t * Math.PI * rng.range(1, 2.5)) * half * 0.4;
        const r = rStart + (rEnd - rStart) * t;
        pts.push(polar(0, 0, r, Math.max(0, Math.min(half, a))));
      }
      sk.path(smooth(pts), sk.w(rng.pick([0.75, 1, 1, 1.25])));
    } else if (kind < 0.62) {
      // Closed lens/leaf shape straddling the wedge.
      const rA = rr(r0 / R, 0.72);
      const rB = rA + rng.range(R * 0.14, R * 0.36);
      const aM = rng.range(half * 0.15, half * 0.9);
      const p1 = polar(0, 0, rA, aM);
      const p2 = polar(0, 0, Math.min(rB, R), aM);
      const bow = rng.range(0.25, 0.75) * half;
      const c1 = polar(0, 0, (rA + rB) / 2, Math.max(0, aM - bow));
      const c2 = polar(0, 0, (rA + rB) / 2, Math.min(half, aM + bow));
      sk.path(`M${f(p1.x)} ${f(p1.y)}Q${f(c1.x)} ${f(c1.y)} ${f(p2.x)} ${f(p2.y)}Q${f(c2.x)} ${f(c2.y)} ${f(p1.x)} ${f(p1.y)}Z`);
    } else if (kind < 0.78) {
      // Circle cluster.
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i++) {
        const r = rr(r0 / R, 0.92);
        const a = rng.range(half * 0.1, half);
        const p = polar(0, 0, r, a);
        const size = Math.min(rng.range(R * 0.03, R * 0.1), r * half * 0.9);
        sk.circle(p.x, p.y, size);
        if (size > R * 0.05 && rng.bool(0.5)) sk.circle(p.x, p.y, size * 0.5, sk.w(0.7));
      }
    } else if (kind < 0.9) {
      // Arc band following the circumference.
      const r = rr(0.28, 0.95);
      const a1 = rng.range(0, half * 0.4);
      const a2 = rng.range(half * 0.6, half);
      const p1 = polar(0, 0, r, a1);
      const p2 = polar(0, 0, r, a2);
      sk.path(`M${f(p1.x)} ${f(p1.y)}A${f(r)} ${f(r)} 0 0 1 ${f(p2.x)} ${f(p2.y)}`, sk.w(rng.pick([0.8, 1.1])));
    } else {
      // Straight spoke.
      const a = rng.range(0, half);
      const p1 = polar(0, 0, rr(r0 / R, 0.45), a);
      const p2 = polar(0, 0, rr(0.55, 1), a);
      sk.line(p1.x, p1.y, p2.x, p2.y, sk.w(0.85));
    }
  }
}

export default {
  id: 'kaleidoscope',
  name: 'Kaleidoscope',
  blurb: 'One random doodle, mirrored around a circle — abstract shards and unexpected shapes.',
  tags: ['abstract', 'symmetry', 'modern'],

  draw(sk, { rng, box, complexity }) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const R = Math.min(box.w, box.h) / 2;
    const wedges = rng.pick([6, 8, 8, 10, 12, 12, 16]);
    const half = Math.PI / wedges;

    // The doodle stops short of the rim; a border band fills the gap so the
    // composition reads as a rose window rather than a blot in a circle.
    const rim = R * rng.range(0.76, 0.84);

    // Build the wedge once, then re-emit it as mirrored pairs.
    const cache = new (sk.constructor)({ width: sk.width, height: sk.height, stroke: sk.stroke });
    wedgeContent(cache, rim, half, rng, complexity);
    const content = cache.parts.join('');

    for (let i = 0; i < wedges; i++) {
      const deg = f((i * 360) / wedges);
      sk.open(`translate(${f(cx)} ${f(cy)}) rotate(${deg})`).raw(content).close();
      sk.open(`translate(${f(cx)} ${f(cy)}) rotate(${deg}) scale(1 -1)`).raw(content).close();
    }

    // Border band between the doodle and the rim.
    const outer = R * 0.96;
    const petals = wedges * 2;
    sk.circle(cx, cy, rim, sk.w(1));
    const band = rng.next();
    if (band < 0.34) {
      scallops(sk, cx, cy, outer, petals, 0.85, 0);
    } else if (band < 0.68) {
      const step = TAU / petals;
      for (let i = 0; i < petals; i++) {
        const a = i * step;
        const base = polar(cx, cy, rim, a);
        const tip = polar(cx, cy, outer, a);
        const c1 = polar(cx, cy, (rim + outer) / 2, a - step * 0.45);
        const c2 = polar(cx, cy, (rim + outer) / 2, a + step * 0.45);
        sk.path(`M${f(base.x)} ${f(base.y)}Q${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)}Q${f(c2.x)} ${f(c2.y)} ${f(base.x)} ${f(base.y)}Z`);
      }
    } else {
      const mid = (rim + outer) / 2;
      const rr = Math.min((outer - rim) * 0.46, (TAU * mid) / petals / 2.1);
      for (let i = 0; i < petals; i++) {
        const p = polar(cx, cy, mid, (i / petals) * TAU);
        sk.circle(p.x, p.y, rr);
        if (rr > 8) sk.circle(p.x, p.y, rr * 0.45, sk.w(0.7));
      }
    }

    // Framing rings keep the shards contained.
    sk.circle(cx, cy, R, sk.w(1.3));
    if (rng.bool(0.7)) sk.circle(cx, cy, outer, sk.w(0.8));
    const rInner = R * rng.range(0.07, 0.14);
    sk.circle(cx, cy, rInner, sk.w(1.1));
    if (rng.bool(0.6)) {
      const n = wedges * 2;
      for (let i = 0; i < n; i++) {
        const p = polar(cx, cy, rInner * 0.6, (i / n) * TAU);
        sk.circle(p.x, p.y, rInner * 0.14, sk.w(0.7));
      }
    }

    radialCorners(sk, box, R, rng);
  },
};
