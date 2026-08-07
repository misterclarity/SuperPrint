/*
 * Celtic Weave — Truchet-style interlace.
 *
 * Every tile connects the midpoints of all four of its edges, so whatever the
 * random tile choice, ribbons always join seamlessly with their neighbours and
 * the whole page becomes a handful of continuous bands. Crossings are drawn
 * with an over/under break, which is what sells the "woven" read.
 */

import { f } from '../core/util.js';

/**
 * A pair of parallel arcs centred on a cell corner, forming one elbow of
 * ribbon. `d1`/`d2` are unit directions from that corner to the two edge
 * midpoints the ribbon connects.
 */
function elbow(sk, cx, cy, s, w, d1, d2, sweep) {
  for (const r of [s / 2 - w, s / 2 + w]) {
    const p1 = { x: cx + d1.x * r, y: cy + d1.y * r };
    const p2 = { x: cx + d2.x * r, y: cy + d2.y * r };
    sk.path(`M${f(p1.x)} ${f(p1.y)}A${f(r)} ${f(r)} 0 0 ${sweep} ${f(p2.x)} ${f(p2.y)}`);
  }
}

const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };
const S = { x: 0, y: 1 };
const N = { x: 0, y: -1 };

export default {
  id: 'celtic',
  name: 'Celtic Weave',
  blurb: 'Endless interlaced ribbons that thread over and under across the whole sheet.',
  tags: ['geometric', 'intricate', 'classic'],

  draw(sk, { rng, box, complexity }) {
    // The decorative frame sits *outside* the grid (ribbon ends terminate on
    // the grid edge), so room for it has to be reserved before the grid is
    // laid out — otherwise it would spill past the page border.
    const framed = rng.bool(0.6);
    const reserve = framed ? Math.min(box.w, box.h) * 0.07 : 0;
    const area = { x: box.x + reserve, y: box.y + reserve, w: box.w - reserve * 2, h: box.h - reserve * 2 };

    const cols = 2 + complexity + rng.int(0, 1);
    const s = area.w / cols;
    const rows = Math.max(2, Math.floor(area.h / s));
    const oy = area.y + (area.h - rows * s) / 2;
    const w = s * rng.range(0.13, 0.19);
    const crossChance = rng.range(0.15, 0.4);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = area.x + c * s;
        const y = oy + r * s;
        const mx = x + s / 2;
        const my = y + s / 2;

        if (rng.next() < crossChance) {
          // Straight ribbons crossing, one passing over the other.
          const vOver = rng.bool();
          const gap = w * 1.9;
          for (const o of [-w, w]) {
            if (vOver) {
              sk.line(x, my + o, mx - gap, my + o);
              sk.line(mx + gap, my + o, x + s, my + o);
              sk.line(mx + o, y, mx + o, y + s);
            } else {
              sk.line(x, my + o, x + s, my + o);
              sk.line(mx + o, y, mx + o, my - gap);
              sk.line(mx + o, my + gap, mx + o, y + s);
            }
          }
        } else if (rng.bool()) {
          elbow(sk, x, y, s, w, E, S, 1); // top-left corner
          elbow(sk, x + s, y + s, s, w, W, N, 1); // bottom-right corner
        } else {
          elbow(sk, x + s, y, s, w, W, S, 0); // top-right corner
          elbow(sk, x, y + s, s, w, E, N, 0); // bottom-left corner
        }
      }
    }

    // Round off every ribbon that runs into the edge of the grid. With the
    // tangent taken as (-dy, dx) the outward half-circle is always sweep 0.
    const gx = area.x;
    const gy = oy;
    const gw = cols * s;
    const gh = rows * s;
    const cap = (mx, my, dx, dy) => {
      const p1 = { x: mx - dy * w, y: my + dx * w };
      const p2 = { x: mx + dy * w, y: my - dx * w };
      sk.path(`M${f(p1.x)} ${f(p1.y)}A${f(w)} ${f(w)} 0 0 0 ${f(p2.x)} ${f(p2.y)}`);
    };
    for (let c = 0; c < cols; c++) {
      cap(gx + c * s + s / 2, gy, 0, -1);
      cap(gx + c * s + s / 2, gy + gh, 0, 1);
    }
    for (let r = 0; r < rows; r++) {
      cap(gx, gy + r * s + s / 2, -1, 0);
      cap(gx + gw, gy + r * s + s / 2, 1, 0);
    }

    if (framed) {
      // Clamped so the outer line always stays inside the reserved band.
      const m = Math.max(4, Math.min(w * rng.range(1.8, 3), reserve * 0.55));
      sk.rect(gx - m, gy - m, gw + m * 2, gh + m * 2, 0, sk.w(1.2));
      if (rng.bool(0.5)) sk.rect(gx - m * 1.6, gy - m * 1.6, gw + m * 3.2, gh + m * 3.2, 0, sk.w(0.85));
    }
  },
};
