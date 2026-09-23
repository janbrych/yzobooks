'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, X, Check, Sparkles } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecognized: (bookData: any) => void;
}

export function CameraModal({ isOpen, onClose, onRecognized }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, capturedImage]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setCameraError('Kamera není dostupná nebo byl odepřen přístup. Můžete vybrat fotografii ze souborů.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target?.result as string);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!capturedImage) return;
    setIsAnalyzing(true);

    try {
      const res = await fetch('/api/books/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: capturedImage }),
      });

      const data = await res.json();
      if (res.ok && data.result) {
        onRecognized({
          ...data.result,
          coverUrl: data.result.coverUrl || capturedImage,
        });
        handleClose();
      } else {
        alert(data.error || 'Nepodařilo se rozpoznat knihu z fotky.');
      }
    } catch (err) {
      console.error('Analyze error:', err);
      alert('Chyba při komunikaci se serverem.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClose = () => {
    setCapturedImage(null);
    setCameraError(null);
    setIsAnalyzing(false);
    stopCamera();
    onClose();
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
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
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
                onClick={() => {
                  setCapturedImage(null);
                  startCamera();
                }}
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
                disabled={!stream}
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
