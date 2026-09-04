import { randomSeed, makeRng } from '../core/rng.js';
import { pickBest } from '../core/quality.js';
import { STYLES } from '../gen/index.js';
import { studioURL } from '../components/tile.js';
import { ICONS } from '../ui.js';

const heroStack = document.getElementById('hero-stack');
const showcase = document.getElementById('style-showcase');

/*
 * The three sheets in the hero and the twelve style cards below are the first
 * drawings anyone sees, so they are worth choosing rather than taking blind.
 * Each is picked from a few candidate seeds by composition; the winner's
 * artwork comes back with it, so the choosing costs one extra render apiece
 * rather than two.
 */
const HERO_SEARCH = { budgetMs: 90, max: 6 };
const CARD_SEARCH = { budgetMs: 20, max: 3, min: 1 };

function heroDesigns() {
  const rng = makeRng(randomSeed());
  return rng.sample(STYLES, 3).map((s) => {
    const p = {
      style: s.id,
      complexity: rng.int(3, 5),
      paper: 'letter',
      weight: 'medium',
      frame: rng.pick(['thin', 'none', 'double']),
      caption: false,
    };
    const won = pickBest(p, HERO_SEARCH);
    return { params: { ...p, seed: won.seed }, svg: won.svg };
  });
}

function paintHero() {
  if (!heroStack) return;
  heroStack.innerHTML = '';
  for (const { params, svg } of heroDesigns()) {
    const sheet = document.createElement('a');
    sheet.className = 'sheet';
    sheet.href = studioURL(params);
    sheet.setAttribute('aria-label', `Open this ${params.style} design in the studio`);
    sheet.innerHTML = svg;
    heroStack.appendChild(sheet);
  }
}

/*
 * Say how many styles there are by counting them.
 *
 * The number appeared twice in the markup and was wrong within a day of a
 * style being added — the same rot as any hand-kept list. The HTML still
 * carries the right words so the page reads correctly before this runs; this
 * is what stops it from ever being wrong again.
 */
const NUMBER_WORDS = [
  'No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen', 'Twenty',
];

function paintStyleCount() {
  const n = STYLES.length;
  const stat = document.querySelector('[data-style-count]');
  if (stat) stat.textContent = String(n);
  const heading = document.querySelector('[data-style-count-word]');
  if (heading) heading.textContent = `${NUMBER_WORDS[n] || n} ways to fill a page`;
}

function paintShowcase() {
  if (!showcase) return;
  const rng = makeRng(randomSeed());
  showcase.innerHTML = '';
  for (const style of STYLES) {
    const base = {
      style: style.id,
      complexity: rng.int(3, 4),
      paper: 'letter',
      weight: 'medium',
      frame: 'thin',
      caption: false,
    };
    const won = pickBest(base, CARD_SEARCH);
    const params = { ...base, seed: won.seed };
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
    card.querySelector('.tile-art').innerHTML = won.svg;
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

paintStyleCount();
paintHero();
paintShowcase();
