/*
 * The colouring page: a design, a palette and a finger.
 *
 * The sheet is two stacked canvases at a common working resolution — paint
 * underneath, the rasterised line art on top. Stacking them rather than
 * compositing by hand means the browser does the blending, so a brush stroke
 * touches only the paint layer and the artwork is never redrawn.
 *
 * Gestures are the whole design here, because a finger is not a mouse:
 *
 *   fill tool    one finger taps to fill, and drags to pan when zoomed in
 *   brush/eraser one finger draws
 *   any tool     two fingers pinch to zoom and drag to pan
 *
 * Which means a single finger never has an ambiguous job, and getting to a
 * corner of a zoomed-in sheet never requires a different tool.
 */

import { buildSVG, normalize, filename, title, PAPERS, DEFAULTS } from '../core/render.js';
import { getStyle } from '../gen/index.js';
import { floodFill, dilate, applyFill, alphaChannel, hexToRgb } from '../core/paint.js';
import { rasterize, downloadCanvas, printImage } from '../core/export.js';
import { ICONS, toast } from '../ui.js';

const els = {
  app: document.querySelector('.colour-app'),
  stage: document.getElementById('colour-stage'),
  paper: document.getElementById('colour-paper'),
  paint: document.getElementById('colour-paint'),
  lines: document.getElementById('colour-lines'),
  hint: document.getElementById('colour-hint'),
  reset: document.getElementById('colour-reset'),
  swatches: document.getElementById('swatches'),
  tools: document.getElementById('tool-seg'),
  brushSize: document.getElementById('brush-size'),
  brushRange: document.getElementById('brush-range'),
  undo: document.getElementById('colour-undo'),
  clear: document.getElementById('colour-clear'),
  back: document.getElementById('colour-back'),
  save: document.getElementById('colour-save'),
  print: document.getElementById('colour-print'),
  titleEl: document.getElementById('colour-title'),
};

/* ------------------------------------------------------------- palette -- */

/*
 * Twelve families in a light and a deep tone, plus paper, ink and two greys.
 *
 * Pairs rather than a long spread of hues: colouring a page is mostly picking
 * one family and shading within it, and having the darker tone next to the
 * lighter one puts that a thumb's width away instead of somewhere in a scroll.
 * They are muted a little off full saturation, which is where coloured pencil
 * sits and where black line art still reads as the drawing.
 */
const PALETTE = [
  ['#f6aab6', '#d9506e'], ['#f3897a', '#c93f30'],
  ['#f7b878', '#e07c2c'], ['#f8d573', '#dfa416'],
  ['#d3e084', '#96bd3d'], ['#95d3a6', '#3f9e63'],
  ['#8ed2cb', '#2f8f88'], ['#9fcdea', '#3a8cc4'],
  ['#a3aee3', '#4655ad'], ['#c6abe2', '#7d55b5'],
  ['#dcb68f', '#95603a'], ['#dcd7ce', '#7c766c'],
  ['#ffffff', '#1c1a17'],
];
const COLOURS = PALETTE.flat();

const TOOLS = [
  { id: 'fill', label: 'Fill', icon: 'bucket', hint: 'Tap an area to fill it · pinch to zoom' },
  { id: 'brush', label: 'Brush', icon: 'brush', hint: 'Drag to colour · two fingers to zoom' },
  { id: 'eraser', label: 'Eraser', icon: 'eraser', hint: 'Drag to rub colour out' },
];

/* --------------------------------------------------------------- state -- */

const params = paramsFromURL();
const page = PAPERS[params.paper];

let W = 0;
let H = 0;
let lineAlpha = null; // the rasterised artwork, alpha only: the fill's walls
let ready = false;

let tool = 'fill';
let colour = '#d9506e';
let brushStep = 3;

const paintCtx = els.paint.getContext('2d', { willReadFrequently: true });
const view = { scale: 1, x: 0, y: 0 };

function paramsFromURL() {
  const q = new URLSearchParams(window.location.search);
  const raw = {};
  for (const k of Object.keys(DEFAULTS)) if (q.has(k)) raw[k] = q.get(k);
  return normalize(raw);
}

