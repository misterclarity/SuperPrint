/*
 * Pattern Bands — the page split into horizontal strips, each filled with a
 * different repeating texture. Low commitment and very forgiving: you can
 * colour one band at a time and stop whenever you like.
 */

import { TAU, f, polar, smooth, lerp } from '../core/util.js';
import { leaf, spiral, teardrop } from '../core/shapes.js';

const STRIPS = {
  waves(sk, x, y, w, h, rng) {
    const lines = Math.max(2, Math.round(h / (h * 0.22)));
    const period = w / rng.int(3, 7);
    const amp = (h / lines) * rng.range(0.45, 0.8);
    // Baselines are inset by the amplitude so the crests stay inside the band.
    const top = y + amp;
    const span = Math.max(0, h - amp * 2);
    for (let i = 0; i <= lines; i++) {
      const base = top + (span * i) / lines;
      const pts = [];
      for (let k = 0; k <= 60; k++) {
        const px = x + (w * k) / 60;
        pts.push({ x: px, y: base + Math.sin((px / period) * TAU) * amp });
      }
      sk.path(smooth(pts), sk.w(i % 2 ? 0.8 : 1));
    }
  },

  scales(sk, x, y, w, h, rng) {
    const rows = rng.int(2, 4);
    const rh = h / rows;
    const cols = Math.max(3, Math.round(w / (rh * 1.6)));
    const cw = w / cols;
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 ? cw / 2 : 0;
      for (let c = -1; c <= cols; c++) {
        const cx = x + c * cw + offset + cw / 2;
        const cy = y + (r + 1) * rh;
        const rr = cw / 2;
        const p1 = { x: Math.max(x, cx - rr), y: cy };
        const p2 = { x: Math.min(x + w, cx + rr), y: cy };
        if (p2.x - p1.x < 1) continue;
        sk.path(`M${f(p1.x)} ${f(p1.y)}A${f(rr)} ${f(rr)} 0 0 1 ${f(p2.x)} ${f(p2.y)}`);
        if (rr > 8) sk.path(`M${f(lerp(p1.x, p2.x, 0.22))} ${f(cy)}A${f(rr * 0.56)} ${f(rr * 0.56)} 0 0 1 ${f(lerp(p1.x, p2.x, 0.78))} ${f(cy)}`, sk.w(0.7));
      }
    }
  },

  bricks(sk, x, y, w, h, rng) {
    const rows = rng.int(2, 4);
    const rh = h / rows;
    const cols = Math.max(2, Math.round(w / (rh * 2.2)));
    const cw = w / cols;
    for (let r = 0; r < rows; r++) {
      sk.line(x, y + r * rh, x + w, y + r * rh, sk.w(0.9));
      const offset = r % 2 ? cw / 2 : 0;
      for (let c = 0; c <= cols; c++) {
        const px = x + c * cw + offset;
        if (px <= x || px >= x + w) continue;
        sk.line(px, y + r * rh, px, y + (r + 1) * rh, sk.w(0.9));
      }
    }
  },

  circles(sk, x, y, w, h, rng) {
    const r = h * rng.range(0.34, 0.46);
    const cols = Math.max(2, Math.round(w / (r * 2.15)));
    const cw = w / cols;
    for (let c = 0; c < cols; c++) {
      const cx = x + cw * (c + 0.5);
      const cy = y + h / 2;
      sk.circle(cx, cy, r);
      const kind = rng.next();
      if (kind < 0.4) sk.circle(cx, cy, r * 0.6, sk.w(0.8));
      else if (kind < 0.7) {
        const n = rng.int(5, 8);
        for (let i = 0; i < n; i++) {
          const p = polar(cx, cy, r * 0.6, (i / n) * TAU);
          sk.circle(p.x, p.y, r * 0.16, sk.w(0.7));
        }
      } else spiral(sk, cx, cy, r * 0.82, rng.range(2, 3.2), rng, 0.8);
    }
  },

  zigzag(sk, x, y, w, h, rng) {
    const lines = rng.int(2, 4);
    const teeth = Math.max(4, Math.round(w / (h * 0.7)));
    const amp = (h / (lines + 1)) * 0.62;
    const top = y + amp;
    const span = Math.max(0, h - amp * 2);
    for (let i = 0; i <= lines; i++) {
      const base = top + (span * i) / lines;
      const pts = [];
      for (let k = 0; k <= teeth; k++) {
        pts.push({ x: x + (w * k) / teeth, y: base + (k % 2 ? amp : -amp) });
      }
      sk.poly(pts, false, sk.w(i % 2 ? 0.8 : 1));
    }
  },

  hatch(sk, x, y, w, h, rng) {
    const gap = h * rng.range(0.16, 0.3);
    const dir = rng.sign();
    for (let px = x - h; px < x + w + h; px += gap) {
      const x1 = px;
      const x2 = px + dir * h;
      const p1 = { x: Math.max(x, Math.min(x + w, x1)), y: y };
      const p2 = { x: Math.max(x, Math.min(x + w, x2)), y: y + h };
      if (Math.abs(p2.x - p1.x) < 0.5 && (p1.x === x || p1.x === x + w)) continue;
      sk.line(p1.x, p1.y, p2.x, p2.y, sk.w(0.85));
    }
  },

  dots(sk, x, y, w, h, rng) {
    const rows = rng.int(2, 4);
    const rh = h / rows;
    const cols = Math.max(4, Math.round(w / rh));
    const cw = w / cols;
    const r = Math.min(cw, rh) * rng.range(0.2, 0.32);
    for (let ri = 0; ri < rows; ri++) {
      for (let c = 0; c < cols; c++) {
        const cx = x + cw * (c + 0.5) + (ri % 2 ? cw * 0.5 : 0);
        if (cx > x + w - r * 0.5) continue;
        sk.circle(cx, y + rh * (ri + 0.5), r, sk.w(0.9));
      }
    }
  },

  leaves(sk, x, y, w, h, rng) {
    const cols = Math.max(3, Math.round(w / (h * 0.85)));
    const cw = w / cols;
    const stemY = y + h * 0.5;
    sk.line(x, stemY, x + w, stemY, sk.w(1));
    for (let c = 0; c < cols; c++) {
      const cx = x + cw * (c + 0.5);
      for (const s of [-1, 1]) {
        leaf(sk, cx, stemY, h * rng.range(0.34, 0.46), 0.21, s > 0 ? rng.range(0.6, 1.1) : -rng.range(0.6, 1.1), { veins: 1 });
      }
      if (rng.bool(0.4)) sk.circle(cx + cw * 0.5, stemY, h * 0.07, sk.w(0.8));
    }
  },

  teardrops(sk, x, y, w, h, rng) {
    const cols = Math.max(3, Math.round(w / (h * 0.7)));
    const cw = w / cols;
    for (let c = 0; c < cols; c++) {
      const cx = x + cw * (c + 0.5);
      const up = c % 2 === 0;
      teardrop(sk, cx, up ? y + h * 0.94 : y + h * 0.06, h * 0.86, 0.42, up ? -Math.PI / 2 : Math.PI / 2, true);
    }
    void rng;
  },

  chain(sk, x, y, w, h, rng) {
    const r = h * 0.4;
    const cols = Math.max(3, Math.round(w / (r * 1.45)));
    const cw = w / cols;
    for (let c = 0; c < cols; c++) {
      const cx = x + cw * (c + 0.5);
      const cy = y + h / 2;
      sk.ellipse(cx, cy, r * 0.85, r, c % 2 ? 0.4 : -0.4, sk.w(1));
      sk.ellipse(cx, cy, r * 0.5, r * 0.62, c % 2 ? 0.4 : -0.4, sk.w(0.75));
    }
    void rng;
  },

  mounds(sk, x, y, w, h, rng) {
    const cols = Math.max(2, Math.round(w / (h * 1.5)));
    const cw = w / cols;
    for (let c = 0; c < cols; c++) {
      const cx = x + cw * (c + 0.5);
      const layers = rng.int(3, 5);
      for (let i = 0; i < layers; i++) {
        const rr = (h * 0.92 * (layers - i)) / layers;
        const p1 = { x: Math.max(x, cx - rr), y: y + h };
        const p2 = { x: Math.min(x + w, cx + rr), y: y + h };
        sk.path(`M${f(p1.x)} ${f(p1.y)}A${f(rr)} ${f(rr)} 0 0 1 ${f(p2.x)} ${f(p2.y)}`, sk.w(i ? 0.8 : 1));
      }
    }
  },

  basket(sk, x, y, w, h, rng) {
    const cell = h / rng.int(2, 3);
    const cols = Math.max(2, Math.round(w / cell));
    const cw = w / cols;
    const rows = Math.max(1, Math.round(h / cell));
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = x + c * cw;
        const py = y + r * rh;
        const vertical = (r + c) % 2 === 0;
        sk.rect(px, py, cw, rh, 0, sk.w(0.95));
        const n = 3;
        for (let i = 1; i < n; i++) {
          const t = i / n;
          if (vertical) sk.line(px + cw * t, py, px + cw * t, py + rh, sk.w(0.7));
          else sk.line(px, py + rh * t, px + cw, py + rh * t, sk.w(0.7));
        }
      }
    }
  },
};

