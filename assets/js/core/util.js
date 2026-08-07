/* Small geometry + formatting helpers shared by every generator. */

export const TAU = Math.PI * 2;

/** Trim float noise so exported SVG files stay small and diff-able. */
export function f(n) {
  return Math.round(n * 100) / 100;
}

export function polar(cx, cy, r, a) {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Move point `p` toward `target` by `d` units (used for polygon insets). */
export function toward(p, target, d) {
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(d / len, 0.48);
  return { x: p.x + dx * k, y: p.y + dy * k };
}

export function centroid(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Straight-line path data through a list of points. */
export function poly(pts, close = true) {
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += `L${f(pts[i].x)} ${f(pts[i].y)}`;
  return close ? `${d}Z` : d;
}

/**
 * Catmull-Rom spline converted to cubic beziers — the workhorse for organic
 * line art (petals, vines, wave bands, kaleidoscope doodles).
 */
export function smooth(pts, closed = false, tension = 1) {
  if (pts.length < 3) return poly(pts, closed);
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${f(p[1].x)} ${f(p[1].y)}`;
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2];
    const c1 = { x: p1.x + ((p2.x - p0.x) / 6) * tension, y: p1.y + ((p2.y - p0.y) / 6) * tension };
    const c2 = { x: p2.x - ((p3.x - p1.x) / 6) * tension, y: p2.y - ((p3.y - p1.y) / 6) * tension };
    d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return closed ? `${d}Z` : d;
}

/** Arc segment path data between two points on a circle of radius r. */
export function arc(p1, p2, r, sweep = 1, large = 0) {
  return `M${f(p1.x)} ${f(p1.y)}A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(p2.x)} ${f(p2.y)}`;
}
