'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, X, Check, Sparkles, ScanBarcode, BookImage, Flashlight, Lightbulb } from 'lucide-react';
import { processImageOrQuery, resolveBookFromBarcode, BookSearchResult, type BarcodeResolution } from '@/lib/scanner';
import { ocrPasses } from '@/lib/imagePreprocessing';
import { toast } from '@/lib/toast';
import { decodeGray, decodePhoto, rgbaToGray, type GrayImage } from '@/lib/barcodeDecode';
import { GUIDE, GUIDE_DECODE_MAX_SIDE, FULL_DECODE_MAX_SIDE, acceptBookCode, detectBookCode, getDetector, guideRect, visibleRect, type Detector } from '@/lib/fastBarcode';
import { measurePhoto, photoIssues, PHOTO_ISSUE_TEXT, type PhotoIssue } from '@/lib/photoQuality';

export type ScanMode = 'barcode' | 'cover';

// Digital zoom asked of the camera while scanning a code: the book can stay
// further from the lens, where the camera can still focus on it.
const BARCODE_ZOOM = 1.6;

const BARCODE_HINT = 'Namiř čárový kód do rámečku';
const COVER_TIPS = [
  'Celou přední stranu obálky dej do rámečku',
  'Drž telefon rovně nad knihou, ne šikmo',
  'Bez odlesku: lampu dej bokem, ne nad knihu',
  'Název musí jít přečíst, jinak radši vyfoť kód',
];

function canvasGray(canvas: HTMLCanvasElement): GrayImage | null {
  const ctx = canvas.getContext('2d');
  if (!ctx?.getImageData || !canvas.width || !canvas.height) return null;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (!imageData?.data) return null;
  return rgbaToGray(imageData.data, canvas.width, canvas.height);
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

// Camera controls only some browsers expose (Chrome on Android mostly).
type TrackCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number }; torch?: boolean; focusMode?: string[] };

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecognized: (bookData: BookData) => void;
  // Which way of adding a book the modal opens in; switchable inside.
  initialMode?: ScanMode;
}

