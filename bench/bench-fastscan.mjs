// Fast ISBN mode benchmark: crops each synthetic camera frame to the guide
// frame (as the app does) and decodes it with ZXing-C++ (WebAssembly, the
// engine behind BarcodeDetector on Safari/Firefox) and, for comparison, with
// the JavaScript ZXing the cover-photo path uses.
// Usage: DATASET=dataset2 node bench/bench-fastscan.mjs [--variants=near,far]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { VARIANTS, frame, W, H } from './frames.mjs';

const here = import.meta.dirname;
const DATASET = process.env.DATASET || 'dataset';
const books = JSON.parse(readFileSync(path.join(here, 'data', `${DATASET}.json`), 'utf8'));
const LIMIT = Number(process.env.LIMIT || books.length);

const { guideRect, visibleRect, acceptBookCode, GUIDE_DECODE_MAX_SIDE, FULL_DECODE_MAX_SIDE } = await import('../src/lib/fastBarcode.ts');
const { decodeGray, downscaleGray } = await import('../src/lib/barcodeDecode.ts');
const require = createRequire(import.meta.url);
const { readBarcodes, prepareZXingModule } = await import('zxing-wasm/reader');
await prepareZXingModule({
  overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) },
  fireImmediately: true,
});

// Portrait 3:4 preview box over a 4:3 landscape frame, as on a phone held upright.
const rect = guideRect(W, H, 3, 4);
const visible = visibleRect(W, H, 3, 4);

function crop(f, r = rect, maxSide = GUIDE_DECODE_MAX_SIDE) {
  const data = new Uint8ClampedArray(r.width * r.height);
  for (let y = 0; y < r.height; y++) {
    const from = (r.y + y) * f.width + r.x;
    data.set(f.gray.subarray(from, from + r.width), y * r.width);
  }
  return downscaleGray({ data, width: r.width, height: r.height }, maxSide);
}

function toRgba(img) {
  const rgba = new Uint8ClampedArray(img.width * img.height * 4);
  for (let i = 0, j = 0; i < img.data.length; i++, j += 4) {
    rgba[j] = rgba[j + 1] = rgba[j + 2] = img.data[i];
    rgba[j + 3] = 255;
  }
  return { data: rgba, width: img.width, height: img.height };
}

async function wasmRead(img) {
  const results = await readBarcodes(toRgba(img), { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], tryHarder: true, maxNumberOfSymbols: 1 });
  for (const r of results) {
    const code = acceptBookCode(r.text);
    if (code) return code;
  }
  return null;
}

// Each engine gets the frame and returns the code it reads; times include
// cropping and scaling.
const engines = {
  // BarcodeDetector's WebAssembly backend on the guide crop.
  wasm: async (f) => wasmRead(crop(f)),
  // What the app does over two consecutive frames: the guide crop, then the
  // whole visible picture at 960 px (time = both frames together).
  app: async (f) => (await wasmRead(crop(f))) || wasmRead(crop(f, visible, FULL_DECODE_MAX_SIDE)),
  // The JavaScript ZXing on the guide crop (the fallback before WASM loads).
  zxingjs: async (f) => acceptBookCode(decodeGray(crop(f))),
};

const only = process.argv.find((a) => a.startsWith('--variants='))?.split('=')[1]?.split(',');
const results = {};
console.log(`guide crop ${rect.width}×${rect.height} of ${W}×${H}, ${Math.min(LIMIT, books.length)} books`);
for (const [name, v] of Object.entries(VARIANTS)) {
  if (only && !only.includes(name)) continue;
  const row = {};
  for (const engine of Object.keys(engines)) row[engine] = { ok: 0, wrong: 0, ms: 0 };
  for (const b of books.slice(0, LIMIT)) {
    const f = await frame(b.isbn, v);
    for (const [engine, decode] of Object.entries(engines)) {
      const t = performance.now();
      const text = await decode(f);
      row[engine].ms += performance.now() - t;
      if (text === b.isbn) row[engine].ok++;
      else if (text) row[engine].wrong++;
    }
  }
  const n = Math.min(LIMIT, books.length);
  results[name] = Object.fromEntries(
    Object.entries(row).map(([e, r]) => [e, { ok: r.ok, wrong: r.wrong, pct: +((100 * r.ok) / n).toFixed(1), avgMs: +(r.ms / n).toFixed(1) }])
  );
  console.log(
    name.padEnd(20),
    ...Object.entries(results[name]).map(([e, r]) => `${e} ${r.pct}%${r.wrong ? ` (wrong ${r.wrong})` : ''} ${r.avgMs}ms`.padEnd(34))
  );
}
writeFileSync(path.join(here, 'data', `fastscan-${DATASET}.json`), JSON.stringify(results, null, 1));
