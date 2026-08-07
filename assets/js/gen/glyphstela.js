/*
 * Glyph Stela — invented signs set in the grammar of Classic Maya inscriptions.
 *
 * IMPORTANT: these are not real Maya glyphs and they spell nothing. Maya script
 * is a living heritage with a mostly deciphered logosyllabic vocabulary of some
 * 800 signs; inventing readable text would be a forgery, and scribbling
 * "hieroglyphic-looking" doodles would be a caricature. This generator does the
 * honest third thing — it reproduces the documented *structure* of the writing
 * system and fills the slots with original signs.
 *
 * The structural rules it follows:
 *
 *  - Text is set in glyph blocks, square in outline except for rounded corners
 *    (monumental style; codex forms are rounder).
 *  - A block holds one large MAIN SIGN plus smaller AFFIXES attached above
 *    (superfix), left (prefix), right (postfix) and below (subfix), and may
 *    carry an INFIX embedded inside the main sign.
 *  - Affixes are narrow signs, roughly 2:1 to 3:1 in their long dimension.
 *  - Main signs come in two flavours: abstract/geometric, or a HEAD VARIANT —
 *    a human or animal head in profile.
 *  - Blocks are laid out in PAIRED COLUMNS and read in a zigzag: A1, B1, A2,
 *    B2, and so on down the pair. The layout here follows that pairing, which
 *    is why columns are generated two at a time.
 *  - Numbers are bar-and-dot coefficients (dot = 1, bar = 5, shell = 0),
 *    attached as a prefix to the sign they count.
 *  - Calendar day signs sit inside a cartouche with a small pedestal.
 *
 * Sign shapes are assembled from the formal vocabulary described in the
 * catalogues — enclosing outlines, crossed bands, scroll volutes, dotted bands,
 * brackets, hatching and spots — rather than copied from any real sign.
 */

import { TAU, f, polar, smooth, lerp } from '../core/util.js';

/* ------------------------------------------------------- sign interiors -- */

