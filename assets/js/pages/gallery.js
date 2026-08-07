import { STYLES } from '../gen/index.js';
import { makeRng, randomSeed } from '../core/rng.js';
import { createTile } from '../components/tile.js';
import { ICONS } from '../ui.js';

const grid = document.getElementById('gallery-grid');
const filters = document.getElementById('gallery-filters');
const moreBtn = document.getElementById('load-more');
const freshBtn = document.getElementById('fresh-batch');

const BATCH = 12;
let active = 'all';

function makeParams(rng) {
  const pool = active === 'all' ? STYLES : STYLES.filter((s) => s.id === active);
  const style = rng.pick(pool);
  return {
    style: style.id,
    seed: randomSeed(),
    complexity: rng.int(2, 5),
    paper: 'letter',
    weight: rng.bool(0.75) ? 'medium' : rng.pick(['fine', 'bold']),
    frame: rng.pick(['thin', 'thin', 'none', 'double', 'rounded']),
    caption: true,
  };
}

function appendBatch(count = BATCH) {
  const rng = makeRng(randomSeed());
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) frag.appendChild(createTile(makeParams(rng)));
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
