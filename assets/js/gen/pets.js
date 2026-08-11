/*
 * Cats & Dogs — portraits assembled from parts rather than traced from photos.
 *
 * Every face is authored in a unit circle at the origin and placed afterwards,
 * which keeps each proportion a plain fraction of head size: eyes 0.16 above
 * centre and 0.44 out, nose at 0.3 below, ears springing from the top of the
 * skull. Reading the numbers tells you the face.
 *
 * The transform is applied to the points, not by wrapping the drawing in a
 * scaled group — a group would scale the stroke widths with it, and a portrait
 * placed at 200 units would come out drawn with a 200-unit pen.
 *
 * The two species differ in the places they actually differ. A cat's head is
 * wider at the cheeks than it is tall, with high triangular ears, a small wedge
 * nose and two whisker pads meeting under it. A dog's is longer, with a muzzle
 * that steps forward off the skull and ears that either hang or stand.
 */

import { TAU, f, poly, smooth, lerp } from '../core/util.js';
import { flattenPath } from '../core/path.js';
import { layered } from '../core/layer.js';

/* ---------------------------------------------------------------- drawing -- */

/**
 * A pen that takes unit-space geometry and puts it on the page at a given
 * centre and size.
 */
function scene(sk, cx, cy, r) {
  const P = (p) => ({ x: cx + p.x * r, y: cy + p.y * r });
  return {
    /** Straight-sided shape. */
    poly: (pts, w = 1, close = true) => sk.path(poly(pts.map(P), close), sk.w(w)),
    /** Smoothed closed outline — the workhorse for heads, ears and pads. */
    blob: (pts, w = 1) => sk.path(smooth(pts.map(P), true), sk.w(w)),
    /** Smoothed open line, for whiskers and mouths. */
    curve: (pts, w = 1) => sk.path(smooth(pts.map(P), false), sk.w(w)),
    circle: (x, y, rad, w = 1) => sk.circle(cx + x * r, cy + y * r, rad * r, sk.w(w)),
    /** True when a detail is too small to survive the widest pen on offer. */
    fits: (size) => size * r > sk.refStroke * 2.4,
  };
}

/** Mirror a half-outline (x ≥ 0, top to bottom) into a full symmetric one. */
function mirrorX(half) {
  return [...half, ...half.slice(1, -1).reverse().map((p) => ({ x: -p.x, y: p.y }))];
}

/** A ring of points — the basis of every rounded part. */
function lobe(cx, cy, rx, ry, n = 16) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

/* ------------------------------------------------------------------ eyes -- */

/**
 * One eye — the single most important thing on the page. Everything nests as a
 * separate closed region so there is an iris and a pupil to colour, and the
 * catchlight sits up and to one side, which is what makes an eye look wet
 * rather than drawn.
 */
function eye(g, x, y, w, h, { round, slit }) {
  const outline = round ? lobe(x, y, w, h, 18) : [
    { x: x - w, y: y + h * 0.1 },
    { x: x - w * 0.5, y: y - h * 0.95 },
    { x: x + w * 0.45, y: y - h * 0.88 },
    { x: x + w, y: y + h * 0.14 },
    { x: x + w * 0.4, y: y + h * 0.98 },
    { x: x - w * 0.55, y: y + h * 0.9 },
  ];
  g.blob(outline, 1.05);

  /*
   * The iris nearly fills the eye. Drawn smaller it leaves a ring of white
   * around it and the whole face turns into a row of concentric circles — the
   * bullseye look that kills any expression.
   */
  const ir = Math.min(w, h) * 0.95;
  if (!g.fits(ir * 2)) return;
  g.circle(x, y, ir, 0.85);

  if (slit) {
    // A tall lens, reaching the full height of the iris.
    const ph = ir * 0.96;
    const pw = ir * 0.2;
    g.blob([
      { x, y: y - ph },
      { x: x + pw, y },
      { x, y: y + ph },
      { x: x - pw, y },
    ], 0.8);
  } else {
    g.circle(x, y, ir * 0.62, 0.8);
  }
  if (g.fits(ir * 0.5)) g.circle(x - ir * 0.32, y - ir * 0.34, ir * 0.2, 0.6);
}

/* ------------------------------------------------------------------- cat -- */

