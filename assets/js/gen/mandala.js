/*
 * Mandala — concentric bands of radially repeated motifs.
 *
 * The generator picks a symmetry order, slices the radius into bands, then
 * assigns each band a motif from the library below. Bands never repeat their
 * immediate neighbour, which is what keeps the result from looking mushy.
 */

import { TAU, f, polar, smooth, lerp } from '../core/util.js';
import { scallops, rosette, waveRing, radialCorners } from '../core/shapes.js';

const MOTIFS = {
  petal(sk, c, rIn, rOut, n, rng) {
    const step = TAU / n;
    const half = step * rng.range(0.34, 0.47);
    const inner = rng.bool(0.6);
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const base = polar(c.x, c.y, rIn, a);
      const tip = polar(c.x, c.y, rOut, a);
      const c1 = polar(c.x, c.y, lerp(rIn, rOut, 0.55), a - half);
      const c2 = polar(c.x, c.y, lerp(rIn, rOut, 0.55), a + half);
      sk.path(`M${f(base.x)} ${f(base.y)}Q${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)}Q${f(c2.x)} ${f(c2.y)} ${f(base.x)} ${f(base.y)}Z`);
      if (inner) {
        const t2 = polar(c.x, c.y, lerp(rIn, rOut, 0.7), a);
        const i1 = polar(c.x, c.y, lerp(rIn, rOut, 0.42), a - half * 0.55);
        const i2 = polar(c.x, c.y, lerp(rIn, rOut, 0.42), a + half * 0.55);
        sk.path(`M${f(base.x)} ${f(base.y)}Q${f(i1.x)} ${f(i1.y)} ${f(t2.x)} ${f(t2.y)}Q${f(i2.x)} ${f(i2.y)} ${f(base.x)} ${f(base.y)}Z`, sk.w(0.72));
      }
    }
  },

  lotus(sk, c, rIn, rOut, n, rng) {
    const step = TAU / n;
    const half = step * 0.5;
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const b1 = polar(c.x, c.y, rIn, a - half);
      const b2 = polar(c.x, c.y, rIn, a + half);
      const tip = polar(c.x, c.y, rOut, a);
      const c1 = polar(c.x, c.y, rOut * 0.92, a - half * 0.72);
      const c2 = polar(c.x, c.y, rOut * 0.92, a + half * 0.72);
      sk.path(`M${f(b1.x)} ${f(b1.y)}C${f(c1.x)} ${f(c1.y)} ${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)}C${f(c2.x)} ${f(c2.y)} ${f(c2.x)} ${f(c2.y)} ${f(b2.x)} ${f(b2.y)}`);
      if (rng.bool(0.5)) sk.line(polar(c.x, c.y, rIn, a).x, polar(c.x, c.y, rIn, a).y, polar(c.x, c.y, rOut * 0.8, a).x, polar(c.x, c.y, rOut * 0.8, a).y, sk.w(0.65));
    }
  },

  dots(sk, c, rIn, rOut, n, rng) {
    const rMid = (rIn + rOut) / 2;
    const maxR = Math.min((rOut - rIn) * 0.42, (TAU * rMid) / n / 2.4);
    const alt = rng.bool(0.45);
    for (let i = 0; i < n; i++) {
      const p = polar(c.x, c.y, rMid, (i / n) * TAU);
      const rr = alt && i % 2 ? maxR * 0.55 : maxR;
      sk.circle(p.x, p.y, rr);
      if (rr > 6 && rng.bool(0.5)) sk.circle(p.x, p.y, rr * 0.45, sk.w(0.7));
    }
  },

  scallop(sk, c, rIn, rOut, n, rng) {
    const sweep = rng.bool() ? 1 : 0;
    scallops(sk, c.x, c.y, sweep ? rIn : rOut, n, rng.range(0.62, 0.95), sweep);
    if (rng.bool(0.5)) scallops(sk, c.x, c.y, sweep ? rIn + (rOut - rIn) * 0.35 : rOut - (rOut - rIn) * 0.35, n, 0.7, sweep);
  },

  spike(sk, c, rIn, rOut, n) {
    const step = TAU / n;
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const b1 = polar(c.x, c.y, rIn, a - step * 0.45);
      const b2 = polar(c.x, c.y, rIn, a + step * 0.45);
      const tip = polar(c.x, c.y, rOut, a);
      sk.path(`M${f(b1.x)} ${f(b1.y)}L${f(tip.x)} ${f(tip.y)}L${f(b2.x)} ${f(b2.y)}Z`);
      const t2 = polar(c.x, c.y, lerp(rIn, rOut, 0.55), a);
      sk.path(`M${f(lerp(b1.x, b2.x, 0.28))} ${f(lerp(b1.y, b2.y, 0.28))}L${f(t2.x)} ${f(t2.y)}L${f(lerp(b1.x, b2.x, 0.72))} ${f(lerp(b1.y, b2.y, 0.72))}Z`, sk.w(0.7));
    }
  },

  diamond(sk, c, rIn, rOut, n) {
    const step = TAU / n;
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const pts = [
        polar(c.x, c.y, rIn, a),
        polar(c.x, c.y, (rIn + rOut) / 2, a - step * 0.42),
        polar(c.x, c.y, rOut, a),
        polar(c.x, c.y, (rIn + rOut) / 2, a + step * 0.42),
      ];
      sk.poly(pts);
      sk.poly(pts.map((p) => ({ x: lerp(p.x, c.x + (pts[0].x + pts[2].x) / 2 - c.x, 0.34), y: lerp(p.y, c.y + (pts[0].y + pts[2].y) / 2 - c.y, 0.34) })), true, sk.w(0.68));
    }
  },

  rays(sk, c, rIn, rOut, n, rng) {
    const step = TAU / n;
    const paired = rng.bool(0.45);
    for (let i = 0; i < n; i++) {
      const a = i * step;
      if (paired) {
        for (const s of [-1, 1]) {
          const p1 = polar(c.x, c.y, rIn, a + s * step * 0.16);
          const p2 = polar(c.x, c.y, rOut, a + s * step * 0.16);
          sk.line(p1.x, p1.y, p2.x, p2.y);
        }
      } else {
        const p1 = polar(c.x, c.y, rIn, a);
        const p2 = polar(c.x, c.y, rOut, a);
        sk.line(p1.x, p1.y, p2.x, p2.y);
      }
    }
  },

  crescent(sk, c, rIn, rOut, n, rng) {
    const step = TAU / n;
    const half = step * 0.46;
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const p1 = polar(c.x, c.y, rIn, a - half);
      const p2 = polar(c.x, c.y, rIn, a + half);
      const outR = Math.hypot(p2.x - p1.x, p2.y - p1.y) * rng.range(0.6, 0.85);
      const inR = outR * 1.5;
      sk.path(
        `M${f(p1.x)} ${f(p1.y)}A${f(outR)} ${f(outR)} 0 0 1 ${f(p2.x)} ${f(p2.y)}A${f(inR)} ${f(inR)} 0 0 0 ${f(p1.x)} ${f(p1.y)}Z`,
      );
    }
  },

  weave(sk, c, rIn, rOut, n, rng) {
    const rMid = (rIn + rOut) / 2;
    const amp = (rOut - rIn) * 0.42;
    waveRing(sk, c.x, c.y, rMid, n, amp, 0);
    waveRing(sk, c.x, c.y, rMid, n, -amp, 0);
    if (rng.bool(0.5)) {
      for (let i = 0; i < n; i++) {
        const p = polar(c.x, c.y, rMid, ((i + 0.5) / n) * TAU);
        sk.circle(p.x, p.y, Math.min(amp * 0.34, 7), sk.w(0.7));
      }
    }
  },

  fan(sk, c, rIn, rOut, n, rng) {
    const step = TAU / n;
    const ribs = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const p1 = polar(c.x, c.y, rIn, a - step * 0.5);
      const p2 = polar(c.x, c.y, rIn, a + step * 0.5);
      sk.line(p1.x, p1.y, polar(c.x, c.y, rOut, a - step * 0.5).x, polar(c.x, c.y, rOut, a - step * 0.5).y, sk.w(0.85));
      for (let k = 1; k <= ribs; k++) {
        const t = k / (ribs + 1);
        const q1 = polar(c.x, c.y, rIn, a - step * 0.5);
        const q2 = polar(c.x, c.y, rOut, lerp(a - step * 0.5, a + step * 0.5, t));
        sk.path(`M${f(q1.x)} ${f(q1.y)}Q${f(lerp(q1.x, q2.x, 0.5) + (c.x - lerp(q1.x, q2.x, 0.5)) * 0.06)} ${f(lerp(q1.y, q2.y, 0.5) + (c.y - lerp(q1.y, q2.y, 0.5)) * 0.06)} ${f(q2.x)} ${f(q2.y)}`, sk.w(0.7));
      }
      sk.path(`M${f(p2.x)} ${f(p2.y)}A${f(rIn)} ${f(rIn)} 0 0 0 ${f(p1.x)} ${f(p1.y)}`, sk.w(0.7));
    }
  },

  pearls(sk, c, rIn, rOut, n) {
    const rMid = (rIn + rOut) / 2;
    const rr = Math.min((rOut - rIn) * 0.46, (TAU * rMid) / n / 2);
    for (let i = 0; i < n; i++) {
      const p = polar(c.x, c.y, rMid, (i / n) * TAU);
      sk.circle(p.x, p.y, rr);
      const q = polar(c.x, c.y, rMid, ((i + 0.5) / n) * TAU);
      sk.circle(q.x, q.y, rr * 0.3, sk.w(0.7));
    }
  },

  vine(sk, c, rIn, rOut, n, rng) {
    const rMid = (rIn + rOut) / 2;
    const amp = (rOut - rIn) * 0.38;
    waveRing(sk, c.x, c.y, rMid, n, amp, 0, 1);
    const step = TAU / n;
    for (let i = 0; i < n; i++) {
      const a = i * step + step * 0.25;
      const base = polar(c.x, c.y, rMid + amp * Math.sin(n * a), a);
      const tip = polar(c.x, c.y, rOut, a);
      const l1 = polar(c.x, c.y, (rMid + rOut) / 2, a - step * 0.28);
      const l2 = polar(c.x, c.y, (rMid + rOut) / 2, a + step * 0.28);
      sk.path(`M${f(base.x)} ${f(base.y)}Q${f(l1.x)} ${f(l1.y)} ${f(tip.x)} ${f(tip.y)}Q${f(l2.x)} ${f(l2.y)} ${f(base.x)} ${f(base.y)}Z`, sk.w(0.8));
    }
    void rng;
  },
};

