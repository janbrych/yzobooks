// Fast ISBN scanning: read only the part of the camera image inside the guide
// frame, with the browser's native BarcodeDetector (Chrome, Android) or the
// same API backed by ZXing-C++ compiled to WebAssembly (Safari, Firefox).
// ZXing-C++ reads a frame several times faster than the JavaScript ZXing the
// cover-photo path uses, and a frame cropped to the guide is a fraction of
// the pixels, so a code is read the moment it is inside the frame.

// The guide frame drawn over the camera preview, as a fraction of the
// preview box: wide and low, the shape of a barcode.
export const GUIDE = { width: 0.84, height: 0.34 } as const;
// Long side the cropped region is scaled to before decoding.
export const GUIDE_DECODE_MAX_SIDE = 1280;
// Every other frame the whole visible picture is read at this size, which
// catches a code held upright (rotated 90°) that doesn't fit the wide guide
// (benchmark: 100 % of rot90 frames in 1.5 ms).
export const FULL_DECODE_MAX_SIDE = 960;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The part of the video visible in the preview box: it is shown with
// object-fit: cover, so a box of another shape only shows the video's middle.
export function visibleRect(videoWidth: number, videoHeight: number, boxWidth: number, boxHeight: number): Rect {
  const boxAspect = boxWidth / boxHeight;
  let width = videoWidth;
  let height = videoHeight;
  if (videoWidth / videoHeight > boxAspect) width = Math.round(videoHeight * boxAspect);
  else height = Math.round(videoWidth / boxAspect);
  return { x: Math.round((videoWidth - width) / 2), y: Math.round((videoHeight - height) / 2), width, height };
}

// The guide frame in video pixels.
export function guideRect(videoWidth: number, videoHeight: number, boxWidth: number, boxHeight: number): Rect {
  const visible = visibleRect(videoWidth, videoHeight, boxWidth, boxHeight);
  // Read a little beyond the drawn frame: a code held slightly off still counts.
  const width = Math.min(videoWidth, Math.round(visible.width * Math.min(1, GUIDE.width * 1.1)));
  const height = Math.min(videoHeight, Math.round(visible.height * GUIDE.height * 1.3));
  return { x: Math.round((videoWidth - width) / 2), y: Math.round((videoHeight - height) / 2), width, height };
}

function ean13Valid(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

// A book code read from a barcode, or null. Only ISBN-13 (978/979 EAN-13
// with a valid check digit) is accepted, so one read is enough: a misread
// that also lands on a valid ISBN is very unlikely, and other codes on a
// book (price stickers, a magazine's ISSN, shelf labels) are ignored.
export function acceptBookCode(raw: string | null | undefined): string | null {
  const code = (raw || '').replace(/\D/g, '');
  // An EAN-13 with the 5-digit price add-on comes through as 18 digits.
  const main = code.length === 18 ? code.slice(0, 13) : code;
  if (!/^97[89]/.test(main) || !ean13Valid(main)) return null;
  return main;
}

// Minimal shape of the BarcodeDetector API we use.
export interface Detector {
  detect(image: ImageBitmapSource | ImageData): Promise<Array<{ rawValue: string }>>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

let detectorPromise: Promise<Detector> | null = null;

// The native detector when it reads EAN-13, otherwise the WebAssembly one.
// The .wasm file is served by the app itself (public/zxing_reader.wasm,
// copied there by scripts/copy-zxing-wasm.mjs) instead of a CDN.
export function getDetector(basePath = ''): Promise<Detector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const Native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
      if (Native) {
        try {
          const supported = await Native.getSupportedFormats();
          if (supported.includes('ean_13')) return new Native({ formats: FORMATS });
        } catch {
          // fall through to WebAssembly
        }
      }
      const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
      await prepareZXingModule({
        overrides: { locateFile: (file: string, prefix: string) => (file.endsWith('.wasm') ? `${basePath}/${file}` : prefix + file) },
        fireImmediately: true,
      });
      return new BarcodeDetector({ formats: FORMATS as never });
    })();
    detectorPromise.catch(() => {
      detectorPromise = null;
    });
  }
  return detectorPromise;
}

// First book code the detector finds in the image, or null.
export async function detectBookCode(detector: Detector, image: ImageBitmapSource | ImageData): Promise<string | null> {
  try {
    for (const result of await detector.detect(image)) {
      const code = acceptBookCode(result.rawValue);
      if (code) return code;
    }
  } catch {
    // nothing readable in this frame
  }
  return null;
}
