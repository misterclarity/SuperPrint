/*
 * The colouring engine.
 *
 * A flood fill is easy to write and easy to get subtly wrong in ways that only
 * show up as a ruined page: it leaks through a diagonal join and floods the
 * whole sheet, or it stops a pixel short and leaves a white hairline inside
 * every outline. Neither is visible in a unit that only checks "some pixels
 * were coloured", so these build small bitmaps where the right answer is known
 * by construction and check the count.
 *
 * The real artwork is checked separately, in a browser, because the thing that
 * actually breaks a fill is anti-aliasing, and only a rasteriser produces it.
 */

import { floodFill, dilate, applyFill, alphaChannel, hexToRgb, WALL } from '../assets/js/core/paint.js';

/** A blank sheet with a rectangular outline drawn on it, as alpha. */
function boxed(w, h, rect, thickness = 2) {
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const onEdge = (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h)
        && (x < rect.x + thickness || x >= rect.x + rect.w - thickness
          || y < rect.y + thickness || y >= rect.y + rect.h - thickness);
      if (onEdge) a[y * w + x] = 255;
    }
  }
  return a;
}

export default function run() {
  const failures = [];
  const table = {};
  const eq = (name, got, want) => {
    if (got !== want) failures.push(`${name}: got ${got}, expected ${want}`);
  };

  const W = 60;
  const H = 40;
  const rect = { x: 10, y: 8, w: 30, h: 20 };
  const alpha = boxed(W, H, rect);

  /* -- 1. a fill stays inside the shape it started in --------------------- */
  {
    const inner = floodFill(alpha, W, H, 25, 18);
    // The hole inside a 2px-thick outline.
    const want = (rect.w - 4) * (rect.h - 4);
    eq('inside fill covers exactly the interior', inner.count, want);
    eq('inside fill box left', inner.x0, rect.x + 2);
    eq('inside fill box top', inner.y0, rect.y + 2);
    eq('inside fill box right', inner.x1, rect.x + rect.w - 3);
    eq('inside fill box bottom', inner.y1, rect.y + rect.h - 3);

    const outer = floodFill(alpha, W, H, 1, 1);
    eq('outside fill covers exactly the surround', outer.count, W * H - rect.w * rect.h);

    table['containment'] = { interior: inner.count, exterior: outer.count, sheet: W * H };
  }

  /* -- 2. a tap on a line is not a region --------------------------------- */
  {
    const onInk = floodFill(alpha, W, H, rect.x, rect.y);
    eq('tapping a line returns nothing', onInk, null);
    eq('tapping off the sheet returns nothing', floodFill(alpha, W, H, -3, 5), null);
    eq('tapping past the sheet returns nothing', floodFill(alpha, W, H, W + 2, 5), null);
  }

  /*
   * -- 3. a gap in the outline leaks, and that is correct ------------------
   *
   * Worth pinning down rather than leaving implied: line art with a break in it
   * has no enclosed region, so a fill that "helpfully" stopped somewhere would
   * be inventing a boundary the reader cannot see. Undo is the answer to a
   * leak, not a guess.
   */
  {
    const leaky = boxed(W, H, rect);
    const gapY = rect.y + 10;
    leaky[gapY * W + rect.x] = 0;
    leaky[gapY * W + rect.x + 1] = 0;
    const spill = floodFill(leaky, W, H, 25, 18);
    eq('a broken outline lets the fill out', spill.count > (rect.w - 4) * (rect.h - 4) * 2, true);
  }

  /* -- 4. the threshold treats a faint edge as open, solid ink as wall ---- */
  {
    const ramp = new Uint8Array(W * H); // one vertical line, faint
    for (let y = 0; y < H; y++) ramp[y * W + 30] = WALL - 1;
    eq('a stroke fainter than the wall does not stop a fill', floodFill(ramp, W, H, 5, 5).count, W * H);

    for (let y = 0; y < H; y++) ramp[y * W + 30] = WALL;
    eq('a stroke at the wall stops a fill', floodFill(ramp, W, H, 5, 5).count, H * 30);
  }

  /* -- 5. dilation slides under the stroke, by exactly one pixel ---------- */
  {
    const hit = floodFill(alpha, W, H, 25, 18);
    const before = hit.count;
    const box = dilate(hit.mask, W, H, hit);
    const after = hit.mask.reduce((n, v) => n + (v ? 1 : 0), 0);

    const iw = rect.w - 4;
    const ih = rect.h - 4;
    // A one-pixel ring around the interior, minus the four corner pixels that
    // a 4-connected grow cannot reach.
    eq('dilation grows by a one-pixel ring', after - before, iw * 2 + ih * 2);
    eq('dilation widens the box', box.x1 - box.x0, hit.x1 - hit.x0 + 2);

    // And it must not have escaped the outline into the paper outside.
    const outside = floodFill(alpha, W, H, 1, 1);
    let overlap = 0;
    for (let i = 0; i < hit.mask.length; i++) if (hit.mask[i] && outside.mask[i]) overlap++;
    eq('dilation does not reach through the line', overlap, 0);

    table['dilation'] = { filled: before, grown: after, ring: after - before };
  }

  /* -- 6. colour lands on the masked pixels and nowhere else ------------- */
  {
    const hit = floodFill(alpha, W, H, 25, 18);
    const box = { x0: hit.x0, y0: hit.y0, x1: hit.x1, y1: hit.y1 };
    const bw = box.x1 - box.x0 + 1;
    const bh = box.y1 - box.y0 + 1;
    const buf = new Uint8ClampedArray(bw * bh * 4);

    applyFill(buf, hit.mask, box, W, hexToRgb('#3a8cc4'));
    let painted = 0;
    let wrong = 0;
    for (let p = 0; p < buf.length; p += 4) {
      if (buf[p + 3] === 0) continue;
      painted++;
      if (buf[p] !== 0x3a || buf[p + 1] !== 0x8c || buf[p + 2] !== 0xc4) wrong++;
    }
    eq('fill paints every masked pixel', painted, hit.count);
    eq('fill paints the colour asked for', wrong, 0);

    // Erasing is the same walk with the alpha taken back out.
    applyFill(buf, hit.mask, box, W, null);
    let left = 0;
    for (let p = 3; p < buf.length; p += 4) if (buf[p] !== 0) left++;
    eq('erase clears every masked pixel', left, 0);
  }

  /* -- 7. hex parsing, both lengths --------------------------------------- */
  {
    eq('long hex', hexToRgb('#3a8cc4').join(','), '58,140,196');
    eq('short hex', hexToRgb('#fff').join(','), '255,255,255');
  }

  /* -- 8. the alpha channel is lifted out in the right order -------------- */
  {
    const rgba = new Uint8ClampedArray([1, 2, 3, 40, 5, 6, 7, 80, 9, 10, 11, 120, 0, 0, 0, 160]);
    eq('alpha channel', alphaChannel(rgba, 2, 2).join(','), '40,80,120,160');
  }

  console.table(table);
  return failures;
}
