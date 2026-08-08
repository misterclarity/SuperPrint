/*
 * Line weight must change only how thick the ink is — never what is drawn.
 *
 * It is easy to break: a generator reads sk.stroke to decide whether some
 * detail is legible, and now the choice of pen changes the geometry. Worse, if
 * that decision consumes a different number of random draws, everything after
 * it shifts and the page looks like a different seed entirely.
 *
 * So: render each design at every weight, strip the stroke-width attributes,
 * and require what remains to be identical.
 */

import { STYLES } from '../assets/js/gen/index.js';
import { buildSVG, WEIGHTS } from '../assets/js/core/render.js';
import { randomSeed } from '../assets/js/core/rng.js';

const WEIGHT_IDS = Object.keys(WEIGHTS);

/** The drawing, with every trace of pen thickness removed. */
function geometryOf(svg) {
  return svg.replace(/\s*stroke-width="[^"]*"/g, '');
}

export default function run() {
  const failures = [];
  const table = {};

  for (const style of STYLES) {
    let checked = 0;

    for (let complexity = 1; complexity <= 5; complexity++) {
      for (let i = 0; i < 4; i++) {
        const base = { style: style.id, seed: randomSeed(), complexity, paper: 'letter' };
        const reference = geometryOf(buildSVG({ ...base, weight: WEIGHT_IDS[0] }));

        for (const weight of WEIGHT_IDS.slice(1)) {
          const other = geometryOf(buildSVG({ ...base, weight }));
          checked++;
          if (other === reference) continue;

          // Point at the first divergence — far more useful than "differs".
          let at = 0;
          while (at < reference.length && reference[at] === other[at]) at++;
          failures.push(
            `${style.id} c=${complexity} ${base.seed}: geometry changes between `
            + `"${WEIGHT_IDS[0]}" and "${weight}" at char ${at}\n`
            + `      ${WEIGHT_IDS[0]}: …${reference.slice(Math.max(0, at - 30), at + 50)}\n`
            + `      ${weight}: …${other.slice(Math.max(0, at - 30), at + 50)}`,
          );
          break;
        }
      }
    }

    table[style.id] = { 'weight pairs compared': checked };
  }

  console.table(table);
  return failures;
}