export function CameraModal({ isOpen, onClose, onRecognized, initialMode = 'cover' }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<number>(0);

  const [mode, setMode] = useState<ScanMode>(initialMode);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [photoWarnings, setPhotoWarnings] = useState<PhotoIssue[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [foundCode, setFoundCode] = useState<string | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Each opening starts in the mode the user picked on the main screen.
  useEffect(() => {
    if (isOpen) setMode(initialMode);
  }, [isOpen, initialMode]);

  // Load the barcode detector as soon as the modal opens (the WebAssembly
  // fallback is ~1 MB), so it is ready when the camera is.
  useEffect(() => {
    if (isOpen) getDetector(process.env.NEXT_PUBLIC_BASE_PATH || '').catch(() => null);
  }, [isOpen]);

  // Rotate the progress caption while a photo is analyzed — recognition can
  // take several seconds and a static spinner reads as "stuck".
  useEffect(() => {
    if (!isAnalyzing) return;
    setAnalysisStep(0);
    const timer = setInterval(() => setAnalysisStep((s) => Math.min(s + 1, ANALYSIS_STEPS.length - 1)), 1600);
    return () => clearInterval(timer);
  }, [isAnalyzing]);

  // Cycle the cover-photo tips while framing.
  useEffect(() => {
    if (!isOpen || mode !== 'cover' || capturedImage) return;
    const timer = setInterval(() => setTipIndex((i) => (i + 1) % COVER_TIPS.length), 3200);
    return () => clearInterval(timer);
  }, [isOpen, mode, capturedImage]);

  const stopCameraStream = useCallback(() => {
    sessionIdRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsVideoReady(false);
    setTorchSupported(false);
    setTorchOn(false);
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
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
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

  // Camera tuning per mode, where the browser allows it: zoom in a little and
  // keep refocusing for codes, full width for covers.
  useEffect(() => {
    const track = stream?.getVideoTracks?.()[0];
    if (!track?.getCapabilities || !track.applyConstraints) return;
    let caps: TrackCapabilities;
    try {
      caps = track.getCapabilities() as TrackCapabilities;
    } catch {
      return;
    }
    setTorchSupported(!!caps.torch);
    const advanced: Record<string, unknown> = {};
    if (caps.zoom) advanced.zoom = mode === 'barcode' ? Math.min(caps.zoom.max, Math.max(caps.zoom.min, BARCODE_ZOOM)) : caps.zoom.min;
    if (caps.focusMode?.includes('continuous')) advanced.focusMode = 'continuous';
    if (Object.keys(advanced).length) track.applyConstraints({ advanced: [advanced as MediaTrackConstraintSet] }).catch(() => null);
  }, [stream, mode]);

  const toggleTorch = () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    track
      .applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .then(() => setTorchOn(next))
      .catch(() => setTorchSupported(false));
  };

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
      // Tell the user straight away if the photo is too dark or blurred to read.
      const gray = canvasGray(canvas);
      setPhotoWarnings(gray ? photoIssues(measurePhoto(gray)) : []);
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
        setPhotoWarnings([]);
        setCapturedImage(await downscaleImageIfNeeded(rawDataUrl));
        stopCameraStream();
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClose = useCallback(() => {
    setCapturedImage(null);
    setPhotoWarnings([]);
    setCameraError(null);
    setIsAnalyzing(false);
    setFoundCode(null);
    stopCameraStream();
    onClose();
  }, [onClose, stopCameraStream]);

  // ISBN mode: read the guide frame of every camera frame until a book code
  // shows up. One read of a valid ISBN is enough (see acceptBookCode).
  useEffect(() => {
    if (mode !== 'barcode' || !isOpen || capturedImage || !isVideoReady || !stream || isAnalyzing || foundCode) {
      return;
    }

    let cancelled = false;
    let detector: Detector | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const crop = document.createElement('canvas');
    getDetector(process.env.NEXT_PUBLIC_BASE_PATH || '')
      .then((d) => {
        detector = d;
      })
      .catch(() => null);

    let frameIndex = 0;
    const readFrame = async (): Promise<string | null> => {
      const video = videoRef.current;
      const box = previewRef.current;
      if (!video?.videoWidth || !box?.clientWidth) return null;
      // The guide frame, and with the detector every other frame the whole
      // visible picture (a code held upright doesn't fit the wide guide).
      const whole = !!detector && frameIndex++ % 2 === 1;
      const r = (whole ? visibleRect : guideRect)(video.videoWidth, video.videoHeight, box.clientWidth, box.clientHeight);
      const scale = Math.min(1, (whole ? FULL_DECODE_MAX_SIDE : GUIDE_DECODE_MAX_SIDE) / Math.max(r.width, r.height));
      crop.width = Math.round(r.width * scale);
      crop.height = Math.round(r.height * scale);
      const ctx = crop.getContext('2d', { willReadFrequently: !detector });
      if (!ctx) return null;
      ctx.drawImage(video, r.x, r.y, r.width, r.height, 0, 0, crop.width, crop.height);
      if (detector) return detectBookCode(detector, crop);
      // Until the detector has loaded (or if it can't), the JavaScript reader
      // on the guide crop.
      const gray = canvasGray(crop);
      return gray ? acceptBookCode(decodeGray(gray)) : null;
    };

    const scan = async () => {
      if (cancelled) return;
      let code: string | null = null;
      try {
        code = await readFrame();
      } catch (err) {
        console.warn('Barcode scan error:', err);
      }
      if (cancelled) return;
      if (code) {
        navigator.vibrate?.(40);
        setFoundCode(code);
        return;
      }
      // Next frame right away: a crop of the guide decodes in a few ms.
      timer = setTimeout(scan, 30);
    };
    timer = setTimeout(scan, 150);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mode, isOpen, capturedImage, isVideoReady, stream, isAnalyzing, foundCode]);

  // The page passes new callbacks on every render; the lookup below must not
  // restart because of that, so it reads the latest ones from refs.
  const onRecognizedRef = useRef(onRecognized);
  const handleCloseRef = useRef(handleClose);
  useEffect(() => {
    onRecognizedRef.current = onRecognized;
    handleCloseRef.current = handleClose;
  }, [onRecognized, handleClose]);

  // A code was read: look the book up and hand it to the form.
  useEffect(() => {
    if (!foundCode) return;
    let cancelled = false;
    resolveBookFromBarcode(foundCode)
      .then((scanned) => {
        if (cancelled) return;
        if (scanned) {
          onRecognizedRef.current(barcodeToBookData(scanned));
          handleCloseRef.current();
        } else {
          setFoundCode(null);
        }
      })
      .catch(() => {
        if (!cancelled) setFoundCode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [foundCode]);

  const handleRetake = () => {
    setCapturedImage(null);
    setPhotoWarnings([]);
    // Note: Do NOT call startCameraStream() here!
    // Setting capturedImage to null triggers the effect above, which will cleanly call startCameraStream().
  };

  const switchMode = (next: ScanMode) => {
    if (next === mode) return;
    setMode(next);
    setCapturedImage(null);
    setPhotoWarnings([]);
    setFoundCode(null);
  };

  const analyzeImage = async () => {
    if (!capturedImage) return;
    setIsAnalyzing(true);

    try {
      // Draw the captured photo once, both for barcode decoding and (if that
      // fails) to produce a grayscale/contrast-enhanced copy for OCR.
      let ocrImages: string[] = [capturedImage];
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
            const gray = canvasGray(canvas);
            const detectedText = gray ? decodePhoto(gray) : null;
            const scanned = detectedText ? await resolveBookFromBarcode(detectedText) : null;
            if (scanned) {
              onRecognized(barcodeToBookData(scanned));
              handleClose();
              return;
            }
            // No barcode found — reuse the same drawn canvas for the OCR
            // passes (small, inverted, unprocessed, full size).
            ocrImages = ocrPasses(canvas);
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
        body: JSON.stringify({ image: ocrImages[0] }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.result && data.confident) {
          onRecognized({
            ...data.result,
            coverUrl: !data.result.coverUrl || ocrImages.includes(data.result.coverUrl) ? capturedImage : data.result.coverUrl,
          });
          handleClose();
          return;
        }
      }

      // Fallback to client-side recognition (for GitHub Pages / static export,
      // server offline, or when the server call above found no confident match).
      // Each pass reads covers the others miss; stop at the first confident
      // match and otherwise keep the first pass's guess for the form.
      let clientResult: Awaited<ReturnType<typeof processImageOrQuery>> | null = null;
      for (const image of ocrImages) {
        const attempt = await processImageOrQuery({ image });
        if (!clientResult || attempt.confident) clientResult = attempt;
        if (attempt.confident) break;
      }
      if (clientResult && clientResult.result) {
        // Without a catalog cover the recognizer falls back to the image it
        // read — a small grayscale OCR pass; show the real photo instead.
        const coverUrl = clientResult.result.coverUrl;
        onRecognized({
          ...clientResult.result,
          coverUrl: !coverUrl || ocrImages.includes(coverUrl) ? capturedImage : coverUrl,
        });
        handleClose();
        if (!clientResult.confident) {
          // Still no confident match anywhere — let the user know the form
          // was pre-filled from raw OCR text and needs a manual check.
          toast('Knihu se nepodařilo jednoznačně rozpoznat. Zkontroluj údaje, nebo naskenuj čárový kód.', { tone: 'warning', duration: 5000 });
        }
      } else {
        toast('Z fotky se nepodařilo knihu rozpoznat. Zkus naskenovat čárový kód.', { tone: 'warning' });
      }
    } catch (err) {
      console.error('Analyze error:', err);
      toast('Při zpracování fotky nastala chyba.', { tone: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  const modeButton = (value: ScanMode, label: string, Icon: typeof Camera) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => switchMode(value)}
      disabled={isAnalyzing}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
        mode === value ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <Icon size={15} /> {label}
    </button>
  );

  return (
    <div className="theme-keep-dark fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/90 backdrop-blur-md animate-backdrop-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[100dvh] animate-sheet-in">
        {/* Header */}
        <div className="p-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
            <Sparkles size={18} />
            <span>Přidat knihu</span>
          </div>
          <button
            aria-label="Zavřít skenování"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode switch */}
        <div role="tablist" aria-label="Způsob přidání" className="mx-4 mb-3 p-1 flex gap-1 bg-slate-950 border border-slate-800 rounded-xl">
          {modeButton('barcode', 'Čárový kód', ScanBarcode)}
          {modeButton('cover', 'Obálka', BookImage)}
        </div>

        {/* Camera / Photo area */}
        <div ref={previewRef} className="relative aspect-[3/4] w-full bg-slate-950 flex items-center justify-center overflow-hidden">
          {capturedImage ? (
            <img src={capturedImage} alt="Pořízená fotka" className="w-full h-full object-cover animate-fadeIn" />
          ) : stream ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {!cameraError && mode === 'barcode' && (
                <div className="absolute inset-0 pointer-events-none" data-testid="barcode-guide">
                  {/* the guide frame, everything around it dimmed */}
                  <div
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-[0_0_0_9999px_rgb(2_6_23/0.55)] transition-colors ${
                      foundCode ? 'ring-4 ring-emerald-400' : ''
                    }`}
                    style={{ width: `${GUIDE.width * 100}%`, height: `${GUIDE.height * 100}%` }}
                  >
                    {['top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'].map((c) => (
                      <span key={c} aria-hidden className={`absolute w-9 h-9 drop-shadow-[0_0_3px_rgb(0_0_0/0.9)] ${foundCode ? 'border-emerald-400' : 'border-white'} ${c}`} />
                    ))}
                    {!foundCode && (
                      <span aria-hidden className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_12px_2px_rgb(239_68_68/0.8)] animate-pulse" />
                    )}
                  </div>
                  <div className="absolute inset-x-4 bottom-5 flex justify-center">
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/80 backdrop-blur px-4 py-2 text-xs font-medium text-slate-100">
                      {foundCode ? (
                        <>
                          <RefreshCw size={13} className="animate-spin text-emerald-300" />
                          Kód {foundCode} načten, hledám knihu…
                        </>
                      ) : (
                        <>
                          <ScanBarcode size={14} className="text-indigo-300" />
                          {BARCODE_HINT}
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}
              {!cameraError && mode === 'cover' && (
                <div className="absolute inset-0 pointer-events-none" data-testid="cover-guide">
                  {/* outline of a book cover (2:3) to fill */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[72%] aspect-[2/3]">
                    {['top-0 left-0 border-t-2 border-l-2', 'top-0 right-0 border-t-2 border-r-2', 'bottom-0 left-0 border-b-2 border-l-2', 'bottom-0 right-0 border-b-2 border-r-2'].map((c) => (
                      <span key={c} aria-hidden className={`absolute w-8 h-8 rounded-sm border-white drop-shadow-[0_0_3px_rgb(0_0_0/0.9)] ${c}`} />
                    ))}
                  </div>
                  <div className="absolute top-3 inset-x-3 flex justify-center">
                    <span key={tipIndex} className="inline-flex items-center gap-2 rounded-full bg-slate-950/80 backdrop-blur px-3 py-1.5 text-xs text-slate-100 animate-rise">
                      <Lightbulb size={13} className="text-amber-300 shrink-0" />
                      {COVER_TIPS[tipIndex]}
                    </span>
                  </div>
                </div>
              )}
              {torchSupported && !cameraError && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  aria-pressed={torchOn}
                  aria-label={torchOn ? 'Vypnout přisvícení' : 'Zapnout přisvícení'}
                  className={`absolute right-3 ${mode === 'cover' ? 'bottom-3' : 'top-3'} p-2.5 rounded-full backdrop-blur border transition-colors ${
                    torchOn ? 'bg-amber-300 text-slate-900 border-amber-200' : 'bg-slate-950/70 text-slate-100 border-slate-700'
                  }`}
                >
                  <Flashlight size={18} />
                </button>
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

          {/* Photo problems found before analysis */}
          {capturedImage && photoWarnings.length > 0 && !isAnalyzing && (
            <div className="absolute inset-x-3 top-3 flex flex-col gap-1.5" role="status">
              {photoWarnings.map((w) => (
                <span key={w} className="rounded-xl bg-amber-400/95 text-slate-950 px-3 py-2 text-xs font-medium shadow-lg">
                  {PHOTO_ISSUE_TEXT[w]}
                </span>
              ))}
            </div>
          )}

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
                <Check size={18} /> {photoWarnings.length ? 'Přesto vyhodnotit' : 'Vyhodnotit'}
              </button>
            </>
          ) : mode === 'barcode' ? (
            <>
              <label className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors text-center">
                <span>Nahrát fotku kódu</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
              <p className="flex-1 text-[11px] leading-snug text-slate-400">
                Kód se načte sám, jakmile je celý v rámečku. Žádné tlačítko není potřeba.
              </p>
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
                aria-label="Vyfotit obálku"
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
