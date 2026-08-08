#!/usr/bin/env node
/* Test runner: `npm test` (or `node tests/run.mjs`). No dependencies. */

import generators from './generators.test.mjs';
import bounds from './bounds.test.mjs';
import closedShapes from './closed-shapes.test.mjs';

const suites = [
  ['generators', generators],
  ['page bounds', bounds],
  ['closed shapes', closedShapes],
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
