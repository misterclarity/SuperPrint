/* Reusable botanical + decorative motifs shared across generators. */

import { TAU, f, polar, smooth, poly, lerp } from './util.js';

/**
 * Pointed leaf with a midrib and optional veins.
 *
 * `wid` is the half-width as a fraction of `len` (0.2 ≈ a classic leaf). Veins
 * are positioned against the outline's own width profile so they can never
 * poke outside the leaf — a quadratic with its control offset at 2·halfMax is
 * exactly halfMax wide at its midpoint, tapering as 4t(1−t).
 */
export function leaf(sk, x, y, len, wid = 0.2, angle = 0, { veins = 2, serrated = false } = {}) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const at = (t, off = 0) => ({ x: x + ux * len * t + nx * off, y: y + uy * len * t + ny * off });
  const halfMax = len * wid;
  const halfAt = (t) => 4 * t * (1 - t) * halfMax;

  const tip = at(1);
  const c1 = at(0.5, halfMax * 2);
  const c2 = at(0.5, -halfMax * 2);
  sk.path(
    `M${f(x)} ${f(y)}Q${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)}Q${f(c2.x)} ${f(c2.y)} ${f(x)} ${f(y)}Z`,
  );
  sk.line(x, y, tip.x, tip.y, sk.w(0.72));

  for (let i = 1; i <= veins; i++) {
    const t = (i / (veins + 1)) * 0.8;
    const te = Math.min(0.94, t + 0.24);
    const base = at(t);
    for (const s of [-1, 1]) {
      const end = at(te, s * halfAt(te) * 0.78);
      const ctrl = at((t + te) / 2, s * halfAt(te) * 0.3);
      sk.path(`M${f(base.x)} ${f(base.y)}Q${f(ctrl.x)} ${f(ctrl.y)} ${f(end.x)} ${f(end.y)}`, sk.w(0.62));
    }
  }

  if (serrated) {
    for (const s of [-1, 1]) {
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        const p = at(t, s * halfAt(t));
        sk.circle(p.x, p.y, len * 0.03, sk.w(0.6));
      }
    }
  }
}

/** Round-petalled bloom seen face-on. */
export function flower(sk, cx, cy, r, petals, { inner = true, dots = true, rounded = true } = {}) {
  const step = TAU / petals;
  const half = step * 0.46;
  for (let i = 0; i < petals; i++) {
    const a = i * step;
    const base = polar(cx, cy, r * 0.3, a);
    const tip = polar(cx, cy, r, a);
    const bulge = rounded ? 0.95 : 0.62;
    const c1 = polar(cx, cy, r * bulge, a - half);
    const c2 = polar(cx, cy, r * bulge, a + half);
    sk.path(
      `M${f(base.x)} ${f(base.y)}Q${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)}Q${f(c2.x)} ${f(c2.y)} ${f(base.x)} ${f(base.y)}Z`,
    );
    if (inner) {
      const t2 = polar(cx, cy, r * 0.72, a);
      const i1 = polar(cx, cy, r * bulge * 0.68, a - half * 0.6);
      const i2 = polar(cx, cy, r * bulge * 0.68, a + half * 0.6);
      sk.path(
        `M${f(base.x)} ${f(base.y)}Q${f(i1.x)} ${f(i1.y)} ${f(t2.x)} ${f(t2.y)}Q${f(i2.x)} ${f(i2.y)} ${f(base.x)} ${f(base.y)}Z`,
        sk.w(0.7),
      );
    }
  }
  sk.circle(cx, cy, r * 0.28);
  if (dots) {
    const n = Math.max(5, petals);
    for (let i = 0; i < n; i++) {
      const p = polar(cx, cy, r * 0.15, (i / n) * TAU);
      sk.circle(p.x, p.y, r * 0.05, sk.w(0.65));
    }
  }
}

/** Many-layered rosette — denser than `flower`, good as a focal point. */
export function rosette(sk, cx, cy, r, rng) {
  const layers = rng.int(2, 3);
  for (let l = 0; l < layers; l++) {
    const rr = r * (1 - l * 0.28);
    const n = rng.pick([6, 8, 10, 12]) + l * 2;
    const step = TAU / n;
    const phase = l * step * 0.5;
    for (let i = 0; i < n; i++) {
      const a = i * step + phase;
      const tip = polar(cx, cy, rr, a);
      const c1 = polar(cx, cy, rr * 0.78, a - step * 0.5);
      const c2 = polar(cx, cy, rr * 0.78, a + step * 0.5);
      sk.path(`M${f(cx)} ${f(cy)}Q${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)}Q${f(c2.x)} ${f(c2.y)} ${f(cx)} ${f(cy)}Z`, sk.w(l ? 0.8 : 1));
    }
  }
  sk.circle(cx, cy, r * 0.16);
}

/** Archimedean spiral. */
export function spiral(sk, cx, cy, r, turns, rng, weight = 0.9) {
  const pts = [];
  const steps = Math.ceil(turns * 26);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(polar(cx, cy, r * t, t * turns * TAU + (rng ? rng.next() * 0.3 : 0)));
  }
  sk.path(smooth(pts), sk.w(weight));
}