/** Interior motifs, drawn inside a sign's rectangle. */
const ELEMENTS = {
  crossedBands(sk, x, y, w, h) {
    const i = Math.min(w, h) * 0.12;
    const b = Math.min(w, h) * 0.16;
    for (const [ax, ay, bx, by] of [
      [x + i, y + i, x + w - i, y + h - i],
      [x + w - i, y + i, x + i, y + h - i],
    ]) {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * b * 0.5;
      const ny = (dx / len) * b * 0.5;
      sk.poly([
        { x: ax + nx, y: ay + ny }, { x: bx + nx, y: by + ny },
        { x: bx - nx, y: by - ny }, { x: ax - nx, y: ay - ny },
      ], true, sk.w(0.85));
    }
  },

  dottedBand(sk, x, y, w, h, rng) {
    const n = Math.max(2, Math.round(w / (h * 0.62)));
    const r = Math.min(h * 0.3, w / n / 2.4);
    for (let i = 0; i < n; i++) {
      const cx = x + (w * (i + 0.5)) / n;
      sk.circle(cx, y + h / 2, r, sk.w(0.85));
      if (r > 5 && rng.bool(0.4)) sk.circle(cx, y + h / 2, r * 0.42, sk.w(0.7));
    }
  },

  bracket(sk, x, y, w, h, rng) {
    const i = Math.min(w, h) * 0.14;
    const flip = rng.bool();
    const r = Math.min(w, h) * 0.38;
    const top = flip ? y + h - i : y + i;
    const bot = flip ? y + i : y + h - i;
    sk.path(
      `M${f(x + i)} ${f(top)}L${f(x + i)} ${f(bot - (flip ? -r : r))}` +
      `Q${f(x + i)} ${f(bot)} ${f(x + i + r)} ${f(bot)}` +
      `L${f(x + w - i - r)} ${f(bot)}` +
      `Q${f(x + w - i)} ${f(bot)} ${f(x + w - i)} ${f(bot - (flip ? -r : r))}` +
      `L${f(x + w - i)} ${f(top)}`,
      sk.w(0.9),
    );
    const inset = Math.min(w, h) * 0.2;
    if (Math.min(w, h) > 26) {
      sk.path(
        `M${f(x + i + inset)} ${f(top)}L${f(x + i + inset)} ${f(bot - (flip ? -r : r) * 0.6)}` +
        `Q${f(x + i + inset)} ${f(bot - (flip ? -inset : inset))} ${f(x + i + inset + r * 0.6)} ${f(bot - (flip ? -inset : inset))}` +
        `L${f(x + w - i - inset - r * 0.6)} ${f(bot - (flip ? -inset : inset))}` +
        `Q${f(x + w - i - inset)} ${f(bot - (flip ? -inset : inset))} ${f(x + w - i - inset)} ${f(bot - (flip ? -r : r) * 0.6)}` +
        `L${f(x + w - i - inset)} ${f(top)}`,
        sk.w(0.7),
      );
    }
  },

  scroll(sk, x, y, w, h, rng) {
    // Volutes are everywhere in Maya carving — the single most characteristic
    // interior mark after the dot.
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) * 0.42;
    const turns = rng.range(1.6, 2.4);
    const dir = rng.sign();
    const pts = [];
    const steps = Math.ceil(turns * 22);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push(polar(cx, cy, r * (0.12 + 0.88 * t), dir * t * turns * TAU + rng.range(0, 0.01)));
    }
    sk.path(smooth(pts), sk.w(0.9));
    sk.circle(cx, cy, r * 0.14, sk.w(0.75));
  },

  hatch(sk, x, y, w, h, rng) {
    const i = Math.min(w, h) * 0.12;
    sk.rect(x + i, y + i, w - i * 2, h - i * 2, Math.min(w, h) * 0.1, sk.w(0.85));

    // Clip each diagonal analytically to the inner rectangle. Interpolating
    // along the perimeter instead lets lines escape the box near the corners.
    const m = i * 1.6;
    const x0 = x + m;
    const y0 = y + m;
    const x1 = x + w - m;
    const y1 = y + h - m;
    if (x1 - x0 < 4 || y1 - y0 < 4) return;
    const gap = Math.max(5, Math.min(w, h) * 0.19);

    if (rng.bool()) {
      for (let c = x0 - y1 + gap; c < x1 - y0; c += gap) {
        const ax = Math.max(x0, y0 + c);
        const bx = Math.min(x1, y1 + c);
        if (bx - ax > 1) sk.line(ax, ax - c, bx, bx - c, sk.w(0.6));
      }
    } else {
      for (let d = x0 + y0 + gap; d < x1 + y1; d += gap) {
        const ax = Math.max(x0, d - y1);
        const bx = Math.min(x1, d - y0);
        if (bx - ax > 1) sk.line(ax, d - ax, bx, d - bx, sk.w(0.6));
      }
    }
  },

  spot(sk, x, y, w, h, rng) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) * 0.36;
    sk.circle(cx, cy, r, sk.w(0.9));
    sk.circle(cx, cy, r * 0.5, sk.w(0.75));
    if (rng.bool(0.5)) {
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const p = polar(cx, cy, r * 1.5, (i / n) * TAU + 0.4);
        if (p.x > x && p.x < x + w && p.y > y && p.y < y + h) sk.circle(p.x, p.y, r * 0.16, sk.w(0.7));
      }
    }
  },

  arcs(sk, x, y, w, h, rng) {
    const layers = rng.int(2, 4);
    const cx = x + w / 2;
    const base = y + h * 0.88;
    for (let i = 0; i < layers; i++) {
      const r = (Math.min(w, h * 1.6) * 0.46 * (layers - i)) / layers;
      sk.path(`M${f(cx - r)} ${f(base)}A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${f(base)}`, sk.w(i ? 0.75 : 0.9));
    }
  },

  tSign(sk, x, y, w, h) {
    // A T-shaped sign, one of the readily recognised abstract forms.
    const i = Math.min(w, h) * 0.14;
    const armH = h * 0.34;
    const stemW = w * 0.34;
    sk.poly([
      { x: x + i, y: y + i },
      { x: x + w - i, y: y + i },
      { x: x + w - i, y: y + i + armH },
      { x: x + w / 2 + stemW / 2, y: y + i + armH },
      { x: x + w / 2 + stemW / 2, y: y + h - i },
      { x: x + w / 2 - stemW / 2, y: y + h - i },
      { x: x + w / 2 - stemW / 2, y: y + i + armH },
      { x: x + i, y: y + i + armH },
    ], true, sk.w(0.9));
  },

  stepFret(sk, x, y, w, h) {
    const i = Math.min(w, h) * 0.14;
    const n = 3;
    const sw = (w - i * 2) / n;
    const sh = (h - i * 2) / n;
    const pts = [{ x: x + i, y: y + h - i }];
    for (let k = 0; k < n; k++) {
      pts.push({ x: x + i + sw * k, y: y + h - i - sh * k });
      pts.push({ x: x + i + sw * (k + 1), y: y + h - i - sh * k });
    }
    pts.push({ x: x + w - i, y: y + i });
    sk.poly(pts, false, sk.w(0.9));
    sk.poly(pts.map((p) => ({ x: p.x, y: p.y - sh * 0.42 })), false, sk.w(0.7));
  },

  bars(sk, x, y, w, h, rng) {
    const n = rng.int(2, 3);
    const gap = (h - Math.min(w, h) * 0.2) / n;
    for (let i = 0; i < n; i++) {
      sk.rect(x + w * 0.14, y + Math.min(w, h) * 0.1 + gap * i + gap * 0.16, w * 0.72, gap * 0.6,
        gap * 0.2, sk.w(0.85));
    }
  },
};

