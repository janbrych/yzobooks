// Copies the ZXing-C++ WebAssembly decoder (used by the fast ISBN scanner
// when the browser has no native BarcodeDetector) into public/, so the app
// serves it itself instead of loading it from a CDN. Runs before dev/build,
// which keeps it in step with the installed zxing-wasm version.
import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const source = require.resolve('zxing-wasm/reader/zxing_reader.wasm');
const target = path.join(import.meta.dirname, '..', 'public', 'zxing_reader.wasm');
copyFileSync(source, target);
