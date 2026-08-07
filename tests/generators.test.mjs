/*
 * Smoke tests for every generator across every setting combination.
 *
 * Generators are pure string builders with no DOM dependency, so they can be
 * exercised directly in Node — no browser or test framework required.
 */

import { STYLES } from '../assets/js/gen/index.js';
import { buildSVG, PAPERS, WEIGHTS, FRAMES } from '../assets/js/core/render.js';
import { randomSeed, makeRng } from '../assets/js/core/rng.js';

const PAPER_IDS = Object.keys(PAPERS);
const WEIGHT_IDS = Object.keys(WEIGHTS);
const FRAME_IDS = Object.keys(FRAMES);
const MIN_MARKS = 12;

export default function run() {
  const failures = [];
  const table = {};

  for (const style of STYLES) {
    let min = Infinity;
    let max = 0;
    let ms = 0;
    let n = 0;

    for (let complexity = 1; complexity <= 5; complexity++) {
      for (let i = 0; i < 8; i++) {
        const params = {
          style: style.id,
          seed: randomSeed(),
          complexity,
          paper: PAPER_IDS[(i + complexity) % PAPER_IDS.length],
          weight: WEIGHT_IDS[i % WEIGHT_IDS.length],
          frame: FRAME_IDS[i % FRAME_IDS.length],
          caption: true,
        };

        const started = Date.now();
        let svg;
        try {
          svg = buildSVG(params);
        } catch (err) {
          failures.push(`${style.id} ${params.seed} threw: ${err.message}`);
          continue;
        }
        ms += Date.now() - started;
        n++;

        if (!svg.startsWith('<svg') || !svg.trimEnd().endsWith('</svg>')) {
          failures.push(`${style.id} ${params.seed}: malformed SVG document`);
        }

        const drawing = svg.replace(/<text[\s\S]*?<\/text>/g, '');
        const broken = drawing.match(/NaN|Infinity|undefined/);
        if (broken) failures.push(`${style.id} ${params.seed}: emitted "${broken[0]}"`);

        const marks = (svg.match(/<(path|circle|ellipse|line|rect|polyline)\b/g) || []).length;
        if (marks < MIN_MARKS) {
          failures.push(`${style.id} c=${complexity} ${params.seed}: only ${marks} marks`);
        }
        min = Math.min(min, marks);
        max = Math.max(max, marks);
      }
    }

    table[style.id] = { marks: `${min}-${max}`, 'avg ms': +(ms / n).toFixed(1) };
  }

  // The same inputs must always produce byte-identical output: shared links and
  // saved designs depend on it.
  for (const style of STYLES) {
    const params = { style: style.id, seed: 'determinism-check', complexity: 4 };
    if (buildSVG(params) !== buildSVG(params)) failures.push(`${style.id}: not deterministic`);
  }

  // Seeds must be well-formed and reasonably collision-free.
  const rng = makeRng('seed-quality');
  const seeds = new Set(Array.from({ length: 400 }, () => randomSeed()));
  if (seeds.size < 380) failures.push(`randomSeed collides too often: ${seeds.size}/400 unique`);
  for (const s of seeds) {
    if (!/^[a-z]+-[a-z]+-\d{3}$/.test(s)) { failures.push(`malformed seed: ${s}`); break; }
  }
  void rng;

  console.table(table);
  return failures;
}
