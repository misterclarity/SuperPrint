/*
 * Geometric — a tile grid where each cell draws one motif from a small set,
 * rotated in 90° steps. Tiles are chosen from a per-page palette of 3-4 motifs
 * so the sheet feels composed rather than random.
 */

import { TAU, f, polar, lerp } from '../core/util.js';

const TILES = {
  quarterArcs(sk, s) {
    sk.path(`M${f(s / 2)} 0A${f(s / 2)} ${f(s / 2)} 0 0 1 0 ${f(s / 2)}`);
    sk.path(`M${f(s)} ${f(s / 2)}A${f(s / 2)} ${f(s / 2)} 0 0 1 ${f(s / 2)} ${f(s)}`);
    sk.path(`M${f(s * 0.25)} 0A${f(s * 0.25)} ${f(s * 0.25)} 0 0 1 0 ${f(s * 0.25)}`, sk.w(0.75));
    sk.path(`M${f(s)} ${f(s * 0.75)}A${f(s * 0.25)} ${f(s * 0.25)} 0 0 1 ${f(s * 0.75)} ${f(s)}`, sk.w(0.75));
  },

  concentricSquares(sk, s) {
    for (let i = 1; i <= 4; i++) {
      const k = (i / 5) * 0.5;
      sk.rect(s * k, s * k, s * (1 - 2 * k), s * (1 - 2 * k), 0, sk.w(i === 1 ? 1 : 0.8));
    }
  },

  eye(sk, s) {
    sk.circle(s / 2, s / 2, s * 0.42);
    sk.circle(s / 2, s / 2, s * 0.26, sk.w(0.8));
    sk.circle(s / 2, s / 2, s * 0.1, sk.w(0.8));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const p1 = polar(s / 2, s / 2, s * 0.42, a);
      const p2 = polar(s / 2, s / 2, s * 0.71, a);
      sk.line(p1.x, p1.y, p2.x, p2.y, sk.w(0.8));
    }
  },

  petals4(sk, s) {
    const c = s / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      const tip = polar(c, c, s * 0.46, a);
      const c1 = polar(c, c, s * 0.4, a - 0.7);
      const c2 = polar(c, c, s * 0.4, a + 0.7);
      sk.path(`M${f(c)} ${f(c)}Q${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)}Q${f(c2.x)} ${f(c2.y)} ${f(c)} ${f(c)}Z`);
    }
    sk.circle(c, c, s * 0.09, sk.w(0.8));
  },

  fanCorner(sk, s) {
    for (let i = 1; i <= 5; i++) {
      const r = (s * i) / 5;
      sk.path(`M${f(r)} 0A${f(r)} ${f(r)} 0 0 1 0 ${f(r)}`, sk.w(i % 2 ? 1 : 0.75));
    }
  },

  chevron(sk, s) {
    for (let i = 0; i <= 4; i++) {
      const y = (s * i) / 4;
      sk.path(`M0 ${f(y)}L${f(s / 2)} ${f(y - s * 0.18)}L${f(s)} ${f(y)}`, sk.w(i % 2 ? 0.8 : 1));
    }
  },

  diamondGrid(sk, s) {
    sk.poly([
      { x: s / 2, y: 0 },
      { x: s, y: s / 2 },
      { x: s / 2, y: s },
      { x: 0, y: s / 2 },
    ]);
    sk.poly([
      { x: s / 2, y: s * 0.24 },
      { x: s * 0.76, y: s / 2 },
      { x: s / 2, y: s * 0.76 },
      { x: s * 0.24, y: s / 2 },
    ], true, sk.w(0.8));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const p = polar(s / 2, s / 2, s * 0.36, a);
      sk.circle(p.x, p.y, s * 0.055, sk.w(0.7));
    }
  },

  hatch(sk, s) {
    const n = 7;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      sk.line(0, s * t, s * t, 0, sk.w(0.8));
      sk.line(s, s * t, s * t, s, sk.w(0.8));
    }
  },

  stack(sk, s) {
    for (let i = 0; i < 4; i++) {
      const y = s * (0.12 + i * 0.25);
      sk.rect(s * 0.1, y, s * 0.8, s * 0.16, s * 0.06, sk.w(i % 2 ? 0.8 : 1));
    }
  },

  spokes(sk, s) {
    const c = s / 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const p1 = polar(c, c, s * 0.14, a);
      const p2 = polar(c, c, s * 0.47, a);
      sk.line(p1.x, p1.y, p2.x, p2.y);
    }
    sk.circle(c, c, s * 0.14);
    sk.circle(c, c, s * 0.47, sk.w(0.8));
  },

  steps(sk, s) {
    const n = 5;
    const pts = [{ x: 0, y: s }];
    for (let i = 0; i < n; i++) {
      pts.push({ x: (s * i) / n, y: s - (s * i) / n });
      pts.push({ x: (s * (i + 1)) / n, y: s - (s * i) / n });
    }
    pts.push({ x: s, y: 0 });
    sk.poly(pts, false);
    sk.poly(pts.map((p) => ({ x: p.x + s * 0.14, y: p.y + s * 0.14 })), false, sk.w(0.8));
  },

  scale(sk, s) {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const x = (s / 2) * i;
        const y = (s / 2) * j;
        sk.path(`M${f(x)} ${f(y + s / 2)}A${f(s / 4)} ${f(s / 4)} 0 0 1 ${f(x + s / 2)} ${f(y + s / 2)}`);
      }
    }
    sk.path(`M0 ${f(s / 4)}A${f(s / 4)} ${f(s / 4)} 0 0 1 ${f(s / 2)} ${f(s / 4)}`, sk.w(0.8));
    sk.path(`M${f(s / 2)} ${f(s / 4)}A${f(s / 4)} ${f(s / 4)} 0 0 1 ${f(s)} ${f(s / 4)}`, sk.w(0.8));
  },
};

