/*
 * Botanical wreath — a garland of leaves, blooms and berries following a ring,
 * with an open centre. The classic "framed" coloring page.
 */

import { TAU, f, polar, smooth } from '../core/util.js';
import { leaf, flower, berries, teardrop, radialCorners } from '../core/shapes.js';

function sprig(sk, x, y, angle, len, rng) {
  const pts = [];
  const n = 5;
  const curve = rng.range(-0.5, 0.5);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(polar(x, y, len * t, angle + curve * t * t));
  }
  sk.path(smooth(pts), sk.w(0.9));
  const leaves = rng.int(3, 5);
  for (let i = 1; i <= leaves; i++) {
    const t = i / (leaves + 0.5);
    const base = polar(x, y, len * t, angle + curve * t * t);
    const dir = angle + curve * t * t;
    for (const s of [-1, 1]) {
      leaf(sk, base.x, base.y, len * 0.3 * (1 - t * 0.4), 0.2, dir + s * 0.85, { veins: 1 });
    }
  }
}

export default {
  id: 'wreath',
  name: 'Botanical Wreath',
  blurb: 'Leaves, blooms and berries woven into a ring — open in the middle for a name or a quote.',
  tags: ['nature', 'floral', 'gentle'],

  draw(sk, { rng, box, complexity }) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const R = (Math.min(box.w, box.h) / 2) * 0.94;
    const ring = R * rng.range(0.66, 0.74);
    const band = R - ring;

    // Guide vine. The lobe count is fixed up front — rolling it per sample
    // point would turn the ring into noise instead of a gentle wave.
    const wobble = rng.range(0, TAU);
    const lobes = rng.int(3, 6);
    const guide = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * TAU;
      guide.push(polar(cx, cy, ring + Math.sin(a * lobes + wobble) * band * 0.12, a));
    }
    sk.path(smooth(guide, true), sk.w(1.05));

    const units = 8 + complexity * 3 + rng.int(0, 3);
    const step = TAU / units;
    const bloomEvery = rng.int(3, 5);

    for (let i = 0; i < units; i++) {
      const a = i * step + rng.range(-0.05, 0.05);
      const p = polar(cx, cy, ring, a);
      const out = a; // outward normal
      const isBloom = i % bloomEvery === 0;

      if (isBloom) {
        const r = band * rng.range(0.42, 0.6);
        flower(sk, p.x, p.y, r, rng.pick([5, 6, 8]), { rounded: rng.bool(0.7) });
      } else {
        const kind = rng.next();
        if (kind < 0.45) {
          for (const s of [-1, 1]) {
            leaf(sk, p.x, p.y, band * rng.range(0.6, 0.92), rng.range(0.17, 0.26), out + s * rng.range(0.5, 1.1), {
              veins: complexity > 2 ? 2 : 1,
              serrated: rng.bool(0.2),
            });
          }
        } else if (kind < 0.65) {
          berries(sk, p.x, p.y, band * 0.4, rng.int(3, 5), rng);
        } else if (kind < 0.85) {
          teardrop(sk, p.x, p.y, band * rng.range(0.65, 0.95), 0.5, out + rng.range(-0.3, 0.3));
        } else {
          sprig(sk, p.x, p.y, out + rng.range(-0.4, 0.4), band * rng.range(0.7, 1), rng);
        }
      }

      // Fill the inner edge so the ring reads as continuous.
      if (rng.bool(0.7)) {
        const q = polar(cx, cy, ring - band * 0.12, a + step * 0.5);
        leaf(sk, q.x, q.y, band * rng.range(0.3, 0.5), 0.2, a + Math.PI + rng.range(-0.5, 0.5), { veins: 1 });
      }
    }

    // Optional outer/inner keylines.
    if (rng.bool(0.55)) sk.circle(cx, cy, R + band * 0.1, sk.w(1.2));
    if (rng.bool(0.4)) sk.circle(cx, cy, ring - band * rng.range(0.7, 1.0), sk.w(0.85));

    radialCorners(sk, box, R + band * 0.1, rng);
  },
};