/**
 * A cat's head: wider than tall, cheeks flaring below the eyes, a short chin.
 * The ears are the giveaway, so they are large and set well apart.
 */
function catFace(rng) {
  const cheek = rng.range(1.0, 1.16);
  const chin = rng.range(0.62, 0.76);
  const tufty = rng.bool(0.5);

  const half = [
    { x: 0, y: -0.95 },
    { x: 0.46, y: -0.9 },
    { x: 0.84, y: -0.58 },
    { x: cheek, y: -0.04 },
    { x: cheek * (tufty ? 1.0 : 0.92), y: 0.4 },
    { x: chin, y: 0.72 },
    { x: chin * 0.46, y: 0.95 },
    { x: 0, y: 1.0 },
  ];

  const ears = [];
  for (const side of [-1, 1]) {
    ears.push({
      side,
      inner: { x: side * 0.34, y: -0.92 },
      outer: { x: side * 0.94, y: -0.5 },
      tip: { x: side * rng.range(0.74, 0.96), y: rng.range(-1.74, -1.5) },
    });
  }

  return {
    kind: 'cat',
    outline: mirrorX(half),
    ears,
    eye: { x: 0.45, y: -0.16, w: 0.33, h: 0.26, round: false, slit: rng.bool(0.75) },
    noseY: 0.3,
    whiskers: rng.int(3, 4),
  };
}

function drawCatEars(g, face) {
  for (const e of face.ears) {
    g.poly([e.inner, e.tip, e.outer], 1.1);
    const mid = { x: (e.inner.x + e.outer.x) / 2, y: (e.inner.y + e.outer.y) / 2 };
    g.poly([
      { x: lerp(mid.x, e.inner.x, 0.4), y: lerp(mid.y, e.inner.y, 0.4) },
      { x: lerp(mid.x, e.tip.x, 0.66), y: lerp(mid.y, e.tip.y, 0.66) },
      { x: lerp(mid.x, e.outer.x, 0.4), y: lerp(mid.y, e.outer.y, 0.4) },
    ], 0.75);
  }
}

function drawCatMuzzle(g, face) {
  const ny = face.noseY;
  const nw = 0.15;
  g.poly([
    { x: -nw, y: ny - nw * 0.6 },
    { x: nw, y: ny - nw * 0.6 },
    { x: 0, y: ny + nw * 0.8 },
  ], 1);

  // Two whisker pads meeting under the nose — a cat's blunt little smile.
  for (const side of [-1, 1]) g.blob(lobe(side * 0.21, ny + 0.3, 0.28, 0.21, 14), 0.9);

  g.poly([{ x: 0, y: ny + nw * 0.8 }, { x: 0, y: ny + 0.22 }], 0.8, false);
  for (const side of [-1, 1]) {
    g.curve([
      { x: 0, y: ny + 0.22 },
      { x: side * 0.17, y: ny + 0.34 },
      { x: side * 0.36, y: ny + 0.21 },
    ], 0.8);
  }

  for (const side of [-1, 1]) {
    for (let i = 0; i < face.whiskers; i++) {
      const t = i / Math.max(1, face.whiskers - 1);
      const y0 = ny + 0.2 + t * 0.12;
      const y1 = y0 - 0.34 + t * 0.36;
      g.curve([
        { x: side * 0.44, y: y0 },
        { x: side * 0.95, y: (y0 + y1) / 2 },
        { x: side * 1.46, y: y1 },
      ], 0.6);
    }
  }
}

/* ------------------------------------------------------------------- dog -- */

/**
 * A dog's head: longer than a cat's, and built around a muzzle that steps
 * forward from the skull rather than sitting flush with it. Ears hang beside
 * the head or stand up from it, which is most of what separates one breed's
 * silhouette from another's.
 */
