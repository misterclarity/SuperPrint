import { STYLES } from '../gen/index.js';
import { makeRng, randomSeed } from '../core/rng.js';
import { pickBest } from '../core/quality.js';
import { createTile } from '../components/tile.js';
import { ICONS } from '../ui.js';

const grid = document.getElementById('gallery-grid');
const filters = document.getElementById('gallery-filters');
const moreBtn = document.getElementById('load-more');
const freshBtn = document.getElementById('fresh-batch');

const BATCH = 12;
let active = 'all';

/*
 * A tighter search than the studio's: a dozen of these are built before the
 * grid paints, so each tile gets a small slice rather than the full budget.
 * Even three candidates removes most of the lopsided rolls, and the gallery is
 * where they were most visible — a wall of tiles makes a bad one obvious.
 *
 * The cheap styles get their three; the two or three that cost more to draw
 * than the whole budget get one and go straight up, which keeps a fresh batch
 * from stalling on them.
 */
const TILE_SEARCH = { budgetMs: 20, max: 3, min: 1 };

function makeParams(rng) {
  const pool = active === 'all' ? STYLES : STYLES.filter((s) => s.id === active);
  const style = rng.pick(pool);
  const p = {
    style: style.id,
    complexity: rng.int(2, 5),
    paper: 'letter',
    weight: rng.bool(0.75) ? 'medium' : rng.pick(['fine', 'bold']),
    frame: rng.pick(['thin', 'thin', 'none', 'double', 'rounded']),
    caption: true,
  };
  const won = pickBest(p, TILE_SEARCH);
  return { params: { ...p, seed: won.seed }, svg: won.svg };
}

function appendBatch(count = BATCH) {
  const rng = makeRng(randomSeed());
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const { params, svg } = makeParams(rng);
    frag.appendChild(createTile(params, { svg }));
  }
  grid.appendChild(frag);
}

function reset() {
  grid.innerHTML = '';
  appendBatch();
}

function buildFilters() {
  const mk = (id, label) => {
    const b = document.createElement('button');
    b.className = 'filter';
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(active === id));
    b.addEventListener('click', () => {
      active = id;
      filters.querySelectorAll('.filter').forEach((f) => f.setAttribute('aria-pressed', String(f === b)));
      reset();
    });
    return b;
  };
  filters.appendChild(mk('all', 'Everything'));
  for (const s of STYLES) filters.appendChild(mk(s.id, s.name));
}

if (grid) {
  buildFilters();
  moreBtn.addEventListener('click', () => appendBatch());
  freshBtn.insertAdjacentHTML('afterbegin', ICONS.shuffle);
  freshBtn.addEventListener('click', () => {
    reset();
    window.scrollTo({ top: grid.offsetTop - 120, behavior: 'smooth' });
  });
  reset();
}