const NAMES = Object.keys(MOTIFS);

function separator(sk, c, r, rng) {
  const kind = rng.next();
  sk.circle(c.x, c.y, r);
  if (kind < 0.3) {
    sk.circle(c.x, c.y, r - Math.max(4, r * 0.03), sk.w(0.7));
  } else if (kind < 0.45) {
    const n = Math.max(24, Math.round(r / 7));
    for (let i = 0; i < n; i++) {
      const p = polar(c.x, c.y, r - 6, (i / n) * TAU);
      sk.circle(p.x, p.y, 1.9, sk.w(0.6));
    }
  }
}

export default {
  id: 'mandala',
  name: 'Mandala',
  blurb: 'Concentric symmetry — petals, scallops and beadwork radiating from a still centre.',
  tags: ['symmetry', 'meditative', 'classic'],

  draw(sk, { rng, box, complexity }) {
    const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const R = Math.min(box.w, box.h) / 2;
    const bands = 3 + complexity + rng.int(0, 1);
    const symmetry = rng.pick([8, 10, 12, 12, 16, 16, 18, 20, 24]);

    // Band edges, slightly uneven so the rings breathe.
    const edges = [R * rng.range(0.1, 0.16)];
    let remaining = R - edges[0];
    const weights = Array.from({ length: bands }, () => rng.range(0.6, 1.5));
    const total = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < bands; i++) {
      edges.push(edges[edges.length - 1] + (weights[i] / total) * remaining);
    }

    let prev = null;
    for (let i = 0; i < bands; i++) {
      const rIn = edges[i];
      const rOut = edges[i + 1];
      let name = rng.pick(NAMES);
      let guard = 0;
      while (name === prev && guard++ < 6) name = rng.pick(NAMES);
      prev = name;

      // Denser motifs get more repeats as the radius grows.
      const scale = rIn / R;
      let n = symmetry;
      if (scale > 0.45 && rng.bool(0.55)) n = symmetry * 2;
      if (scale < 0.3 && symmetry > 12 && rng.bool(0.4)) n = Math.round(symmetry / 2);

      MOTIFS[name](sk, c, rIn, rOut, n, rng);
      if (i < bands - 1 && rng.bool(0.8)) separator(sk, c, rOut, rng);
    }

    sk.circle(c.x, c.y, R, sk.w(1.25));
    if (rng.bool(0.6)) sk.circle(c.x, c.y, R + Math.max(6, R * 0.028), sk.w(0.9));

    rosette(sk, c.x, c.y, edges[0] * rng.range(0.85, 1), rng);
    radialCorners(sk, box, R, rng);
    void smooth;
  },
};
