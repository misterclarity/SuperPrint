/*
 * Colouring: a paint layer underneath the line art.
 *
 * The obvious way to make an SVG colourable is to let people tap the shapes and
 * set their `fill`. It does not work here. A region on one of these pages is
 * almost never one closed path — it is the space enclosed by a ring, two petals
 * and a stem, each drawn independently and none of them aware of the others.
 * Tapping a shape would colour a whole chain of petals, or nothing at all.
 *
 * So colouring works the way a colouring book does: on pixels. The line art is
 * rasterised once onto its own layer, and a flood fill spreads across a paint
 * layer beneath it, stopped wherever there is ink. What gets coloured is the
 * region a person can see, which is the only definition that matters.
 *
 * Everything in here works on plain typed arrays, with no canvas and no DOM, so
 * it can be tested without a browser. The canvases live in the page controller.
 */

/*
 * How much ink makes a wall.
 *
 * Rasterised strokes are anti-aliased, so a line is not a hard edge but a ramp
 * from nothing to solid across a pixel or so. Treating only solid pixels as
 * walls lets fills seep along the ramp and out through the corners where two
 * lines cross; treating the faintest tint as a wall leaves a pale halo around
 * every filled region. Just over a third of full opacity sits inside the ramp
 * on both counts.
 */
export const WALL = 96;

/** The alpha channel on its own — the only channel a fill cares about. */
export function alphaChannel(rgba, width, height) {
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 3; i < out.length; i++, p += 4) out[i] = rgba[p];
  return out;
}

/**
 * Every pixel reachable from (sx, sy) without crossing ink.
 *
 * Scanline fill: each pass claims a whole horizontal run at once and only then
 * looks at the rows above and below for runs it has opened up. That is a few
 * hundred stack entries for a region that a naive per-pixel fill would push a
 * million times, which on a phone is the difference between instant and a
 * visible stall.
 *
 * @returns {null|{mask: Uint8Array, x0: number, y0: number, x1: number, y1: number, count: number}}
 *   null when the tap landed on ink — there is no region there to colour.
 *   The box is inclusive, and exists so callers can touch only the pixels that
 *   changed rather than walking the whole sheet.
 */
export function floodFill(alpha, width, height, sx, sy, { wall = WALL } = {}) {
  const x = Math.round(sx);
  const y = Math.round(sy);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  if (alpha[y * width + x] >= wall) return null;

  const mask = new Uint8Array(width * height);
  const stack = [x, y];
  let x0 = x;
  let x1 = x;
  let y0 = y;
  let y1 = y;
  let count = 0;

  while (stack.length) {
    const py = stack.pop();
    const px = stack.pop();
    const row = py * width;
    if (mask[row + px] || alpha[row + px] >= wall) continue;

    let left = px;
    while (left > 0 && !mask[row + left - 1] && alpha[row + left - 1] < wall) left--;
    let right = px;
    while (right < width - 1 && !mask[row + right + 1] && alpha[row + right + 1] < wall) right++;

    mask.fill(1, row + left, row + right + 1);
    count += right - left + 1;
    if (left < x0) x0 = left;
    if (right > x1) x1 = right;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;

    for (let d = -1; d <= 1; d += 2) {
      const ny = py + d;
      if (ny < 0 || ny >= height) continue;
      const nrow = ny * width;
      let inRun = false;
      for (let i = left; i <= right; i++) {
        const open = !mask[nrow + i] && alpha[nrow + i] < wall;
        if (open && !inRun) {
          stack.push(i, ny);
          inRun = true;
        } else if (!open) {
          inRun = false;
        }
      }
    }
  }

  return { mask, x0, y0, x1, y1, count };
}

/**
 * Grow the mask one pixel outwards, and return the box that now covers it.
 *
 * The fill stops at the first pixel dark enough to count as a wall, which
 * leaves the pale outer half of every anti-aliased stroke uncoloured — a white
 * hairline tracing the inside of every line, which reads as a bad print rather
 * than as colouring. Growing by one slides the colour under the stroke, where
 * the line layer is drawn on top of it and hides the join.
 *
 * Only ink can be grown into: any open pixel next to the mask would already be
 * in it, since the fill took everything reachable. So this cannot leak into a
 * neighbouring region — the width of a stroke separates them, and the thinnest
 * pen is still more than two pixels across at working resolution.
 *
 * Grown pixels are marked 2 rather than 1 so that this single pass does not
 * feed itself and quietly grow by two.
 */
export function dilate(mask, width, height, box) {
  const x0 = Math.max(0, box.x0 - 1);
  const y0 = Math.max(0, box.y0 - 1);
  const x1 = Math.min(width - 1, box.x1 + 1);
  const y1 = Math.min(height - 1, box.y1 + 1);
  const grown = [];

  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      const i = row + x;
      if (mask[i]) continue;
      if ((x > 0 && mask[i - 1] === 1)
        || (x < width - 1 && mask[i + 1] === 1)
        || (y > 0 && mask[i - width] === 1)
        || (y < height - 1 && mask[i + width] === 1)) grown.push(i);
    }
  }
  for (let i = 0; i < grown.length; i++) mask[grown[i]] = 2;

  return { x0, y0, x1, y1 };
}

/**
 * Paint `rgb` into the masked pixels.
 *
 * `rgba` covers `box` alone, while `mask` covers the whole sheet — because a
 * fill touches one region and reading back the entire canvas to change a
 * thumbnail's worth of it is most of the cost of a tap. `width` is the sheet's,
 * since that is what the mask is indexed by.
 *
 * Passing null for `rgb` erases instead, back to bare paper.
 */
export function applyFill(rgba, mask, box, width, rgb) {
  const bw = box.x1 - box.x0 + 1;
  const [r, g, b] = rgb || [0, 0, 0];
  const a = rgb ? 255 : 0;

  for (let y = box.y0; y <= box.y1; y++) {
    const row = y * width;
    const out = (y - box.y0) * bw;
    for (let x = box.x0; x <= box.x1; x++) {
      if (!mask[row + x]) continue;
      const p = (out + (x - box.x0)) * 4;
      rgba[p] = r;
      rgba[p + 1] = g;
      rgba[p + 2] = b;
      rgba[p + 3] = a;
    }
  }
}

/** '#rrggbb' or '#rgb' -> [r, g, b]. */
export function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
