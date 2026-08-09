/*
 * Botanical wreath — a garland of leaves, blooms and berries following a ring,
 * with an open centre. The classic "framed" coloring page.
 */

import { TAU, f, polar, smooth } from '../core/util.js';
import { leaf, flower, berries, teardrop, radialCorners } from '../core/shapes.js';
import { layered } from '../core/layer.js';

/*
 * A stem with paired leaves. The leaflets sit close enough to overlap, and
 * densely enough that drawn plainly they fill in to a black smudge, so they are
 * layered from the tip back — each pair in front of the one before it, and all
 * of them in front of the stem.
 */
function sprig(sk, x, y, angle, len, rng) {
  const pts = [];
  const n = 5;
  const curve = rng.range(-0.5, 0.5);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(polar(x, y, len * t, angle + curve * t * t));
  }

  const stack = [{ draw: (s) => s.path(smooth(pts), s.w(0.9)), occludes: false }];
  const leaves = rng.int(3, 5);
  for (let i = leaves; i >= 1; i--) {
    const t = i / (leaves + 0.5);
    const base = polar(x, y, len * t, angle + curve * t * t);
    const dir = angle + curve * t * t;
    const size = len * 0.3 * (1 - t * 0.4);
    stack.push((s) => {
      for (const sgn of [-1, 1]) leaf(s, base.x, base.y, size, 0.2, dir + sgn * 0.85, { veins: 1 });
    });
  }
  layered(sk, stack);
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
    /*
     * The garland is built as a stack rather than a sequence, so that each
     * motif hides the parts of its neighbours it lies across. Drawn plainly,
     * leaves run straight through berries and the ring becomes a mesh of
     * slivers too small to colour.
     *
     * The vine and the keylines go in at the back and are marked as
     * non-occluding: they are lines on the page, not things with a front and a
     * back, and a keyline circle taken for a solid would erase the whole wreath
     * inside it.
     */
    const stack = [
      { draw: (s) => s.path(smooth(guide, true), s.w(1.05)), occludes: false },
    ];

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
        const petals = rng.pick([5, 6, 8]);
        const rounded = rng.bool(0.7);
        stack.push((s) => flower(s, p.x, p.y, r, petals, { rounded }));
      } else {
        const kind = rng.next();
        if (kind < 0.45) {
          const pair = [-1, 1].map((s) => ({
            len: band * rng.range(0.6, 0.92),
            wid: rng.range(0.17, 0.26),
            ang: out + s * rng.range(0.5, 1.1),
            serrated: rng.bool(0.2),
          }));
          const veins = complexity > 2 ? 2 : 1;
          // Each leaf of a pair is its own layer, so the second lies over the first.
          for (const l of pair) {
            stack.push((s) => leaf(s, p.x, p.y, l.len, l.wid, l.ang, { veins, serrated: l.serrated }));
          }
        } else if (kind < 0.65) {
          const n = rng.int(3, 5);
          const child = rng.fork();
          stack.push((s) => berries(s, p.x, p.y, band * 0.4, n, child));
        } else if (kind < 0.85) {
          const len = band * rng.range(0.65, 0.95);
          const ang = out + rng.range(-0.3, 0.3);
          stack.push((s) => teardrop(s, p.x, p.y, len, 0.5, ang));
        } else {
          const ang = out + rng.range(-0.4, 0.4);
          const len = band * rng.range(0.7, 1);
          const child = rng.fork();
          stack.push((s) => sprig(s, p.x, p.y, ang, len, child));
        }
      }

      // Fill the inner edge so the ring reads as continuous.
      if (rng.bool(0.7)) {
        const q = polar(cx, cy, ring - band * 0.12, a + step * 0.5);
        const len = band * rng.range(0.3, 0.5);
        const ang = a + Math.PI + rng.range(-0.5, 0.5);
        stack.push((s) => leaf(s, q.x, q.y, len, 0.2, ang, { veins: 1 }));
      }
    }

    // Optional outer/inner keylines, tucked behind the garland.
    if (rng.bool(0.55)) {
      stack.splice(1, 0, { draw: (s) => s.circle(cx, cy, R + band * 0.1, s.w(1.2)), occludes: false });
    }
    if (rng.bool(0.4)) {
      const r = ring - band * rng.range(0.7, 1.0);
      stack.splice(1, 0, { draw: (s) => s.circle(cx, cy, r, s.w(0.85)), occludes: false });
    }

    layered(sk, stack);
    radialCorners(sk, box, R + band * 0.1, rng);
  },
};
