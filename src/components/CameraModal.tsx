'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, X, Check, Sparkles } from 'lucide-react';
import { processImageOrQuery, BookSearchResult } from '@/lib/scanner';

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

  const handleClose = useCallback(() => {
    setCapturedImage(null);
    setCameraError(null);
    setIsAnalyzing(false);
    stopCameraStream();
    onClose();
  }, [onClose, stopCameraStream]);

  // Automatic micro-sequence scanning background loop
  useEffect(() => {
    if (!isOpen || !isVideoReady || capturedImage || isAnalyzing) return;

    let isMounted = true;
    let scanTimeout: NodeJS.Timeout | null = null;

    const runMicroScan = async () => {
      if (!isMounted || !videoRef.current || !canvasRef.current || !isVideoReady) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        try {
          const clientResult = await processImageOrQuery({ image: dataUrl });
          if (isMounted && clientResult && clientResult.result) {
            const res = clientResult.result;
            // Auto-trigger if valid ISBN or detailed match identified
            if (res.isbn || (res.title && res.title !== 'Rozpoznaná kniha' && res.author)) {
              onRecognized({
                ...res,
                coverUrl: res.coverUrl || dataUrl,
              });
              handleClose();
              return;
            }
          }
        } catch (err) {
          console.error('Micro-scan error:', err);
        }
      }

      if (isMounted) {
        scanTimeout = setTimeout(runMicroScan, 1500);
      }
    };

    scanTimeout = setTimeout(runMicroScan, 1000);

    return () => {
      isMounted = false;
      if (scanTimeout) clearTimeout(scanTimeout);
    };
  }, [isOpen, isVideoReady, capturedImage, isAnalyzing, onRecognized, handleClose]);

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

  const handleRetake = () => {
    setCapturedImage(null);
    // Note: Do NOT call startCameraStream() here!
    // Setting capturedImage to null triggers the effect above, which will cleanly call startCameraStream().
  };

  const analyzeImage = async () => {
    if (!capturedImage) return;
    setIsAnalyzing(true);

    try {
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
                className="w-full h-full object-cover -scale-x-100"
                style={{ transform: 'scaleX(-1)' }}
              />
              {cameraError ? (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                  <p className="text-xs text-slate-300">{cameraError}</p>
                </div>
              ) : isVideoReady && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-6">
                  <div className="w-full text-center bg-slate-900/60 backdrop-blur-md rounded-full py-1.5 px-3 text-xs text-indigo-300 font-medium border border-indigo-500/30 flex items-center justify-center gap-2 shadow-lg">
                    <Sparkles size={14} className="animate-spin text-indigo-400" />
                    <span>Automatické AI snímaní obálky / ISBN kódu...</span>
                  </div>
                  <div className="w-64 h-64 border-2 border-indigo-500/50 rounded-2xl relative flex items-center justify-center shadow-2xl">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-indigo-400 -mt-1 -ml-1 rounded-tl"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-indigo-400 -mt-1 -mr-1 rounded-tr"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-indigo-400 -mb-1 -ml-1 rounded-bl"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-indigo-400 -mb-1 -mr-1 rounded-br"></div>
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse"></div>
                  </div>
                  <span className="text-[10px] text-slate-400 bg-slate-950/80 px-2 py-1 rounded-full">
                    Ukažte knihu nebo ISBN kód před kameru
                  </span>
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
