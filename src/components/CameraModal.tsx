'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, X, Check, Sparkles } from 'lucide-react';
import { processImageOrQuery, extractISBN, BookSearchResult } from '@/lib/scanner';
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  BinaryBitmap,
} from '@zxing/library';

function decodeBarcodeFromCanvas(canvas: HTMLCanvasElement): string | null {
  try {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.CODE_128,
    ]);
    const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas);
    const binarizer = new HybridBinarizer(luminanceSource);
    const binaryBitmap = new BinaryBitmap(binarizer);
    const reader = new MultiFormatReader();
    reader.setHints(hints);
    const result = reader.decode(binaryBitmap);
    return result ? result.getText() : null;
  } catch {
    return null;
  }
}

export interface BookData extends Partial<BookSearchResult> {
  id?: string;
  status?: string;
  rating?: number | null;
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
  const autoScanStatus = 'Skenuji čárový kód / obálku...';
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
      reader.onload = (event) => {
        setCapturedImage(event.target?.result as string);
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
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frameData = canvas.toDataURL('image/jpeg', 0.8);

          // 1. Try real-time EAN-13 / barcode scanning first
          const detectedText = decodeBarcodeFromCanvas(canvas);
          if (detectedText) {
            const isbn = extractISBN(detectedText) || detectedText;
            if (isbn && isbn.length >= 9) {
              const bookResult = await processImageOrQuery({ query: `isbn:${isbn}` });
              if (bookResult && bookResult.result && !isCancelled) {
                onRecognized({
                  ...bookResult.result,
                  isbn: bookResult.result.isbn || isbn,
                  coverUrl: bookResult.result.coverUrl || frameData,
                });
                handleClose();
                return;
              }
            }
          }

          // 2. Fallback to OCR auto scan if no barcode found
          const res = await fetch('/api/books/recognize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frameData }),
          }).catch(() => null);

          let autoResult = null;
          if (res && res.ok) {
            const data = await res.json();
            if (data.result && (data.result.isbn || (data.result.title && data.result.title !== 'Neznámá kniha' && data.result.title !== 'Rozpoznaná kniha'))) {
              autoResult = data.result;
            }
          }

          if (!autoResult) {
            const clientResult = await processImageOrQuery({ image: frameData });
            if (clientResult && clientResult.result && (clientResult.result.isbn || (clientResult.result.title && clientResult.result.title !== 'Rozpoznaná kniha' && clientResult.result.title !== 'Neznámá kniha'))) {
              autoResult = clientResult.result;
            }
          }

          if (autoResult && !isCancelled) {
            onRecognized({
              ...autoResult,
              coverUrl: autoResult.coverUrl || frameData,
            });
            handleClose();
            return;
          }
        }
      } catch (err) {
        console.warn('Auto scan iteration error:', err);
      } finally {
        isScanningRef.current = false;
        if (!isCancelled) {
          scanTimeout = setTimeout(performAutoScan, 2000);
        }
      }
    };

    scanTimeout = setTimeout(performAutoScan, 1500);

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
      // Try barcode extraction on captured image first
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
            if (detectedText) {
              const isbn = extractISBN(detectedText) || detectedText;
              if (isbn && isbn.length >= 9) {
                const bookResult = await processImageOrQuery({ query: `isbn:${isbn}` });
                if (bookResult && bookResult.result) {
                  onRecognized({
                    ...bookResult.result,
                    isbn: bookResult.result.isbn || isbn,
                    coverUrl: bookResult.result.coverUrl || capturedImage,
                  });
                  handleClose();
                  return;
                }
              }
            }
          }
        } catch {
          // Barcode not found, continue to OCR / API evaluation
        }
      }

      // Try backend API first
      const res = await fetch('/api/books/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: capturedImage }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.result) {
          onRecognized({
            ...data.result,
            coverUrl: data.result.coverUrl || capturedImage,
          });
          handleClose();
          return;
        }
      }

      // Fallback to client-side recognition (for GitHub Pages / static export / server offline)
      const clientResult = await processImageOrQuery({ image: capturedImage });
      if (clientResult && clientResult.result) {
        onRecognized({
          ...clientResult.result,
          coverUrl: clientResult.result.coverUrl || capturedImage,
        });
        handleClose();
      } else {
        alert('Nepodařilo se rozpoznat knihu z fotky.');
      }
    } catch (err) {
      console.error('Analyze error:', err);
      alert('Chyba při zpracování fotky.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
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
            <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
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
                  <span>{autoScanStatus}</span>
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
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-center p-6">
              <RefreshCw size={36} className="text-indigo-400 animate-spin" />
              <span className="font-semibold text-slate-200 text-sm">AI analýza obálky a vyhledávání knihy...</span>
              <p className="text-xs text-slate-400">Extrahuje se název, autor, ISBN a metadata.</p>
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
