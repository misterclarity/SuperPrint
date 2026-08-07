/*
 * Folk Weave — counted-thread geometry.
 *
 * Woven and embroidered textiles the world over share a grammar, because they
 * share a constraint: thread counted onto a grid gives you straight lines,
 * mirror symmetry, stepped diagonals and banded repetition. Kilim and Anatolian
 * flatweave, Andean pallay, Nordic selbu knitting, Ukrainian and Romanian
 * cross-stitch, Japanese sashiko and West African strip cloth all build from
 * that same vocabulary — eight-point stars, stepped diamonds, hooks, combs and
 * guard borders framing a banded field.
 *
 * This generator works in that grammar rather than copying any one tradition's
 * patterns: motifs are composed on a lattice, mirrored, and stacked into bands
 * between narrow guard stripes.
 */

import { TAU, polar, lerp } from '../core/util.js';

/* ----------------------------------------------------------- primitives -- */

function diamond(sk, cx, cy, rx, ry, weight = 1) {
  sk.poly([
    { x: cx, y: cy - ry },
    { x: cx + rx, y: cy },
    { x: cx, y: cy + ry },
    { x: cx - rx, y: cy },
  ], true, sk.w(weight));
}

/** Staircase from the top vertex to the right vertex of a stepped diamond. */
function quadrantSteps(rx, ry, steps) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const y = -ry + (ry * i) / steps;
    pts.push({ x: (rx * i) / steps, y });
    pts.push({ x: (rx * (i + 1)) / steps, y });
  }
  pts.push({ x: rx, y: 0 });
  return pts;
}

/** Stepped (staircase-edged) diamond — the backbone of counted-thread motifs. */
function steppedDiamond(sk, cx, cy, rx, ry, steps, weight = 1) {
  const q = quadrantSteps(rx, ry, steps);
  const out = [];
  const add = (p) => {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p);
  };
  for (const p of q) add({ x: cx + p.x, y: cy + p.y });
  for (let i = q.length - 1; i >= 0; i--) add({ x: cx + q[i].x, y: cy - q[i].y });
  for (const p of q) add({ x: cx - p.x, y: cy - p.y });
  for (let i = q.length - 1; i >= 0; i--) add({ x: cx - q[i].x, y: cy + q[i].y });
  sk.poly(out, true, sk.w(weight));
}

function cornerFillers(sk, x, y, w, h, rng) {
  const s = Math.min(w, h) * rng.range(0.16, 0.24);
  for (const [px, py, sx, sy] of [
    [x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1],
  ]) {
    sk.poly([{ x: px, y: py }, { x: px + sx * s, y: py }, { x: px, y: py + sy * s }], true, sk.w(0.85));
  }
}

/* --------------------------------------------------------- band motifs --- */

