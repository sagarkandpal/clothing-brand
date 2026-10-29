/**
 * Removes a plain light backdrop from a packshot, in place, on RGBA pixel data
 * (works in the browser and in Node). Only backdrop connected to the image
 * border is removed, so light details inside the garment (prints, logos) are
 * kept. The garment's outline gets a soft one-pixel edge.
 */
export function keyOutWhiteBackground(data: Uint8ClampedArray | Uint8Array, width: number, height: number): void {
  const n = width * height;
  const region = new Uint8Array(n); // 1 = connected backdrop
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  // Light, nearly colourless pixels: white sweeps, grey studio paper, soft shadows.
  const isBackdrop = (p: number) => {
    const i = p * 4;
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    return min > 172 && max - min < 24;
  };

  const seed = (p: number) => {
    if (!region[p] && isBackdrop(p)) {
      region[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    if (x > 0) seed(p - 1);
    if (x < width - 1) seed(p + 1);
    if (p >= width) seed(p - width);
    if (p < n - width) seed(p + width);
  }

  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (region[p]) {
      data[i + 3] = 0;
      continue;
    }
    // Garment pixels touching the backdrop: soften the outline.
    const x = p % width;
    let touching = 0;
    if (x > 0 && region[p - 1]) touching++;
    if (x < width - 1 && region[p + 1]) touching++;
    if (p >= width && region[p - width]) touching++;
    if (p < n - width && region[p + width]) touching++;
    if (touching) data[i + 3] = touching >= 3 ? 90 : touching === 2 ? 150 : 200;
  }
}
