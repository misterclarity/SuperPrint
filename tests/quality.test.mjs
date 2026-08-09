/*
 * Composition scoring.
 *
 * Two things have to hold, and the second is the one that bites.
 *
 * 1. The sampler must read the SVG correctly — in particular it must apply
 *    group transforms. Several styles draw their motif once in local
 *    coordinates and re-emit it rotated about the page centre; a sampler that
 *    ignored `transform` would pile every point near the origin and the
 *    measurement would be quietly meaningless rather than obviously broken.
 *
 * 2. The score must not have an opinion about *shape*. The first version of
 *    this file scored ink coverage, which ranked every circular composition
 *    below every rectangular one: a disc inscribed in portrait paper can only
 *    cover about 78% of it, no matter how well drawn. Wired into "Surprise me",
 *    that would have silently deleted the rose windows. So there is a test
 *    below that scores a disc against a square and demands they come out close.
 */

import { STYLES } from '../assets/js/gen/index.js';
import { buildSVG, PAPERS, normalize } from '../assets/js/core/render.js';
import { samplePoints, measurePoints, scoreOf, measureDesign, pickBestSeed } from '../assets/js/core/quality.js';
import { randomSeed } from '../assets/js/core/rng.js';

const PAGE = { w: 850, h: 1100 };
const wrap = (body) =>
  `<svg viewBox="0 0 850 1100"><rect width="850" height="1100" fill="#ffffff"/>`
  + `<g fill="none" stroke="#141210" stroke-linejoin="round">${body}</g></svg>`;

/**
 * Closed polyline through `n` samples of a parametric outline.
 *
 * The disc and the rectangle below are both built this way, at the same sample
 * count, so the comparison between them is about shape and nothing else — a
 * four-segment rectangle would be measured from four midpoints and tell us
 * about the fixture rather than about the score.
 */
function outlinePath(at, n = 64) {
  const pt = (k) => {
    const { x, y } = at((k % n) / n);
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  };
  let d = `M${pt(0)}`;
  for (let k = 1; k <= n; k++) d += `L${pt(k)}`;
  return `<path d="${d}"/>`;
}

const ringPath = (cx, cy, r) =>
  outlinePath((t) => ({ x: cx + r * Math.cos(t * Math.PI * 2), y: cy + r * Math.sin(t * Math.PI * 2) }));

/** The same outline treatment for an axis-aligned box. */
const boxPath = (x0, y0, x1, y1) =>
  outlinePath((t) => {
    const w = x1 - x0;
    const h = y1 - y0;
    const p = t * 2 * (w + h);
    if (p < w) return { x: x0 + p, y: y0 };
    if (p < w + h) return { x: x1, y: y0 + (p - w) };
    if (p < 2 * w + h) return { x: x1 - (p - w - h), y: y1 };
    return { x: x0, y: y1 - (p - 2 * w - h) };
  });

