/*
 * Deterministic random number generation.
 *
 * Every design on SuperPrint is a pure function of (style, seed, settings), so
 * the same seed always redraws the exact same artwork. That is what makes a
 * design shareable by URL and re-printable months later.
 */

/** FNV-1a style string hash -> 32-bit unsigned int. */
export function hashSeed(input) {
  const str = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let s = hashSeed(seed) || 1;

  const next = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Float in [lo, hi). */
    range: (lo, hi) => lo + next() * (hi - lo),
    /** Integer in [lo, hi] inclusive. */
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    bool: (p = 0.5) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** Pick `n` distinct items (or as many as exist). */
    sample(arr, n) {
      const copy = arr.slice();
      const out = [];
      while (out.length < n && copy.length) {
        out.push(copy.splice(Math.floor(next() * copy.length), 1)[0]);
      }
      return out;
    },
    /** Roughly normal distribution around `mean`. */
    gauss: (mean = 0, sd = 1) => {
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
    },
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

const ADJECTIVES = [
  'amber', 'velvet', 'quiet', 'wild', 'gilded', 'soft', 'lunar', 'copper', 'hazy', 'brave',
  'still', 'ember', 'linen', 'coral', 'drifting', 'humming', 'paper', 'violet', 'sunlit', 'slow',
];
const NOUNS = [
  'meadow', 'lantern', 'harbor', 'thistle', 'compass', 'orchard', 'ripple', 'feather', 'atlas', 'garden',
  'window', 'current', 'blossom', 'pebble', 'canopy', 'echo', 'willow', 'season', 'tide', 'nectar',
];

/** Human-friendly seeds like "amber-thistle-408" — easier to share than hashes. */
export function randomSeed() {
  const r = makeRng(`${Date.now()}-${Math.random()}`);
  return `${r.pick(ADJECTIVES)}-${r.pick(NOUNS)}-${r.int(100, 999)}`;
}
