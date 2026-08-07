import { buildSVG } from '../core/render.js';
import { randomSeed, makeRng } from '../core/rng.js';
import { STYLES } from '../gen/index.js';
import { studioURL } from '../components/tile.js';
import { ICONS } from '../ui.js';

const heroStack = document.getElementById('hero-stack');
const showcase = document.getElementById('style-showcase');

function heroDesigns() {
  const rng = makeRng(randomSeed());
  const picks = rng.sample(STYLES, 3);
  return picks.map((s) => ({
    style: s.id,
    seed: randomSeed(),
    complexity: rng.int(3, 5),
    paper: 'letter',
    weight: 'medium',
    frame: rng.pick(['thin', 'none', 'double']),
    caption: false,
  }));
}

function paintHero() {
  if (!heroStack) return;
  heroStack.innerHTML = '';
  for (const d of heroDesigns()) {
    const sheet = document.createElement('a');
    sheet.className = 'sheet';
    sheet.href = studioURL(d);
    sheet.setAttribute('aria-label', `Open this ${d.style} design in the studio`);
    sheet.innerHTML = buildSVG(d);
    heroStack.appendChild(sheet);
  }
}

function paintShowcase() {
  if (!showcase) return;
  const rng = makeRng(randomSeed());
  showcase.innerHTML = '';
  for (const style of STYLES) {
    const params = {
      style: style.id,
      seed: randomSeed(),
      complexity: rng.int(3, 4),
      paper: 'letter',
      weight: 'medium',
      frame: 'thin',
      caption: false,
    };
    const card = document.createElement('article');
    card.className = 'tile';
    card.innerHTML = `
      <a class="tile-art" href="${studioURL(params)}" aria-label="Make a ${style.name} page"></a>
      <div class="tile-body">
        <div>
          <div class="tile-title">${style.name}</div>
          <p class="small muted" style="margin:6px 0 0">${style.blurb}</p>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${style.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
        </div>
        <div class="tile-actions">
          <a class="btn btn-dark btn-sm" href="${studioURL(params)}">Make one</a>
        </div>
      </div>`;
    card.querySelector('.tile-art').innerHTML = buildSVG(params);
    showcase.appendChild(card);
  }
}

const shuffleBtn = document.getElementById('hero-shuffle');
if (shuffleBtn) {
  shuffleBtn.insertAdjacentHTML('afterbegin', ICONS.shuffle);
  shuffleBtn.addEventListener('click', paintHero);
}

const startBtn = document.getElementById('hero-start');
if (startBtn) {
  startBtn.href = studioURL({ style: 'mandala', seed: randomSeed(), complexity: 3 });
}

paintHero();
paintShowcase();
