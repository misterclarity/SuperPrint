/*
 * Page-bounds regression check.
 *
 * Artwork that strays off the sheet is invisible on screen (the SVG clips it)
 * but shows up as clipped or crossing lines once printed, so it is worth
 * asserting. Only absolute coordinates are inspected: elements inside a
 * <g transform> are group-local and legitimately negative, and rotation angles
 * and caption text would otherwise read as stray numbers.
 */

import { STYLES } from '../assets/js/gen/index.js';
import { buildSVG, PAPERS } from '../assets/js/core/render.js';
import { randomSeed } from '../assets/js/core/rng.js';

const TOLERANCE = 6; // user units ≈ 0.06in of stroke overhang
const FRAME_IDS = ['none', 'thin', 'double', 'rounded'];

function absoluteMarks(svg) {
  const body = svg
    .slice(svg.indexOf('stroke-linejoin'))
    .replace(/<text[\s\S]*?<\/text>/g, '')
    .replace(/<g[\s\S]*?<\/g>/g, '')
    .replace(/transform="[^"]*"/g, '');
  return body.match(/<(path|circle|ellipse|line|rect|polyline)[^>]*>/g) || [];
}

export default function run() {
  const failures = [];
  const table = {};

  for (const style of STYLES) {
    let worst = { over: -Infinity };

    for (const paper of Object.keys(PAPERS)) {
      const page = PAPERS[paper];
      const limit = Math.max(page.w, page.h);

      for (let i = 0; i < 20; i++) {
        const params = {
          style: style.id,
          seed: randomSeed(),
          complexity: (i % 5) + 1,
          paper,
          frame: FRAME_IDS[i % FRAME_IDS.length],
        };

        let lo = 0;
        let hi = 0;
        for (const mark of absoluteMarks(buildSVG(params))) {
          for (const value of (mark.match(/-?\d+(\.\d+)?/g) || []).map(Number)) {
            if (value < lo) lo = value;
            if (value > hi) hi = value;
          }
        }

        const over = +Math.max(-lo, hi - limit).toFixed(1);
        if (over > worst.over) worst = { over, paper, seed: params.seed, c: params.complexity };
        if (over > TOLERANCE) {
          failures.push(`${style.id} c=${params.complexity} ${paper} ${params.seed}: ${over} units off the sheet`);
        }
      }
    }

    table[style.id] = { 'worst overhang': worst.over, paper: worst.paper };
  }

  console.table(table);
  return failures;
}
