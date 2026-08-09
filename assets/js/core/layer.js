/*
 * Layering: letting motifs sit in front of one another.
 *
 * Drawing is additive — every stroke a generator asks for appears, including
 * the half of a berry that ought to be hidden behind the leaf lying across it.
 * The result reads as a tangle of small slivers rather than a leaf on a berry,
 * and slivers are exactly what nobody can put a pencil into.
 *
 * `layered` fixes that the way an illustrator would: draw back to front, and
 * let each motif knock out the parts of everything behind it. The geometry is
 * in clip.js; this is the part generators talk to.
 *
 * Two details are worth knowing:
 *
 *   - Only *closed* outlines occlude. A leaf's silhouette hides what is under
 *     it; its veins and midrib do not, because they are marks on a surface
 *     rather than the surface itself.
 *
 *   - Geometry that nothing overlaps is emitted exactly as it was drawn, curves
 *     and all. Only the shapes actually cut by something in front are replaced
 *     by flattened outlines, so a page pays for clipping only where it shows.
 */

import { parseFragment, pointsToPath, TOLERANCE } from './path.js';
import { clipOut, unionOutline, Occluders } from './clip.js';

function boundsOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

const boxesOverlap = (a, b, pad = 0) =>
  a.minX - pad <= b.maxX && a.maxX + pad >= b.minX && a.minY - pad <= b.maxY && a.maxY + pad >= b.minY;

const merge = (a, b) => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

const EMPTY = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

/**
 * Break captured markup into individual elements, each with its own geometry.
 *
 * Keeping the source string alongside the points is what lets an untouched
 * shape go back onto the sheet unchanged instead of being redrawn as a
 * polyline. Groups are not expected here — motifs are flat lists of shapes —
 * and any that appear are passed through without being clipped rather than
 * being silently mangled.
 */
function elementsOf(markup, tol) {
  const out = [];
  for (const source of markup.match(/<[^>]+>/g) || []) {
    if (/^<\/?g[\s>]/.test(source)) {
      out.push({ source, subs: [], bounds: EMPTY, opaque: true });
      continue;
    }
    const subs = parseFragment(source, tol);
    if (!subs.length) {
      out.push({ source, subs: [], bounds: EMPTY, opaque: true });
      continue;
    }
    out.push({
      source,
      subs,
      bounds: subs.map((s) => boundsOf(s.points)).reduce(merge, EMPTY),
      opaque: false,
    });
  }
  return out;
}

/** Re-emit clipped geometry, grouping runs that share a pen into one element. */
function emit(subs) {
  let out = '';
  let i = 0;
  while (i < subs.length) {
    const attrs = subs[i].attrs || '';
    let d = '';
    while (i < subs.length && (subs[i].attrs || '') === attrs) {
      d += pointsToPath(subs[i].points, subs[i].closed);
      i++;
    }
    if (d) out += `<path d="${d}"${attrs}/>`;
  }
  return out;
}

/** The closed outlines of an element list — the parts that can hide things. */
function silhouette(elements) {
  const polys = [];
  for (const el of elements) {
    for (const sub of el.subs) if (sub.closed && sub.points.length >= 3) polys.push(sub.points);
  }
  return polys;
}

/**
 * Draw a stack of motifs so that later ones hide earlier ones.
 *
 * @param {Sketch} sk
 * @param {(Function|{draw: Function, occludes?: boolean, merge?: boolean})[]} items
 *   Each item draws one motif, back to front. `occludes: false` lets a motif be
 *   covered without covering anything itself — right for a stem, which should
 *   pass behind its leaves but not cut into them. `merge: true` unions the
 *   motif's own outlines into a single silhouette first, for shapes built from
 *   many overlapping pieces that are meant to read as one.
 * @param {{tolerance?: number}} [opts]
 */
export function layered(sk, items, opts = {}) {
  const tol = opts.tolerance || TOLERANCE;

  const layers = items.filter(Boolean).map((item) => {
    const spec = typeof item === 'function' ? { draw: item } : item;
    const elements = elementsOf(sk.capture(spec.draw), tol);
    return { spec, elements };
  });

  // Walk front to back, carrying everything already drawn in front as a mask.
  const painted = [];
  let mask = null;

  for (let i = layers.length - 1; i >= 0; i--) {
    const { spec, elements } = layers[i];
    let markup;

    if (spec.merge) {
      // The motif is many overlapping pieces meant to read as one shape: take
      // their union, and keep the open marks as drawn.
      const outline = unionOutline(silhouette(elements));
      const attrs = (elements.flatMap((el) => el.subs).find((s) => s.closed) || {}).attrs || '';
      const marks = elements.flatMap((el) => el.subs).filter((s) => !s.closed);
      const subs = outline.map((s) => ({ ...s, attrs })).concat(marks);
      markup = emit(mask ? clipOut(subs, mask) : subs);
    } else {
      markup = elements
        .map((el) => {
          if (el.opaque) return el.source;
          // Nothing in front of it: keep the original curves exactly as drawn.
          if (!mask || !boxesOverlap(el.bounds, mask.bounds)) return el.source;
          return emit(clipOut(el.subs, mask));
        })
        .join('');
    }

    painted.push(markup);

    if (spec.occludes !== false) {
      const polys = silhouette(elements);
      if (polys.length) mask = (mask || new Occluders()).add(polys);
    }
  }

  painted.reverse();
  for (const m of painted) sk.raw(m);
}
