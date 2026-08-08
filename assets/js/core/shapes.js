/* Reusable botanical + decorative motifs shared across generators. */

import { TAU, f, polar, smooth, poly, lerp } from './util.js';
import { Sketch } from './sketch.js';

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

/** Regular hexagon with a vertex pointing along +x (aligned to snowflake arms). */
export function hexagon(sk, cx, cy, r, weight = 1) {
  sk.poly(Array.from({ length: 6 }, (_, i) => polar(cx, cy, r, (i / 6) * TAU)), true, sk.w(weight));
}

/**
 * A closed, tapered needle from (ax,ay) to (bx,by).
 *
 * Snowflake arms are drawn as outlines rather than strokes on purpose: a bare
 * line encloses no area, so there would be nothing to put colour into. Every
 * part of every crystal is a shape with an inside.
 */
function needle(sk, ax, ay, bx, by, w, weight = 1) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  /*
   * The interior left to colour is 2w minus the stroke that the outline eats
   * from each side. Below roughly this width the two sides merge into a single
   * solid mark — the un-colourable result we are avoiding — so widen the
   * needle rather than let that happen.
   */
  w = Math.max(w, sk.stroke * 1.45);
  // Once that floor kicks in, a short branch would come out stubbier than it
  // is long — a blob rather than a needle. Drop it instead; on a small flake
  // the clean six arms read better than a crowd of nubs.
  if (len < w * 3) return;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const at = (t, off) => ({ x: ax + ux * len * t + nx * off, y: ay + uy * len * t + ny * off });
  sk.poly([
    at(0, w * 0.5),
    at(0.42, w),
    at(1, 0),
    at(0.42, -w),
    at(0, -w * 0.5),
  ], true, sk.w(weight));
}

/**
 * Recursive dendritic branching — the fractal that makes a real stellar
 * crystal. Each branch sprouts a smaller copy of itself at the same 60° the
 * lattice imposes, so the arm repeats its own structure at every scale.
 */
function dendriteBranch(sk, x, y, angle, len, w, depth, rng) {
  if (len < sk.stroke * 4) return; // too short to read as a shape at all
  const tipX = x + Math.cos(angle) * len;
  const tipY = y + Math.sin(angle) * len;
  needle(sk, x, y, tipX, tipY, w, depth > 0 ? 1 : 0.85);
  // Stop before the children get too short to hold an open interior.
  if (depth <= 0 || len < sk.stroke * 12) return;

  const spots = depth > 1 ? [0.38, 0.68] : [0.55];
  for (const t of spots) {
    const px = x + Math.cos(angle) * len * t;
    const py = y + Math.sin(angle) * len * t;
    const sub = len * rng.range(0.36, 0.5);
    for (const s of [-1, 1]) {
      const child = angle + (s * Math.PI) / 3;
      /*
       * Angles here are relative to the arm's own axis. Arms sit 60° apart, so
       * a child beyond that folds back across the neighbouring arm — which is
       * what turned large dendrites into dark tangles. Keeping children inside
       * the sector also reproduces the real thing: side branches off a side
       * branch end up parallel to the spine.
       */
      if (Math.abs(child) > Math.PI / 3 + 1e-6) continue;
      dendriteBranch(sk, px, py, child, sub, w * 0.66, depth - 1, rng);
    }
  }
}

/** One Koch subdivision: the middle third of a-b replaced by an outward spike. */
function kochEdge(a, b, depth, out) {
  if (depth === 0) {
    out.push(a);
    return;
  }
  const dx = (b.x - a.x) / 3;
  const dy = (b.y - a.y) / 3;
  const p1 = { x: a.x + dx, y: a.y + dy };
  const p3 = { x: a.x + 2 * dx, y: a.y + 2 * dy };
  const vx = p3.x - p1.x;
  const vy = p3.y - p1.y;
  // Rotating the middle third by -60° puts the spike outside the triangle.
  const c = Math.cos(-Math.PI / 3);
  const s = Math.sin(-Math.PI / 3);
  const p2 = { x: p1.x + vx * c - vy * s, y: p1.y + vx * s + vy * c };
  kochEdge(a, p1, depth - 1, out);
  kochEdge(p1, p2, depth - 1, out);
  kochEdge(p2, p3, depth - 1, out);
  kochEdge(p3, b, depth - 1, out);
}

