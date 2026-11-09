// OCR preprocessing experiments: how often does the cover's title (and the
// author's surname) appear in what Tesseract reads, per preprocessing / page
// segmentation mode, on a sample of the dataset. No catalog lookups.
// Usage: node bench/exp.mjs photo 120 app,clahe,small psm=11
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { shot, enhance } from './shots.mjs';

const here = import.meta.dirname;
const [variant = 'photo', nStr = '100', prepList = 'app', psmArg = 'psm=11'] = process.argv.slice(2);
const psm = psmArg.split('=')[1];
const books = JSON.parse(readFileSync(path.join(here, 'data', 'dataset.json'), 'utf8'));
// Spread the sample over the whole dataset (it is grouped by author).
const step = books.length / Number(nStr);
const sample = Array.from({ length: Number(nStr) }, (_, i) => books[Math.floor(i * step)]);

const gray = (buf) => sharp(buf).removeAlpha().grayscale();
async function otsu(buf) {
  const { data, info } = await sharp(await enhance(buf)).raw().toBuffer({ resolveWithObject: true });
  const hist = new Array(256).fill(0); for (const v of data) hist[v]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, th = 128; const total = data.length;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break; sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2; if (between > best) { best = between; th = t; } }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } }).threshold(th).jpeg().toBuffer();
}
export const PREPS = {
  raw: async (b) => b,
  app: enhance,
  small: async (b) => enhance(await sharp(b).resize({ height: 800 }).toBuffer()),
  tiny_invert: async (b) => sharp(await enhance(await sharp(b).resize({ height: 600 }).toBuffer())).negate().jpeg().toBuffer(),
  mini: async (b) => enhance(await sharp(b).resize({ height: 450 }).toBuffer()),
  tiny_raw: async (b) => sharp(b).resize({ height: 600 }).jpeg().toBuffer(),
  tiny: async (b) => enhance(await sharp(b).resize({ height: 600 }).toBuffer()),
  invert: async (b) => sharp(await enhance(b)).negate().jpeg().toBuffer(),
  clahe: async (b) => gray(b).clahe({ width: 48, height: 48, maxSlope: 3 }).jpeg().toBuffer(),
  clahe_small: async (b) => sharp(b).resize({ height: 800 }).removeAlpha().grayscale().clahe({ width: 32, height: 32, maxSlope: 3 }).jpeg().toBuffer(),
  normalise: async (b) => gray(b).normalise().jpeg().toBuffer(),
  otsu,
  minchan: async (b) => {
    const { data, info } = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(info.width * info.height);
    for (let i = 0, p = 0; p < out.length; i += 3, p++) out[p] = Math.min(data[i], data[i + 1], data[i + 2]);
    return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).normalise().jpeg().toBuffer();
  },
  sharpen: async (b) => sharp(await enhance(b)).sharpen({ sigma: 1.2 }).jpeg().toBuffer(),
};

const fold = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const names = prepList.split(',');
const workers = await Promise.all([0, 1, 2].map(async () => {
  const w = await createWorker('ces+eng', 1, { cachePath: path.join(here, 'data') });
  await w.setParameters({ tessedit_pageseg_mode: psm });
  return w;
}));
const stats = Object.fromEntries(names.map((n) => [n, { title: 0, author: 0, ms: 0 }]));
const union = { title: 0, author: 0 };
let i = 0;
const perBook = [];
await Promise.all(workers.map(async (w) => {
  while (i < sample.length) {
    const b = sample[i++];
    const img = await shot(b.isbn, variant);
    const words = fold(b.mainTitle).split(' ').filter((x) => x.length >= 3);
    const surname = fold(b.author.split(',')[0]).split(' ').pop();
    let allText = '';
    const texts = {};
    perBook.push({ words, surname, texts });
    for (const n of names) {
      const t = performance.now();
      const r = await w.recognize(await PREPS[n](img));
      stats[n].ms += performance.now() - t;
      const got = new Set(fold(r.data.text).split(' '));
      allText += ' ' + r.data.text;
      texts[n] = r.data.text;
      if (words.length && words.filter((x) => got.has(x)).length / words.length >= 0.6) stats[n].title++;
      if (got.has(surname)) stats[n].author++;
    }
    const got = new Set(fold(allText).split(' '));
    if (words.length && words.filter((x) => got.has(x)).length / words.length >= 0.6) union.title++;
    if (got.has(surname)) union.author++;
  }
}));
await Promise.all(workers.map((w) => w.terminate()));
const N = sample.length;
for (const n of names) console.log(`${variant} psm${psm} ${n.padEnd(12)} title ${(100 * stats[n].title / N).toFixed(0)}%  author ${(100 * stats[n].author / N).toFixed(0)}%  ${Math.round(stats[n].ms / N)} ms`);
console.log(`${variant} psm${psm} UNION ${names.join('+')}  title ${(100 * union.title / N).toFixed(0)}%  author ${(100 * union.author / N).toFixed(0)}%`);

// Every pair / triple of passes: which cheap combination recovers the most?
const hit = (bk, combo) => { const got = new Set(fold(combo.map((c) => bk.texts[c]).join(' ')).split(' ')); return bk.words.length && bk.words.filter((x) => got.has(x)).length / bk.words.length >= 0.6; };
const combos = [];
for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) {
  combos.push([names[a], names[b]]);
  for (let c = b + 1; c < names.length; c++) combos.push([names[a], names[b], names[c]]);
}
const scored = combos.map((c) => ({ c: c.join('+'), title: perBook.filter((bk) => hit(bk, c)).length, ms: c.reduce((s, n) => s + stats[n].ms / N, 0) }));
scored.sort((x, y) => y.title - x.title || x.ms - y.ms);
for (const s of scored.slice(0, 12)) console.log(`combo ${s.c.padEnd(36)} title ${(100 * s.title / N).toFixed(0)}%  ${Math.round(s.ms)} ms`);
