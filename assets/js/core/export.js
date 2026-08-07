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

/** @param dpi 300 gives a true print-quality raster. */
export function downloadPNG(params, dpi = 300) {
  return new Promise((resolve, reject) => {
    const p = normalize(params);
    const page = PAPERS[p.paper];
    const scale = dpi / 100; // sheets are authored at 100 units per inch
    const svg = buildSVG(p);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(page.w * scale);
      canvas.height = Math.round(page.h * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((out) => {
        if (!out) return reject(new Error('PNG encoding failed'));
        saveBlob(out, filename(p, 'png'));
        resolve();
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not rasterise this design'));
    };
    img.src = url;
  });
}

/**
 * Print by swapping the page for a single full-bleed sheet. Beats opening a
 * popup (blockers) and keeps the browser's own print preview.
 */
export function printDesign(params) {
  const p = normalize(params);
  const page = PAPERS[p.paper];

  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  root.innerHTML = buildSVG(p);
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

  document.title = `${title(p)} — SuperPrint`;
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