/**
 * The resolution the sheet is coloured at.
 *
 * Not the paper's own units, which are far too coarse — the finest pen is 1.7
 * of them, so a stroke would land on under two pixels and a fill would walk
 * straight through it. Not the print resolution either: a flood fill at 300 DPI
 * is eight million pixels of work per tap. This is the smallest raster where
 * every pen still draws a wall at least two pixels thick, nudged up to cover a
 * high-density screen so the artwork does not look soft.
 */
function workingSize() {
  const long = Math.max(page.w, page.h);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const screenLong = Math.max(window.screen?.width || 0, window.screen?.height || 0, 360) * dpr;
  const target = Math.max(1200, Math.min(1800, Math.round(screenLong * 1.2)));
  const s = target / long;
  return { w: Math.round(page.w * s), h: Math.round(page.h * s) };
}

/* ---------------------------------------------------------------- undo -- */

/*
 * Undo keeps only the rectangle each action touched. A full sheet is about four
 * megabytes, so twenty of those would be most of a phone's headroom for the
 * sake of edits that are usually a few hundred pixels across.
 */
const UNDO_STEPS = 24;
const UNDO_BYTES = 24 * 1024 * 1024;
const undoStack = [];
let undoBytes = 0;

function pushUndo(box, img) {
  const snap = img || paintCtx.getImageData(
    box.x0, box.y0, box.x1 - box.x0 + 1, box.y1 - box.y0 + 1,
  );
  undoStack.push({ x: box.x0, y: box.y0, img: snap });
  undoBytes += snap.data.length;
  while (undoStack.length > UNDO_STEPS || undoBytes > UNDO_BYTES) {
    undoBytes -= undoStack.shift().img.data.length;
  }
  paintUndoState();
}

function paintUndoState() {
  els.undo.disabled = undoStack.length === 0;
}

function undo() {
  const step = undoStack.pop();
  if (!step) return;
  undoBytes -= step.img.data.length;
  paintCtx.putImageData(step.img, step.x, step.y);
  paintUndoState();
  scheduleSave();
}

/** A copy of part of a full-sheet snapshot, for the undo stack. */
function crop(src, box) {
  const w = box.x1 - box.x0 + 1;
  const h = box.y1 - box.y0 + 1;
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    const from = ((box.y0 + y) * src.width + box.x0) * 4;
    out.data.set(src.data.subarray(from, from + w * 4), y * w * 4);
  }
  return out;
}

/* --------------------------------------------------------------- tools -- */

function fillAt(pt) {
  const hit = floodFill(lineAlpha, W, H, pt.x, pt.y);
  // A tap that lands on a line has no region to fill. Saying so is better than
  // appearing to do nothing, because the alternative reading is "it's broken".
  if (!hit) {
    toast('That is a line — tap inside an area');
    return;
  }

  const box = dilate(hit.mask, W, H, hit);
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const img = paintCtx.getImageData(box.x0, box.y0, bw, bh);

  pushUndo(box, new ImageData(new Uint8ClampedArray(img.data), bw, bh));
  applyFill(img.data, hit.mask, box, W, tool === 'eraser' ? null : hexToRgb(colour));
  paintCtx.putImageData(img, box.x0, box.y0);
  scheduleSave();
}

/** Brush radius in sheet pixels, so it feels the same on every paper size. */
function brushRadius() {
  const k = [0.006, 0.011, 0.02, 0.036, 0.062][brushStep - 1];
  return Math.max(2, Math.round(Math.min(W, H) * k));
}

const stroke = { on: false, before: null, last: null, box: null };

function strokeBegin(pt) {
  stroke.on = true;
  stroke.before = paintCtx.getImageData(0, 0, W, H);
  stroke.last = pt;
  stroke.box = null;
  strokeTo(pt);
}

function strokeTo(pt) {
  if (!stroke.on) return;
  const r = brushRadius();

  paintCtx.save();
  paintCtx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  paintCtx.strokeStyle = colour;
  paintCtx.fillStyle = colour;
  paintCtx.lineWidth = r * 2;
  paintCtx.lineCap = 'round';
  paintCtx.lineJoin = 'round';
  paintCtx.beginPath();
  paintCtx.moveTo(stroke.last.x, stroke.last.y);
  paintCtx.lineTo(pt.x, pt.y);
  paintCtx.stroke();
  paintCtx.restore();

  growBox(stroke.last, r);
  growBox(pt, r);
  stroke.last = pt;
}

