// Simulated camera shots of dataset covers and the app's OCR preprocessing.
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const here = import.meta.dirname;
mkdirSync(path.join(here, 'data', 'photos'), { recursive: true });

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

export async function shot(isbn, variant) {
  const src = path.join(here, 'data', 'covers', `${isbn}.jpg`);
  if (variant === 'scan') return sharp(src).resize({ height: 1200, kernel: 'lanczos3' }).jpeg({ quality: 90 }).toBuffer();
  // Phone photo: cover fills ~75% of a portrait frame, slightly rotated, on a
  // wooden table, with a light gradient and JPEG compression.
  const angle = (rand() - 0.5) * 10;
  const rotated = await sharp(src).resize({ height: 1150 }).rotate(angle, { background: { r: 120, g: 84, b: 52, alpha: 1 } }).toBuffer();
  const cover = await sharp(rotated).resize({ width: 1150, height: 1550, fit: 'inside', withoutEnlargement: true }).toBuffer();
  const cm = await sharp(cover).metadata();
  const W = 1200, H = 1600;
  const table = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="w" x1="0" x2="1"><stop offset="0" stop-color="#7a5434"/><stop offset="1" stop-color="#8d6440"/></linearGradient><linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#w)"/></svg>`);
  const light = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#l)"/></svg>`);
  const left = Math.max(0, Math.round((W - cm.width) / 2 + (rand() - 0.5) * 80));
  const top = Math.max(0, Math.round((H - cm.height) / 2 + (rand() - 0.5) * 80));
  const img = await sharp(table).composite([{ input: cover, left: Math.min(left, W - cm.width), top: Math.min(top, H - cm.height) }, { input: light }]).blur(0.8).jpeg({ quality: 78 }).toBuffer();
  if (rand() < 0.1) writeFileSync(path.join(here, 'data', 'photos', `${isbn}.jpg`), img);
  return img;
}

// Same as src/lib/imagePreprocessing.ts enhanceCanvasForOcr.
export async function enhance(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const gray = new Float32Array(n);
  let min = 255, max = 0;
  for (let i = 0, p = 0; p < n; i += info.channels, p++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g; if (g < min) min = g; if (g > max) max = g;
  }
  const range = max - min || 1;
  const out = Buffer.alloc(n);
  for (let p = 0; p < n; p++) out[p] = ((gray[p] - min) / range) * 255;
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).jpeg({ quality: 92 }).toBuffer();
}


// The app's multi-pass OCR inputs (src/lib/imagePreprocessing.ts
// ocrPasses): a small contrast-stretched copy first (Tesseract reads large
// cover type better at ~600 px and 3× faster), then its negative (light text
// on dark covers), the small original, and finally the full-size stretch.
export async function multiPasses(img) {
  const small = await sharp(img).resize({ width: 600, height: 600, fit: 'inside' }).jpeg({ quality: 92 }).toBuffer();
  const smallEnhanced = await enhance(small);
  return [
    ['small', smallEnhanced],
    ['small_inverted', await sharp(smallEnhanced).negate().jpeg({ quality: 92 }).toBuffer()],
    ['small_raw', small],
    ['full', await enhance(img)],
  ];
}
