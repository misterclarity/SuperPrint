#!/usr/bin/env node
/* Test runner: `npm test` (or `node tests/run.mjs`). No dependencies. */

import generators from './generators.test.mjs';
import bounds from './bounds.test.mjs';
import closedShapes from './closed-shapes.test.mjs';
import lineWeight from './line-weight.test.mjs';
import quality from './quality.test.mjs';
import clip from './clip.test.mjs';
import fractal from './fractal.test.mjs';
import pwa from './pwa.test.mjs';

const suites = [
  ['generators', generators],
  ['page bounds', bounds],
  ['closed shapes', closedShapes],
  ['line weight', lineWeight],
  ['composition scoring', quality],
  ['clipping and layering', clip],
  ['fractal depth limits', fractal],
  ['offline & installable', pwa],
];

let total = 0;
for (const [name, run] of suites) {
  console.log(`\n— ${name} —`);
  const failures = run();
  total += failures.length;
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.log(failures.length ? `  ${failures.length} failure(s)` : '  ✓ passed');
}

console.log(total ? `\n${total} failure(s)\n` : '\nAll suites passed\n');
process.exit(total ? 1 : 0);
