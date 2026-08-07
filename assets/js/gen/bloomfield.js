/*
 * Bloom Field — an all-over floral, scattered with rejection sampling so big
 * blooms never collide, then packed with leaves and dots until the page is
 * full. Large open shapes make this the friendliest page for markers.
 */

import { TAU, polar, dist, smooth } from '../core/util.js';
import { leaf, flower, berries, spiral } from '../core/shapes.js';

function scatter(rng, box, count, minR, maxR, placed) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 60) {
    const r = rng.range(minR, maxR);
    const p = {
      x: rng.range(box.x + r, box.x + box.w - r),
      y: rng.range(box.y + r, box.y + box.h - r),
      r,
    };
    if (placed.every((q) => dist(p, q) > (p.r + q.r) * 0.92)) {
      placed.push(p);
      out.push(p);
    }
  }
  return out;
}

export default {
  id: 'bloomfield',
  name: 'Bloom Field',
  blurb: 'An all-over garden pattern that runs off every edge — big petals, easy on the hands.',
  tags: ['nature', 'floral', 'relaxed'],

  draw(sk, { rng, box, complexity }) {
    const unit = Math.min(box.w, box.h);
    const placed = [];

    const bigCount = 3 + complexity;
    const bigs = scatter(rng, box, bigCount, unit * 0.11, unit * 0.17, placed);
    const midCount = 4 + complexity * 3;
    const mids = scatter(rng, box, midCount, unit * 0.055, unit * 0.09, placed);

    // Stems joining nearby blooms. Each one is trimmed back to the edge of the
    // two blooms it connects and dropped entirely if it would cross anything
    // else, so a stem never runs through a shape. Accepted stems are then
    // reserved so later fillers cannot land on top of them either.
    const reserved = [];
    for (const b of bigs) {
      const near = mids
        .map((m) => ({ m, d: dist(b, m) }))
        .filter((o) => o.d < unit * 0.42)
        .sort((a, z) => a.d - z.d)
        .slice(0, 2);

      for (const { m } of near) {
        const bow = {
          x: (b.x + m.x) / 2 + rng.range(-unit * 0.06, unit * 0.06),
          y: (b.y + m.y) / 2 + rng.range(-unit * 0.06, unit * 0.06),
        };
        // Control point placed so the quadratic passes through `bow` at t=0.5.
        const ctrl = { x: 2 * bow.x - (b.x + m.x) / 2, y: 2 * bow.y - (b.y + m.y) / 2 };

        const path = [];
        for (let i = 0; i <= 28; i++) {
          const t = i / 28;
          const p = {
            x: (1 - t) * (1 - t) * b.x + 2 * (1 - t) * t * ctrl.x + t * t * m.x,
            y: (1 - t) * (1 - t) * b.y + 2 * (1 - t) * t * ctrl.y + t * t * m.y,
          };
          // Tuck the ends under the two blooms rather than across them.
          if (dist(p, b) < b.r * 1.02 || dist(p, m) < m.r * 1.02) continue;
          path.push(p);
        }
        if (path.length < 4) continue;
        // A stem trimmed down to a stub reads as a stray mark, not a stem.
        let span = 0;
        for (let i = 1; i < path.length; i++) span += dist(path[i - 1], path[i]);
        if (span < unit * 0.09) continue;
        if (path.some((p) => placed.some((q) => q !== b && q !== m && dist(p, q) < q.r))) continue;

        sk.path(smooth(path), sk.w(0.9));
        for (const p of path) reserved.push({ x: p.x, y: p.y, r: unit * 0.012 });

        const anchor = path[Math.floor(path.length / 2)];
        const len = unit * 0.05;
        const ang = Math.atan2(m.y - anchor.y, m.x - anchor.x) + rng.sign() * 1.2;
        const tip = { x: anchor.x + Math.cos(ang) * len, y: anchor.y + Math.sin(ang) * len };
        if (placed.every((q) => q === b || q === m || dist(tip, q) > q.r + len * 0.3)) {
          leaf(sk, anchor.x, anchor.y, len, 0.22, ang, { veins: 1 });
          reserved.push({ x: (anchor.x + tip.x) / 2, y: (anchor.y + tip.y) / 2, r: len * 0.55 });
        }
      }
    }
    placed.push(...reserved);

    for (const b of bigs) {
      flower(sk, b.x, b.y, b.r, rng.pick([5, 6, 7, 8]), { rounded: rng.bool(0.65) });
    }

    for (const m of mids) {
      const kind = rng.next();
      if (kind < 0.5) flower(sk, m.x, m.y, m.r, rng.pick([5, 6, 8]), { inner: rng.bool(0.6) });
      else if (kind < 0.7) berries(sk, m.x, m.y, m.r * 0.9, rng.int(3, 6), rng);
      else if (kind < 0.85) spiral(sk, m.x, m.y, m.r, rng.range(2, 3.4), rng);
      else {
        const n = rng.int(3, 5);
        for (let i = 0; i < n; i++) {
          leaf(sk, m.x, m.y, m.r * 1.15, 0.22, (i / n) * TAU + rng.range(-0.2, 0.2), { veins: 1 });
        }
      }
    }

    // Filler: small leaves and dot clusters in whatever gaps remain.
    const fillers = 20 + complexity * 14;
    let guard = 0;
    let made = 0;
    while (made < fillers && guard++ < fillers * 25) {
      const r = unit * rng.range(0.018, 0.04);
      const p = { x: rng.range(box.x + r, box.x + box.w - r), y: rng.range(box.y + r, box.y + box.h - r), r: r * 1.5 };
      if (!placed.every((q) => dist(p, q) > (p.r + q.r) * 0.85)) continue;
      placed.push(p);
      made++;
      const kind = rng.next();
      if (kind < 0.45) {
        leaf(sk, p.x, p.y, r * 2.6, 0.22, rng.range(0, TAU), { veins: 1 });
      } else if (kind < 0.7) {
        sk.circle(p.x, p.y, r, sk.w(0.85));
        if (rng.bool(0.5)) sk.circle(p.x, p.y, r * 0.45, sk.w(0.65));
      } else {
        const n = rng.int(3, 5);
        for (let i = 0; i < n; i++) {
          const q = polar(p.x, p.y, r, (i / n) * TAU);
          sk.circle(q.x, q.y, r * 0.34, sk.w(0.7));
        }
      }
    }
  },
};