function dogFace(rng) {
  const wide = rng.range(0.88, 1.04);
  const floppy = rng.bool(0.55);
  const snoutW = rng.range(0.34, 0.48);   // half-width of the muzzle
  const snoutY = rng.range(1.12, 1.36);   // how far it reaches below centre

  /*
   * The muzzle is part of the silhouette, not a shape laid on top of it.
   *
   * That is the difference between a dog and a cat with a big nose. A cat's
   * face is one rounded mass; a dog's skull narrows at the cheeks and a snout
   * steps forward out of it, so the outline runs down the side of the head,
   * tucks in under the cheek, and then back out around the muzzle.
   */
  const half = [
    { x: 0, y: -0.93 },
    { x: 0.44, y: -0.88 },
    { x: 0.82, y: -0.6 },
    { x: wide, y: -0.12 },
    { x: wide * 0.86, y: 0.34 },
    { x: wide * 0.62, y: 0.6 },
    { x: snoutW + 0.06, y: 0.72 },
    { x: snoutW, y: snoutY - 0.28 },
    { x: snoutW * 0.82, y: snoutY },
    { x: snoutW * 0.34, y: snoutY + 0.1 },
    { x: 0, y: snoutY + 0.12 },
  ];

  const ears = [];
  for (const side of [-1, 1]) {
    if (floppy) {
      const len = rng.range(0.95, 1.45);
      const wid = rng.range(0.32, 0.46);
      ears.push([
        { x: side * 0.5, y: -0.78 },
        { x: side * (0.84 + wid), y: -0.58 },
        { x: side * (0.88 + wid), y: -0.78 + len * 0.66 },
        { x: side * (0.64 + wid * 0.4), y: -0.78 + len },
        { x: side * 0.48, y: -0.78 + len * 0.6 },
        { x: side * 0.42, y: -0.42 },
      ]);
    } else {
      ears.push([
        { x: side * 0.3, y: -0.86 },
        { x: side * rng.range(0.72, 0.92), y: rng.range(-1.74, -1.48) },
        { x: side * 1.0, y: -0.38 },
      ]);
    }
  }

  return {
    kind: 'dog',
    outline: mirrorX(half),
    ears,
    floppy,
    eye: { x: 0.44, y: -0.3, w: 0.28, h: 0.27, round: true, slit: false },
    snoutW,
    snoutY,
    noseY: snoutY - 0.62,
    tongue: rng.bool(0.35) ? rng.sign() : 0,
  };
}

function drawDogEars(g, face) {
  for (const e of face.ears) {
    if (face.floppy) g.blob(e, 1.1);
    else g.poly(e, 1.1);
  }
}

function drawDogMuzzle(g, face) {
  const ny = face.noseY;
  const m = face.snoutW;

  // A crease where the snout leaves the skull, which is what makes it read as
  // stepping forward rather than being painted on.
  g.curve([
    { x: -m - 0.06, y: 0.68 },
    { x: 0, y: 0.52 },
    { x: m + 0.06, y: 0.68 },
  ], 0.7);

  // Nose leather: broad, rounded, sitting at the top of the snout.
  const nw = m * 0.6;
  g.blob([
    { x: -nw, y: ny },
    { x: -nw * 0.72, y: ny - 0.15 },
    { x: 0, y: ny - 0.19 },
    { x: nw * 0.72, y: ny - 0.15 },
    { x: nw, y: ny },
    { x: nw * 0.56, y: ny + 0.16 },
    { x: 0, y: ny + 0.2 },
    { x: -nw * 0.56, y: ny + 0.16 },
  ], 1);

  g.poly([{ x: 0, y: ny + 0.2 }, { x: 0, y: ny + 0.36 }], 0.8, false);
  for (const side of [-1, 1]) {
    g.curve([
      { x: 0, y: ny + 0.36 },
      { x: side * m * 0.56, y: ny + 0.52 },
      { x: side * m * 0.94, y: ny + 0.3 },
    ], 0.85);
  }

  if (face.tongue) {
    const tx = face.tongue * m * 0.28;
    g.blob(lobe(tx, ny + 0.62, m * 0.34, m * 0.3, 12), 0.9);
    // The crease down the tongue, kept inside it — run past the tip it becomes
    // a stray line down the chest.
    g.poly([{ x: tx, y: ny + 0.46 }, { x: tx, y: ny + 0.78 }], 0.6, false);
  }
}


/* -------------------------------------------------------------- markings -- */

/*
 * Coat markings, which are what a portrait is mostly for. Each is a closed
 * outline laid on the face, so every one is another region to fill; a blank
 * head is a nice drawing and a poor coloring page.
 */