const NAMES = Object.keys(STRIPS);

export default {
  id: 'bands',
  name: 'Pattern Bands',
  blurb: 'Stacked strips of texture — waves, scales, chains. Colour one band at a time.',
  tags: ['pattern', 'relaxed', 'beginner-friendly'],

  draw(sk, { rng, box, complexity }) {
    const count = 4 + complexity + rng.int(0, 2);
    const weights = Array.from({ length: count }, () => rng.range(0.6, 1.6));
    const total = weights.reduce((a, b) => a + b, 0);

    let available = NAMES.slice();
    let prev = null;
    let y = box.y;

    for (let i = 0; i < count; i++) {
      const h = (weights[i] / total) * box.h;
      if (!available.length) available = NAMES.slice();
      let idx = rng.int(0, available.length - 1);
      if (available[idx] === prev && available.length > 1) idx = (idx + 1) % available.length;
      const name = available.splice(idx, 1)[0];
      prev = name;

      const pad = h * 0.1;
      STRIPS[name](sk, box.x, y + pad, box.w, h - pad * 2, rng);

      if (i < count - 1) {
        const yy = y + h;
        sk.line(box.x, yy, box.x + box.w, yy, sk.w(1.15));
        if (rng.bool(0.45)) sk.line(box.x, yy + Math.max(3, h * 0.035), box.x + box.w, yy + Math.max(3, h * 0.035), sk.w(0.7));
      }
      y += h;
    }

    sk.line(box.x, box.y, box.x + box.w, box.y, sk.w(1.15));
    sk.line(box.x, box.y + box.h, box.x + box.w, box.y + box.h, sk.w(1.15));
  },
};
