// EAN-13 rendering (for synthetic test images) and ZXing decoding in Node with
// the same reader setup as the app's CameraModal.
import sharp from 'sharp';
import {
  MultiFormatReader, BarcodeFormat, DecodeHintType, HybridBinarizer, BinaryBitmap, LuminanceSource,
} from '@zxing/library';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map((p) => [...p].reverse().map((b) => (b === '1' ? '0' : '1')).join(''));
const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13Modules(code) {
  const d = [...code].map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += '101';
  return bits; // 95 modules
}

// SVG of a printed book barcode: bars, longer guards, digits underneath and
// "ISBN 978-…" above, like on a real back cover.
export function ean13Svg(code, module = 3, barHeight = 70) {
  const bits = ean13Modules(code);
  const quiet = 11 * module;
  const w = 95 * module + quiet * 2;
  const h = barHeight + 40;
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  let rects = '';
  for (let i = 0; i < 95; i++) {
    if (bits[i] !== '1') continue;
    const long = guard.has(i) ? 6 : 0;
    rects += `<rect x="${quiet + i * module}" y="14" width="${module}" height="${barHeight + long}" fill="#000"/>`;
  }
  const fs = module * 4;
  const isbnText = `ISBN ${code.slice(0, 3)}-${code.slice(3, 5)}-${code.slice(5, 9)}-${code.slice(9, 12)}-${code[12]}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + fs}">
<rect width="100%" height="100%" fill="#fff"/>
<text x="${w / 2}" y="11" font-family="Helvetica" font-size="${fs * 0.7}" text-anchor="middle">${isbnText}</text>
${rects}
<text x="${quiet - module * 7}" y="${barHeight + 14 + fs}" font-family="Helvetica" font-size="${fs}">${code[0]}</text>
<text x="${quiet + 3 * module + 21 * module}" y="${barHeight + 14 + fs}" font-family="Helvetica" font-size="${fs}" text-anchor="middle" letter-spacing="${module * 1.5}">${code.slice(1, 7)}</text>
<text x="${quiet + 50 * module + 21 * module}" y="${barHeight + 14 + fs}" font-family="Helvetica" font-size="${fs}" text-anchor="middle" letter-spacing="${module * 1.5}">${code.slice(7)}</text>
</svg>`;
}

// Luminance source over a grayscale buffer that supports rotation — the
// browser's HTMLCanvasElementLuminanceSource does, and TRY_HARDER relies on
// it to read barcodes held sideways.
export class GrayLuminanceSource extends LuminanceSource {
  constructor(gray, width, height) {
    super(width, height);
    this.gray = gray;
  }
  getRow(y, row) {
    const w = this.getWidth();
    if (!row || row.length < w) row = new Uint8ClampedArray(w);
    row.set(this.gray.subarray(y * w, y * w + w));
    return row;
  }
  getMatrix() { return this.gray; }
  isCropSupported() { return false; }
  isRotateSupported() { return true; }
  rotateCounterClockwise() {
    const w = this.getWidth(), h = this.getHeight();
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(w - 1 - x) * h + y] = this.gray[y * w + x];
    return new GrayLuminanceSource(out, h, w);
  }
  rotateCounterClockwise45() { return this.rotateCounterClockwise(); }
  invert() {
    const out = new Uint8ClampedArray(this.gray.length);
    for (let i = 0; i < out.length; i++) out[i] = 255 - this.gray[i];
    return new GrayLuminanceSource(out, this.getWidth(), this.getHeight());
  }
}

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]);
hints.set(DecodeHintType.TRY_HARDER, true);
const reader = new MultiFormatReader();
reader.setHints(hints);

// APP_DECODE=legacy reproduces the old app call: reader.decode(bitmap) without
// hints, which makes ZXing reset itself to "all formats, no TRY_HARDER".
const legacy = process.env.APP_DECODE === 'legacy' || process.env.MODE === 'legacy';
export function decodeGray(gray, width, height) {
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new GrayLuminanceSource(gray, width, height)));
    return (legacy ? reader.decode(bitmap) : reader.decodeWithState(bitmap)).getText();
  } catch {
    return null;
  }
}

export async function decodeImage(input) {
  const { data, info } = await sharp(input).grayscale().raw().toBuffer({ resolveWithObject: true });
  return decodeGray(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height);
}