function markings(g, face, rng, kind) {
  const topY = -0.86;
  const e = face.eye;

  /** Clear of both eyes, so a marking never lands where a pupil should be. */
  const clearOfEyes = (x, y, rad) =>
    Math.hypot(Math.abs(x) - e.x, (y - e.y) * 0.9) > e.w + rad + 0.08;

  if (kind === 'blaze') {
    // A broad stripe down the brow, stopping above the nose.
    const w = rng.range(0.2, 0.3);
    const foot = Math.min(e.y + 0.42, face.noseY - 0.18);
    g.blob([
      { x: 0, y: topY - 0.04 },
      { x: w, y: topY + 0.34 },
      { x: w * 0.82, y: foot - 0.14 },
      { x: 0, y: foot },
      { x: -w * 0.82, y: foot - 0.14 },
      { x: -w, y: topY + 0.34 },
    ], 0.85);
  } else if (kind === 'patch') {
    const side = rng.sign();
    g.blob([
      { x: side * (e.x - e.w * 1.55), y: e.y - e.h * 1.8 },
      { x: side * (e.x + e.w * 1.9), y: e.y - e.h * 1.6 },
      { x: side * (e.x + e.w * 2.1), y: e.y + e.h * 1.2 },
      { x: side * (e.x + e.w * 0.4), y: e.y + e.h * 2.2 },
      { x: side * (e.x - e.w * 1.7), y: e.y + e.h * 1.4 },
    ], 0.85);
  } else if (kind === 'tabby') {
    const bars = rng.int(2, 3);
    for (let i = 0; i < bars; i++) {
      const y = topY + 0.18 + i * 0.17;
      const w = 0.44 - i * 0.09;
      for (const side of [-1, 1]) {
        g.curve([
          { x: side * 0.08, y: y + 0.12 },
          { x: side * (w * 0.6), y },
          { x: side * w, y: y + 0.06 },
        ], 0.75);
      }
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const y = e.y + 0.42 + i * 0.2;
        g.curve([
          { x: side * 0.66, y },
          { x: side * 0.88, y: y + 0.05 },
          { x: side * 1.04, y: y - 0.02 },
        ], 0.7);
      }
    }
  } else if (kind === 'spots') {
    const n = rng.int(5, 9);
    let guard = 0;
    let made = 0;
    const placed = [];
    while (made < n && guard++ < n * 25) {
      const x = rng.range(-1.0, 1.0);
      const y = rng.range(topY + 0.1, face.noseY + 0.1);
      const rad = rng.range(0.08, 0.15);
      if (!clearOfEyes(x, y, rad)) continue;
      if (Math.abs(x) < 0.28 && y > face.noseY - 0.4) continue; // clear of the nose
      if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < (q.rad + rad) * 1.9)) continue;
      placed.push({ x, y, rad });
      made++;
      if (g.fits(rad * 2)) g.circle(x, y, rad, 0.75);
    }
  }
}


/** Which coat this animal wears. Chosen once so face and chest agree. */
function coatOf(face, rng) {
  return rng.pick(face.kind === 'cat'
    ? ['plain', 'blaze', 'patch', 'tabby', 'tabby', 'spots']
    : ['plain', 'blaze', 'patch', 'patch', 'spots']);
}

/**
 * The same coat carried onto the chest.
 *
 * The shoulders are the largest single area on the sheet and were coming out
 * bare, which made a detailed face sit on top of an empty triangle. Repeating
 * the face's markings across them fills that space and ties the two halves of
 * the drawing together. Clipped to the shoulders, so it stops at their edge.
 */
function bodyCoat(g, face, rng, coat, foot, spread) {
  const top = (face.kind === 'cat' ? 0.72 : 0.8) + 0.5;
  const wide = (y) => 0.66 + (spread * 1.02 - 0.66) * Math.max(0, (y - top) / Math.max(0.01, foot - top));

  if (coat === 'tabby') {
    for (let y = top + 0.4; y < foot; y += 0.42) {
      const half = wide(y);
      for (const side of [-1, 1]) {
        g.curve([
          { x: side * half * 0.28, y },
          { x: side * half * 0.66, y: y - 0.16 },
          { x: side * half * 1.08, y: y - 0.06 },
        ], 0.75);
      }
    }
  } else if (coat === 'spots' || coat === 'patch') {
    const placed = [];
    let guard = 0;
    while (placed.length < rng.int(7, 13) && guard++ < 300) {
      const y = rng.range(top + 0.2, foot - 0.1);
      const half = wide(y);
      const x = rng.range(-half, half);
      const rad = rng.range(0.11, 0.2);
      if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < (q.rad + rad) * 2)) continue;
      placed.push({ x, y, rad });
      if (g.fits(rad * 2)) g.circle(x, y, rad, 0.75);
    }
  } else if (coat === 'blaze') {
    // A bib running down the chest.
    const w = 0.44;
    g.blob([
      { x: 0, y: top + 0.55 },
      { x: w, y: top + 1.0 },
      { x: w * 1.4, y: foot - 0.1 },
      { x: -w * 1.4, y: foot - 0.1 },
      { x: -w, y: top + 1.0 },
    ], 0.8);
  }
}