const MAJOR = {
  star8(sk, x, y, w, h, rng) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w * 0.46;
    const ry = h * 0.46;
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU - Math.PI / 2;
      const k = i % 2 ? 0.42 : 1;
      pts.push({ x: cx + rx * k * Math.cos(a), y: cy + ry * k * Math.sin(a) });
    }
    sk.poly(pts, true);
    if (rng.bool(0.6)) sk.poly(pts.map((p) => ({ x: lerp(cx, p.x, 0.5), y: lerp(cy, p.y, 0.5) })), true, sk.w(0.8));
    else diamond(sk, cx, cy, rx * 0.28, ry * 0.28, 0.8);
  },

  hookedDiamond(sk, x, y, w, h, rng) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    diamond(sk, cx, cy, w * 0.42, h * 0.42);
    diamond(sk, cx, cy, w * 0.27, h * 0.27, 0.8);
    diamond(sk, cx, cy, w * 0.11, h * 0.11, 0.75);
    cornerFillers(sk, x, y, w, h, rng);
  },

  steppedCross(sk, x, y, w, h, rng) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const steps = rng.int(3, 4);
    steppedDiamond(sk, cx, cy, w * 0.46, h * 0.46, steps);
    steppedDiamond(sk, cx, cy, w * 0.24, h * 0.24, 2, 0.8);
  },

  lozengeStack(sk, x, y, w, h, rng) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const layers = rng.int(3, 4);
    for (let i = 0; i < layers; i++) {
      const k = 1 - i / layers;
      diamond(sk, cx, cy, w * 0.46 * k, h * 0.46 * k, i ? 0.8 : 1);
    }
    for (let i = 0; i < 4; i++) {
      const p = polar(cx, cy, Math.min(w, h) * 0.38, (i / 4) * TAU + Math.PI / 4);
      sk.circle(p.x, p.y, Math.min(w, h) * 0.035, sk.w(0.7));
    }
  },

  comb(sk, x, y, w, h, rng) {
    const teeth = rng.int(4, 6);
    const flip = rng.bool();
    const tw = (w * 0.86) / teeth;
    const x0 = x + w * 0.07;
    const base = flip ? y + h * 0.9 : y + h * 0.1;
    const bodyY = flip ? y + h * 0.62 : y + h * 0.38;
    const tipY = flip ? y + h * 0.12 : y + h * 0.88;

    const pts = [{ x: x0, y: base }, { x: x0, y: bodyY }];
    for (let i = 0; i < teeth; i++) {
      const a = x0 + i * tw + tw * 0.25;
      const b = x0 + i * tw + tw * 0.75;
      pts.push({ x: a, y: bodyY }, { x: a, y: tipY }, { x: b, y: tipY }, { x: b, y: bodyY });
    }
    pts.push({ x: x0 + w * 0.86, y: bodyY }, { x: x0 + w * 0.86, y: base });
    sk.poly(pts, true);
  },

  rosetteCross(sk, x, y, w, h, rng) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w * 0.16;
    const ry = h * 0.16;
    for (let i = 0; i < 4; i++) {
      const p = polar(cx, cy, Math.min(w, h) * 0.3, (i / 4) * TAU);
      diamond(sk, p.x, p.y, rx, ry);
    }
    diamond(sk, cx, cy, rx * 0.9, ry * 0.9);
    if (rng.bool(0.6)) {
      for (let i = 0; i < 4; i++) {
        const p = polar(cx, cy, Math.min(w, h) * 0.36, (i / 4) * TAU + Math.PI / 4);
        sk.circle(p.x, p.y, Math.min(w, h) * 0.045, sk.w(0.75));
      }
    }
  },

  stepPyramid(sk, x, y, w, h, rng) {
    const steps = rng.int(3, 5);
    const cx = x + w / 2;
    const top = y + h * 0.08;
    const bottom = y + h * 0.92;
    const half = w * 0.44;
    const q = quadrantSteps(half, bottom - top, steps);
    const pts = [{ x: cx - half, y: bottom }];
    for (let i = q.length - 1; i >= 0; i--) pts.push({ x: cx - q[i].x, y: bottom + q[i].y });
    for (const p of q) pts.push({ x: cx + p.x, y: bottom + p.y });
    sk.poly(pts, true);
    if (rng.bool(0.55)) diamond(sk, cx, bottom - (bottom - top) * 0.3, w * 0.12, h * 0.12, 0.8);
  },

  octEye(sk, x, y, w, h, rng) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      pts.push({ x: cx + w * 0.45 * Math.cos(a), y: cy + h * 0.45 * Math.sin(a) });
    }
    sk.poly(pts, true);
    diamond(sk, cx, cy, w * 0.26, h * 0.26, 0.85);
    if (rng.bool(0.5)) diamond(sk, cx, cy, w * 0.1, h * 0.1, 0.7);
  },
};