function growBox(pt, r) {
  const x0 = Math.max(0, Math.floor(pt.x - r - 1));
  const y0 = Math.max(0, Math.floor(pt.y - r - 1));
  const x1 = Math.min(W - 1, Math.ceil(pt.x + r + 1));
  const y1 = Math.min(H - 1, Math.ceil(pt.y + r + 1));
  if (!stroke.box) stroke.box = { x0, y0, x1, y1 };
  else {
    stroke.box.x0 = Math.min(stroke.box.x0, x0);
    stroke.box.y0 = Math.min(stroke.box.y0, y0);
    stroke.box.x1 = Math.max(stroke.box.x1, x1);
    stroke.box.y1 = Math.max(stroke.box.y1, y1);
  }
}

function strokeEnd() {
  if (!stroke.on) return;
  if (stroke.box && stroke.box.x1 >= stroke.box.x0 && stroke.box.y1 >= stroke.box.y0) {
    pushUndo(stroke.box, crop(stroke.before, stroke.box));
    scheduleSave();
  }
  stroke.on = false;
  stroke.before = null;
}

/** Put back what the stroke had drawn — a second finger means it was a pinch. */
function strokeAbort() {
  if (!stroke.on) return;
  paintCtx.putImageData(stroke.before, 0, 0);
  stroke.on = false;
  stroke.before = null;
}

function clearAll() {
  pushUndo({ x0: 0, y0: 0, x1: W - 1, y1: H - 1 });
  paintCtx.clearRect(0, 0, W, H);
  scheduleSave();
  toast('Cleared — undo puts it back');
}

/* ------------------------------------------------------------ gestures -- */

const pointers = new Map();
let pinch = null;
let press = null;

function toSheet(e) {
  const r = els.lines.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * W,
    y: ((e.clientY - r.top) / r.height) * H,
  };
}

function applyView() {
  els.paper.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  els.reset.hidden = view.scale <= 1.01;
}

function clampView() {
  view.scale = Math.min(8, Math.max(1, view.scale));
  const stage = els.stage.getBoundingClientRect();
  const w = els.lines.offsetWidth * view.scale;
  const h = els.lines.offsetHeight * view.scale;
  const maxX = Math.max(0, (w - stage.width) / 2 + 20);
  const maxY = Math.max(0, (h - stage.height) / 2 + 20);
  view.x = Math.min(maxX, Math.max(-maxX, view.x));
  view.y = Math.min(maxY, Math.max(-maxY, view.y));
}

function resetView() {
  view.scale = 1;
  view.x = 0;
  view.y = 0;
  applyView();
}

/** The two live pointers as a distance and a midpoint, in client space. */
function span() {
  const [a, b] = [...pointers.values()];
  return {
    dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
  };
}

/**
 * Zoom about a point, keeping whatever is under it exactly where it is.
 *
 * The paper is transformed as translate then scale about its own centre, so a
 * point sitting `p` from that centre in untransformed paper units appears at
 * `x + scale * p`. Solving that for the new translation is what stops a pinch
 * sliding the artwork out from under the fingers doing it.
 */
function zoomAbout(clientX, clientY, from, nextScale) {
  const stage = els.stage.getBoundingClientRect();
  const cx = stage.left + stage.width / 2;
  const cy = stage.top + stage.height / 2;
  const px = (from.cx - cx - from.x) / from.scale;
  const py = (from.cy - cy - from.y) / from.scale;

  view.scale = Math.min(8, Math.max(1, nextScale));
  view.x = clientX - cx - view.scale * px;
  view.y = clientY - cy - view.scale * py;
  clampView();
  applyView();
}

function onPointerDown(e) {
  if (!ready) return;
  // Capture keeps a stroke alive when a finger wanders off the sheet, which on
  // a phone is most of them. It throws for a pointer the browser no longer
  // considers active, and losing capture is survivable where losing the rest of
  // this handler is not.
  try {
    els.paper.setPointerCapture(e.pointerId);
  } catch { /* draw without it */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    // Whatever one finger had started is now the beginning of a pinch.
    strokeAbort();
    press = null;
    const s = span();
    pinch = { ...s, scale: view.scale, x: view.x, y: view.y };
    return;
  }
  if (pointers.size > 2) return;

  press = { x: e.clientX, y: e.clientY, at: performance.now(), moved: false, panX: view.x, panY: view.y };
  if (tool !== 'fill') strokeBegin(toSheet(e));
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size >= 2 && pinch) {
    const s = span();
    zoomAbout(s.cx, s.cy, pinch, pinch.scale * (s.dist / pinch.dist));
    return;
  }
  if (!press) return;

  const dx = e.clientX - press.x;
  const dy = e.clientY - press.y;
  if (!press.moved && Math.hypot(dx, dy) > 9) press.moved = true;

  if (tool === 'fill') {
    // One finger pans; there is nothing else for it to do between taps.
    if (press.moved && view.scale > 1) {
      view.x = press.panX + dx;
      view.y = press.panY + dy;
      clampView();
      applyView();
    }
    return;
  }
  strokeTo(toSheet(e));
}