/* ------------------------------------------------------------- the scene -- */

/** Shoulders behind the head, turning a floating face into a portrait. */
function bust(g, face, rng, foot, spread) {
  const top = face.kind === 'cat' ? 0.72 : 0.8;
  g.blob([
    { x: -0.6, y: top },
    { x: -0.98, y: top + 0.34 },
    { x: -1.42, y: top + 0.86 },
    { x: -spread, y: foot * 0.78 },
    { x: -spread * 1.06, y: foot },
    { x: spread * 1.06, y: foot },
    { x: spread, y: foot * 0.78 },
    { x: 1.42, y: top + 0.86 },
    { x: 0.98, y: top + 0.34 },
    { x: 0.6, y: top },
  ], 1.25);

  /*
   * A ruff of chest fur: nested chevrons opening downward from the throat.
   * Rows of even scallops looked like a knitted jumper; a few broad Vs read as
   * the fur on a chest and leave big regions either side of them to colour.
   */
  const vees = rng.int(2, 3);
  for (let i = 0; i < vees; i++) {
    const y = top + 1.15 + i * 0.44;
    if (y > foot - 0.34) break;
    const half = 0.66 + i * 0.34;
    g.curve([
      { x: -half, y },
      { x: -half * 0.45, y: y + 0.3 },
      { x: 0, y: y + 0.42 },
      { x: half * 0.45, y: y + 0.3 },
      { x: half, y },
    ], 0.75);
  }
}

/** A collar across the neck, with a tag hanging from it. */
function collar(g, face, rng, foot) {
  const y = face.kind === 'cat' ? 1.24 : 1.62;
  if (y > foot - 0.3) return;
  const w = 1.18;
  const drop = 0.16;
  g.blob([
    { x: -w, y: y - drop * 0.2 },
    { x: 0, y: y + drop },
    { x: w, y: y - drop * 0.2 },
    { x: w, y: y + drop * 1.1 },
    { x: 0, y: y + drop * 2.3 },
    { x: -w, y: y + drop * 1.1 },
  ], 1);

  const studs = rng.int(4, 7);
  for (let i = 1; i < studs; i++) {
    const t = i / studs;
    const x = -w + 2 * w * t;
    const sy = y + drop * (1.1 - 1.3 * Math.abs(0.5 - t) * 2 + 0.5);
    if (g.fits(0.1)) g.circle(x, sy, 0.05, 0.6);
  }

  const tagY = y + drop * 2.3 + 0.22;
  if (rng.bool(0.7)) {
    g.circle(0, tagY, 0.19, 0.9);
    g.circle(0, tagY - 0.16, 0.05, 0.6);
  }
}

/* ------------------------------------------------------------ background -- */

