// Phase 1 of the cover benchmark: OCR every dataset cover the way the app
// does (contrast-stretched grayscale, Tesseract ces+eng, SPARSE_TEXT, line
// boxes) in two shots — the catalog image ("scan") and a simulated phone photo
// ("photo": on a table, tilted, uneven light, JPEG). Raw images are OCR'd too,
// for the app's retry. Results go to data/ocr-<variant>.json so the
// recognition heuristics can be re-tuned without re-running OCR.
// Usage: node bench/ocr.mjs [scan|photo] [--workers=3]
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const variant = process.argv[2] || 'scan';
const nWorkers = Number(process.argv.find((a) => a.startsWith('--workers='))?.split('=')[1] || 3);
const prep = process.env.PREP || 'app'; // preprocessing experiment name
const books = JSON.parse(readFileSync(path.join(here, 'data', `${process.env.DATASET || 'dataset'}.json`), 'utf8'));
const outFile = path.join(here, 'data', `ocr-${variant}${prep !== 'app' ? '-' + prep : ''}.json`);
const done = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
mkdirSync(path.join(here, 'data', 'photos'), { recursive: true });

import { shot as makeShot, enhance, multiPasses } from './shots.mjs';
const shot = (isbn) => makeShot(isbn, variant);

const PREPS = { app: enhance };


function lines(blocks) {
  return (blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), height: l.bbox.y1 - l.bbox.y0 }))));
}

const workers = await Promise.all(Array.from({ length: nWorkers }, async () => {
  const w = await createWorker('ces+eng', 1, { cachePath: path.join(here, 'data') });
  await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  return w;
}));

const todo = books.filter((b) => !done[b.isbn]);
let i = 0, finished = 0;
const t0 = Date.now();
await Promise.all(workers.map(async (w) => {
  while (i < todo.length) {
    const b = todo[i++];
    const img = await shot(b.isbn);
    const entry = {};
    const inputs = prep === 'multi' ? await multiPasses(img) : [['enhanced', await PREPS[prep](img)], ['raw', img]];
    if (prep === 'multi') entry.passes = inputs.map(([n]) => n);
    for (const [kind, buf] of inputs) {
      const t = performance.now();
      const r = await w.recognize(buf, {}, { text: true, blocks: true });
      entry[kind] = { text: r.data.text, layout: lines(r.data.blocks), ms: Math.round(performance.now() - t) };
    }
    done[b.isbn] = entry;
    if (++finished % 20 === 0) {
      writeFileSync(outFile, JSON.stringify(done));
      console.log(`${finished}/${todo.length}  ${((Date.now() - t0) / finished / 1000).toFixed(1)} s/book`);
    }
  }
}));
writeFileSync(outFile, JSON.stringify(done));
await Promise.all(workers.map((w) => w.terminate()));
console.log('done', Object.keys(done).length);
