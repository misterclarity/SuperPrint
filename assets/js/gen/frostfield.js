/*
 * Frost Field — the Bloom Field composition rendered in ice.
 *
 * Same idea (rejection-sampled scatter, big shapes first, gaps packed with
 * smaller ones) but every element is a six-fold crystal, and nothing is joined
 * by stems: snow falls, it doesn't grow.
 */

import { TAU, polar, dist } from '../core/util.js';
import { snowflake, sparkle, hexagon } from '../core/shapes.js';

function scatter(rng, box, count, minR, maxR, placed, spacing = 1.04) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 70) {
    const r = rng.range(minR, maxR);
    const p = {
      x: rng.range(box.x + r, box.x + box.w - r),
      y: rng.range(box.y + r, box.y + box.h - r),
      r,
    };
    if (placed.every((q) => dist(p, q) > (p.r + q.r) * spacing)) {
      placed.push(p);
      out.push(p);
    }
  }
  return out;
}

export default {
  id: 'frostfield',
  name: 'Frost Field',
  blurb: 'A drift of six-fold snow crystals, each one different — winter cards and calm evenings.',
  tags: ['winter', 'symmetry', 'relaxed'],

  draw(sk, { rng, box, complexity }) {
    const unit = Math.min(box.w, box.h);
    const placed = [];

    // Crystals need a little air around them or the arms tangle, hence the
    // generous spacing factor compared with the floral field.
    const bigs = scatter(rng, box, 2 + Math.floor(complexity / 2), unit * 0.13, unit * 0.18, placed, 1.06);
    const mids = scatter(rng, box, 2 + complexity, unit * 0.075, unit * 0.11, placed, 1.05);
    const smalls = scatter(rng, box, 3 + complexity * 2, unit * 0.045, unit * 0.065, placed, 1.04);

    for (const s of [...bigs, ...mids, ...smalls]) {
      snowflake(sk, s.x, s.y, s.r, rng);
    }

    // Falling flecks: sparkles, tiny hexagons and dot clusters in the gaps.
    const flecks = 12 + complexity * 9;
    let guard = 0;
    let made = 0;
    while (made < flecks && guard++ < flecks * 25) {
      const r = unit * rng.range(0.008, 0.022);
      const p = { x: rng.range(box.x + r, box.x + box.w - r), y: rng.range(box.y + r, box.y + box.h - r), r: r * 1.9 };
      if (!placed.every((q) => dist(p, q) > (p.r + q.r) * 0.9)) continue;
      placed.push(p);
      made++;

      const kind = rng.next();
      if (kind < 0.45) {
        sparkle(sk, p.x, p.y, r * 1.6, rng);
      } else if (kind < 0.72) {
        hexagon(sk, p.x, p.y, r, 0.85);
        if (r > unit * 0.014 && rng.bool(0.5)) hexagon(sk, p.x, p.y, r * 0.45, 0.65);
      } else {
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) {
          const q = polar(p.x, p.y, r, (i / n) * TAU + rng.range(0, 1));
          sk.circle(q.x, q.y, r * 0.34, sk.w(0.7));
        }
      }
    }
  },
};