const MINOR = {
  sawtooth(sk, x, y, w, h, rng) {
    const n = Math.max(6, Math.round(w / (h * 1.1)));
    const tw = w / n;
    for (let i = 0; i < n; i++) {
      const up = i % 2 === 0;
      const x0 = x + i * tw;
      sk.poly(up
        ? [{ x: x0, y: y + h }, { x: x0 + tw / 2, y }, { x: x0 + tw, y: y + h }]
        : [{ x: x0, y }, { x: x0 + tw / 2, y: y + h }, { x: x0 + tw, y }], true, sk.w(0.9));
    }
    void rng;
  },

  diamondChain(sk, x, y, w, h, rng) {
    const n = Math.max(5, Math.round(w / h));
    const dw = w / n;
    for (let i = 0; i < n; i++) {
      diamond(sk, x + dw * (i + 0.5), y + h / 2, dw * 0.5, h * 0.46, 0.9);
      if (h > 14 && rng.bool(0.5)) diamond(sk, x + dw * (i + 0.5), y + h / 2, dw * 0.2, h * 0.18, 0.7);
    }
  },

  ladder(sk, x, y, w, h, rng) {
    sk.line(x, y, x + w, y, sk.w(0.9));
    sk.line(x, y + h, x + w, y + h, sk.w(0.9));
    const n = Math.max(8, Math.round(w / (h * 0.85)));
    for (let i = 1; i < n; i++) {
      const px = x + (w * i) / n;
      sk.line(px, y, px, y + h, sk.w(0.75));
    }
    void rng;
  },

  squares(sk, x, y, w, h, rng) {
    const n = Math.max(6, Math.round(w / (h * 1.25)));
    const cw = w / n;
    const s = Math.min(cw * 0.6, h * 0.8);
    for (let i = 0; i < n; i++) {
      const cx = x + cw * (i + 0.5);
      const cy = y + h / 2;
      sk.rect(cx - s / 2, cy - s / 2, s, s, 0, sk.w(0.9));
      if (s > 12 && rng.bool(0.5)) sk.circle(cx, cy, s * 0.2, sk.w(0.7));
    }
  },

  chevrons(sk, x, y, w, h, rng) {
    const n = Math.max(6, Math.round(w / (h * 0.9)));
    const cw = w / n;
    const dir = rng.sign();
    for (let i = 0; i < n; i++) {
      const x0 = x + cw * i;
      for (const off of [0, cw * 0.35]) {
        sk.poly([
          { x: x0 + off, y: dir > 0 ? y : y + h },
          { x: x0 + off + cw * 0.5, y: dir > 0 ? y + h : y },
          { x: x0 + off + cw, y: dir > 0 ? y : y + h },
        ], false, sk.w(off ? 0.7 : 0.9));
      }
    }
  },

  hookRun(sk, x, y, w, h, rng) {
    const uw = h * 1.9;
    const n = Math.max(3, Math.floor(w / uw));
    const step = w / n;
    sk.line(x, y + h, x + w, y + h, sk.w(0.9));
    for (let i = 0; i < n; i++) {
      const px = x + step * i;
      sk.poly([
        { x: px + step * 0.08, y: y + h },
        { x: px + step * 0.08, y: y + h * 0.2 },
        { x: px + step * 0.78, y: y + h * 0.2 },
        { x: px + step * 0.78, y: y + h * 0.62 },
        { x: px + step * 0.38, y: y + h * 0.62 },
        { x: px + step * 0.38, y: y + h * 0.42 },
      ], false, sk.w(0.85));
    }
    void rng;
  },

  dottedRule(sk, x, y, w, h, rng) {
    sk.line(x, y, x + w, y, sk.w(0.9));
    sk.line(x, y + h, x + w, y + h, sk.w(0.9));
    const n = Math.max(10, Math.round(w / (h * 1.1)));
    for (let i = 0; i < n; i++) {
      const cx = x + (w * (i + 0.5)) / n;
      sk.circle(cx, y + h / 2, Math.min(h * 0.3, w / n / 3), sk.w(0.75));
    }
    void rng;
  },
};

const MAJOR_NAMES = Object.keys(MAJOR);
const MINOR_NAMES = Object.keys(MINOR);

