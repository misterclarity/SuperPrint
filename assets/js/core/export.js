/*
 * Download + print helpers.
 *
 * PNG export rasterises the very same SVG through a canvas at print
 * resolution, so there is no second rendering path to keep in sync.
 */

import { buildSVG, filename, PAPERS, normalize, title } from './render.js';

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadSVG(params) {
  const svg = buildSVG(params);
  saveBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename(params, 'svg'));
}

/** Save a canvas as a PNG, for callers that composited something themselves. */
export function downloadCanvas(canvas, name) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((out) => {
      if (!out) return reject(new Error('PNG encoding failed'));
      saveBlob(out, name);
      resolve();
    }, 'image/png');
  });
}

/**
 * An SVG string as a decoded image, ready to draw into a canvas at any size.
 *
 * Shared with the colouring page, which rasterises the same artwork twice: once
 * small enough to flood fill quickly, and again at print resolution on the way
 * out.
 */
export function rasterize(svg) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      // Revoking immediately after decode would race Safari, which reads the
      // blob lazily; one turn of the event loop is enough.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not rasterise this design'));
    };
    img.src = url;
  });
}

/** @param dpi 300 gives a true print-quality raster. */
export async function downloadPNG(params, dpi = 300) {
  const p = normalize(params);
  const page = PAPERS[p.paper];
  const scale = dpi / 100; // sheets are authored at 100 units per inch
  const img = await rasterize(buildSVG(p));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(page.w * scale);
  canvas.height = Math.round(page.h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  await downloadCanvas(canvas, filename(p, 'png'));
}

/**
 * Print by swapping the page for a single full-bleed sheet. Beats opening a
 * popup (blockers) and keeps the browser's own print preview.
 *
 * @param markup the sheet itself, either the design's SVG or an <img> of a
 *   coloured raster. Both are sized by the stylesheet to fill the sheet.
 */
function printSheet(markup, page, docTitle) {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  root.innerHTML = markup;
  const svgEl = root.querySelector('svg');
  if (svgEl) {
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');
  }

  let pageStyle = document.getElementById('print-page-size');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'print-page-size';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = `@page { size: ${page.w / 100}in ${page.h / 100}in; margin: 0; }`;

  document.title = `${docTitle} — SuperPrint`;
  document.body.classList.add('is-printing');

  const cleanup = () => {
    document.body.classList.remove('is-printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  // Give the browser a frame to lay the sheet out before opening the dialog.
  requestAnimationFrame(() => {
    window.print();
    setTimeout(cleanup, 1500);
  });
}

export function printDesign(params) {
  const p = normalize(params);
  printSheet(buildSVG(p), PAPERS[p.paper], title(p));
}

/** Print what someone has coloured, rather than the blank design. */
export function printImage(src, params) {
  const p = normalize(params);
  printSheet(`<img src="${src}" alt="${title(p)}">`, PAPERS[p.paper], title(p));
}

export async function copyLink(params) {
  const p = normalize(params);
  const url = new URL('studio.html', window.location.href);
  Object.entries(p).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const link = url.toString();
  try {
    await navigator.clipboard.writeText(link);
    return link;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = link;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return link;
  }
}