/** Closed Koch snowflake outline of radius r. */
function kochRing(sk, cx, cy, r, depth, weight) {
  const base = [0, 1, 2].map((i) => polar(cx, cy, r, -Math.PI / 2 + (i * TAU) / 3));
  const pts = [];
  for (let i = 0; i < 3; i++) kochEdge(base[i], base[(i + 1) % 3], depth, pts);
  sk.poly(pts, true, sk.w(weight));
}

/**
 * The Koch flake: nested fractal rings. One iteration is already a six-pointed
 * star, and each further one adds spikes to every edge — self-similar all the
 * way down, and every ring closed, so the bands between them take colour.
 */
function kochFlake(sk, cx, cy, r, rc, fine, rng) {
  /*
   * Each iteration divides the edge into thirds, so the smallest spike is
   * r/3^depth across. Let that approach the line width and the whole outline
   * fills in solid black — so the depth is derived from how much room the
   * stroke actually leaves, per ring, rather than picked by eye.
   */
  const depthFor = (radius) => {
    const d = Math.floor(Math.log(radius / (sk.stroke * 3.2)) / Math.log(3));
    return Math.max(1, Math.min(3, d));
  };

  kochRing(sk, cx, cy, r, depthFor(r), 1.05);
  const inner = r * rng.range(0.58, 0.68);
  kochRing(sk, cx, cy, inner, depthFor(inner), 0.85);
  if (fine > 20) {
    const core = r * 0.34;
    kochRing(sk, cx, cy, core, depthFor(core), 0.75);
  }
  hexagon(sk, cx, cy, rc * 0.9);
}

/**
 * One sixth of a snowflake, drawn along +x from the origin.
 *
 * `fine` is the arm length measured in line widths. Detail is gated on it:
 * branches and spurs that read beautifully on a large crystal merge into a
 * solid blot on a small one, so small flakes get shallower recursion.
 */
function snowArm(sk, r, rc, kind, rng, fine) {
  if (kind === 'stellar') {
    // Broad blade arms: closed shapes, so there is something to colour in.
    const w = r * rng.range(0.075, 0.115);
    const blade = [
      { x: rc, y: w * 0.62 },
      { x: r * 0.7, y: w },
      { x: r, y: 0 },
      { x: r * 0.7, y: -w },
      { x: rc, y: -w * 0.62 },
    ];
    sk.poly(blade, true);
    if (fine > 18) sk.poly(blade.map((p) => ({ x: lerp(r * 0.55, p.x, 0.6), y: p.y * 0.45 })), true, sk.w(0.7));

    // Side spurs: small diamonds at the crystal's natural 60°.
    const spurs = fine > 20 ? rng.int(1, 2) : 1;
    for (let i = 0; i < spurs; i++) {
      const t = rng.range(0.4, 0.72);
      const base = { x: lerp(rc, r, t), y: 0 };
      const len = r * rng.range(0.16, 0.26);
      for (const s of [-1, 1]) {
        const dx = Math.cos(Math.PI / 3);
        const dy = s * Math.sin(Math.PI / 3);
        const tip = { x: base.x + dx * len, y: base.y + dy * len };
        const mid = { x: base.x + dx * len * 0.5, y: base.y + dy * len * 0.5 };
        const off = len * 0.2;
        sk.poly([base, { x: mid.x - dy * off, y: mid.y + dx * off }, tip, { x: mid.x + dy * off, y: mid.y - dx * off }], true, sk.w(0.85));
      }
    }
    return;
  }

  if (kind === 'plate') {
    // Sectored plate: a spoke with a diamond and a fork near the tip.
    needle(sk, rc, 0, r, 0, r * 0.045);
    const d = r * 0.1;
    const at = r * rng.range(0.5, 0.66);
    sk.poly([{ x: at - d, y: 0 }, { x: at, y: -d }, { x: at + d, y: 0 }, { x: at, y: d }], true, sk.w(0.85));
    const tip = r * 0.88;
    for (const s of [-1, 1]) {
      needle(sk, tip, 0, tip - r * 0.1, s * r * 0.1, r * 0.03, 0.8);
    }
    return;
  }

  // Dendrite: a central shaft carrying recursively branching side arms.
  const depth = fine > 26 ? 2 : fine > 16 ? 1 : 0;
  needle(sk, rc, 0, r, 0, r * 0.05);

  const branches = fine > 22 ? rng.int(2, 3) : 2;
  for (let i = 0; i < branches; i++) {
    const t = lerp(0.3, 0.78, (i + 0.5) / branches);
    const x = lerp(rc, r, t);
    const len = (r - x) * rng.range(0.62, 0.92);
    for (const s of [-1, 1]) {
      dendriteBranch(sk, x, 0, (s * Math.PI) / 3, len, r * 0.032, depth, rng);
    }
  }

  // Tip fork.
  for (const s of [-1, 1]) {
    needle(sk, r * 0.97, 0, r * 0.84, s * r * 0.12, r * 0.026, 0.8);
  }
}

