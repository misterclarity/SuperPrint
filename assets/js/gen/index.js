import mandala from './mandala.js';
import kaleidoscope from './kaleidoscope.js';
import wreath from './wreath.js';
import bloomfield from './bloomfield.js';
import frostfield from './frostfield.js';
import geometric from './geometric.js';
import stainedglass from './stainedglass.js';
import celtic from './celtic.js';
import folkweave from './folkweave.js';
import bands from './bands.js';
import contours from './contours.js';

export const STYLES = [
  mandala,
  kaleidoscope,
  stainedglass,
  wreath,
  bloomfield,
  frostfield,
  folkweave,
  geometric,
  celtic,
  bands,
  contours,
];

export const STYLE_MAP = Object.fromEntries(STYLES.map((s) => [s.id, s]));

export function getStyle(id) {
  return STYLE_MAP[id] || STYLES[0];
}
