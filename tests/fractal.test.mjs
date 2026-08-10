/*
 * Recursion has to stop before the pen runs out.
 *
 * This is the one failure mode a fractal has, and it is not subtle: every one
 * of these figures multiplies its detail two- or three-fold per level, so a
 * single level too many turns the whole thing into a solid black lump. The
 * guard is that each family works out how deep it can go from the size of its
 * own smallest feature against the widest pen on offer, and asking for more
 * than that is simply ignored.
 *
 * So the assertion is: past the ceiling, asking for more changes nothing. If a
 * cap were dropped, output would keep growing with the request and this fails.
 * It is checked against `refStroke`, not the pen in use, because the ceiling
 * must not move when someone switches to a fine nib — that would make the line
 * weight change the drawing, which tests/line-weight.test.mjs forbids.
 */

import { FIGURES } from '../assets/js/gen/fractal.js';
import { Sketch } from '../assets/js/core/sketch.js';
import { WEIGHTS } from '../assets/js/core/render.js';
import { makeRng } from '../assets/js/core/rng.js';

const REFERENCE_STROKE = Math.max(...Object.values(WEIGHTS).map((w) => w.value));
const PAGE = { w: 850, h: 1100 };
const BOX = { x: 80, y: 80, w: 690, h: 940 };

/** Draw one figure at a given requested depth and return its markup. */
function render(name, want, { stroke = 2.8, box = BOX, seed = 'fractal-check' } = {}) {
  const sk = new Sketch({ width: PAGE.w, height: PAGE.h, stroke, refStroke: REFERENCE_STROKE });
  FIGURES[name](sk, box, want, makeRng(seed));
  return sk.parts.join('');
}

export default function run() {
  const failures = [];
  const table = {};

  for (const name of Object.keys(FIGURES)) {
    /* -- 1. the depth cap binds -------------------------------------------- */
    // Far past any sane request. If output still grows, nothing is capping it.
    const atCeiling = render(name, 40);
    const wayPast = render(name, 60);
    const capped = atCeiling === wayPast;

    /* -- 2. but the request is honoured below the ceiling ------------------- */
    // A figure that ignored its depth argument would also pass the test above.
    const shallow = render(name, 1);
    const responds = shallow !== atCeiling && shallow.length < atCeiling.length;

    /* -- 3. the ceiling is set by the room available ------------------------ */
    /*
     * The sharp end of this suite. "Output stops growing" is also true of a
     * depth hard-coded to some number, which is not a guard at all — it would
     * still fill in solid on a small tile, or stop short on a big sheet. What
     * has to hold is that the limit tracks the space: the same figure asked for
     * the same depth in a quarter-size box must come out with fewer levels, not
     * the same levels drawn smaller.
     */
    const tokens = (s) => (s.match(/-?\d+\.?\d*/g) || []).length;
    const smallBox = { x: BOX.x, y: BOX.y, w: BOX.w / 4, h: BOX.h / 4 };
    const inSmall = render(name, 40, { box: smallBox });
    const scales = tokens(inSmall) < tokens(atCeiling) * 0.75;

    /* -- 4. the pen does not move the ceiling ------------------------------- */
    // Same geometry at every weight: only stroke-width may differ.
    const strip = (s) => s.replace(/\s*stroke-width="[^"]*"/g, '');
    const weights = Object.values(WEIGHTS).map((w) => strip(render(name, 40, { stroke: w.value })));
    const penStable = weights.every((w) => w === weights[0]);

    table[name] = {
      'at cap': `${(atCeiling.length / 1024).toFixed(1)}KB`,
      capped: String(capped),
      'depth 1': `${(shallow.length / 1024).toFixed(1)}KB`,
      responds: String(responds),
      'small box': `${tokens(inSmall)} vs ${tokens(atCeiling)} numbers`,
      scales: String(scales),
      'pen-stable': String(penStable),
    };

    if (!capped) {
      failures.push(
        `${name}: recursion is not capped — depth 40 gives ${atCeiling.length} chars and depth 60 gives `
        + `${wayPast.length}. Unbounded recursion fills the figure in solid.`,
      );
    }
    if (!responds) {
      failures.push(
        `${name}: the depth argument does nothing — depth 1 and depth 40 both give `
        + `${shallow.length} chars. The cap is swallowing the request entirely.`,
      );
    }
    if (!scales) {
      failures.push(
        `${name}: the depth limit ignores how much room there is — a quarter-size box still draws `
        + `${tokens(inSmall)} coordinates against ${tokens(atCeiling)} at full size. A limit that does not `
        + `track the available space is a hard-coded number, and will fill in solid on a small tile.`,
      );
    }
    if (!penStable) {
      failures.push(
        `${name}: the recursion depth follows the pen in use, so choosing a finer nib redraws the `
        + `figure. Depth must be judged against refStroke.`,
      );
    }

    /* -- 5. nothing degenerate -------------------------------------------- */
    if (/NaN|Infinity|undefined/.test(atCeiling)) {
      failures.push(`${name}: emitted a non-finite coordinate`);
    }

    /* -- 6. same input, same drawing --------------------------------------- */
    if (render(name, 6) !== render(name, 6)) failures.push(`${name}: not deterministic`);

    /* -- 7. stays on the page ---------------------------------------------- */
    // Figures are handed a box and must keep inside it; several fit themselves
    // to it after the fact, which is exactly where an off-by-one escapes.
    let strayed = false;
    for (const el of atCeiling.match(/<[^>]+>/g) || []) {
      for (const [, x, y] of el.matchAll(/(-?\d+\.?\d*)[ ,](-?\d+\.?\d*)/g)) {
        if (Number(x) < -1 || Number(x) > PAGE.w + 1 || Number(y) < -1 || Number(y) > PAGE.h + 1) {
          strayed = true;
        }
      }
    }
    if (strayed) failures.push(`${name}: drew outside the page`);
  }

  console.table(table);
  return failures;
}