function onPointerUp(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;

  if (stroke.on && pointers.size === 0) strokeEnd();

  if (press && pointers.size === 0) {
    const quick = performance.now() - press.at < 700;
    if (tool === 'fill' && !press.moved && quick) {
      fillAt(toSheet(e));
      dismissHint();
    }
    press = null;
  }
}

function onWheel(e) {
  if (!ready) return;
  e.preventDefault();
  const from = { cx: e.clientX, cy: e.clientY, scale: view.scale, x: view.x, y: view.y };
  zoomAbout(e.clientX, e.clientY, from, view.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
}

/* ------------------------------------------------------------- storage -- */

/*
 * Work in progress survives leaving the page, because on a phone leaving is not
 * a decision — it is a notification, a call, or the browser reclaiming a
 * backgrounded tab. Only the paint layer is stored; the artwork underneath is
 * a pure function of the URL and costs nothing to draw again.
 */
const WORK_KEY = 'superprint.colouring.v1';
const WORK_MAX = 4;
let saveTimer = 0;

function workId() {
  return [params.style, params.seed, params.complexity, params.paper, params.weight, params.frame].join('|');
}

function readWork() {
  try {
    const raw = localStorage.getItem(WORK_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWork, 1200);
}

function saveWork() {
  let list = readWork().filter((w) => w.id !== workId());
  const blank = undoStack.length === 0;
  if (!blank) list.unshift({ id: workId(), png: els.paint.toDataURL('image/png'), at: Date.now() });
  list = list.slice(0, WORK_MAX);

  // Images are big and quotas are small, so give up a sheet at a time rather
  // than losing the one being worked on.
  while (list.length) {
    try {
      localStorage.setItem(WORK_KEY, JSON.stringify(list));
      return;
    } catch {
      list.pop();
    }
  }
  try { localStorage.removeItem(WORK_KEY); } catch { /* private mode */ }
}

async function restoreWork() {
  const found = readWork().find((w) => w.id === workId());
  if (!found?.png) return false;
  try {
    const img = new Image();
    img.src = found.png;
    await img.decode();
    paintCtx.drawImage(img, 0, 0, W, H);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- output -- */

/*
 * Composited fresh rather than scaled up from the screen: the line art is
 * redrawn from the SVG at the export's own resolution, so what prints has the
 * same crisp edges the blank design would have. Only the colour underneath is
 * enlarged, and flat colour survives that without anyone noticing.
 */
const MAX_EXPORT_PIXELS = 12e6;

async function composite(dpi) {
  const scale = dpi / 100;
  let w = Math.round(page.w * scale);
  let h = Math.round(page.h * scale);
  if (w * h > MAX_EXPORT_PIXELS) {
    const k = Math.sqrt(MAX_EXPORT_PIXELS / (w * h));
    w = Math.round(w * k);
    h = Math.round(h * k);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(els.paint, 0, 0, w, h);
  ctx.drawImage(await rasterize(buildSVG(params, { background: 'none' })), 0, 0, w, h);
  return canvas;
}

async function saveColoured() {
  els.save.disabled = true;
  try {
    const canvas = await composite(300);
    await downloadCanvas(canvas, filename(params, 'png').replace(/\.png$/, '-coloured.png'));
    toast('Saved your coloured page');
  } catch (err) {
    toast(err.message || 'Could not save that');
  } finally {
    els.save.disabled = false;
  }
}

async function printColoured() {
  els.print.disabled = true;
  try {
    const url = (await composite(200)).toDataURL('image/png');
    // The print sheet gets one frame to lay out, which a data URL this size
    // will not have decoded in. Decoding here puts it in the cache first.
    const img = new Image();
    img.src = url;
    await img.decode();
    printImage(url, params);
  } catch (err) {
    toast(err.message || 'Could not print that');
  } finally {
    els.print.disabled = false;
  }
}

/* ------------------------------------------------------------- chrome -- */

function buildSwatches() {
  for (const hex of COLOURS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.setProperty('--swatch', hex);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(hex === colour));
    b.setAttribute('aria-label', `Colour ${hex}`);
    b.addEventListener('click', () => {
      colour = hex;
      // Picking a colour is also how you stop erasing.
      if (tool === 'eraser') setTool('fill');
      els.swatches.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', String(s === b)));
    });
    els.swatches.appendChild(b);
  }
}

function setTool(id) {
  tool = id;
  els.tools.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
  els.brushSize.hidden = id === 'fill';
  const t = TOOLS.find((x) => x.id === id);
  if (t && els.hint.dataset.done !== '1') els.hint.textContent = t.hint;
}

function buildTools() {
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tool = t.id;
    b.innerHTML = `${ICONS[t.icon]}<span>${t.label}</span>`;
    b.setAttribute('aria-pressed', String(t.id === tool));
    b.addEventListener('click', () => setTool(t.id));
    els.tools.appendChild(b);
  }
}

function dismissHint() {
  if (els.hint.dataset.done === '1') return;
  els.hint.dataset.done = '1';
  els.hint.classList.add('is-gone');
}

/* -------------------------------------------------------------- start -- */

async function start() {
  const size = workingSize();
  W = size.w;
  H = size.h;
  els.paint.width = W;
  els.paint.height = H;

  els.titleEl.textContent = `${getStyle(params.style).name} · ${params.seed}`;
  document.title = `Colour ${title(params)} — SuperPrint`;
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  els.back.href = `studio.html?${q.toString()}`;
  els.back.innerHTML = `${ICONS.back}<span>Back</span>`;
  els.save.innerHTML = `${ICONS.download}<span>Save</span>`;
  els.print.innerHTML = `${ICONS.print}<span>Print</span>`;
  els.undo.innerHTML = ICONS.undo;

  buildSwatches();
  buildTools();
  paintUndoState();

  /*
   * The artwork, on a transparent ground so the paint layer shows through it.
   *
   * It goes on screen as the SVG, which stays sharp at any zoom, and is
   * rasterised once off-screen to give the flood fill its walls. That canvas is
   * only wanted for the one read: what survives is the alpha channel, a quarter
   * of its size, and the canvas itself is dropped.
   */
  const svg = buildSVG(params, { background: 'none' });
  els.lines.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const [, art] = await Promise.all([els.lines.decode(), rasterize(svg)]);

  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const offCtx = off.getContext('2d', { willReadFrequently: true });
  offCtx.drawImage(art, 0, 0, W, H);
  lineAlpha = alphaChannel(offCtx.getImageData(0, 0, W, H).data, W, H);

  if (await restoreWork()) toast('Picked up where you left off');
  applyView();
  ready = true;

  els.paper.addEventListener('pointerdown', onPointerDown);
  els.paper.addEventListener('pointermove', onPointerMove);
  els.paper.addEventListener('pointerup', onPointerUp);
  els.paper.addEventListener('pointercancel', onPointerUp);
  els.stage.addEventListener('wheel', onWheel, { passive: false });

  els.brushRange.addEventListener('input', () => { brushStep = parseInt(els.brushRange.value, 10); });
  els.undo.addEventListener('click', undo);
  els.clear.addEventListener('click', clearAll);
  els.reset.addEventListener('click', resetView);
  els.save.addEventListener('click', saveColoured);
  els.print.addEventListener('click', printColoured);

  window.addEventListener('resize', () => { clampView(); applyView(); });
  // A backgrounded tab may never come back, so bank the work now rather than
  // waiting out the debounce.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { clearTimeout(saveTimer); saveWork(); }
  });

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (e.key === 'f') setTool('fill');
    else if (e.key === 'b') setTool('brush');
    else if (e.key === 'e') setTool('eraser');
    else if (e.key === '0') resetView();
  });
}

// Last, not at the top: `start` reads module state that is declared with const
// above it, which does not exist until the module body has run.
if (els.paint) start();
