// Lightweight canvas-based preprocessing to improve Tesseract OCR accuracy on
// book cover photos. Raw cover photos have decorative fonts over busy,
// low-contrast backgrounds — converting to grayscale and stretching contrast
// before OCR meaningfully reduces misreads compared to feeding Tesseract the
// original color image directly.
//
// This intentionally does NOT touch the canvas used for barcode decoding:
// ZXing already performs its own binarization and works better on the raw
// luminance source.
export function enhanceCanvasForOcr(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/jpeg', 0.9);

  const { width, height } = canvas;
  if (width === 0 || height === 0) return canvas.toDataURL('image/jpeg', 0.9);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pixelCount = width * height;
  const gray = new Uint8ClampedArray(pixelCount);

  let min = 255;
  let max = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }

  const range = max - min || 1;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const stretched = ((gray[p] - min) / range) * 255;
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

// Grayscale + min/max contrast stretch of a canvas, optionally inverted.
function stretchedCopy(source: HTMLCanvasElement, maxSide: number, { enhance, invert }: { enhance: boolean; invert: boolean }): string {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = source.ownerDocument.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return source.toDataURL('image/jpeg', 0.9);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (!enhance) return canvas.toDataURL('image/jpeg', 0.92);
  enhanceCanvasForOcr(canvas);
  if (invert) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas.toDataURL('image/jpeg', 0.92);
}

// Long side of the first OCR passes. Measured on 100 simulated phone photos
// of real covers (bench/exp.mjs): Tesseract finds the title as often or more
// often at 600 px than at full size, in a third of the time — cover type is
// large, and Tesseract reads best at moderate letter heights.
export const OCR_SMALL_SIDE = 600;

// The images to OCR, in order; recognition stops at the first confident
// catalog match. Each pass rescues covers the others miss: the negative reads
// light text on dark covers, the unprocessed copy keeps colored type that the
// grayscale stretch flattens, and the full-size pass catches small print.
// Together they found the title on ~42 % of covers vs. 29 % for the old
// single full-size pass, at about the same worst-case time.
export function ocrPasses(canvas: HTMLCanvasElement): string[] {
  const passes = [
    stretchedCopy(canvas, OCR_SMALL_SIDE, { enhance: true, invert: false }),
    stretchedCopy(canvas, OCR_SMALL_SIDE, { enhance: true, invert: true }),
    stretchedCopy(canvas, OCR_SMALL_SIDE, { enhance: false, invert: false }),
  ];
  // Last, because it overwrites the canvas.
  passes.push(enhanceCanvasForOcr(canvas));
  return passes;
}