/* ------------------------------------------------------------- border --- */

function guardBorder(sk, box, bw, rng) {
  sk.rect(box.x, box.y, box.w, box.h, 0, sk.w(1.3));
  sk.rect(box.x + bw, box.y + bw, box.w - bw * 2, box.h - bw * 2, 0, sk.w(1.1));

  const mid = bw / 2;
  const corners = [
    [box.x + mid, box.y + mid],
    [box.x + box.w - mid, box.y + mid],
    [box.x + box.w - mid, box.y + box.h - mid],
    [box.x + mid, box.y + box.h - mid],
  ];
  for (const [cx, cy] of corners) {
    sk.rect(cx - mid * 0.5, cy - mid * 0.5, mid, mid, 0, sk.w(0.9));
    if (rng.bool(0.5)) diamond(sk, cx, cy, mid * 0.26, mid * 0.26, 0.75);
  }

  const runW = box.w - bw * 2;
  const nH = Math.max(2, Math.round(runW / (bw * 0.95)));
  const stepH = runW / nH;
  for (let i = 0; i < nH; i++) {
    const px = box.x + bw + stepH * (i + 0.5);
    diamond(sk, px, box.y + mid, stepH * 0.4, mid * 0.6, 0.9);
    diamond(sk, px, box.y + box.h - mid, stepH * 0.4, mid * 0.6, 0.9);
  }

  const runH = box.h - bw * 2;
  const nV = Math.max(2, Math.round(runH / (bw * 0.95)));
  const stepV = runH / nV;
  for (let i = 0; i < nV; i++) {
    const py = box.y + bw + stepV * (i + 0.5);
    diamond(sk, box.x + mid, py, mid * 0.6, stepV * 0.4, 0.9);
    diamond(sk, box.x + box.w - mid, py, mid * 0.6, stepV * 0.4, 0.9);
  }
}

export default {
  id: 'folkweave',
  name: 'Folk Weave',
  blurb: 'Counted-thread geometry from the world’s weaving and embroidery traditions — stars, stepped diamonds and guard borders.',
  tags: ['folk', 'geometric', 'structured'],

  draw(sk, { rng, box, complexity }) {
    // Reserve the guard border first so the field never collides with it.
    const framed = rng.bool(0.72);
    const bw = framed ? Math.min(box.w, box.h) * rng.range(0.055, 0.075) : 0;
    if (framed) guardBorder(sk, box, bw, rng);

    const pad = framed ? bw * 1.35 : 0;
    const field = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };

    const cols = 2 + complexity + rng.int(0, 1);
    const cellW = field.w / cols;
    const ratio = rng.range(0.26, 0.42); // guard stripe height, relative to a motif band

    // Solve for a band height that tiles the field exactly:
    //   rows * u + (rows + 1) * (u * ratio) = field.h
    const rows = Math.max(2, Math.round(field.h / (cellW * (1 + ratio))));
    const u = field.h / (rows + (rows + 1) * ratio);
    const minorH = u * ratio;

    // A small palette per page, so the sheet reads as one cloth.
    const majors = rng.sample(MAJOR_NAMES, rng.int(2, 3));
    const minors = rng.sample(MINOR_NAMES, rng.int(2, 3));

    let y = field.y;
    for (let r = 0; r <= rows; r++) {
      // Guard stripe.
      const minor = minors[r % minors.length];
      MINOR[minor](sk, field.x, y + minorH * 0.15, field.w, minorH * 0.7, rng);
      y += minorH;
      if (r === rows) break;

      // Motif band. Alternating two motifs across a row is a common device;
      // most bands stay with a single motif.
      const primary = majors[r % majors.length];
      const alternate = rng.bool(0.3) ? rng.pick(majors) : null;
      for (let c = 0; c < cols; c++) {
        const name = alternate && c % 2 ? alternate : primary;
        MAJOR[name](sk, field.x + c * cellW, y, cellW, u, rng);
      }
      y += u;
    }
  },
};
