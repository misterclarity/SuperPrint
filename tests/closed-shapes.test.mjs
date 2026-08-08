/*
 * Colourable-region check for the crystal styles.
 *
 * A bare stroke encloses no area, so there is nothing to put colour into. Frost
 * Field must therefore be built entirely from closed outlines: no <line>
 * elements, and every <path> ending in a Z. This is easy to regress — reaching
 * for sk.line() is the natural way to draw a snowflake arm — so it is asserted.
 */

import { buildSVG, PAPERS } from '../assets/js/core/render.js';
import { randomSeed } from '../assets/js/core/rng.js';

const CLOSED_ONLY = ['frostfield'];

export default function run() {
  const failures = [];
  const table = {};

  for (const style of CLOSED_ONLY) {
    let paths = 0;
    let shapes = 0;

    for (const paper of Object.keys(PAPERS)) {
      for (let complexity = 1; complexity <= 5; complexity++) {
        for (let i = 0; i < 4; i++) {
          const params = { style, seed: randomSeed(), complexity, paper, frame: 'none', caption: false };
          const svg = buildSVG(params);
          const where = `${style} c=${complexity} ${paper} ${params.seed}`;

          const lines = (svg.match(/<line\b/g) || []).length;
          if (lines) failures.push(`${where}: ${lines} bare <line> element(s) — not colourable`);

          const ds = [...svg.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
          for (const d of ds) {
            paths++;
            if (!d.trimEnd().endsWith('Z')) {
              failures.push(`${where}: unclosed path "${d.slice(0, 44)}…"`);
              break;
            }
          }

          const marks = (svg.match(/<(path|circle|ellipse|rect|polygon)\b/g) || []).length;
          shapes += marks;
          // A flake made of nothing would trivially satisfy "all closed".
          if (marks < 20) failures.push(`${where}: only ${marks} shapes`);
        }
      }
    }

    table[style] = { 'closed paths checked': paths, 'total shapes': shapes };
  }

  console.table(table);
  return failures;
}
