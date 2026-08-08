/* The studio: controls -> params -> live sheet, with URL + localStorage sync. */

import { STYLES, getStyle } from '../gen/index.js';
import { buildSVG, normalize, PAPERS, WEIGHTS, FRAMES, COMPLEXITY_LABELS, DEFAULTS } from '../core/render.js';
import { randomSeed, makeRng } from '../core/rng.js';
import { downloadPNG, downloadSVG, printDesign, copyLink } from '../core/export.js';
import * as store from '../core/store.js';
import { ICONS, toast } from '../ui.js';

const els = {
  sheet: document.getElementById('sheet'),
  styleList: document.getElementById('style-list'),
  seedInput: document.getElementById('seed-input'),
  seedShuffle: document.getElementById('seed-shuffle'),
  complexity: document.getElementById('complexity'),
  complexityLabel: document.getElementById('complexity-label'),
  paper: document.getElementById('paper-seg'),
  weight: document.getElementById('weight-seg'),
  frame: document.getElementById('frame-seg'),
  caption: document.getElementById('caption-toggle'),
  meta: document.getElementById('sheet-meta'),
  stage: document.querySelector('.studio-stage'),
  sheetFrame: document.getElementById('sheet-frame'),
  zoomClose: document.getElementById('zoom-close'),
  surprise: document.getElementById('act-surprise'),
  print: document.getElementById('act-print'),
  png: document.getElementById('act-png'),
  svg: document.getElementById('act-svg'),
  save: document.getElementById('act-save'),
  link: document.getElementById('act-link'),
};

function paramsFromURL() {
  const q = new URLSearchParams(window.location.search);
  const raw = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (q.has(k)) raw[k] = q.get(k);
  }
  if (!q.has('seed')) raw.seed = randomSeed();
  return normalize(raw);
}

let params = paramsFromURL();
let frame = 0;

function syncURL() {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
}

function countLines(svg) {
  return (svg.match(/<(path|circle|ellipse|line|rect|polyline)\b/g) || []).length - 1; // minus the page rect
}

/*
 * On a phone the seed and detail controls move out of the scrolling panel and
 * into the pinned block, directly under the preview.
 *
 * They are the two dials you actually iterate on, and left in the panel they
 * sit below a twelve-item style grid — so reaching them means scrolling, and
 * focusing the seed field opens the keyboard, which on Android can leave the
 * pinned preview outside the visible area entirely. Sitting inside the pinned
 * block, they cannot be separated from the preview at all.
 */
const compact = window.matchMedia('(max-width: 1000px)');
// Landscape phones already show panel and preview side by side, so there the
// controls stay put — moving them would only make the pinned column too tall.
const sideBySide = window.matchMedia('(max-width: 1000px) and (min-width: 620px) and (max-height: 560px)');
const stacked = () => compact.matches && !sideBySide.matches;
let quickRow = null;
let quickHomes = null;

function placeQuickControls() {
  const fields = [document.getElementById('field-seed'), document.getElementById('field-detail')];
  if (fields.some((f) => !f)) return;

  if (!quickHomes) {
    // Remember where each field belongs so the desktop layout can be restored.
    quickHomes = fields.map((el) => ({ el, parent: el.parentNode, next: el.nextSibling }));
    quickRow = document.createElement('div');
    quickRow.className = 'quick-controls';
  }

  if (stacked()) {
    if (quickRow.parentNode !== els.stage) els.stage.insertBefore(quickRow, els.meta);
    fields.forEach((f) => quickRow.appendChild(f));
  } else {
    quickHomes.forEach((h) => h.parent.insertBefore(h.el, h.next));
    if (quickRow.parentNode) quickRow.remove();
  }
}

/*
 * Full-screen preview. The pinned preview has to stay small enough to leave
 * room for the controls, so tapping it fills the screen; tapping anywhere puts
 * it back and brings the controls with it.
 */
let zoomed = false;

function setZoom(on) {
  const next = on && compact.matches;
  if (next === zoomed) return;
  zoomed = next;

  document.body.classList.toggle('is-zoomed', zoomed);
  els.sheetFrame.setAttribute('aria-expanded', String(zoomed));
  if (zoomed) els.zoomClose.focus();
  else if (compact.matches) els.sheetFrame.focus();
  syncPinnedHeight();
}

/** The preview only acts as a button in the layouts where it can expand. */
function syncZoomAffordance() {
  if (compact.matches) {
    els.sheetFrame.setAttribute('role', 'button');
    els.sheetFrame.setAttribute('tabindex', '0');
    els.sheetFrame.setAttribute('aria-expanded', String(zoomed));
    els.sheetFrame.setAttribute('aria-label', 'Preview — activate to view full screen');
  } else {
    setZoom(false);
    for (const a of ['role', 'tabindex', 'aria-expanded', 'aria-label']) els.sheetFrame.removeAttribute(a);
  }
}

/**
 * Publish how much of the viewport the pinned preview occupies, so the
 * stylesheet can keep controls from being scrolled underneath it. Zero when the
 * stage is not pinned (desktop, and short landscape viewports), or while the
 * preview is expanded and the controls are out of the way.
 */
function syncPinnedHeight() {
  const pinned = !zoomed && getComputedStyle(els.stage).position === 'sticky'
    ? document.querySelector('.nav').offsetHeight + els.stage.offsetHeight
    : 0;
  document.documentElement.style.setProperty('--pinned-h', `${Math.round(pinned)}px`);
}