/** Ring of scalloped arcs — a classic mandala band edge. */
export function scallops(sk, cx, cy, r, n, depth, sweep = 0) {
  const step = TAU / n;
  for (let i = 0; i < n; i++) {
    const p1 = polar(cx, cy, r, i * step);
    const p2 = polar(cx, cy, r, (i + 1) * step);
    const rad = Math.max(1, (Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2) * depth);
    sk.path(`M${f(p1.x)} ${f(p1.y)}A${f(rad)} ${f(rad)} 0 0 ${sweep} ${f(p2.x)} ${f(p2.y)}`);
  }
}

/** Berry cluster / seed pod. */
export function berries(sk, cx, cy, r, count, rng) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.range(-0.3, 0.3);
    const p = polar(cx, cy, r * rng.range(0.5, 1), a);
    const rr = r * rng.range(0.3, 0.46);
    sk.circle(p.x, p.y, rr);
    sk.circle(p.x - rr * 0.3, p.y - rr * 0.3, rr * 0.22, sk.w(0.6));
  }
}

/** Closed wobbly ring: radius modulated by a sine — the base of many bands. */
export function waveRing(sk, cx, cy, r, lobes, amp, phase = 0, weight = 1) {
  const pts = [];
  const steps = Math.max(64, lobes * 10);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    pts.push(polar(cx, cy, r + amp * Math.sin(lobes * a + phase), a));
  }
  sk.path(smooth(pts, true), sk.w(weight));
}

/** Teardrop / paisley pointing outward from (x,y) along `angle`. */
export function teardrop(sk, x, y, len, wid, angle, detail = true) {
  const tip = polar(x, y, len, angle);
  const l1 = polar(x, y, len * 0.62, angle - wid);
  const l2 = polar(x, y, len * 0.62, angle + wid);
  const b1 = polar(x, y, len * 0.12, angle - wid * 0.55);
  const b2 = polar(x, y, len * 0.12, angle + wid * 0.55);
  sk.path(
    `M${f(b1.x)} ${f(b1.y)}C${f(l1.x)} ${f(l1.y)} ${f(l1.x)} ${f(l1.y)} ${f(tip.x)} ${f(tip.y)}` +
      `C${f(l2.x)} ${f(l2.y)} ${f(l2.x)} ${f(l2.y)} ${f(b2.x)} ${f(b2.y)}Z`,
  );
  if (detail) {
    const t2 = polar(x, y, len * 0.68, angle);
    const m1 = polar(x, y, len * 0.44, angle - wid * 0.6);
    const m2 = polar(x, y, len * 0.44, angle + wid * 0.6);
    sk.path(
      `M${f(b1.x)} ${f(b1.y)}C${f(m1.x)} ${f(m1.y)} ${f(m1.x)} ${f(m1.y)} ${f(t2.x)} ${f(t2.y)}` +
        `C${f(m2.x)} ${f(m2.y)} ${f(m2.x)} ${f(m2.y)} ${f(b2.x)} ${f(b2.y)}Z`,
      sk.w(0.7),
    );
  }
}

/**
 * Quarter-fan ornament tucked into a page corner. `angle` points from the
 * corner into the page.
 */
export function cornerOrnament(sk, x, y, size, angle, rng) {
  const q = Math.PI / 4;
  const arcs = rng.int(2, 4);
  for (let i = 1; i <= arcs; i++) {
    const r = size * (0.4 + (0.6 * i) / arcs);
    const p1 = polar(x, y, r, angle - q);
    const p2 = polar(x, y, r, angle + q);
    sk.path(`M${f(p1.x)} ${f(p1.y)}A${f(r)} ${f(r)} 0 0 1 ${f(p2.x)} ${f(p2.y)}`, sk.w(i % 2 ? 1 : 0.75));
  }
  teardrop(sk, x, y, size * 0.5, 0.4, angle, true);
  const dots = rng.int(2, 3);
  for (let i = 0; i < dots; i++) {
    const t = (i + 1) / (dots + 1);
    const p = polar(x, y, size * 0.72, angle - q + t * q * 2);
    sk.circle(p.x, p.y, size * 0.05, sk.w(0.7));
  }
}

/**
 * Fill the four corners left over when a circular design sits on a
 * rectangular sheet. No-op when the sheet is close to square.
 */
export function radialCorners(sk, box, R, rng) {
  const corners = [
    [box.x, box.y, Math.PI / 4],
    [box.x + box.w, box.y, (Math.PI * 3) / 4],
    [box.x + box.w, box.y + box.h, (Math.PI * 5) / 4],
    [box.x, box.y + box.h, (Math.PI * 7) / 4],
  ];
  const gap = Math.hypot(box.w / 2, box.h / 2) - R;
  if (gap < box.w * 0.13) return;
  const size = Math.min(gap * 0.62, box.w * 0.19);
  for (const [x, y, a] of corners) cornerOrnament(sk, x, y, size, a, rng);
}

/** Evenly spaced dots along a straight run. */
export function dotRow(sk, x1, y1, x2, y2, n, r, sk_w = 0.7) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    sk.circle(lerp(x1, x2, t), lerp(y1, y2, t), r, sk.w(sk_w));
  }
}

export { poly };
