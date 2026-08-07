/*
 * Contour Map — a smooth scalar field built from a handful of random peaks and
 * basins, sliced at evenly spaced levels with marching squares. The resulting
 * nested closed curves read like a topographic map: long meditative lines and
 * clearly bounded regions.
 */

import { poly } from '../core/util.js';

function buildField(rng, cols, rows, complexity) {
  const sites = [];
  const count = 3 + complexity + rng.int(0, 2);
  for (let i = 0; i < count; i++) {
    sites.push({
      x: rng.range(-0.15, 1.15),
      y: rng.range(-0.15, 1.15),
      amp: rng.range(0.5, 1) * rng.sign(),
      sigma: rng.range(0.13, 0.42),
    });
  }
  // Gentle global tilt stops the peaks from looking like isolated islands.
  const tiltX = rng.range(-0.35, 0.35);
  const tiltY = rng.range(-0.35, 0.35);

  const grid = new Float32Array((cols + 1) * (rows + 1));
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const v = r / rows;
      let sum = u * tiltX + v * tiltY;
      for (const s of sites) {
        const dx = u - s.x;
        const dy = v - s.y;
        sum += s.amp * Math.exp(-(dx * dx + dy * dy) / (2 * s.sigma * s.sigma));
      }
      grid[r * (cols + 1) + c] = sum;
    }
  }
  return { grid };
}

function marchingSquares(grid, cols, rows, level, box) {
  const segs = [];
  const at = (c, r) => grid[r * (cols + 1) + c];
  const px = (c) => box.x + (c / cols) * box.w;
  const py = (r) => box.y + (r / rows) * box.h;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v0 = at(c, r); // top-left
      const v1 = at(c + 1, r); // top-right
      const v2 = at(c + 1, r + 1); // bottom-right
      const v3 = at(c, r + 1); // bottom-left
      let idx = 0;
      if (v0 > level) idx |= 8;
      if (v1 > level) idx |= 4;
      if (v2 > level) idx |= 2;
      if (v3 > level) idx |= 1;
      if (idx === 0 || idx === 15) continue;

      const t = (a, b) => (level - a) / (b - a || 1e-9);
      const top = () => ({ x: px(c) + t(v0, v1) * (px(c + 1) - px(c)), y: py(r) });
      const right = () => ({ x: px(c + 1), y: py(r) + t(v1, v2) * (py(r + 1) - py(r)) });
      const bottom = () => ({ x: px(c) + t(v3, v2) * (px(c + 1) - px(c)), y: py(r + 1) });
      const left = () => ({ x: px(c), y: py(r) + t(v0, v3) * (py(r + 1) - py(r)) });

      switch (idx) {
        case 1: case 14: segs.push({ a: left(), b: bottom() }); break;
        case 2: case 13: segs.push({ a: bottom(), b: right() }); break;
        case 3: case 12: segs.push({ a: left(), b: right() }); break;
        case 4: case 11: segs.push({ a: top(), b: right() }); break;
        case 6: case 9: segs.push({ a: top(), b: bottom() }); break;
        case 7: case 8: segs.push({ a: left(), b: top() }); break;
        case 5: segs.push({ a: left(), b: top() }); segs.push({ a: bottom(), b: right() }); break;
        case 10: segs.push({ a: top(), b: right() }); segs.push({ a: left(), b: bottom() }); break;
        default: break;
      }
    }
  }
  return segs;
}

/** Stitch loose segments into polylines so the SVG stays compact. */
function chain(segs) {
  const K = (p) => `${Math.round(p.x * 8)}_${Math.round(p.y * 8)}`;
  const map = new Map();
  segs.forEach((s, i) => {
    for (const k of [K(s.a), K(s.b)]) {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    }
  });

  const used = new Uint8Array(segs.length);
  const paths = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    let pts = [segs[i].a, segs[i].b];
    for (let pass = 0; pass < 2; pass++) {
      for (;;) {
        const end = pts[pts.length - 1];
        const cands = map.get(K(end)) || [];
        let found = -1;
        for (const j of cands) {
          if (!used[j]) { found = j; break; }
        }
        if (found < 0) break;
        used[found] = 1;
        const s = segs[found];
        pts.push(K(s.a) === K(end) ? s.b : s.a);
      }
      pts.reverse();
    }
    if (pts.length > 2) paths.push(pts);
  }
  return paths;
}

export default {
  id: 'contours',
  name: 'Contour Map',
  blurb: 'Topographic ripples of nested lines — long, calm curves and clear regions.',
  tags: ['abstract', 'meditative', 'modern'],

  draw(sk, { rng, box, complexity }) {
    const cols = 100;
    const rows = Math.round(cols * (box.h / box.w));
    const { grid } = buildField(rng, cols, rows, complexity);

    const levels = 7 + complexity * 3 + rng.int(0, 3);
    const emphasis = rng.int(3, 5); // every Nth line drawn heavier

    // Levels are taken at quantiles of the field rather than at even heights.
    // Even heights bunch every line around the steep slopes and leave the
    // plateaus bare; quantiles spread the lines evenly across the sheet.
    const sorted = Float32Array.from(grid).sort();

    for (let i = 1; i <= levels; i++) {
      const level = sorted[Math.floor((sorted.length * i) / (levels + 1))];
      const segs = marchingSquares(grid, cols, rows, level, box);
      const weight = i % emphasis === 0 ? 1.15 : 0.8;
      for (const pts of chain(segs)) {
        sk.path(poly(pts, false), sk.w(weight));
      }
    }

    sk.rect(box.x, box.y, box.w, box.h, 0, sk.w(1.3));
  },
};
