/*
 * Flow Field — ribbons combed through a field of noise.
 *
 * The flow field is the signature p5 sketch: build a field of directions from
 * noise, drop particles into it, and let their trails draw the picture. It is
 * beautiful and it is also, as normally written, the worst possible colouring
 * page — a thousand open trails enclose nothing at all, and a page with nothing
 * enclosed has nowhere to put a pencil.
 *
 * So the trails are the armature here rather than the drawing. Each one becomes
 * a ribbon: a closed outline tapering to a point at both ends, divided across
 * its width into cells. What you colour is the cells; what makes the page worth
 * colouring is that every ribbon has been combed by the same field, so a
 * hundred separate shapes all lean the same way and swirl around the same
 * centres.
 *
 * Two things do most of the work:
 *
 *   - Vortices. Noise alone gives an even comb, which is soothing and dull.
 *     A few points of rotation added to the field give the page somewhere to
 *     look. They are summed as vectors rather than as angles, because angles do
 *     not average — halfway between 350° and 10° is 180° if you take the mean.
 *
 *   - Even spacing. A new ribbon stops as soon as it comes too close to one
 *     already drawn, which is the classic evenly-spaced streamline algorithm.
 *     Without it the field's converging lines pile into each other and the
 *     gaps between ribbons — themselves regions to colour — disappear.
 */

import { TAU, smooth, poly } from '../core/util.js';
import { makeNoise } from '../core/noise.js';

/* ---------------------------------------------------------------- field -- */

function buildField(rng, box, complexity) {
  const noise = makeNoise(rng, {
    octaves: 2 + Math.min(2, complexity - 1),
    falloff: 0.5,
  });
  // How many features of the field fit across the sheet, and how far the
  // direction turns across one of them.
  const scale = rng.range(1.5, 2.6);
  const swirl = rng.range(1.3, 2.4);
  const drift = rng.range(0, TAU);

  const vortices = [];
  const count = rng.int(1, complexity >= 4 ? 3 : 2);
  for (let i = 0; i < count; i++) {
    vortices.push({
      x: box.x + box.w * rng.range(0.2, 0.8),
      y: box.y + box.h * rng.range(0.2, 0.8),
      r: Math.min(box.w, box.h) * rng.range(0.2, 0.38),
      spin: rng.sign(),
      strength: rng.range(1.1, 2.2),
    });
  }

  return function angleAt(x, y) {
    const u = (x - box.x) / box.w;
    const v = (y - box.y) / box.h;
    const a = noise(u * scale, v * scale) * TAU * swirl + drift;

    let vx = Math.cos(a);
    let vy = Math.sin(a);
    for (const q of vortices) {
      const dx = x - q.x;
      const dy = y - q.y;
      const d = Math.hypot(dx, dy) + 1e-6;
      const w = q.strength * Math.exp(-(d * d) / (2 * q.r * q.r));
      // The perpendicular of the radius is a rotation about the vortex.
      vx += (-dy / d) * w * q.spin;
      vy += (dx / d) * w * q.spin;
    }
    return Math.atan2(vy, vx);
  };
}

/* -------------------------------------------------------------- spacing -- */

/**
 * Points already occupied, on a coarse grid.
 *
 * A ribbon has to know whether it is about to run into one already drawn, and
 * asking that of every point of every ribbon is quadratic. Bucketing by the
 * separation distance makes it a lookup in nine cells.
 */
class Spacing {
  constructor(box, cell) {
    this.cell = cell;
    this.x0 = box.x;
    this.y0 = box.y;
    this.cols = Math.ceil(box.w / cell) + 2;
    this.rows = Math.ceil(box.h / cell) + 2;
    this.buckets = new Map();
  }

  key(x, y) {
    const c = Math.floor((x - this.x0) / this.cell) + 1;
    const r = Math.floor((y - this.y0) / this.cell) + 1;
    return r * this.cols + c;
  }

  add(x, y) {
    const k = this.key(x, y);
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = []));
    b.push(x, y);
  }

  /** Is anything already within `d` of this point? */
  crowded(x, y, d) {
    const c = Math.floor((x - this.x0) / this.cell) + 1;
    const r = Math.floor((y - this.y0) / this.cell) + 1;
    const d2 = d * d;
    for (let rr = r - 1; rr <= r + 1; rr++) {
      for (let cc = c - 1; cc <= c + 1; cc++) {
        const b = this.buckets.get(rr * this.cols + cc);
        if (!b) continue;
        for (let i = 0; i < b.length; i += 2) {
          const dx = b[i] - x;
          const dy = b[i + 1] - y;
          if (dx * dx + dy * dy < d2) return true;
        }
      }
    }
    return false;
  }
}

/* --------------------------------------------------------------- traces -- */

/** One midpoint (RK2) step along the field — straight Euler visibly corners. */
function advance(angleAt, p, h) {
  const a1 = angleAt(p.x, p.y);
  const mx = p.x + Math.cos(a1) * h * 0.5;
  const my = p.y + Math.sin(a1) * h * 0.5;
  const a2 = angleAt(mx, my);
  return { x: p.x + Math.cos(a2) * h, y: p.y + Math.sin(a2) * h };
}

