import { describe, expect, it } from 'vitest';
import { acceptBookCode, detectBookCode, guideRect, GUIDE } from '@/lib/fastBarcode';
import { measurePhoto, photoIssues } from '@/lib/photoQuality';

describe('acceptBookCode', () => {
  it('accepts ISBN-13 codes with a valid check digit', () => {
    expect(acceptBookCode('9788000061917')).toBe('9788000061917');
    expect(acceptBookCode('9791032305690')).toBe('9791032305690');
  });

  it('rejects a misread check digit, other EAN codes and junk', () => {
    expect(acceptBookCode('9788000061918')).toBeNull(); // wrong check digit
    expect(acceptBookCode('8594003660085')).toBeNull(); // grocery EAN (valid check digit)
    expect(acceptBookCode('9770862690008')).toBeNull(); // magazine ISSN (valid check digit)
    expect(acceptBookCode('')).toBeNull();
    expect(acceptBookCode(null)).toBeNull();
  });

  it('drops the 5-digit price add-on printed next to the ISBN', () => {
    expect(acceptBookCode('978800006191752499')).toBe('9788000061917');
  });
});

describe('guideRect', () => {
  it('maps the guide frame to the visible middle of a cover-fit video', () => {
    // 16:9 landscape video in a 3:4 portrait preview: only the middle
    // 810 px of its width is visible.
    const r = guideRect(1920, 1080, 360, 480);
    expect(r.x + r.width / 2).toBeCloseTo(960, -1);
    expect(r.y + r.height / 2).toBeCloseTo(540, -1);
    expect(r.width).toBeLessThanOrEqual(810);
    expect(r.width).toBeGreaterThan(810 * GUIDE.width * 0.99);
    expect(r.height).toBeGreaterThan(1080 * GUIDE.height);
    expect(r.height).toBeLessThan(1080);
  });

  it('never reaches outside the video', () => {
    const r = guideRect(640, 480, 100, 1000);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(640);
    expect(r.y + r.height).toBeLessThanOrEqual(480);
  });
});

describe('detectBookCode', () => {
  it('returns the first book code and skips other symbols', async () => {
    const detector = { detect: async () => [{ rawValue: '8594003660085' }, { rawValue: '9788000061917' }] };
    expect(await detectBookCode(detector, {} as ImageData)).toBe('9788000061917');
  });

  it('treats a detector error as an empty frame', async () => {
    const detector = { detect: async () => Promise.reject(new Error('boom')) };
    expect(await detectBookCode(detector, {} as ImageData)).toBeNull();
  });
});

describe('photo quality', () => {
  // A sharp checkerboard of text-sized squares, optionally darkened or flattened.
  function image(level: (sharp: number) => number, blur = false) {
    const width = 600;
    const height = 800;
    const data = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const on = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0;
        data[y * width + x] = level(blur ? 0.5 : on ? 1 : 0);
      }
    }
    return { data, width, height };
  }

  it('passes a well-lit sharp photo', () => {
    expect(photoIssues(measurePhoto(image((v) => 40 + v * 180)))).toEqual([]);
  });

  it('flags a dark photo', () => {
    expect(photoIssues(measurePhoto(image((v) => 5 + v * 50)))).toEqual(['dark']);
  });

  it('flags a photo with no edges as blurry', () => {
    expect(photoIssues(measurePhoto(image((v) => 40 + v * 180, true)))).toEqual(['blurry']);
  });
});
