/* The design card used on the home page, the gallery and the saved page. */

import { buildSVG, normalize, PAPERS, COMPLEXITY_LABELS } from '../core/render.js';
import { getStyle } from '../gen/index.js';
import { printDesign } from '../core/export.js';
import * as store from '../core/store.js';
import { ICONS, toast } from '../ui.js';

export function studioURL(params) {
  const p = normalize(params);
  const q = new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)]));
  return `studio.html?${q.toString()}`;
}

function aspectClass(paper) {
  const page = PAPERS[paper];
  if (!page) return '';
  if (page.w === page.h) return 'square';
  return page.w > page.h ? 'landscape' : '';
}

/**
 * @param {object} params design parameters
 * @param {{onRemove?: Function, svg?: string}} [opts]
 *   `svg` reuses artwork the caller has already rendered for these exact
 *   params — the gallery scores candidates before it picks one, and drawing the
 *   winner a second time would be pure waste.
 * @returns {HTMLElement}
 */
export function createTile(params, opts = {}) {
  const p = normalize(params);
  const style = getStyle(p.style);

  const el = document.createElement('article');
  el.className = 'tile';
  el.innerHTML = `
    <a class="tile-art ${aspectClass(p.paper)}" href="${studioURL(p)}" aria-label="Open ${style.name} design ${p.seed} in the studio"></a>
    <div class="tile-body">
      <div>
        <div class="tile-title">${style.name}</div>
        <div class="tile-seed">${p.seed}</div>
      </div>
      <div class="small muted">${COMPLEXITY_LABELS[p.complexity]} · ${PAPERS[p.paper].label}</div>
      <div class="tile-actions">
        <a class="btn btn-outline btn-sm" href="${studioURL(p)}">Open</a>
        <button class="btn btn-outline btn-sm" data-act="print" title="Print this design" aria-label="Print ${style.name} ${p.seed}">${ICONS.print}</button>
        <button class="btn btn-outline btn-sm" data-act="save" title="Save this design"></button>
      </div>
    </div>`;

  el.querySelector('.tile-art').innerHTML = opts.svg || buildSVG(p);

  const saveBtn = el.querySelector('[data-act="save"]');
  const paintSave = () => {
    const saved = store.isSaved(p);
    saveBtn.innerHTML = saved ? ICONS.heartFilled : ICONS.heart;
    saveBtn.setAttribute('aria-label', saved ? 'Remove from saved' : 'Save design');
    saveBtn.setAttribute('aria-pressed', String(saved));
  };
  paintSave();

  saveBtn.addEventListener('click', () => {
    const now = store.toggle(p);
    paintSave();
    toast(now ? 'Saved to your collection' : 'Removed from saved');
    if (!now && opts.onRemove) opts.onRemove(el, p);
  });

  el.querySelector('[data-act="print"]').addEventListener('click', () => printDesign(p));

  return el;
}
