// Quick checks on a cover photo before it is analyzed. A dark, blurred or
// glaring photo is the main reason OCR can't read the title, and telling the
// user right away ("retake it, the photo is blurred") is faster than letting
// them wait for a wrong result.

// Self-contained (no imports) so the benchmark can load it in plain Node.
export interface GrayImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface PhotoQuality {
  brightness: number; // mean luminance 0–255
  sharpness: number; // variance of the Laplacian (edge strength)
  glare: number; // share of blown-out pixels, 0–1
}

export type PhotoIssue = 'dark' | 'blurry';

// Measured on a 480 px copy so the numbers don't depend on the camera's
// resolution (and the check takes a few milliseconds).
const SIDE = 480;

// Box-average down to SIDE px on the long side.
function shrink(img: GrayImage): GrayImage {
  const factor = Math.max(1, Math.max(img.width, img.height) / SIDE);
  const width = Math.max(1, Math.floor(img.width / factor));
  const height = Math.max(1, Math.floor(img.height / factor));
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * factor);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * factor));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * factor);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * factor));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += img.data[yy * img.width + xx];
      data[y * width + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return { data, width, height };
}

export function measurePhoto(img: GrayImage): PhotoQuality {
  const { data, width, height } = shrink(img);
  let sum = 0;
  let blown = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (data[i] >= 250) blown++;
  }
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width];
      lapSum += lap;
      lapSq += lap * lap;
      n++;
    }
  }
  const mean = n ? lapSum / n : 0;
  return {
    brightness: data.length ? sum / data.length : 0,
    sharpness: n ? lapSq / n - mean * mean : 0,
    glare: data.length ? blown / data.length : 0,
  };
}

// Thresholds picked on the benchmark covers (bench/photo-quality.mjs, 120
// covers): "dark" flags 9 in 10 darkened photos and ~2 % of dim ones,
// "blurry" flags 99 % of heavily blurred photos and none of the sharp ones.
// Glare isn't flagged: blown-out pixels can't be told apart from a white
// cover (10 % of clean covers would be flagged), so it is only a tip.
export const QUALITY_LIMITS = { minBrightness: 48, minSharpness: 60 };

export function photoIssues(q: PhotoQuality): PhotoIssue[] {
  const issues: PhotoIssue[] = [];
  if (q.brightness < QUALITY_LIMITS.minBrightness) issues.push('dark');
  // A dark photo has weak edges anyway; light is the thing to fix first.
  else if (q.sharpness < QUALITY_LIMITS.minSharpness) issues.push('blurry');
  return issues;
}

export const PHOTO_ISSUE_TEXT: Record<PhotoIssue, string> = {
  dark: 'Fotka je tmavá. Rozsviť nebo zapni přisvícení.',
  blurry: 'Fotka je rozmazaná. Podrž telefon chvíli v klidu a nech kameru zaostřit.',
};