const MOTIFS = {
  paw(g, x, y, s) {
    g.blob(lobe(x, y + s * 0.34, s * 0.62, s * 0.5, 14), 0.75);
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI * 0.86 + (i / 3) * Math.PI * 0.72;
      g.blob(lobe(x + Math.cos(a) * s * 0.72, y + Math.sin(a) * s * 0.72, s * 0.22, s * 0.26, 10), 0.7);
    }
  },
  bone(g, x, y, s) {
    g.blob([
      { x: x - s, y: y - s * 0.16 }, { x: x - s * 0.72, y: y - s * 0.44 },
      { x: x - s * 0.44, y: y - s * 0.2 }, { x: x + s * 0.44, y: y - s * 0.2 },
      { x: x + s * 0.72, y: y - s * 0.44 }, { x: x + s, y: y - s * 0.16 },
      { x: x + s, y: y + s * 0.16 }, { x: x + s * 0.72, y: y + s * 0.44 },
      { x: x + s * 0.44, y: y + s * 0.2 }, { x: x - s * 0.44, y: y + s * 0.2 },
      { x: x - s * 0.72, y: y + s * 0.44 }, { x: x - s, y: y + s * 0.16 },
    ], 0.75);
  },
  fish(g, x, y, s) {
    g.blob([
      { x: x - s, y }, { x: x - s * 0.3, y: y - s * 0.5 }, { x: x + s * 0.5, y: y - s * 0.36 },
      { x: x + s, y }, { x: x + s * 0.5, y: y + s * 0.36 }, { x: x - s * 0.3, y: y + s * 0.5 },
    ], 0.75);
    g.poly([{ x: x - s, y }, { x: x - s * 1.5, y: y - s * 0.42 },
      { x: x - s * 1.5, y: y + s * 0.42 }], 0.7);
  },
  heart(g, x, y, s) {
    g.blob([
      { x, y: y + s * 0.72 }, { x: x - s * 0.9, y }, { x: x - s * 0.86, y: y - s * 0.5 },
      { x: x - s * 0.34, y: y - s * 0.56 }, { x, y: y - s * 0.2 },
      { x: x + s * 0.34, y: y - s * 0.56 }, { x: x + s * 0.86, y: y - s * 0.5 },
      { x: x + s * 0.9, y },
    ], 0.75);
  },
  star(g, x, y, s) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2;
      const rad = i % 2 ? s * 0.42 : s;
      pts.push({ x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad });
    }
    g.poly(pts, 0.75);
  },
};

/**
 * Motifs strewn behind the portrait.
 *
 * Placed by rejection sampling against a keep-out disc around the head and the
 * shoulders below it, so nothing lands on the animal. They fill what would
 * otherwise be a bare margin, and each is another small thing to colour.
 */
function backdrop(g, face, rng, box, r, cx, cy, shape) {
  const names = face.kind === 'cat' ? ['paw', 'fish', 'heart', 'star'] : ['paw', 'bone', 'heart', 'star'];
  const pick = rng.sample(names, rng.int(1, 2));
  const placed = [];
  const want = rng.int(18, 30);
  let guard = 0;

  const left = (box.x - cx) / r;
  const right = (box.x + box.w - cx) / r;
  const top = (box.y - cy) / r;
  const bottom = (box.y + box.h - cy) / r;

  while (placed.length < want && guard++ < want * 60) {
    const s = rng.range(0.16, 0.27);
    const x = rng.range(left + s * 1.8, right - s * 1.8);
    const y = rng.range(top + s * 1.8, bottom - s * 1.8);
    if (shape.covers(x, y, s * 1.5)) continue;
    if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < (q.s + s) * 1.8)) continue;
    placed.push({ x, y, s });
    MOTIFS[rng.pick(pick)](g, x, y, s);
  }
}

/**
 * Where the animal is, so nothing is strewn on top of it.
 *
 * Built from the parts rather than as one bounding box: a box around a head
 * with ears and shoulders covers most of the sheet, and the strewn motifs end
 * up squeezed into the corners with the rest of the page left bare.
 */
function keepOut(face, foot, spread, hasBust) {
  const earTop = face.kind === 'cat' || !face.floppy ? -1.8 : -1.0;
  return {
    covers(x, y, pad) {
      const p = pad || 0;
      // The head, as a disc a little larger than the outline.
      if (Math.hypot(x, y * 0.94) < 1.2 + p) return true;
      // The ears, as a band above it.
      if (y < -0.4 && y > earTop - p && Math.abs(x) < 1.15 + p) return true;
      // The shoulders: a cone widening from the jaw to the foot of the page.
      if (hasBust && y > 0.55 - p && y < foot + p) {
        const t = Math.max(0, (y - 0.55) / Math.max(0.001, foot - 0.55));
        if (Math.abs(x) < 0.66 + (spread * 1.06 - 0.66) * t + p) return true;
      }
      return false;
    },
  };
}

/* ------------------------------------------------------------- the style -- */

