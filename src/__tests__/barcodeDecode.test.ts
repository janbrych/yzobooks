import { describe, it, expect } from 'vitest';
import { decodeGray, decodeLiveFrame, decodePhoto, downscaleGray, rotateGray, SCAN_MAX_SIDE, type GrayImage } from '@/lib/barcodeDecode';

// EAN-13 bit patterns, to draw a real, decodable book barcode in memory.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map((p) => [...p].reverse().map((b) => (b === '1' ? '0' : '1')).join(''));
const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function ean13Bits(code: string): string {
  const d = [...code].map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + '101';
}

// A frame of the given size with the code drawn in the middle, `module` px
// per bar module and bars half as tall as the code is wide (like on a book).
function frameWithCode(code: string, width: number, height: number, module: number): GrayImage {
  const data = new Uint8ClampedArray(width * height).fill(235);
  const bits = ean13Bits(code);
  const codeW = 95 * module;
  const left = Math.round((width - codeW) / 2);
  const barH = Math.round(codeW * 0.5);
  const top = Math.round((height - barH) / 2);
  // White label behind the code, with quiet zones.
  for (let y = top - 10; y < top + barH + 10; y++) {
    for (let x = left - 12 * module; x < left + codeW + 12 * module; x++) data[y * width + x] = 255;
  }
  for (let i = 0; i < 95; i++) {
    if (bits[i] !== '1') continue;
    for (let y = top; y < top + barH; y++) {
      for (let x = left + i * module; x < left + (i + 1) * module; x++) data[y * width + x] = 10;
    }
  }
  return { data, width, height };
}

const ISBN = '9788025703366';

describe('barcodeDecode', () => {
  it('reads a straight code', () => {
    expect(decodeGray(frameWithCode(ISBN, 800, 600, 4))).toBe(ISBN);
  });

  it('reads a code held sideways (TRY_HARDER rotation actually applies)', () => {
    const sideways = rotateGray(frameWithCode(ISBN, 800, 600, 4), 90);
    expect(decodeGray(sideways)).toBe(ISBN);
  });

  it('reads a code tilted by 40° within a few live frames', () => {
    const tilted = rotateGray(frameWithCode(ISBN, 1200, 900, 4), 40);
    expect(decodeGray(tilted)).toBeNull();
    const reads = [0, 1, 2].map((frame) => decodeLiveFrame(tilted, frame));
    expect(reads).toContain(ISBN);
  });

  it('reads a small, far-away code from the full-resolution centre', () => {
    // 2 px modules at 1920 px: 1 px once the frame is scaled to 960.
    const far = frameWithCode(ISBN, 1920, 1080, 2);
    expect(decodeGray(downscaleGray(far, SCAN_MAX_SIDE))).toBeNull();
    expect(decodeLiveFrame(far, 0)).toBe(ISBN);
    expect(decodePhoto(far)).toBe(ISBN);
  });

  it('returns null for a frame without a code', () => {
    const empty: GrayImage = { data: new Uint8ClampedArray(640 * 480).fill(200), width: 640, height: 480 };
    expect(decodeLiveFrame(empty, 0)).toBeNull();
    expect(decodePhoto(empty)).toBeNull();
  });
});
