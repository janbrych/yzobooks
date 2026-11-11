// Barcode benchmark: renders each dataset ISBN as a printed EAN-13, places it
// in a camera-like frame with real-world distortions and decodes it with the
// app's ZXing setup. Then resolves every code through the catalog lookup.
// Usage: node bench/bench-barcodes.mjs [--no-lookup]
import { installFetchCache, stats } from './cache.mjs';
import { decodeGray } from './barcode.mjs';
import { VARIANTS, frame } from './frames.mjs';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

installFetchCache();
const here = import.meta.dirname;
const SUFFIX = process.env.DATASET && process.env.DATASET !== 'dataset' ? '-' + process.env.DATASET : '';
const books = JSON.parse(readFileSync(path.join(here, 'data', `${process.env.DATASET || 'dataset'}.json`), 'utf8'));

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

writeFileSync(path.join(here, 'data', `wrong-reads${SUFFIX}.json`), JSON.stringify(wrongReads, null, 1));
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
  writeFileSync(path.join(here, 'data', `lookup-misses${SUFFIX}.json`), JSON.stringify(misses, null, 1));
}
writeFileSync(path.join(here, 'data', `barcode-results-${MODE}${SUFFIX}.json`), JSON.stringify(results, null, 1));
console.log('http cache', stats);