/**
 * One portrait, centred at (cx, cy) with head radius r.
 *
 * Layered rather than drawn straight through: ears go down first and the head
 * outline is drawn over them, so the parts of an ear behind the skull are cut
 * away and it reads as sitting behind rather than through. The features sit in
 * front of everything and occlude nothing.
 */
/**
 * One portrait: backdrop, shoulders, head, features.
 *
 * Layered rather than drawn straight through, so each thing in front cuts away
 * what is behind it — the shoulders stop at the jaw instead of running up
 * through the face, the ears emerge from the skull instead of crossing it, and
 * the strewn motifs never show through the animal. Features sit in front of
 * everything and occlude nothing.
 */
function portrait(sk, cx, cy, r, face, rng, box) {
  const G = (s) => scene(s, cx, cy, r);
  const foot = (box.y + box.h - cy) / r;
  const hasBust = foot > 1.9;
  /*
   * How wide the shoulders reach, clamped so they cannot run off the sheet.
   * The head is sized from whichever of the box's dimensions binds first, and
   * on a tall narrow page that leaves a bust wider than the paper.
   */
  const spread = Math.min(rng.range(1.5, 1.95), box.w / (2.12 * r));
  const shape = keepOut(face, foot, spread, hasBust);

  // The head in page coordinates, flattened from the smoothed outline rather
  // than from its control points — the curve bulges outside the polygon its
  // controls describe, and markings clipped to the polygon would show a sliver
  // of daylight along the jaw.
  const headPoly = flattenPath(smooth(face.outline.map(
    (p) => ({ x: cx + p.x * r, y: cy + p.y * r }),
  ), true))[0].points;

  const coat = coatOf(face, rng);
  const bustPts = [
    { x: -0.6, y: (face.kind === 'cat' ? 0.72 : 0.8) },
    { x: -0.98, y: 1.14 }, { x: -1.42, y: 1.66 },
    { x: -spread, y: foot * 0.78 }, { x: -spread * 1.06, y: foot },
    { x: spread * 1.06, y: foot }, { x: spread, y: foot * 0.78 },
    { x: 1.42, y: 1.66 }, { x: 0.98, y: 1.14 },
    { x: 0.6, y: (face.kind === 'cat' ? 0.72 : 0.8) },
  ];
  const toPage = (pts) => pts.map((p) => ({ x: cx + p.x * r, y: cy + p.y * r }));
  const bustPoly = flattenPath(smooth(toPage(bustPts), true))[0].points;

  layered(sk, [
    { occludes: false, draw: (s) => backdrop(G(s), face, rng, box, r, cx, cy, shape) },
    hasBust && ((s) => bust(G(s), face, rng, foot, spread)),
    hasBust && {
      occludes: false,
      within: [bustPoly],
      draw: (s) => bodyCoat(G(s), face, rng, coat, foot, spread),
    },
    // The collar lies on the chest and hides the coat markings under it.
    hasBust && ((s) => collar(G(s), face, rng, foot)),
    (s) => (face.kind === 'cat' ? drawCatEars(G(s), face) : drawDogEars(G(s), face)),
    (s) => G(s).blob(face.outline, 1.35),
    // Markings are painted on the head, so they stop at its edge.
    { occludes: false, within: [headPoly], draw: (s) => markings(G(s), face, rng, coat) },
    {
      occludes: false,
      draw: (s) => {
        const g = G(s);
        for (const side of [-1, 1]) {
          eye(g, side * face.eye.x, face.eye.y, face.eye.w, face.eye.h, face.eye);
        }
        if (face.kind === 'cat') drawCatMuzzle(g, face);
        else drawDogMuzzle(g, face);
      },
    },
  ].filter(Boolean));
}

export default {
  id: 'pets',
  name: 'Cats & Dogs',
  blurb: 'Portraits of invented cats and dogs — every one a different face.',
  tags: ['animals', 'friendly', 'bold'],

  draw(sk, { rng, box }) {
    const face = rng.bool(0.5) ? catFace(rng) : dogFace(rng);
    // Sized so the ears clear the top and the shoulders reach the bottom, and
    // set high in the box because a portrait is mostly head.
    const r = Math.min(box.w / 2.9, box.h / 4.4);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h * 0.36 + r * 0.1;
    portrait(sk, cx, cy, r, face, rng, box);
    void f;
  },
};