/**
 * A streamline through `start`, in both directions, stopping at the edge of the
 * sheet or at anything already drawn.
 *
 * `pad` keeps the centreline far enough inside the box that the ribbon built
 * around it is still on the paper — the bounds test is not a formality, it is
 * the difference between a design and a design with its edge sliced off.
 */
function streamline(angleAt, start, { step, maxSteps, box, pad, spacing, sep }) {
  const inside = (p) => p.x > box.x + pad && p.x < box.x + box.w - pad
    && p.y > box.y + pad && p.y < box.y + box.h - pad;
  if (!inside(start)) return null;

  /*
   * A streamline has to give way to itself as well as to its neighbours.
   *
   * Inside a vortex the field turns fast enough that a line spirals inward
   * without ever leaving the sheet or meeting another ribbon, and runs until it
   * hits the step limit — laying hundreds of coils and cross-bars into a space a
   * few units across. On the page that is a solid black disc: no lines to see,
   * nothing to colour, and a lot of toner.
   *
   * Checking against its own trail fixes it, but only past a lag: the points
   * just behind the pen are always within a ribbon's width, so testing those
   * would stop every line on its second step.
   */
  const lag = Math.max(4, Math.ceil((sep * 2.2) / step));

  const half = (dir) => {
    const own = new Spacing(box, sep);
    const pending = [];
    const out = [];
    let p = start;

    for (let i = 0; i < maxSteps; i++) {
      const next = advance(angleAt, p, step * dir);
      if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) break;
      if (!inside(next)) break;
      if (spacing.crowded(next.x, next.y, sep)) break;
      if (own.crowded(next.x, next.y, sep * 0.9)) break;

      out.push(next);
      pending.push(next);
      if (pending.length > lag) {
        const old = pending.shift();
        own.add(old.x, old.y);
      }
      p = next;
    }
    return out;
  };

  const back = half(-1).reverse();
  const fwd = half(1);
  return [...back, start, ...fwd];
}

/**
 * Thin the traced points out to what the drawing actually needs.
 *
 * Tracing steps finely because the accuracy of the path depends on it; drawing
 * does not, because `smooth` puts the curve back. Emitting a cubic per traced
 * point made pages of three-quarters of a megabyte — ten times any other style,
 * for a shape indistinguishable from this one.
 */
function decimate(pts, minStep) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    if (dist(out[out.length - 1], pts[i]) >= minStep) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out.length >= 3 ? out : pts;
}

/* -------------------------------------------------------------- ribbons -- */

/**
 * The two sides of a ribbon around a centreline.
 *
 * The half-width follows a sine along the length, so both ends come to a point
 * and the outline closes on itself without a cap. Raising it to a low power
 * fattens the middle, which stops a long ribbon from looking like a needle.
 */
/**
 * How tightly the centreline turns here, as a radius.
 *
 * The circumradius of a point and its two neighbours. Collinear points give a
 * zero area and an infinite radius, which is the right answer.
 */
function curveRadius(p0, p1, p2) {
  const a = dist(p0, p1);
  const b = dist(p1, p2);
  const c = dist(p0, p2);
  const area = Math.abs((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)) / 2;
  if (area < 1e-9) return Infinity;
  return (a * b * c) / (4 * area);
}

function sides(pts, halfWidth) {
  const left = [];
  const right = [];
  const last = pts.length - 1;

  for (let i = 0; i <= last; i++) {
    const t = i / last;
    let w = halfWidth * Math.sin(Math.PI * t) ** 0.5;

    /*
     * A ribbon cannot be wider than the turn it is going round.
     *
     * Offsetting by more than the radius of curvature folds the inner edge
     * back through itself: on the page that is a spike sticking out of an
     * otherwise smooth ribbon, and a region whose outline crosses itself. Where
     * the field turns hard, the ribbon narrows instead — which is also what a
     * brush loaded with ink actually does.
     */
    if (i > 0 && i < last) {
      w = Math.min(w, curveRadius(pts[i - 1], pts[i], pts[i + 1]) * 0.8);
    }

    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(last, i + 1)];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = -Math.sin(ang) * w;
    const ny = Math.cos(ang) * w;
    left.push({ x: pts[i].x + nx, y: pts[i].y + ny });
    right.push({ x: pts[i].x - nx, y: pts[i].y - ny });
  }
  return { left, right };
}

