// Barcode decoding on plain grayscale buffers, shared by the camera (live
// frames and photos) and the benchmark in bench/. Working on our own buffers
// instead of ZXing's HTMLCanvasElementLuminanceSource fixes two problems the
// benchmark found:
//  - reader.decode(bitmap) without hints makes ZXing reset itself to "every
//    format, no TRY_HARDER" on each call, so the configured hints never
//    applied: decodeWithState keeps them (codes held sideways: 0 % → 100 %).
//  - the canvas source's rotation doesn't update its width/height, so even
//    with TRY_HARDER the 90° retry read a garbled image.

import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  HybridBinarizer,
  BinaryBitmap,
  LuminanceSource,
} from '@zxing/library';

export interface GrayImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

class GrayLuminanceSource extends LuminanceSource {
  private readonly gray: Uint8ClampedArray;

  constructor(gray: Uint8ClampedArray, width: number, height: number) {
    super(width, height);
    this.gray = gray;
  }

  getRow(y: number, row?: Uint8ClampedArray): Uint8ClampedArray {
    const w = this.getWidth();
    const out = row && row.length >= w ? row : new Uint8ClampedArray(w);
    out.set(this.gray.subarray(y * w, y * w + w));
    return out;
  }

  getMatrix(): Uint8ClampedArray {
    return this.gray;
  }

  isRotateSupported(): boolean {
    return true;
  }

  rotateCounterClockwise(): LuminanceSource {
    const w = this.getWidth();
    const h = this.getHeight();
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) out[(w - 1 - x) * h + y] = this.gray[y * w + x];
    }
    return new GrayLuminanceSource(out, h, w);
  }

  invert(): LuminanceSource {
    const out = new Uint8ClampedArray(this.gray.length);
    for (let i = 0; i < out.length; i++) out[i] = 255 - this.gray[i];
    return new GrayLuminanceSource(out, this.getWidth(), this.getHeight());
  }
}

// Book codes only: EAN-13 (ISBN), plus the others a book might carry.
const hints = new Map<DecodeHintType, unknown>();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
]);
// Also tries the image turned 90° (a book held sideways).
hints.set(DecodeHintType.TRY_HARDER, true);
const reader = new MultiFormatReader();
reader.setHints(hints);

export function decodeGray(img: GrayImage): string | null {
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new GrayLuminanceSource(img.data, img.width, img.height)));
    return reader.decodeWithState(bitmap).getText();
  } catch {
    return null;
  }
}

// RGBA pixels (canvas ImageData) → luminance.
export function rgbaToGray(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; p < data.length; i += 4, p++) {
    data[p] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return { data, width, height };
}

// Box-filter downscale so the long side is at most maxSide.
export function downscaleGray(img: GrayImage, maxSide: number): GrayImage {
  const factor = Math.max(img.width, img.height) / maxSide;
  if (factor <= 1) return img;
  const width = Math.round(img.width / factor);
  const height = Math.round(img.height / factor);
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * factor);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * factor));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * factor);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * factor));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) {
        const row = yy * img.width;
        for (let xx = x0; xx < x1; xx++) sum += img.data[row + xx];
      }
      data[y * width + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return { data, width, height };
}

// The middle `fraction` of the image at full resolution — a code held far
// from the camera is too small to read in a downscaled frame.
export function centerCrop(img: GrayImage, fraction: number): GrayImage {
  const width = Math.round(img.width * fraction);
  const height = Math.round(img.height * fraction);
  const left = Math.round((img.width - width) / 2);
  const top = Math.round((img.height - height) / 2);
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    data.set(img.data.subarray((top + y) * img.width + left, (top + y) * img.width + left + width), y * width);
  }
  return { data, width, height };
}

// Rotate by `degrees` around the centre (bilinear, white corners).
// ZXing reads rows, so a code tilted more than its bars allow is missed;
// reading a counter-rotated copy straightens it.
export function rotateGray(img: GrayImage, degrees: number): GrayImage {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const width = Math.ceil(Math.abs(img.width * cos) + Math.abs(img.height * sin));
  const height = Math.ceil(Math.abs(img.width * sin) + Math.abs(img.height * cos));
  const data = new Uint8ClampedArray(width * height).fill(255);
  const cx = img.width / 2;
  const cy = img.height / 2;
  const ncx = width / 2;
  const ncy = height / 2;
  for (let y = 0; y < height; y++) {
    const dy = y - ncy;
    for (let x = 0; x < width; x++) {
      const dx = x - ncx;
      const fx = dx * cos + dy * sin + cx - 0.5;
      const fy = -dx * sin + dy * cos + cy - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= img.width || y0 + 1 >= img.height) continue;
      // Bilinear: nearest-neighbour leaves jagged bar edges ZXing can't read.
      const ax = fx - x0;
      const ay = fy - y0;
      const i = y0 * img.width + x0;
      const top = img.data[i] + (img.data[i + 1] - img.data[i]) * ax;
      const bottom = img.data[i + img.width] + (img.data[i + img.width + 1] - img.data[i + img.width]) * ax;
      data[y * width + x] = top + (bottom - top) * ay;
    }
  }
  return { data, width, height };
}

// Long side of the frame ZXing reads in one pass: big enough for a code at a
// normal distance, small enough to decode several times a second.
export const SCAN_MAX_SIDE = 960;
// Extra attempts tried on top of the plain frame, one per live frame in turn
// (so each frame costs at most two decodes) and all of them for a photo.
const EXTRA_ATTEMPTS: Array<(img: GrayImage) => GrayImage> = [
  (img) => downscaleGray(centerCrop(img, 0.5), SCAN_MAX_SIDE),
  // Rotate only the middle of the frame, where the code is aimed: the whole
  // rotated frame comes out larger and the code too small to read.
  (img) => rotateGray(downscaleGray(centerCrop(img, 0.6), SCAN_MAX_SIDE), 30),
  (img) => rotateGray(downscaleGray(centerCrop(img, 0.6), SCAN_MAX_SIDE), -30),
];

// One live camera frame: the whole frame, then one extra attempt chosen by
// the frame number, so all of them are covered within a few frames.
export function decodeLiveFrame(img: GrayImage, frameIndex: number): string | null {
  const full = decodeGray(downscaleGray(img, SCAN_MAX_SIDE));
  if (full) return full;
  return decodeGray(EXTRA_ATTEMPTS[frameIndex % EXTRA_ATTEMPTS.length](img));
}

// A still photo: try everything.
export function decodePhoto(img: GrayImage): string | null {
  const full = decodeGray(downscaleGray(img, SCAN_MAX_SIDE * 2));
  if (full) return full;
  // Scaling down averages out sensor noise: dark, grainy photos read at 960
  // px but not at 1920 (benchmark: 81 % → 100 %).
  for (const attempt of [(i: GrayImage) => downscaleGray(i, SCAN_MAX_SIDE), ...EXTRA_ATTEMPTS]) {
    const text = decodeGray(attempt(img));
    if (text) return text;
  }
  return null;
}
