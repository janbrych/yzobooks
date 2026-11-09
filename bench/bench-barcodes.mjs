// Barcode benchmark: renders each dataset ISBN as a printed EAN-13, places it
// in a camera-like frame with real-world distortions and decodes it with the
// app's ZXing setup. Then resolves every code through the catalog lookup.
// Usage: node bench/bench-barcodes.mjs [--no-lookup]
import { installFetchCache, stats } from './cache.mjs';
import { ean13Svg, decodeGray } from './barcode.mjs';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

installFetchCache();
const here = import.meta.dirname;
const books = JSON.parse(readFileSync(path.join(here, 'data', 'dataset.json'), 'utf8'));

// Deterministic noise so runs are comparable.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const W = 1920, H = 1440; // native camera frame; the app downscales it

const VARIANTS = {
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

async function frame(code, v) {
  let bar = sharp(Buffer.from(ean13Svg(code, 4, 230))).png();
  let buf = await bar.toBuffer();
  const meta = await sharp(buf).metadata();
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

const app = await import('../src/lib/barcodeDecode.ts');
const MODE = process.env.MODE || 'live';
// legacy: the old app — frame scaled to 960 px, reader.decode() without hints.
// live: decodeLiveFrame over up to 3 consecutive frames (≈1 s of scanning).
// photo: decodePhoto on the still.
function decodeFn(gray, width, height) {
  const img = { data: gray, width, height };
  if (MODE === 'legacy') { const s = app.downscaleGray(img, 960); return decodeGray(s.data, s.width, s.height); }
  if (MODE === 'photo') return app.decodePhoto(img);
  for (let frame = 0; frame < 3; frame++) { const t = app.decodeLiveFrame(img, frame); if (t) return t; }
  return null;
}
const only = process.argv.find((a) => a.startsWith('--variants='))?.split('=')[1]?.split(',');
const results = {};
const timings = {};
const wrongReads = [];
for (const [name, v] of Object.entries(VARIANTS)) {
  if (only && !only.includes(name)) continue;
  let ok = 0, wrong = 0, ms = 0;
  for (const b of books) {
    const f = await frame(b.isbn, v);
    const t = performance.now();
    const text = decodeFn(f.gray, f.width, f.height);
    ms += performance.now() - t;
    if (text === b.isbn) ok++;
    else if (text) { wrong++; wrongReads.push({ variant: name, want: b.isbn, got: text }); }
    if (process.env.SAMPLES && b === books[0]) await sharp(Buffer.from(f.gray.buffer, f.gray.byteOffset, f.gray.length), { raw: { width: f.width, height: f.height, channels: 1 } }).png().toFile(path.join(here, 'data', `sample-${name}.png`));
  }
  results[name] = { ok, wrong, total: books.length, pct: +(100 * ok / books.length).toFixed(1), avgMs: +(ms / books.length).toFixed(1) };
  console.log(MODE.padEnd(7), name.padEnd(20), `${ok}/${books.length}`, `(${results[name].pct}%)`, wrong ? `WRONG ${wrong}` : '', `${results[name].avgMs} ms`);
}

writeFileSync(path.join(here, 'data', 'wrong-reads.json'), JSON.stringify(wrongReads, null, 1));
if (!process.argv.includes('--no-lookup')) {
  const { resolveBookFromBarcode } = await import('../src/lib/scanner.ts');
  const fold = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let found = 0, titleOk = 0, authorOk = 0, cover = 0;
  const misses = [];
  for (const b of books) {
    const r = await resolveBookFromBarcode(b.isbn);
    if (!r?.confident) { misses.push({ isbn: b.isbn, want: b.title, got: null }); continue; }
    found++;
    const t = fold(r.result.title);
    if (t.includes(fold(b.mainTitle)) || fold(b.mainTitle).includes(t)) titleOk++;
    else misses.push({ isbn: b.isbn, want: b.title, got: r.result.title });
    const surname = fold(b.author.split(',')[0]).split(' ').pop();
    if (fold(r.result.author).includes(surname)) authorOk++;
    if (r.result.coverUrl) cover++;
  }
  results.lookup = { found, titleOk, authorOk, withCoverUrl: cover, total: books.length };
  console.log('lookup', results.lookup);
  writeFileSync(path.join(here, 'data', 'lookup-misses.json'), JSON.stringify(misses, null, 1));
}
writeFileSync(path.join(here, 'data', `barcode-results-${MODE}.json`), JSON.stringify(results, null, 1));
console.log('http cache', stats);