function drawRibbon(sk, pts, halfWidth, { cellLength, midline, minBar }) {
  const { left, right } = sides(pts, halfWidth);

  /*
   * The outline, as one closed shape: up one side and back down the other.
   * Both tips are dropped from the return leg, because the taper has already
   * brought the two sides together there — including them would put the same
   * point in the path twice, and a spline through a doubled point kinks.
   */
  const outline = left.concat(right.slice(1, -1).reverse());
  sk.path(smooth(outline, true), sk.w(1));

  /*
   * Cross-bars placed by distance travelled, not by index. The traced points
   * are not evenly spaced once the field turns sharply, and counting indices
   * bunches the bars exactly where the ribbon curves hardest and has least room
   * for them.
   */
  let since = cellLength * 0.6;
  let first = -1;
  let last = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    since += dist(pts[i - 1], pts[i]);
    if (since < cellLength) continue;
    // Near the tips the two sides have all but met; a bar there is a dot.
    if (dist(left[i], right[i]) < minBar) continue;
    sk.path(poly([left[i], right[i]], false), sk.w(0.75));
    if (first < 0) first = i;
    last = i;
    since = 0;
  }

  // The midline runs between the first and last bar, so it stops short of the
  // points rather than running into them and making a spike.
  if (midline && last - first > 2) {
    sk.path(smooth(pts.slice(first, last + 1), false), sk.w(0.6));
  }
}

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/* ----------------------------------------------------------------- page -- */

// Ribbons across the short side of the sheet, by detail level.
const DENSITY = [0, 8, 11, 15, 20, 26];

export default {
  id: 'flowfield',
  name: 'Flow Field',
  blurb: 'Ribbons combed through a field of noise — long organic sweeps that all lean the same way.',
  tags: ['abstract', 'organic', 'calm'],

  draw(sk, { rng, box, complexity }) {
    const short = Math.min(box.w, box.h);
    const angleAt = buildField(rng, box, complexity);

    const sep = short / DENSITY[complexity];
    // The gap between ribbons is a region to colour too, so the ribbon takes
    // only part of its own lane. Never so thin that the boldest pen closes it.
    const halfWidth = Math.max(sk.refStroke * 1.6, sep * 0.34);
    const step = short / 240;
    const maxSteps = Math.ceil(((box.w + box.h) * 1.6) / step);
    // Long enough that the taper leaves a body between the two points. Below
    // about six ribbon-widths a ribbon is all tip — a sliver, which is the one
    // thing on a colouring page that cannot be coloured.
    const minLength = Math.max(sep * 5.5, halfWidth * 16);

    const spacing = new Spacing(box, sep);
    const ribbons = [];

    /*
     * Seeding, the way evenly-spaced streamlines are normally grown.
     *
     * A jittered grid gets it started, but a grid alone leaves bald patches and
     * then makes them permanent: a ribbon stops when it nears one already
     * drawn, so wherever the grid happened not to land, nothing ever will.
     * Instead every accepted ribbon proposes new seeds one separation out along
     * its own flanks. Coverage then grows outward from what is already there
     * and closes its own gaps, which is the whole point of the algorithm.
     */
    const queue = [];
    const cols = Math.ceil(box.w / (sep * 1.5));
    const rows = Math.ceil(box.h / (sep * 1.5));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        queue.push({
          x: box.x + ((c + rng.range(0.2, 0.8)) / cols) * box.w,
          y: box.y + ((r + rng.range(0.2, 0.8)) / rows) * box.h,
        });
      }
    }
    for (let i = queue.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }

    const pad = halfWidth + sk.refStroke;
    // Bounded so a pathological field cannot spin here indefinitely; the queue
    // grows as ribbons are accepted, and every accepted ribbon adds more.
    const maxRibbons = Math.ceil((box.w * box.h) / (sep * sep * 2.5));
    const maxTries = maxRibbons * 40;

    for (let tries = 0; queue.length && ribbons.length < maxRibbons && tries < maxTries; tries++) {
      const seed = queue.shift();
      if (spacing.crowded(seed.x, seed.y, sep)) continue;
      const line = streamline(angleAt, seed, { step, maxSteps, box, pad, spacing, sep: sep * 0.92 });
      if (!line) continue;

      let length = 0;
      for (let i = 1; i < line.length; i++) length += dist(line[i - 1], line[i]);
      if (length < minLength) continue;

      for (const p of line) spacing.add(p.x, p.y);
      ribbons.push(line);

      // Offer the neighbouring lanes on both flanks, spaced along the ribbon.
      const stride = Math.max(1, Math.round(sep / step));
      for (let i = stride; i < line.length - stride; i += stride) {
        const a = line[i - 1];
        const b = line[i + 1];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const nx = -Math.sin(ang) * sep * 1.05;
        const ny = Math.cos(ang) * sep * 1.05;
        queue.push({ x: line[i].x + nx, y: line[i].y + ny });
        queue.push({ x: line[i].x - nx, y: line[i].y - ny });
      }
    }

    // Drawn after tracing, so an early ribbon is never cut short by ink that
    // was not there when it was traced.
/*
     * Cells about twice as long as the ribbon is wide. Square cells read as
     * segmentation — the ribbon stops looking like a ribbon and starts looking
     * like something with a lot of legs.
     */
    const cellLength = halfWidth * rng.range(3.6, 5.2);
    const midline = complexity >= 4;
    const minBar = sk.refStroke * 2.4;
    for (const line of ribbons) {
      const w = halfWidth * rng.range(0.82, 1);
      drawRibbon(sk, decimate(line, w * 1.3), w, { cellLength, midline, minBar });
    }
  },
};
