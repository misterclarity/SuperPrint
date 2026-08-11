/*
 * Path flattening, polygon clipping and layering.
 *
 * These three sit underneath the drawing rather than beside it: a generator
 * cannot see that the clipper dropped an edge it should have kept, it just
 * quietly produces a slightly wrong picture. So the cases here are ones with
 * answers known in advance — a square, a disc, two bars in a cross — where the
 * right perimeter can be written down and checked to three decimal places.
 *
 * The awkward cases are the point. Coincident edges, shapes that merely touch
 * at a corner, a subject entirely swallowed, a subject entirely clear: these
 * are where clippers go wrong, and each one is pinned down below.
 */

import { flattenPath, parseFragment, ellipsePoints, TOLERANCE } from '../assets/js/core/path.js';
import { clipOut, unionOutline } from '../assets/js/core/clip.js';
import { layered } from '../assets/js/core/layer.js';
import { Sketch } from '../assets/js/core/sketch.js';
import { polyArea } from '../assets/js/core/util.js';

const box = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

function lengthOf(sub) {
  const n = sub.points.length;
  const segs = sub.closed ? n : n - 1;
  let len = 0;
  for (let i = 0; i < segs; i++) {
    const a = sub.points[i];
    const b = sub.points[(i + 1) % n];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}
const totalLength = (subs) => subs.reduce((sum, s) => sum + lengthOf(s), 0);

function pointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

export default function run() {
  const failures = [];
  const table = {};

  const near = (label, got, want, tol, note) => {
    table[label] = { got: got.toFixed(3), want: want.toFixed(3) };
    if (Math.abs(got - want) > tol) {
      failures.push(`${label}: got ${got.toFixed(4)}, expected ${want.toFixed(4)}${note ? ` — ${note}` : ''}`);
    }
  };

  /* -- 1. flattening is faithful ------------------------------------------ */
  {
    // A circle written as two arcs. Every sample must land on it exactly.
    const sub = flattenPath('M100 50A50 50 0 1 1 100 150A50 50 0 1 1 100 50Z')[0];
    let worst = 0;
    for (const p of sub.points) worst = Math.max(worst, Math.abs(Math.hypot(p.x - 100, p.y - 100) - 50));
    table['arc radius error'] = { got: worst.toExponential(1), want: '0' };
    if (worst > 1e-9) failures.push(`flattened arc drifts off its circle by ${worst}`);
    if (!sub.closed) failures.push('a path ending in Z did not come back closed');

    // An inscribed polygon is a little short; how short says whether the
    // sampling honoured the tolerance.
    const n = sub.points.length;
    near('circle perimeter', lengthOf(sub), 2 * Math.PI * 50, 1.0);
    near('circle area', polyArea(sub.points), Math.PI * 2500, 60);

    /*
     * The chords must stay within the stated tolerance of the true curve. One
     * curve proves nothing about a subdivision rule, so this checks a spread of
     * shapes: a gentle arc, a deep U, an S, a cusp where the controls cross,
     * and a hairpin whose endpoints nearly coincide.
     */
    const curves = [
      ['gentle', [0, 0, 40, 60, 160, 60, 200, 0]],
      ['deep U', [0, 0, 0, 300, 300, 300, 300, 0]],
      ['S bend', [0, 0, 300, 0, -100, 200, 200, 200]],
      ['cusp', [0, 0, 200, 200, 0, 200, 200, 0]],
      ['hairpin', [100, 0, 400, 300, -200, 300, 101, 1]],
      ['tiny', [0, 0, 0.3, 0.6, 1.2, 0.6, 1.5, 0]],
    ];
    let worstSag = 0;
    let worstAt = '';
    for (const [label, [ax, ay, bx, by, cx2, cy2, dx2, dy2]] of curves) {
      const pts = flattenPath(`M${ax} ${ay}C${bx} ${by} ${cx2} ${cy2} ${dx2} ${dy2}`)[0].points;
      const at = (t) => {
        const u = 1 - t;
        return {
          x: u * u * u * ax + 3 * u * u * t * bx + 3 * u * t * t * cx2 + t * t * t * dx2,
          y: u * u * u * ay + 3 * u * u * t * by + 3 * u * t * t * cy2 + t * t * t * dy2,
        };
      };
      /*
       * Measured as: how far does the true curve stray from the polyline we
       * drew? Taking it in this direction makes each sample exact, because the
       * distance to a segment is a closed form. Comparing chord midpoints
       * against a sampled curve instead — the obvious way round — measures the
       * spacing of the reference samples as much as the flattening, and reports
       * an error two or three times the real one.
       */
      let sag = 0;
      for (let k = 0; k <= 20000; k++) {
        const c = at(k / 20000);
        let best = Infinity;
        for (let i = 1; i < pts.length; i++) {
          const d = pointToSegment(c, pts[i - 1], pts[i]);
          if (d < best) best = d;
        }
        if (best > sag) sag = best;
      }
      if (sag > worstSag) {
        worstSag = sag;
        worstAt = label;
      }
    }
    table['worst cubic chord error'] = { got: `${worstSag.toFixed(4)} (${worstAt})`, want: `< ${TOLERANCE}` };
    if (worstSag > TOLERANCE) {
      failures.push(`cubic flattening exceeds its tolerance on the "${worstAt}" curve: ${worstSag.toFixed(4)} > ${TOLERANCE}`);
    }
    table['circle samples'] = { got: String(n), want: '—' };
  }

  /* -- 2. markup reads back correctly ------------------------------------- */
  {
    // A stroke and the same stroke rotated half a turn about (5,5).
    const subs = parseFragment('<path d="M0 0L2 0" stroke-width="1.7"/><g transform="rotate(180 5 5)"><path d="M0 0L2 0"/></g>');
    if (subs.length !== 2) failures.push(`parseFragment found ${subs.length} subpaths, expected 2`);
    else {
      const [a, b] = subs;
      near('rotated copy x', b.points[0].x, 10, 1e-9, 'group transforms are not being applied');
      near('rotated copy y', b.points[0].y, 10, 1e-9);
      // The pen must survive: `\b` in the attribute filter used to eat the
      // "width" out of "stroke-width" and silently reset every shape.
      table['pen preserved'] = { got: JSON.stringify(a.attrs), want: '" stroke-width=\\"1.7\\""' };
      if (!/stroke-width="1\.7"/.test(a.attrs)) {
        failures.push(`presentational attributes were mangled: ${JSON.stringify(a.attrs)}`);
      }
      if (/\bd=|transform=/.test(a.attrs)) failures.push(`geometry leaked into attrs: ${a.attrs}`);
    }
  }

  /* -- 3. union: known perimeters ----------------------------------------- */
  {
    // Two 100-squares overlapping by half make a 150x100 rectangle.
    near('union: half-overlapping squares', totalLength(unionOutline([box(0, 0, 100, 100), box(50, 0, 100, 100)])), 500, 1e-6,
      'the shared collinear edge is probably being emitted by both squares');
    // Identical squares are the degenerate case of the same thing.
    near('union: identical squares', totalLength(unionOutline([box(0, 0, 100, 100), box(0, 0, 100, 100)])), 400, 1e-6);
    near('union: disjoint squares', totalLength(unionOutline([box(0, 0, 100, 100), box(200, 0, 100, 100)])), 800, 1e-6);
    near('union: nested squares', totalLength(unionOutline([box(0, 0, 100, 100), box(25, 25, 50, 50)])), 400, 1e-6);
    near('union: corner-touching squares', totalLength(unionOutline([box(0, 0, 100, 100), box(100, 100, 100, 100)])), 800, 1e-6);
    // A plus sign: four arms of three 40-unit sides.
    near('union: crossed bars', totalLength(unionOutline([box(0, 40, 120, 40), box(40, 0, 40, 120)])), 480, 1e-6);

    // Two discs of radius 50 with centres 50 apart: each keeps 240° of its rim.
    const discs = unionOutline([ellipsePoints(0, 0, 50, 50), ellipsePoints(50, 0, 50, 50)]);
    near('union: two overlapping discs', totalLength(discs), (2 / 3) * 2 * Math.PI * 50 * 2, 1.0);
    if (discs.length !== 1 || !discs[0].closed) {
      failures.push(`two overlapping discs should union to one closed ring, got ${discs.length} ring(s), closed=${discs.map((d) => d.closed)}`);
    }
  }

  /* -- 4. clipping away what is hidden ------------------------------------ */
  {
    const through = [{ points: [{ x: -50, y: 50 }, { x: 150, y: 50 }], closed: false }];
    near('clip: line crossing a square', totalLength(clipOut(through, [box(0, 0, 100, 100)])), 100, 1e-6);

    const swallowed = [{ points: [{ x: 10, y: 50 }, { x: 90, y: 50 }], closed: false }];
    const left = clipOut(swallowed, [box(0, 0, 100, 100)]);
    table['clip: line wholly inside'] = { got: `${left.length} runs`, want: '0 runs' };
    if (left.length) failures.push('a line entirely inside an occluder was not removed');

    const clear = [{ points: [{ x: -50, y: -50 }, { x: -10, y: -50 }], closed: false }];
    near('clip: line clear of the square', totalLength(clipOut(clear, [box(0, 0, 100, 100)])), 40, 1e-6);

    // A square with one corner covered loses exactly the two half-edges there.
    const once = clipOut([{ points: box(0, 0, 100, 100), closed: true }], [box(50, 50, 100, 100)]);
    near('clip: square with a covered corner', totalLength(once), 300, 1e-6);

    // Clipping again against the same occluder must change nothing.
    const twice = clipOut(once, [box(50, 50, 100, 100)]);
    table['clip: idempotent'] = { got: totalLength(twice).toFixed(3), want: totalLength(once).toFixed(3) };
    if (Math.abs(totalLength(twice) - totalLength(once)) > 1e-9) {
      failures.push('clipping twice against the same occluder changed the result');
    }

    /*
     * Inverted: keep what falls inside. This is what confines a marking to the
     * animal it is painted on, and the two halves must partition the subject —
     * whatever one keeps, the other drops, and together they account for all of
     * it and none of it twice.
     */
    const outside = clipOut(through, [box(0, 0, 100, 100)]);
    const inside = clipOut(through, [box(0, 0, 100, 100)], { inside: true });
    near('clip inside: line crossing a square', totalLength(inside), 100, 1e-6);
    table['clip: inside + outside'] = {
      got: (totalLength(inside) + totalLength(outside)).toFixed(3),
      want: '200.000',
    };
    if (Math.abs(totalLength(inside) + totalLength(outside) - 200) > 1e-6) {
      failures.push(
        `keeping the inside and keeping the outside do not partition the subject: `
        + `${totalLength(inside).toFixed(3)} + ${totalLength(outside).toFixed(3)} ≠ 200`,
      );
    }
    const clearInside = clipOut(clear, [box(0, 0, 100, 100)], { inside: true });
    if (clearInside.length) {
      failures.push('a line entirely clear of the shape survived an inside-clip');
    }
    const swallowedInside = clipOut(swallowed, [box(0, 0, 100, 100)], { inside: true });
    near('clip inside: line wholly within', totalLength(swallowedInside), 80, 1e-6);

    // Clipping can only ever remove ink, never invent it.
    const before = totalLength([{ points: box(0, 0, 100, 100), closed: true }]);
    if (totalLength(once) > before + 1e-9) failures.push('clipping produced more ink than it started with');
  }

  /* -- 5. layering, end to end -------------------------------------------- */
  {
    const pen = { width: 200, height: 200, stroke: 2, refStroke: 2 };
    const ink = (fn) => {
      const sk = new Sketch(pen);
      fn(sk);
      return totalLength(parseFragment(sk.parts.join('')));
    };

    // A disc drawn over the middle of a long line hides the covered stretch.
    const plain = ink((sk) => {
      sk.path('M0 100L200 100');
      sk.circle(100, 100, 30);
    });
    const stacked = ink((sk) => layered(sk, [
      (s) => s.path('M0 100L200 100'),
      (s) => s.circle(100, 100, 30),
    ]));
    table['layering removes hidden ink'] = { got: stacked.toFixed(1), want: `${(plain - 60).toFixed(1)}` };
    if (Math.abs(stacked - (plain - 60)) > 0.5) {
      failures.push(`layering should have hidden the 60 units of line under the disc: ${plain.toFixed(2)} → ${stacked.toFixed(2)}`);
    }

    // `occludes: false` means a shape is drawn but hides nothing.
    const transparent = ink((sk) => layered(sk, [
      (s) => s.path('M0 100L200 100'),
      { draw: (s) => s.circle(100, 100, 30), occludes: false },
    ]));
    if (Math.abs(transparent - plain) > 1e-6) {
      failures.push(`a layer marked occludes:false still hid something: ${plain.toFixed(2)} → ${transparent.toFixed(2)}`);
    }

    // Order matters: put the line in front and nothing is lost.
    const inFront = ink((sk) => layered(sk, [
      (s) => s.circle(100, 100, 30),
      (s) => s.path('M0 100L200 100'),
    ]));
    if (inFront < plain - 1e-6) {
      failures.push(`the front-most layer was clipped by something behind it: ${inFront.toFixed(2)} < ${plain.toFixed(2)}`);
    }

    // `merge: true` fuses a motif's own outlines into one silhouette. Three
    // discs in a row, each overlapping its neighbour, become a single ring.
    const merged = (() => {
      const sk = new Sketch(pen);
      layered(sk, [{
        merge: true,
        draw: (s) => { for (let i = 0; i < 3; i++) s.circle(70 + i * 30, 100, 25); },
      }]);
      return parseFragment(sk.parts.join(''));
    })();
    table['merge fuses outlines'] = { got: `${merged.length} ring(s)`, want: '1 ring(s)' };
    if (merged.length !== 1 || !merged[0].closed) {
      failures.push(`merge should fuse three overlapping discs into one closed ring, got ${merged.length}`);
    } else if (totalLength(merged) >= 3 * 2 * Math.PI * 25) {
      failures.push('merge kept the full perimeter of all three discs — nothing was fused');
    }

    // Untouched geometry keeps its curves rather than being flattened, which is
    // what stops clipping from bloating every page it is used on.
    const sk = new Sketch(pen);
    layered(sk, [(s) => s.path('M10 10Q50 90 90 10'), (s) => s.circle(180, 180, 5)]);
    const markup = sk.parts.join('');
    table['untouched curves kept'] = { got: /Q50 90/.test(markup) ? 'yes' : 'no', want: 'yes' };
    if (!/Q50 90/.test(markup)) failures.push('a shape nothing overlapped was needlessly flattened to a polyline');
  }

  console.table(table);
  return failures;
}
