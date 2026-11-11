# Recognition benchmark

Measures barcode and cover recognition on real catalog data from Knihovny.cz:
`dataset` (485 books by 78 authors, used for tuning) and `dataset2` (700 books
by 129 other authors, for checking). No ML: results are used to tune the
heuristics in `src/lib/scanner.ts` and the decoding in `src/lib/barcodeDecode.ts`
and `src/lib/fastBarcode.ts`. Pick the set with `DATASET=dataset2`.
Everything downloaded or computed lands in `bench/data/` (gitignored).

    node bench/collect.mjs                  # dataset.json + covers
    MODE=live node bench/bench-barcodes.mjs # live|photo|legacy, --no-lookup, --variants=a,b
    node bench/ocr.mjs scan                 # OCR covers (scan|photo); PREP=multi = app's passes
    node bench/resolve.mjs scan             # OCR text → catalog match; --prep=multi, TAG=name
    node bench/bench-fastscan.mjs           # ISBN mode: guide crop, ZXing-C++ (WASM) vs ZXing-js
    node bench/photo-quality.mjs            # calibrates the dark/blurry checks on cover photos

Barcodes are rendered EAN-13 codes in synthetic camera frames; "photo" covers
are catalog covers composited on a table with tilt, light and JPEG. Neither is
a real phone camera.
