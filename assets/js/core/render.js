/*
 * The render pipeline: params in, SVG string out.
 *
 * Everything downstream (preview, gallery thumbnail, .svg download, .png
 * download, print sheet) goes through `buildSVG`, so what you see is exactly
 * what prints.
 */

import { Sketch } from './sketch.js';
import { makeRng, randomSeed } from './rng.js';
import { getStyle, STYLE_MAP } from '../gen/index.js';
import { f } from './util.js';

// Sheet sizes in user units at 100 units per inch.
export const PAPERS = {
  letter: { id: 'letter', label: 'US Letter', sub: '8.5 × 11 in', w: 850, h: 1100 },
  'letter-landscape': { id: 'letter-landscape', label: 'Letter landscape', sub: '11 × 8.5 in', w: 1100, h: 850 },
  a4: { id: 'a4', label: 'A4', sub: '210 × 297 mm', w: 827, h: 1169 },
  'a4-landscape': { id: 'a4-landscape', label: 'A4 landscape', sub: '297 × 210 mm', w: 1169, h: 827 },
  square: { id: 'square', label: 'Square', sub: '10 × 10 in', w: 1000, h: 1000 },
};

export const WEIGHTS = {
  fine: { id: 'fine', label: 'Fine', sub: 'Pencils & fineliners', value: 1.7 },
  medium: { id: 'medium', label: 'Medium', sub: 'Everyday', value: 2.8 },
  bold: { id: 'bold', label: 'Bold', sub: 'Markers & low vision', value: 4.4 },
};

export const FRAMES = {
  none: { id: 'none', label: 'None' },
  thin: { id: 'thin', label: 'Thin' },
  double: { id: 'double', label: 'Double' },
  rounded: { id: 'rounded', label: 'Rounded' },
};

export const COMPLEXITY_LABELS = ['', 'Calm', 'Easy', 'Balanced', 'Detailed', 'Intricate'];

export const DEFAULTS = {
  style: 'mandala',
  seed: 'amber-meadow-108',
  complexity: 3,
  paper: 'letter',
  weight: 'medium',
  frame: 'thin',
  caption: true,
};

export function normalize(input = {}) {
  const p = { ...DEFAULTS, ...input };
  return {
    style: STYLE_MAP[p.style] ? p.style : DEFAULTS.style,
    seed: String(p.seed || randomSeed()).slice(0, 48),
    complexity: Math.min(5, Math.max(1, parseInt(p.complexity, 10) || 3)),
    paper: PAPERS[p.paper] ? p.paper : DEFAULTS.paper,
    weight: WEIGHTS[p.weight] ? p.weight : DEFAULTS.weight,
    frame: FRAMES[p.frame] ? p.frame : DEFAULTS.frame,
    caption: p.caption === false || p.caption === 'false' || p.caption === '0' ? false : true,
  };
}

function drawFrame(sk, params, page) {
  const m = Math.min(page.w, page.h) * 0.045;
  const x = m;
  const y = m;
  const w = page.w - m * 2;
  const h = page.h - m * 2;
  const gap = Math.min(page.w, page.h) * 0.016;

  switch (params.frame) {
    case 'thin':
      sk.rect(x, y, w, h, 0, sk.w(1.2));
      break;
    case 'double':
      sk.rect(x, y, w, h, 0, sk.w(1.4));
      sk.rect(x + gap, y + gap, w - gap * 2, h - gap * 2, 0, sk.w(0.8));
      break;
    case 'rounded':
      sk.rect(x, y, w, h, gap * 2.5, sk.w(1.3));
      break;
    default:
      break;
  }
}

/** Inner drawing area, leaving room for the frame and printer margins. */
function contentBox(params, page) {
  const base = Math.min(page.w, page.h);
  const m = params.frame === 'none' ? base * 0.055 : base * 0.095;
  return { x: m, y: m, w: page.w - m * 2, h: page.h - m * 2 };
}

export function title(params) {
  return `${getStyle(params.style).name} · ${params.seed}`;
}

export function buildSVG(input, { background = '#ffffff' } = {}) {
  const params = normalize(input);
  const page = PAPERS[params.paper];
  const style = getStyle(params.style);
  const sk = new Sketch({ width: page.w, height: page.h, stroke: WEIGHTS[params.weight].value });

  drawFrame(sk, params, page);

  const rng = makeRng(`${params.style}|${params.seed}|${params.complexity}|${params.paper}`);
  style.draw(sk, { rng, box: contentBox(params, page), complexity: params.complexity, page });

  if (params.caption) {
    const size = Math.min(page.w, page.h) * 0.0135;
    sk.text(page.w / 2, page.h - Math.min(page.w, page.h) * 0.021, `${style.name.toLowerCase()} · ${params.seed} · superprint`, size, {
      fill: '#b8b2aa',
      stroke: 'none',
      'text-anchor': 'middle',
      'letter-spacing': f(size * 0.12),
    });
  }

  return sk.toSVG({ title: title(params), background });
}

/** Stable, filesystem-safe filename for downloads. */
export function filename(input, ext) {
  const p = normalize(input);
  return `superprint-${p.style}-${p.seed}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + `.${ext}`;
}
