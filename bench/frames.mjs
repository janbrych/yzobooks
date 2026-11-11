// Synthetic camera frames of a printed EAN-13 on a back cover, shared by the
// barcode benchmarks.
import sharp from 'sharp';
import { ean13Svg } from './barcode.mjs';

// Deterministic noise so runs are comparable.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

export const W = 1920, H = 1440; // native camera frame; the app downscales it

export const VARIANTS = {
  near: { width: 0.45 },
  far: { width: 0.2 },
  very_far: { width: 0.13 },
  rot8: { width: 0.4, rotate: 8 },
  rot20: { width: 0.4, rotate: 20 },
  rot35: { width: 0.4, rotate: 35 },
  rot90: { width: 0.4, rotate: 90 },
  upside_down: { width: 0.4, rotate: 180 },
  blur_light: { width: 0.35, blur: 1.5 },
  blur_heavy: { width: 0.35, blur: 3 },
  dark_noisy_jpeg: { width: 0.3, dark: true, noise: 28, jpeg: 35 },
  glare: { width: 0.4, glare: true },
  tilted_perspective: { width: 0.4, shear: 0.3 },
  far_blur: { width: 0.2, blur: 1.2 },
};

export async function frame(code, v) {
  let bar = sharp(Buffer.from(ean13Svg(code, 4, 230))).png();
  let buf = await bar.toBuffer();
  const targetW = Math.round(W * v.width);
  buf = await sharp(buf).resize({ width: targetW }).toBuffer();
  if (v.shear) buf = await sharp(buf).affine([1, 0, v.shear, 1], { background: '#fff' }).toBuffer();
  if (v.rotate) buf = await sharp(buf).rotate(v.rotate, { background: '#f4efe6' }).toBuffer();
  const bm = await sharp(buf).metadata();
  const scale = Math.min(1, (W - 20) / bm.width, (H - 20) / bm.height);
  if (scale < 1) buf = await sharp(buf).resize({ width: Math.round(bm.width * scale) }).toBuffer();
  const fm = await sharp(buf).metadata();
  // Back cover: off-white paper with a block of "blurb" text above the code.
  const blurb = Array.from({ length: 9 }, (_, i) => `<text x="80" y="${100 + i * 52}" font-size="36" font-family="Georgia" fill="#333">Lorem ipsum dolor sit amet, kniha o všem možném ${i}</text>`).join('');
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#f4efe6"/>${blurb}</svg>`);
  let img = sharp(bg).composite([{ input: buf, left: Math.round((W - fm.width) / 2), top: Math.round(Math.max(0, Math.min(H - fm.height, H * 0.55 - fm.height / 2))) }]);
  let out = await img.png().toBuffer();
  if (v.blur) out = await sharp(out).blur(v.blur * 2).toBuffer();
  if (v.glare) {
    const g = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="0.6" cy="0.55" r="0.35"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
    out = await sharp(out).composite([{ input: g }]).png().toBuffer();
  }
  if (v.dark) out = await sharp(out).linear(0.45, 30).toBuffer();
  let { data, info } = await sharp(out).grayscale().raw().toBuffer({ resolveWithObject: true });
  if (v.noise) for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, data[i] + (rand() - 0.5) * 2 * v.noise));
  if (v.jpeg) {
    const j = await sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } }).jpeg({ quality: v.jpeg }).toBuffer();
    ({ data, info } = await sharp(j).grayscale().raw().toBuffer({ resolveWithObject: true }));
  }
  return { gray: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

