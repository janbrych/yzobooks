'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, X, Check, Sparkles } from 'lucide-react';
import { processImageOrQuery, resolveBookFromBarcode, BookSearchResult, type BarcodeResolution } from '@/lib/scanner';
import { enhanceCanvasForOcr } from '@/lib/imagePreprocessing';
import { toast } from '@/lib/toast';
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  BinaryBitmap,
} from '@zxing/library';

// Reused across every scan iteration instead of allocating a fresh reader
// (and hint map) on every single frame — this runs as often as every ~2s
// during continuous auto-scanning.
const barcodeHints = new Map();
barcodeHints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
]);
// Search harder per frame (skewed / partly blurred codes); affordable now
// that live scanning does nothing but decode barcodes.
barcodeHints.set(DecodeHintType.TRY_HARDER, true);

const LIVE_SCAN_INTERVAL_MS = 300;
const LIVE_SCAN_MAX_WIDTH = 960;
const SCAN_STATUS_IDLE = 'Hledám čárový kód… Obálku vyfoťte tlačítkem.';
const barcodeReader = new MultiFormatReader();
barcodeReader.setHints(barcodeHints);

function decodeBarcodeFromCanvas(canvas: HTMLCanvasElement): string | null {
  try {
    const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas);
    const binarizer = new HybridBinarizer(luminanceSource);
    const binaryBitmap = new BinaryBitmap(binarizer);
    const result = barcodeReader.decode(binaryBitmap);
    return result ? result.getText() : null;
  } catch {
    return null;
  }
}

// Photos picked from the file input can come straight off a phone's main
// camera (often 10+ megapixels) with no resizing at all — that's a lot of
// base64 payload to ship to the OCR endpoint and a lot of pixels for
// Tesseract to churn through for no recognition benefit. Downscale to a
// sane max dimension before it ever reaches the canvas/OCR/upload pipeline.
const MAX_IMAGE_DIMENSION = 1600;

function downscaleImageIfNeeded(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    // Guard against an image that never fires load/error (e.g. test
    // environments without real image decoding) so this can never hang.
    const timeout = setTimeout(() => finish(dataUrl), 300);

    const img = new Image();
    img.onload = () => {
      clearTimeout(timeout);
      const { width, height } = img;
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
      if (!width || !height || scale >= 1) {
        finish(dataUrl);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      finish(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      clearTimeout(timeout);
      finish(dataUrl);
    };
    img.src = dataUrl;
  });
}

const ANALYSIS_STEPS = [
  'Hledám čárový kód…',
  'Čtu text z obálky…',
  'Prohledávám katalogy knihoven…',
  'Porovnávám nalezené tituly…',
  'Ještě chvilku…',
];

export interface BookData extends Partial<BookSearchResult> {
  id?: string;
  status?: string;
  rating?: number | null;
  // Other catalog titles sharing the scanned code (box-set ISBNs), offered
  // in the form so the user can pick the right one.
  alternatives?: BookSearchResult[];
  // Shown next to the ISBN field when the scan needs a manual check.
  notice?: string;
}

// A barcode photo shows the back cover, so unlike an OCR'd front cover it is
// never used as the book's cover image — the form looks one up instead.
function barcodeToBookData(scanned: BarcodeResolution): BookData {
  return {
    ...scanned.result,
    alternatives: scanned.alternatives,
    notice: scanned.confident
      ? undefined
      : `Kód ${scanned.result.isbn} jsme v katalozích nenašli. Doplňte prosím údaje ručně.`,
  };
}

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecognized: (bookData: BookData) => void;
}