const NAMES = Object.keys(TILES);

export default {
  id: 'geometric',
  name: 'Geometric Tiles',
  blurb: 'A tessellated grid of rotating motifs — crisp edges, satisfying repetition.',
  tags: ['geometric', 'structured', 'bold'],

  draw(sk, { rng, box, complexity }) {
    const cols = 2 + complexity + rng.int(0, 1);
    const rows = Math.max(2, Math.round(box.h / (box.w / cols)));
    // Rounding the row count up can make the grid taller than the box, so the
    // cell size is taken from whichever axis binds first.
    const s = Math.min(box.w / cols, box.h / rows);
    const ox = box.x + (box.w - cols * s) / 2;
    const oy = box.y + (box.h - rows * s) / 2;

    const palette = rng.sample(NAMES, Math.min(NAMES.length, rng.int(3, 4)));
    // Bias toward one dominant tile so the page has a "ground".
    const weighted = [...palette, palette[0], palette[0], palette[1]];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const name = rng.pick(weighted);
        const rot = rng.int(0, 3) * 90;
        const x = ox + c * s;
        const y = oy + r * s;
        sk.open(`translate(${f(x + s / 2)} ${f(y + s / 2)}) rotate(${rot}) translate(${f(-s / 2)} ${f(-s / 2)})`);
        TILES[name](sk, s);
        sk.close();
      }
    }

    // Grid lines, sometimes.
    if (rng.bool(0.45)) {
      for (let r = 0; r <= rows; r++) sk.line(ox, oy + r * s, ox + cols * s, oy + r * s, sk.w(0.85));
      for (let c = 0; c <= cols; c++) sk.line(ox + c * s, oy, ox + c * s, oy + rows * s, sk.w(0.85));
    } else {
      sk.rect(ox, oy, cols * s, rows * s, 0, sk.w(1.2));
    }
    void lerp;
  },
};
