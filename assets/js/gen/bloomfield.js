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

    // Stems connecting nearby blooms give the field some structure.
    for (const b of bigs) {
      const near = mids
        .map((m) => ({ m, d: dist(b, m) }))
        .filter((o) => o.d < unit * 0.42)
        .sort((a, z) => a.d - z.d)
        .slice(0, 2);
      for (const { m } of near) {
        const mid = { x: (b.x + m.x) / 2 + rng.range(-unit * 0.06, unit * 0.06), y: (b.y + m.y) / 2 + rng.range(-unit * 0.06, unit * 0.06) };
        sk.path(smooth([b, mid, m]), sk.w(0.9));
        const ang = Math.atan2(m.y - mid.y, m.x - mid.x);
        leaf(sk, mid.x, mid.y, unit * 0.05, 0.22, ang + rng.sign() * 1.2, { veins: 1 });
      }
    }

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