export function CameraModal({ isOpen, onClose, onRecognized }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<number>(0);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [scanStatus, setScanStatus] = useState(SCAN_STATUS_IDLE);
  const [analysisStep, setAnalysisStep] = useState(0);

  // Rotate the progress caption while a photo is analyzed — recognition can
  // take several seconds and a static spinner reads as "stuck".
  useEffect(() => {
    if (!isAnalyzing) return;
    setAnalysisStep(0);
    const timer = setInterval(() => setAnalysisStep((s) => Math.min(s + 1, ANALYSIS_STEPS.length - 1)), 1600);
    return () => clearInterval(timer);
  }, [isAnalyzing]);
  const isScanningRef = useRef<boolean>(false);

  const stopCameraStream = useCallback(() => {
    sessionIdRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsVideoReady(false);
  }, []);

  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    const currentSession = sessionIdRef.current;
    setCameraError(null);
    setIsVideoReady(false);

    try {
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err: unknown) {
        if (currentSession !== sessionIdRef.current) return;
        const error = err as { name?: string };
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          throw err;
        }
        // Fallback to basic video constraint if camera resolution constraint failed
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (currentSession !== sessionIdRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
    } catch (err: unknown) {
      if (currentSession !== sessionIdRef.current) return;
      console.error('Camera access error:', err);
      const error = err as { name?: string };
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraError('Přístup ke kameře byl odepřen. Můžete vybrat fotografii ze souborů.');
      } else {
        setCameraError('Kamera není dostupná nebo se nepodařilo spustit náhled. Můžete vybrat fotografii ze souborů.');
      }
    }
  }, [stopCameraStream]);

  // Main camera lifecycle effect
  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCameraStream();
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [isOpen, capturedImage, startCameraStream, stopCameraStream]);

  // Handle stream binding to <video> element safely
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !stream) {
      setIsVideoReady(false);
      return;
    }

    let isSubscribed = true;
    videoEl.srcObject = stream;

    const handleLoadedMetadata = () => {
      if (!isSubscribed) return;
      videoEl
        .play()
        .then(() => {
          if (isSubscribed) setIsVideoReady(true);
        })
        .catch((playErr) => {
          console.error('Video play error:', playErr);
          if (isSubscribed) {
            setCameraError('Chyba při přehrávání videa z kamery.');
          }
        });
    };

    videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);

    if (videoEl.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      isSubscribed = false;
      videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      if (videoEl.srcObject === stream) {
        videoEl.srcObject = null;
      }
    };
  }, [stream]);


  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !isVideoReady) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImage(dataUrl);
      stopCameraStream();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawDataUrl = event.target?.result as string;
        setCapturedImage(await downscaleImageIfNeeded(rawDataUrl));
        stopCameraStream();
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClose = useCallback(() => {
    setCapturedImage(null);
    setCameraError(null);
    setIsAnalyzing(false);
    stopCameraStream();
    onClose();
  }, [onClose, stopCameraStream]);

  // Continuous background auto-scanning logic
  useEffect(() => {
    if (!isOpen || capturedImage || !isVideoReady || !stream || isAnalyzing) {
      return;
    }

    let isCancelled = false;
    let scanTimeout: NodeJS.Timeout | null = null;

    const performAutoScan = async () => {
      if (isCancelled || isScanningRef.current || !videoRef.current || !canvasRef.current) {
        return;
      }

      isScanningRef.current = true;
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        // A barcode stays readable well below full camera resolution, and a
        // smaller frame keeps each decode quick enough to run several times a
        // second.
        const scale = Math.min(1, LIVE_SCAN_MAX_WIDTH / (video.videoWidth || 640));
        canvas.width = Math.round((video.videoWidth || 640) * scale);
        canvas.height = Math.round((video.videoHeight || 480) * scale);

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Live scanning only reads barcodes. Recognizing a cover (OCR +
          // catalog searches) takes seconds; running it here blocked the loop
          // so a barcode in view was only checked every few seconds. Covers
          // are recognized from a photo the user takes instead.
          const detectedText = decodeBarcodeFromCanvas(canvas);
          if (detectedText && !isCancelled) {
            setScanStatus(`Nalezen kód ${detectedText} – hledám knihu…`);
            const scanned = await resolveBookFromBarcode(detectedText);
            if (scanned && !isCancelled) {
              onRecognized(barcodeToBookData(scanned));
              handleClose();
              return;
            }
            // Not a valid book code (misread, shelf label) — keep scanning.
            if (!isCancelled) setScanStatus(SCAN_STATUS_IDLE);
          }
        }
      } catch (err) {
        console.warn('Auto scan iteration error:', err);
      } finally {
        isScanningRef.current = false;
        if (!isCancelled) {
          scanTimeout = setTimeout(performAutoScan, LIVE_SCAN_INTERVAL_MS);
        }
      }
    };

    setScanStatus(SCAN_STATUS_IDLE);
    scanTimeout = setTimeout(performAutoScan, 400);

    return () => {
      isCancelled = true;
      if (scanTimeout) clearTimeout(scanTimeout);
    };
  }, [isOpen, capturedImage, isVideoReady, stream, isAnalyzing, handleClose, onRecognized]);

  const handleRetake = () => {
    setCapturedImage(null);
    // Note: Do NOT call startCameraStream() here!
    // Setting capturedImage to null triggers the effect above, which will cleanly call startCameraStream().
  };

  const analyzeImage = async () => {
    if (!capturedImage) return;
    setIsAnalyzing(true);

    try {
      // Draw the captured photo once, both for barcode decoding and (if that
      // fails) to produce a grayscale/contrast-enhanced copy for OCR.
      let ocrImage: string = capturedImage;
      if (canvasRef.current) {
        try {
          const img = new Image();
          img.src = capturedImage;
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
            setTimeout(resolve, 200);
          });

          const canvas = canvasRef.current;
          canvas.width = img.width || 640;
          canvas.height = img.height || 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const detectedText = decodeBarcodeFromCanvas(canvas);
            const scanned = detectedText ? await resolveBookFromBarcode(detectedText) : null;
            if (scanned) {
              onRecognized(barcodeToBookData(scanned));
              handleClose();
              return;
            }
            // No barcode found — reuse the same drawn canvas to produce an
            // OCR-enhanced version of the photo (better text recognition).
            ocrImage = enhanceCanvasForOcr(canvas);
          }
        } catch {
          // Barcode/canvas step failed, continue to OCR / API evaluation with the original photo
        }
      }

      // Try backend API first, but only accept a confident catalog match —
      // otherwise fall through to the client-side path below, which tries
      // additional sources (e.g. Knihovny.cz) before giving up.
      const res = await fetch('/api/books/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: ocrImage }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.result && data.confident) {
          onRecognized({
            ...data.result,
            coverUrl: data.result.coverUrl || capturedImage,
          });
          handleClose();
          return;
        }
      }

      // Fallback to client-side recognition (for GitHub Pages / static export,
      // server offline, or when the server call above found no confident match)
      let clientResult = await processImageOrQuery({ image: ocrImage });
      if (!clientResult.confident && ocrImage !== capturedImage) {
        // The contrast enhancement helps most photos but wrecks some
        // stylized covers (it lost "Malý" from "Malý princ") — give the
        // untouched photo one more try before giving up.
        const rawResult = await processImageOrQuery({ image: capturedImage });
        if (rawResult.confident) clientResult = rawResult;
      }
      if (clientResult && clientResult.result) {
        onRecognized({
          ...clientResult.result,
          coverUrl: clientResult.result.coverUrl || capturedImage,
        });
        handleClose();
        if (!clientResult.confident) {
          // Still no confident match anywhere — let the user know the form
          // was pre-filled from raw OCR text and needs a manual check.
          toast('Knihu se nepodařilo jednoznačně rozpoznat – zkontrolujte údaje nebo opište ISBN.', { tone: 'warning', duration: 5000 });
        }
      } else {
        toast('Z fotky se nepodařilo knihu rozpoznat.', { tone: 'warning' });
      }
    } catch (err) {
      console.error('Analyze error:', err);
      toast('Při zpracování fotky nastala chyba.', { tone: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="theme-keep-dark fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/90 backdrop-blur-md animate-backdrop-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[100dvh] animate-sheet-in">
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
            <Sparkles size={18} />
            <span>Vyfotit knihu s AI</span>
          </div>
          <button
            aria-label="Zavřít skenování"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Camera / Photo area */}
        <div className="relative aspect-[3/4] w-full bg-slate-950 flex items-center justify-center overflow-hidden">
          {capturedImage ? (
            <img src={capturedImage} alt="Captured" className="w-full h-full object-cover animate-fadeIn" />
          ) : stream ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!cameraError && (
                <div className="absolute top-3 left-3 right-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/50 flex items-center justify-center gap-2 text-xs text-indigo-300 animate-pulse pointer-events-none">
                  <RefreshCw size={12} className="animate-spin text-indigo-400" />
                  <span>{scanStatus}</span>
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                  <p className="text-xs text-slate-300">{cameraError}</p>
                </div>
              )}
            </>
          ) : (
            <div className="p-6 text-center flex flex-col items-center gap-3">
              <Camera size={48} className="text-slate-600 animate-pulse" />
              <p className="text-xs text-slate-400">{cameraError || 'Načítám kameru...'}</p>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />

          {/* AI Loader Overlay */}
          {isAnalyzing && (
            <div className="absolute inset-0 animate-fadeIn">
              {/* tinted photo with a sweeping scan line */}
              <div className="absolute inset-0 bg-indigo-950/45" />
              <div
                aria-hidden
                className="absolute inset-x-[6%] h-0.5 rounded-full bg-indigo-300 shadow-[0_0_18px_4px_rgb(129_140_248/0.7)] animate-scan"
              />
              {/* corner brackets framing the cover */}
              {['top-4 left-4 border-t-2 border-l-2', 'top-4 right-4 border-t-2 border-r-2', 'bottom-4 left-4 border-b-2 border-l-2', 'bottom-4 right-4 border-b-2 border-r-2'].map((c) => (
                <span key={c} aria-hidden className={`absolute w-8 h-8 rounded-sm border-indigo-300/80 ${c}`} />
              ))}
              <div className="absolute inset-x-4 bottom-8 flex flex-col items-center gap-1.5 text-center">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/80 backdrop-blur px-4 py-2 text-sm font-semibold text-slate-100 shadow-lg">
                  <RefreshCw size={14} className="text-indigo-300 animate-spin" />
                  <span key={analysisStep} className="animate-rise">{ANALYSIS_STEPS[analysisStep]}</span>
                </span>
                <span className="text-[11px] text-slate-300/90">AI analýza obálky a vyhledávání knihy</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="p-5 flex items-center justify-around gap-4 bg-slate-900 border-t border-slate-800">
          {capturedImage ? (
            <>
              <button
                onClick={handleRetake}
                disabled={isAnalyzing}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw size={18} /> Znova
              </button>
              <button
                onClick={analyzeImage}
                disabled={isAnalyzing}
                className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-500/25"
              >
                <Check size={18} /> Vyhodnotit
              </button>
            </>
          ) : (
            <>
              <label className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors text-center">
                <span>Nahrát fotku</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
              <button
                onClick={capturePhoto}
                disabled={!stream || !isVideoReady}
                className="p-4 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 transition-transform active:scale-95 disabled:opacity-50"
              >
                <Camera size={26} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