const ELEMENT_NAMES = Object.keys(ELEMENTS);

/* ------------------------------------------------------------- affixes -- */

/** Narrow signs that clip onto the edges of a main sign. */
function drawAffix(sk, x, y, w, h, rng) {
  const r = Math.min(w, h) * 0.34;
  sk.rect(x, y, w, h, r, sk.w(0.95));

  const horizontal = w >= h;
  const kind = rng.next();
  const i = Math.min(w, h) * 0.24;

  if (kind < 0.26) {
    // Row of spots.
    const n = Math.max(2, Math.round((horizontal ? w : h) / (Math.min(w, h) * 0.85)));
    const rr = Math.min(w, h) * 0.2;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      sk.circle(horizontal ? x + w * t : x + w / 2, horizontal ? y + h / 2 : y + h * t, rr, sk.w(0.75));
    }
  } else if (kind < 0.48) {
    // Comb teeth.
    const n = Math.max(3, Math.round((horizontal ? w : h) / (Math.min(w, h) * 0.55)));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (horizontal) sk.line(x + w * t, y + i, x + w * t, y + h - i, sk.w(0.7));
      else sk.line(x + i, y + h * t, x + w - i, y + h * t, sk.w(0.7));
    }
  } else if (kind < 0.66) {
    // Inner outline.
    sk.rect(x + i * 0.7, y + i * 0.7, w - i * 1.4, h - i * 1.4, r * 0.6, sk.w(0.7));
  } else if (kind < 0.82) {
    // Nested arcs along the long edge.
    const n = Math.max(2, Math.round((horizontal ? w : h) / (Math.min(w, h) * 1.1)));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const cx = horizontal ? x + w * t : x + w / 2;
      const cy = horizontal ? y + h * 0.72 : y + h * t;
      const rr = Math.min(w, h) * 0.28;
      sk.path(`M${f(cx - rr)} ${f(cy)}A${f(rr)} ${f(rr)} 0 0 1 ${f(cx + rr)} ${f(cy)}`, sk.w(0.72));
    }
  } else {
    // A scroll tucked into one end.
    const s = Math.min(w, h) * 0.8;
    ELEMENTS.scroll(sk, x + (horizontal ? i * 0.2 : (w - s) / 2), y + (horizontal ? (h - s) / 2 : i * 0.2), s, s, rng);
  }
}

/* ------------------------------------------------------------ numerals -- */

/**
 * Bar-and-dot coefficient: dot = 1, bar = 5, shell = 0. Dots sit in a row above
 * the stacked bars, which is how coefficients read on monuments.
 */
