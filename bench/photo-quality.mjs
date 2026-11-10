// Calibrates the cover-photo checks in src/lib/photoQuality.ts: measures the
// benchmark covers as they are, as phone-like photos, and in deliberately
// bad copies (dark, blurred, glare), and reports how many each check flags.
// Usage: node bench/photo-quality.mjs
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const { measurePhoto, photoIssues } = await import('../src/lib/photoQuality.ts');

const dir = path.join(here, 'data', 'covers');
const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).slice(0, Number(process.env.LIMIT || 300));

const W = 1200, H = 1600;
async function asPhoto(file) {
  // The cover filling ~75 % of a 3:4 frame on a wooden-ish table.
  const cover = await sharp(path.join(dir, file)).resize({ height: Math.round(H * 0.78), width: Math.round(W * 0.75), fit: 'inside' }).toBuffer();
  const m = await sharp(cover).metadata();
  return sharp({ create: { width: W, height: H, channels: 3, background: '#8a6d4f' } })
    .composite([{ input: cover, left: Math.round((W - m.width) / 2), top: Math.round((H - m.height) / 2) }])
    .png()
    .toBuffer();
}

const VARIANTS = {
  clean: (b) => b,
  dim: (b) => sharp(b).linear(0.6, 0).toBuffer(),
  dark: (b) => sharp(b).linear(0.3, 0).toBuffer(),
  blur_light: (b) => sharp(b).blur(2).toBuffer(),
  blur_heavy: (b) => sharp(b).blur(6).toBuffer(),
  glare: (b) =>
    sharp(b)
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="0.55" cy="0.45" r="0.45"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`) }])
      .png()
      .toBuffer(),
};
const expected = { clean: [], dim: [], dark: ['dark'], blur_light: [], blur_heavy: ['blurry'], glare: [] }; // glare is not flagged, see QUALITY_LIMITS

const rows = {};
for (const file of files) {
  const base = await asPhoto(file);
  for (const [name, fn] of Object.entries(VARIANTS)) {
    const buf = await fn(base);
    const { data, info } = await sharp(buf).grayscale().raw().toBuffer({ resolveWithObject: true });
    const q = measurePhoto({ data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height });
    const issues = photoIssues(q);
    const r = (rows[name] ??= { n: 0, flagged: {}, b: [], s: [], g: [] });
    r.n++;
    r.b.push(q.brightness); r.s.push(q.sharpness); r.g.push(q.glare);
    for (const i of issues) r.flagged[i] = (r.flagged[i] || 0) + 1;
  }
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };
for (const [name, r] of Object.entries(rows)) {
  const want = expected[name];
  const flaggedPct = Object.fromEntries(Object.entries(r.flagged).map(([k, v]) => [k, `${((100 * v) / r.n).toFixed(0)}%`]));
  console.log(
    name.padEnd(11),
    `want ${want.join('+') || 'none'}`.padEnd(16),
    'flagged', JSON.stringify(flaggedPct).padEnd(40),
    `bright p10 ${pct(r.b, 0.1).toFixed(0)} p90 ${pct(r.b, 0.9).toFixed(0)}`,
    `sharp p10 ${pct(r.s, 0.1).toFixed(0)} p90 ${pct(r.s, 0.9).toFixed(0)}`,
    `glare p10 ${pct(r.g, 0.1).toFixed(3)} p90 ${pct(r.g, 0.9).toFixed(3)}`
  );
}