export default function run() {
  const failures = [];
  const table = {};

  /* -- 1. group transforms are applied ------------------------------------ */
  {
    // The same short stroke, drawn once at the top-left and once inside a group
    // that rotates it half a turn about the page centre. If transforms are
    // honoured the two samples sit on opposite sides; if not, they coincide.
    const local = '<path d="M100 100L140 140"/>';
    const rotated = `<g transform="rotate(180 425 550)">${local}</g>`;
    const pts = samplePoints(wrap(local + rotated));
    const xs = pts.map((p) => p.x);
    const spread = Math.max(...xs) - Math.min(...xs);
    table['group transforms'] = { 'x spread': spread.toFixed(0) };
    if (spread < 500) {
      failures.push(
        `samplePoints ignores group transforms: a stroke and its 180°-rotated `
        + `copy span only ${spread.toFixed(0)} units, expected ~610.`,
      );
    }
  }

  /* -- 2. a disc is not punished for being round -------------------------- */
  {
    const inset = 0.06;
    const disc = measurePoints(samplePoints(wrap(ringPath(425, 550, 425 * (1 - inset)))), PAGE);
    const square = measurePoints(samplePoints(wrap(boxPath(60, 60, 790, 1040))), PAGE);
    const dScore = scoreOf(disc);
    const sScore = scoreOf(square);
    table['disc vs rectangle'] = {
      disc: dScore.toFixed(3),
      rectangle: sScore.toFixed(3),
      gap: (sScore - dScore).toFixed(3),
    };
    if (sScore - dScore > 0.1) {
      failures.push(
        `the score penalises round compositions: a full-width disc scores `
        + `${dScore.toFixed(3)} against ${sScore.toFixed(3)} for a rectangle. `
        + `A disc that fills the sheet's width is as large as it can be — this is `
        + `the coverage bias that would delete the rose windows from Stained Glass.`,
      );
    }
  }

  /* -- 3. a lopsided page scores below a balanced one --------------------- */
  {
    // Same ink, same amount, once spread over the sheet and once crammed into
    // the top-left quadrant. This is the defect the filter exists to catch.
    let spread = '';
    let crammed = '';
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        spread += `<path d="M${80 + c * 130} ${80 + r * 175}L${140 + c * 130} ${140 + r * 175}"/>`;
        crammed += `<path d="M${80 + c * 55} ${80 + r * 70}L${110 + c * 55} ${110 + r * 70}"/>`;
      }
    }
    const a = scoreOf(measurePoints(samplePoints(wrap(spread)), PAGE));
    const b = scoreOf(measurePoints(samplePoints(wrap(crammed)), PAGE));
    table['balanced vs lopsided'] = { balanced: a.toFixed(3), lopsided: b.toFixed(3) };
    if (!(a > b + 0.15)) {
      failures.push(
        `the score fails to separate a balanced page (${a.toFixed(3)}) from one `
        + `crammed into a corner (${b.toFixed(3)}); it should score the balanced one clearly higher.`,
      );
    }
  }

  /* -- 4. every real style measures sanely -------------------------------- */
  {
    const rows = {};
    for (const style of STYLES) {
      let worst = Infinity;
      let worstSeed = '';
      let minExtent = Infinity;
      for (let i = 0; i < 6; i++) {
        const seed = randomSeed();
        const m = measureDesign({ style: style.id, seed, complexity: 3 });
        if (m.score < worst) {
          worst = m.score;
          worstSeed = seed;
        }
        minExtent = Math.min(minExtent, m.extent);
        if (!(m.score >= 0 && m.score <= 1)) {
          failures.push(`${style.id} ${seed}: score ${m.score} outside [0, 1]`);
        }
        if (!m.ink) failures.push(`${style.id} ${seed}: no ink sampled at all`);
      }
      rows[style.id] = { 'worst score': worst.toFixed(3), 'min extent': minExtent.toFixed(2) };
      // Every style is meant to fill the page. A style that never reaches even
      // two thirds of the sheet means the sampler is missing its geometry.
      if (minExtent < 0.66) {
        failures.push(
          `${style.id}: extent falls to ${minExtent.toFixed(2)} (worst seed ${worstSeed}) — `
          + `either the style leaves the sheet mostly empty or the sampler cannot read its output.`,
        );
      }
    }
    console.table(rows);
  }

  /* -- 5. pickBestSeed returns a real seed, and the best of its pool ------- */
  {
    const style = 'frostfield';
    const pool = Array.from({ length: 5 }, () => randomSeed());
    const chosen = pickBestSeed({ style, complexity: 3 }, { seeds: pool });
    if (!pool.includes(chosen)) {
      failures.push(`pickBestSeed returned "${chosen}", which is not one of the seeds it was given.`);
    } else {
      const scores = pool.map((seed) => measureDesign({ style, seed }).score);
      const best = pool[scores.indexOf(Math.max(...scores))];
      table['pickBestSeed'] = { chosen, 'is best of pool': String(chosen === best) };
      if (chosen !== best) {
        failures.push(`pickBestSeed chose "${chosen}" but "${best}" scored higher in the same pool.`);
      }
    }

    // The chosen seed must still be an ordinary seed: same page, every time.
    const p = { style, seed: chosen, complexity: 3 };
    if (buildSVG(normalize(p)) !== buildSVG(normalize(p))) {
      failures.push('a seed chosen by pickBestSeed does not redraw identically.');
    }
  }

  /* -- 6. the time budget is respected ------------------------------------ */
  {
    // Contours is the most expensive style; a budget must still bound it.
    const t0 = Date.now();
    pickBestSeed({ style: 'contours', complexity: 5 }, { budgetMs: 60, max: 40 });
    const spent = Date.now() - t0;
    table['budget (60ms, contours)'] = { spent: `${spent} ms` };
    // Two candidates are always judged, so the ceiling is the budget plus one
    // more measurement; allow generous headroom for a loaded CI box.
    if (spent > 800) {
      failures.push(`pickBestSeed overran its 60ms budget badly: took ${spent}ms.`);
    }
  }

  console.table(table);
  return failures;
}