function drawNumeral(sk, x, y, w, h, value, rng) {
  if (value === 0) {
    // Shell sign for zero.
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) * 0.42;
    sk.path(
      `M${f(cx - r)} ${f(cy)}Q${f(cx - r)} ${f(cy - r)} ${f(cx)} ${f(cy - r)}` +
      `Q${f(cx + r)} ${f(cy - r)} ${f(cx + r)} ${f(cy)}` +
      `Q${f(cx + r)} ${f(cy + r * 0.9)} ${f(cx)} ${f(cy + r * 0.9)}` +
      `Q${f(cx - r)} ${f(cy + r * 0.9)} ${f(cx - r)} ${f(cy)}Z`,
      sk.w(0.95),
    );
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      sk.path(`M${f(cx - r + r * 2 * t)} ${f(cy - r * 0.85)}Q${f(cx - r + r * 2 * t + r * 0.14)} ${f(cy)} ${f(cx - r + r * 2 * t)} ${f(cy + r * 0.78)}`, sk.w(0.65));
    }
    return;
  }

  const bars = Math.floor(value / 5);
  const dots = value % 5;
  const rows = bars + (dots ? 1 : 0);
  const rowH = h / Math.max(1, rows);
  let cy = y;

  if (dots) {
    const r = Math.min(rowH * 0.3, w / (dots * 2.6));
    for (let i = 0; i < dots; i++) {
      sk.circle(x + (w * (i + 0.5)) / dots, cy + rowH / 2, r, sk.w(0.9));
    }
    cy += rowH;
  }
  for (let i = 0; i < bars; i++) {
    sk.rect(x + w * 0.06, cy + rowH * 0.24, w * 0.88, rowH * 0.5, rowH * 0.2, sk.w(0.95));
    cy += rowH;
  }
  void rng;
}

/* --------------------------------------------------------- head variant -- */

/**
 * A head in profile, facing left — the other form a main sign can take.
 * Built around the characteristic Maya profile: sloping forehead running
 * straight into a strong nose, almond eye, and a round ear ornament.
 */
function drawHead(sk, x, y, w, h, rng) {
  // Letterbox into a near-upright field. The profile geometry is drawn for a
  // roughly square head; stretched to a wide block it reads as a caricature.
  if (w / h > 1.22) {
    x += (w - h * 1.22) / 2;
    w = h * 1.22;
  } else if (w / h < 0.82) {
    y += (h - w / 0.82) / 2;
    h = w / 0.82;
  }
  const u = (a, b) => ({ x: x + w * a, y: y + h * b });

  const outline = [
    u(0.46, 0.03), u(0.74, 0.07), u(0.9, 0.24), u(0.93, 0.52),
    u(0.86, 0.82), u(0.66, 0.95), u(0.4, 0.95), u(0.2, 0.84),
    u(0.13, 0.68), u(0.05, 0.52), u(0.16, 0.38), u(0.22, 0.18),
  ];
  sk.path(smooth(outline, true), sk.w(1));

  // Brow into nose: one continuous line, the signature of the profile.
  const brow = u(0.34, 0.3);
  const noseTip = u(0.07, 0.5);
  const nostril = u(0.2, 0.58);
  sk.path(
    `M${f(u(0.5, 0.24).x)} ${f(u(0.5, 0.24).y)}Q${f(brow.x)} ${f(brow.y)} ${f(noseTip.x)} ${f(noseTip.y)}` +
    `Q${f(u(0.13, 0.6).x)} ${f(u(0.13, 0.6).y)} ${f(nostril.x)} ${f(nostril.y)}`,
    sk.w(0.9),
  );

  // Almond eye.
  const eye = u(0.42, 0.38);
  const er = Math.min(w, h) * 0.12;
  sk.path(
    `M${f(eye.x - er)} ${f(eye.y)}Q${f(eye.x)} ${f(eye.y - er * 0.85)} ${f(eye.x + er)} ${f(eye.y)}` +
    `Q${f(eye.x)} ${f(eye.y + er * 0.85)} ${f(eye.x - er)} ${f(eye.y)}Z`,
    sk.w(0.85),
  );
  sk.circle(eye.x, eye.y, er * 0.34, sk.w(0.8));

  // Mouth, sometimes with a fang.
  const m1 = u(0.16, 0.7);
  const m2 = u(0.46, 0.72);
  sk.path(`M${f(m1.x)} ${f(m1.y)}Q${f((m1.x + m2.x) / 2)} ${f(m1.y + h * 0.06)} ${f(m2.x)} ${f(m2.y)}`, sk.w(0.9));
  if (rng.bool(0.45)) {
    const fx = u(0.26, 0.71);
    sk.poly([fx, { x: fx.x + w * 0.05, y: fx.y }, { x: fx.x + w * 0.025, y: fx.y + h * 0.1 }], true, sk.w(0.75));
  }

  // Ear ornament — the round earflare worn by carved figures.
  const ear = u(0.72, 0.6);
  const rr = Math.min(w, h) * 0.15;
  sk.circle(ear.x, ear.y, rr, sk.w(0.95));
  sk.circle(ear.x, ear.y, rr * 0.45, sk.w(0.75));

  // Headdress band and crest.
  sk.path(`M${f(u(0.2, 0.2).x)} ${f(u(0.2, 0.2).y)}Q${f(u(0.5, 0.1).x)} ${f(u(0.5, 0.1).y)} ${f(u(0.84, 0.24).x)} ${f(u(0.84, 0.24).y)}`, sk.w(0.9));
  const crestN = rng.int(2, 3);
  for (let i = 0; i < crestN; i++) {
    const t = (i + 0.5) / crestN;
    const p = u(0.26 + t * 0.5, 0.14 - Math.sin(t * Math.PI) * 0.03);
    sk.circle(p.x, p.y, Math.min(w, h) * 0.045, sk.w(0.7));
  }
  if (rng.bool(0.5)) {
    ELEMENTS.scroll(sk, x + w * 0.6, y + h * 0.66, w * 0.3, h * 0.26, rng);
  }
}