/**
 * Six-fold snowflake. One arm is built once and re-emitted as six rotations,
 * which is both faster and the reason the crystal is exactly symmetric.
 */
export function snowflake(sk, cx, cy, r, rng) {
  // Arm length in line widths — the budget for how much detail can be legible.
  const fine = r / sk.stroke;
  let kind;
  if (fine < 12) kind = rng.pick(['koch', 'plate']);
  else if (fine < 20) kind = rng.pick(['koch', 'plate', 'dendrite']);
  else kind = rng.pick(['dendrite', 'dendrite', 'koch', 'stellar', 'plate']);

  const rc = r * rng.range(0.13, 0.2);

  // The Koch form is a whole-flake fractal rather than six repeated arms.
  if (kind === 'koch') {
    kochFlake(sk, cx, cy, r, rc, fine, rng);
    return;
  }

  const arm = new Sketch({ width: sk.width, height: sk.height, stroke: sk.stroke });
  snowArm(arm, r, rc, kind, rng, fine);
  const content = arm.parts.join('');
  for (let i = 0; i < 6; i++) {
    sk.open(`translate(${f(cx)} ${f(cy)}) rotate(${f(i * 60)})`).raw(content).close();
  }

  if (kind === 'plate') {
    hexagon(sk, cx, cy, r * 0.92, 1);
    if (fine > 14) hexagon(sk, cx, cy, r * 0.62, 0.8);
  }
  hexagon(sk, cx, cy, rc);
  if (fine > 18 && rng.bool(0.6)) hexagon(sk, cx, cy, rc * 0.5, 0.75);
}

/**
 * Tiny sparkle for filling gaps between snowflakes. Drawn as a closed star
 * rather than crossed strokes so even the smallest fleck can be coloured.
 */
export function sparkle(sk, cx, cy, r, rng) {
  const arms = rng.bool(0.6) ? 6 : 4;
  const pts = [];
  for (let i = 0; i < arms * 2; i++) {
    pts.push(polar(cx, cy, i % 2 ? r * 0.34 : r, (i / (arms * 2)) * TAU));
  }
  sk.poly(pts, true, sk.w(0.85));
  if (r > 9 && rng.bool(0.4)) hexagon(sk, cx, cy, r * 0.22, 0.65);
}

/** Evenly spaced dots along a straight run. */
export function dotRow(sk, x1, y1, x2, y2, n, r, sk_w = 0.7) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    sk.circle(lerp(x1, x2, t), lerp(y1, y2, t), r, sk.w(sk_w));
  }
}

export { poly };
