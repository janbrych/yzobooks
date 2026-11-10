// Phase 2 of the cover benchmark: feed cached OCR output through the app's
// resolveBookFromText (with the raw-photo retry the app does) and score it
// against the dataset. Fast to re-run after changing src/lib/scanner.ts.
// Usage: node bench/resolve.mjs [scan|photo] [--prep=name] [--limit=N]
import { installFetchCache, stats } from './cache.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

installFetchCache();
const here = import.meta.dirname;
const variant = process.argv[2] || 'scan';
const prep = process.argv.find((a) => a.startsWith('--prep='))?.split('=')[1];
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 1e9);
const books = JSON.parse(readFileSync(path.join(here, 'data', `${process.env.DATASET || 'dataset'}.json`), 'utf8'));
const ocr = JSON.parse(readFileSync(path.join(here, 'data', `ocr-${variant}${prep ? '-' + prep : ''}.json`), 'utf8'));
const { resolveBookFromText, UNRECOGNIZED_TITLE } = await import(process.env.SCANNER || '../src/lib/scanner.ts');

export const fold = (t) => t.replace(/ł/g, 'l').replace(/Ł/g, 'L').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const main = (t) => fold(String(t).split(/\s[:/=]\s?|[:/=.]/)[0]);
function sameBook(got, b) {
  if (!got.title || got.title === UNRECOGNIZED_TITLE) return false;
  if (got.isbn && got.isbn.replace(/-/g, '') === b.isbn) return true;
  const g = main(got.title), w = main(b.mainTitle);
  if (!g || !w) return false;
  if (g === w) return true;
  const [s, l] = g.length < w.length ? [g, w] : [w, g];
  return s.length >= 4 && (` ${l} `).includes(` ${s} `) && s.length / l.length >= 0.5;
}

const rows = [];
let correct = 0, wrong = 0, none = 0, n = 0;
const t0 = Date.now();
const todo = books.filter((b) => ocr[b.isbn]).slice(0, limit);
n = todo.length;
const out = new Array(todo.length);
let next = 0;
async function worker() {
  while (next < todo.length) {
    const idx = next++;
    const b = todo[idx];
    const o = ocr[b.isbn];
    // Passes in order, stopping at the first confident match (as the app does).
    const passes = o.passes || ['enhanced', 'raw'];
    let r, used;
    for (const p of passes) {
      const attempt = await resolveBookFromText(o[p].text, undefined, o[p].layout);
      if (!r || attempt.confident) { r = attempt; used = p; }
      if (attempt.confident) break;
    }
    const ok = r.confident && sameBook(r.result, b);
    const status = ok ? 'correct' : r.confident ? 'wrong' : 'none';
    out[idx] = { isbn: b.isbn, status, used, want: `${b.mainTitle} — ${b.author}`, got: r.confident ? `${r.result.title} — ${r.result.author}` : `(${r.result.title} — ${r.result.author})`, ocr: o[passes[0]].text.replace(/\s+/g, ' ').slice(0, 160) };
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
for (const row of out) { rows.push(row); if (row.status === 'correct') correct++; else if (row.status === 'wrong') wrong++; else none++; }
const pct = (x) => (100 * x / n).toFixed(1) + '%';
const summary = { variant, prep: prep || 'app', n, correct, wrong, none, correctPct: pct(correct), wrongPct: pct(wrong), nonePct: pct(none), seconds: Math.round((Date.now() - t0) / 1000) };
console.log(summary, 'http', stats);
writeFileSync(path.join(here, 'data', `resolve-${variant}${prep ? '-' + prep : ''}${process.env.TAG ? '-' + process.env.TAG : ''}.json`), JSON.stringify({ summary, rows }, null, 1));