/* ------------------------------------------------------------ main sign -- */

function drawMainSign(sk, x, y, w, h, rng, complexity) {
  const r = Math.min(w, h) * 0.22; // square in outline except for rounded corners
  sk.rect(x, y, w, h, r, sk.w(1.1));

  const pad = Math.min(w, h) * 0.11;
  const ix = x + pad;
  const iy = y + pad;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  if (iw < 8 || ih < 8) return;

  // Compound interiors: real signs are frequently split into stacked or
  // side-by-side fields, each carrying its own mark.
  const split = complexity > 2 && rng.bool(0.5);
  if (!split) {
    ELEMENTS[rng.pick(ELEMENT_NAMES)](sk, ix, iy, iw, ih, rng);
    return;
  }

  const vertical = rng.bool();
  const t = rng.range(0.38, 0.62);
  const gap = Math.min(iw, ih) * 0.07;
  if (vertical) {
    const h1 = ih * t - gap / 2;
    ELEMENTS[rng.pick(ELEMENT_NAMES)](sk, ix, iy, iw, h1, rng);
    ELEMENTS[rng.pick(ELEMENT_NAMES)](sk, ix, iy + h1 + gap, iw, ih - h1 - gap, rng);
  } else {
    const w1 = iw * t - gap / 2;
    ELEMENTS[rng.pick(ELEMENT_NAMES)](sk, ix, iy, w1, ih, rng);
    ELEMENTS[rng.pick(ELEMENT_NAMES)](sk, ix + w1 + gap, iy, iw - w1 - gap, ih, rng);
  }
}

/** Calendar-style cartouche: rounded frame standing on a small pedestal. */
function drawCartouche(sk, x, y, w, h, rng) {
  const footH = h * 0.16;
  const bodyH = h - footH;
  const r = Math.min(w, bodyH) * 0.38;
  sk.rect(x, y, w, bodyH, r, sk.w(1.1));
  sk.rect(x + w * 0.05, y + bodyH * 0.06, w * 0.9, bodyH * 0.88, r * 0.8, sk.w(0.7));

  // Pedestal.
  sk.poly([
    { x: x + w * 0.3, y: y + bodyH },
    { x: x + w * 0.7, y: y + bodyH },
    { x: x + w * 0.62, y: y + h },
    { x: x + w * 0.38, y: y + h },
  ], true, sk.w(0.9));

  const pad = Math.min(w, bodyH) * 0.2;
  ELEMENTS[rng.pick(ELEMENT_NAMES)](sk, x + pad, y + pad, w - pad * 2, bodyH - pad * 2, rng);
}

/* --------------------------------------------------------------- block -- */

