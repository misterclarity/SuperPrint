/*
 * Sketch: a tiny immediate-mode SVG builder.
 *
 * Generators never touch the DOM — they append markup strings here. That keeps
 * them fast enough to render a 24-thumbnail gallery, and lets the exact same
 * code path produce the on-screen preview, the downloadable .svg and the
 * high-resolution .png.
 */

import { f, poly } from './util.js';

const INK = '#141210';

function attrs(a) {
  let out = '';
  for (const k in a) {
    if (a[k] === undefined || a[k] === null) continue;
    out += ` ${k}="${a[k]}"`;
  }
  return out;
}

export class Sketch {
  /**
   * `stroke` is the pen actually being drawn with. `refStroke` is the widest
   * pen the sheet might be drawn with, and is what generators must consult
   * when deciding whether a detail is worth drawing — see
   * tests/line-weight.test.mjs. Judging legibility against `stroke` would make
   * the choice of pen change the artwork itself.
   */
  constructor({ width, height, stroke = 2.4, refStroke }) {
    this.width = width;
    this.height = height;
    this.stroke = stroke;
    this.refStroke = refStroke || stroke;
    this.parts = [];
  }

  /** Line weight relative to the sheet's base weight. */
  w(mult = 1) {
    return { 'stroke-width': f(this.stroke * mult) };
  }

  raw(markup) {
    this.parts.push(markup);
    return this;
  }

  open(transform, extra = {}) {
    this.parts.push(`<g${transform ? ` transform="${transform}"` : ''}${attrs(extra)}>`);
    return this;
  }

  close() {
    this.parts.push('</g>');
    return this;
  }

  path(d, a = {}) {
    return this.raw(`<path d="${d}"${attrs(a)}/>`);
  }

  circle(cx, cy, r, a = {}) {
    if (r <= 0) return this;
    return this.raw(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"${attrs(a)}/>`);
  }

  ellipse(cx, cy, rx, ry, rot = 0, a = {}) {
    const t = rot ? { transform: `rotate(${f((rot * 180) / Math.PI)} ${f(cx)} ${f(cy)})` } : {};
    return this.raw(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"${attrs({ ...t, ...a })}/>`);
  }

  line(x1, y1, x2, y2, a = {}) {
    return this.raw(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"${attrs(a)}/>`);
  }

  rect(x, y, w, h, rx = 0, a = {}) {
    return this.raw(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ''}${attrs(a)}/>`);
  }

  poly(pts, close = true, a = {}) {
    if (!pts || pts.length < 2) return this;
    return this.path(poly(pts, close), a);
  }

  /** Small text label (used only for the optional printed caption). */
  text(x, y, str, size, a = {}) {
    const safe = String(str).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    return this.raw(
      `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" font-family="Helvetica, Arial, sans-serif"${attrs(a)}>${safe}</text>`,
    );
  }

  toSVG({ title = 'Coloring page', background = '#ffffff' } = {}) {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}"`,
      ` width="${this.width}" height="${this.height}" role="img" aria-label="${title}">`,
      `<title>${title}</title>`,
      `<rect width="${this.width}" height="${this.height}" fill="${background}"/>`,
      `<g fill="none" stroke="${INK}" stroke-width="${f(this.stroke)}"`,
      ' stroke-linecap="round" stroke-linejoin="round">',
      this.parts.join(''),
      '</g></svg>',
    ].join('');
  }
}
