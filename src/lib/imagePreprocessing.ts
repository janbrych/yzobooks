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