function drawBlock(sk, x, y, s, rng, complexity) {
  const gutter = s * 0.06;
  let bx = x + gutter;
  let by = y + gutter;
  let bw = s - gutter * 2;
  let bh = s - gutter * 2;
  if (bw < 12) return;

  // Affixes are narrow: roughly a third of the block on their short axis.
  const t = bw * rng.range(0.25, 0.32);
  const gap = bw * 0.035;
  const denser = complexity >= 3;

  const numeral = rng.bool(denser ? 0.3 : 0.22);
  const hasSuper = !numeral && rng.bool(denser ? 0.4 : 0.28);
  const hasSub = rng.bool(denser ? 0.3 : 0.2);
  const hasPre = numeral || rng.bool(denser ? 0.42 : 0.3);
  const hasPost = !numeral && rng.bool(denser ? 0.34 : 0.22);

  if (hasSuper) {
    drawAffix(sk, bx, by, bw, t, rng);
    by += t + gap;
    bh -= t + gap;
  }
  if (hasSub) {
    drawAffix(sk, bx, by + bh - t, bw, t, rng);
    bh -= t + gap;
  }
  if (hasPre) {
    if (numeral) drawNumeral(sk, bx, by + bh * 0.12, t, bh * 0.76, rng.bool(0.12) ? 0 : rng.int(1, 19), rng);
    else drawAffix(sk, bx, by, t, bh, rng);
    bx += t + gap;
    bw -= t + gap;
  }
  if (hasPost) {
    drawAffix(sk, bx + bw - t, by, t, bh, rng);
    bw -= t + gap;
  }
  if (bw < 10 || bh < 10) return;

  const kind = rng.next();
  // The head profile is drawn for a roughly upright field; in a wide or squat
  // one it would stretch into a caricature, so those blocks take a sign instead.
  const aspect = bw / bh;
  if (numeral && kind < 0.55) drawCartouche(sk, bx, by, bw, bh, rng);
  else if (kind < 0.3 && aspect > 0.55 && aspect < 1.8) drawHead(sk, bx, by, bw, bh, rng);
  else drawMainSign(sk, bx, by, bw, bh, rng, complexity);
}

export default {
  id: 'glyphstela',
  name: 'Glyph Stela',
  blurb: 'Invented signs set in the block-and-affix grammar of Classic Maya inscriptions — structure faithful, meaning none.',
  tags: ['script', 'structured', 'intricate'],

  draw(sk, { rng, box, complexity }) {
    // Carved panel edge.
    const framed = rng.bool(0.65);
    const bw = framed ? Math.min(box.w, box.h) * 0.035 : 0;
    if (framed) {
      sk.rect(box.x, box.y, box.w, box.h, 0, sk.w(1.3));
      sk.rect(box.x + bw, box.y + bw, box.w - bw * 2, box.h - bw * 2, 0, sk.w(0.9));
    }
    const pad = framed ? bw * 2.2 : 0;
    const field = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };

    // Columns come in pairs, because the text reads A1, B1, A2, B2 down each
    // pair of columns before moving to the next.
    const pairs = complexity <= 2 ? 1 : complexity <= 4 ? 2 : 3;
    const cols = pairs * 2;
    const rows = Math.max(2, Math.round(field.h / (field.w / cols)));
    // Blocks are square, so the cell size is set by whichever axis binds first
    // — on landscape sheets a two-column grid would otherwise run off the page.
    const s = Math.min(field.w / cols, field.h / rows);
    const ox = field.x + (field.w - cols * s) / 2;
    const oy = field.y + (field.h - rows * s) / 2;

    // Many stelae open with an oversized introductory glyph; when there is room
    // it takes the first two columns and two rows.
    const intro = rows >= 3 && cols >= 4 && rng.bool(0.4);
    const skip = new Set();
    if (intro) {
      for (const [c, r] of [[0, 0], [1, 0], [0, 1], [1, 1]]) skip.add(`${c},${r}`);
      drawBlock(sk, ox, oy, s * 2, rng, Math.min(5, complexity + 1));
    }

    for (let pair = 0; pair < pairs; pair++) {
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < 2; k++) {
          const c = pair * 2 + k;
          if (skip.has(`${c},${r}`)) continue;
          drawBlock(sk, ox + c * s, oy + r * s, s, rng, complexity);
        }
      }
    }
    void lerp;
  },
};
