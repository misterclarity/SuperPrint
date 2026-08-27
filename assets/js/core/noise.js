/*
 * Gradient noise — the one piece of p5's vocabulary this site had no answer to.
 *
 * Everything here is generated from smooth analytic fields: sums of Gaussians,
 * trigonometry, recursion. Those give you symmetry and repetition, which is most
 * of what a colouring page wants, but they cannot give you the other thing —
 * a field that wanders without ever repeating, and is smooth at every scale.
 * That is what noise is for, and it is why `noise()` is the function generative
 * sketches reach for first.
 *
 * This is Perlin's gradient noise rather than p5's own implementation. Same
 * shape of API (`noiseDetail`'s octaves and falloff become options here), same
 * [0, 1] range, but gradient noise has no axis-aligned grain, which shows
 * immediately when you use the field for directions rather than heights.
 *
 * Seeded from the page's own RNG, so a noise field is as reproducible as
 * everything else: the same seed is the same field forever.
 */

/** 6t⁵ − 15t⁴ + 10t³ — Perlin's improved fade, smooth in its second derivative. */
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const lerp = (a, b, t) => a + (b - a) * t;

/*
 * Eight gradient directions rather than random vectors.
 *
 * A small fixed set keeps the field free of the clumping you get when random
 * gradients happen to agree, and the diagonals stop the result from favouring
 * the axes — which, in a field being read as directions, would show up as
 * ribbons that all want to run horizontally.
 */
const GRAD = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];

/**
 * A seeded 2D noise field.
 *
 * @param {object} rng          the page's RNG, so the field is part of the seed
 * @param {number} [octaves]    layers of detail — p5's `noiseDetail` first
 *   argument. Each octave is twice the frequency and a fraction of the
 *   amplitude, which is what makes the result look like terrain rather than
 *   like a lava lamp.
 * @param {number} [falloff]    how much each octave contributes, as p5's second
 *   argument. Above about 0.6 the fine detail starts to dominate and the field
 *   stops being smooth enough to trace a line along.
 * @returns {(x: number, y: number) => number} field value in [0, 1]
 */
export function makeNoise(rng, { octaves = 4, falloff = 0.5 } = {}) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates, from the seeded source.
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const dot = (hash, x, y) => {
    const g = GRAD[hash & 7];
    return g[0] * x + g[1] * y;
  };

  function single(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];

    return lerp(
      lerp(dot(aa, xf, yf), dot(ba, xf - 1, yf), u),
      lerp(dot(ab, xf, yf - 1), dot(bb, xf - 1, yf - 1), u),
      v,
    );
  }

  // Each octave is offset so the layers do not line up their zero crossings,
  // which would leave a visible grid of still points in the field.
  const shift = Array.from({ length: octaves }, () => ({ x: rng.range(0, 128), y: rng.range(0, 128) }));

  return function noise(x, y) {
    let total = 0;
    let amp = 1;
    let freq = 1;
    let max = 0;
    for (let o = 0; o < octaves; o++) {
      total += single(x * freq + shift[o].x, y * freq + shift[o].y) * amp;
      max += amp;
      amp *= falloff;
      freq *= 2;
    }
    // Perlin's 2D range is about ±0.707, so the sum is rescaled rather than
    // simply halved — otherwise the field never reaches its own extremes and
    // everything drawn from it is muted.
    const n = (total / max) * 1.4142;
    return Math.min(1, Math.max(0, (n + 1) / 2));
  };
}