function render() {
  const page = PAPERS[params.paper];
  const svg = buildSVG(params);
  // Publish the paper's proportions; the stylesheet decides how much height
  // the preview may claim, which differs between desktop and a pinned phone
  // layout.
  els.sheet.style.setProperty('--sheet-num', String(page.w / page.h));
  els.sheet.innerHTML = svg;

  const n = countLines(svg);
  els.meta.textContent = `${getStyle(params.style).name} · ${COMPLEXITY_LABELS[params.complexity]} · ${page.sub} · ${n.toLocaleString()} lines`;
  document.title = `${getStyle(params.style).name} — ${params.seed} · SuperPrint`;
  paintSave();
  syncURL();
  syncPinnedHeight(); // the preview's height changes with the paper size
}

function schedule() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

function set(patch, { rerender = true } = {}) {
  params = normalize({ ...params, ...patch });
  if (rerender) schedule();
}

/* ---------------------------------------------------------------- panel -- */

function buildStyleList() {
  for (const s of STYLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'style-opt';
    b.innerHTML = `<span>${s.name}</span>`;
    b.title = s.blurb;
    b.setAttribute('aria-pressed', String(s.id === params.style));
    b.addEventListener('click', () => {
      set({ style: s.id });
      els.styleList.querySelectorAll('.style-opt').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    });
    els.styleList.appendChild(b);
  }
}

function buildSegment(container, options, key, labelKey = 'label') {
  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opt[labelKey];
    if (opt.sub) b.title = opt.sub;
    b.setAttribute('aria-pressed', String(opt.id === params[key]));
    b.addEventListener('click', () => {
      set({ [key]: opt.id });
      container.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    });
    container.appendChild(b);
  }
}

function paintSave() {
  const saved = store.isSaved(params);
  els.save.innerHTML = `${saved ? ICONS.heartFilled : ICONS.heart}<span>${saved ? 'Saved' : 'Save'}</span>`;
  els.save.setAttribute('aria-pressed', String(saved));
}

function newSeed() {
  const seed = randomSeed();
  els.seedInput.value = seed;
  set({ seed });
}

/* -------------------------------------------------------------- actions -- */

function wire() {
  els.seedInput.value = params.seed;
  els.seedInput.addEventListener('change', () => {
    const v = els.seedInput.value.trim() || randomSeed();
    els.seedInput.value = v;
    set({ seed: v });
  });
  els.seedShuffle.innerHTML = ICONS.shuffle;
  els.seedShuffle.addEventListener('click', newSeed);

  els.complexity.value = String(params.complexity);
  els.complexityLabel.textContent = COMPLEXITY_LABELS[params.complexity];
  els.complexity.addEventListener('input', () => {
    const v = parseInt(els.complexity.value, 10);
    els.complexityLabel.textContent = COMPLEXITY_LABELS[v];
    set({ complexity: v });
  });

  els.caption.checked = params.caption;
  els.caption.addEventListener('change', () => set({ caption: els.caption.checked }));

  els.surprise.innerHTML = `${ICONS.wand}<span>Surprise me</span>`;
  els.surprise.addEventListener('click', () => {
    const rng = makeRng(randomSeed());
    const style = rng.pick(STYLES).id;
    set({ style, seed: randomSeed(), complexity: rng.int(2, 5) });
    els.seedInput.value = params.seed;
    els.complexity.value = String(params.complexity);
    els.complexityLabel.textContent = COMPLEXITY_LABELS[params.complexity];
    els.styleList.querySelectorAll('.style-opt').forEach((o, i) => o.setAttribute('aria-pressed', String(STYLES[i].id === style)));
  });

  els.print.innerHTML = `${ICONS.print}<span>Print</span>`;
  els.print.addEventListener('click', () => printDesign(params));

  els.png.innerHTML = `${ICONS.download}<span>PNG</span>`;
  els.png.addEventListener('click', async () => {
    els.png.disabled = true;
    try {
      await downloadPNG(params, 300);
      toast('PNG saved at 300 DPI');
    } catch (err) {
      toast(err.message || 'Could not export PNG');
    } finally {
      els.png.disabled = false;
    }
  });

  els.svg.innerHTML = `${ICONS.download}<span>SVG</span>`;
  els.svg.addEventListener('click', () => {
    downloadSVG(params);
    toast('Vector SVG saved');
  });

  els.save.addEventListener('click', () => {
    const now = store.toggle(params);
    paintSave();
    toast(now ? 'Saved to your collection' : 'Removed from saved');
  });

  els.link.innerHTML = `${ICONS.link}<span>Copy link</span>`;
  els.link.addEventListener('click', async () => {
    await copyLink(params);
    toast('Link copied — it reopens this exact design');
  });

  // Tapping the preview expands it; once expanded the frame covers the screen,
  // so a tap anywhere — including the close button — lands here and closes it.
  els.sheetFrame.addEventListener('click', () => setZoom(!zoomed));
  els.sheetFrame.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setZoom(!zoomed);
    }
  });
  els.zoomClose.innerHTML = ICONS.close;
  document.querySelector('.zoom-hint').innerHTML = ICONS.expand;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && zoomed) {
      setZoom(false);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'n') { newSeed(); }
    else if (e.key === 'p') { e.preventDefault(); printDesign(params); }
    else if (e.key === 's') { store.toggle(params); paintSave(); }
  });
}

if (els.sheet) {
  buildStyleList();
  buildSegment(els.paper, Object.values(PAPERS), 'paper');
  buildSegment(els.weight, Object.values(WEIGHTS), 'weight');
  buildSegment(els.frame, Object.values(FRAMES), 'frame');
  wire();
  placeQuickControls();
  syncZoomAffordance();
  render();

  const relayout = () => {
    placeQuickControls();
    syncZoomAffordance();
    syncPinnedHeight();
  };
  compact.addEventListener('change', relayout);
  sideBySide.addEventListener('change', relayout);
  window.addEventListener('resize', syncPinnedHeight);
  window.addEventListener('orientationchange', relayout);
}
