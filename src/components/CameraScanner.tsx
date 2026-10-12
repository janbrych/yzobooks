'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, X, Upload, Search, RefreshCw, AlertCircle, Sparkles, Check } from 'lucide-react';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { identifyBook } from '@/lib/bookIdentification';
import { BookIdentificationResult } from '@/types';

interface CameraScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onIdentified: (result: BookIdentificationResult) => void;
}

export default function CameraScanner({ isOpen, onClose, onIdentified }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeMode, setActiveMode] = useState<'camera' | 'upload' | 'search'>('camera');
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualIsbn, setManualIsbn] = useState('');
  const [searching, setSearching] = useState(false);

  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // Initialize ZXing barcode reader with hints
  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.CODE_128,
    ]);
    codeReaderRef.current = new BrowserMultiFormatReader(hints);

    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
    };
  }, []);

  const stopCameraStream = useCallback(() => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleIdentificationPipeline = async (params: { isbn?: string; imageData?: string; query?: string }) => {
    setProcessing(true);
    setProcessingStep('Scanning ISBN & Barcode...');

    try {
      if (params.isbn) {
        setProcessingStep('Found ISBN. Retrieving metadata...');
      } else if (params.imageData) {
        setProcessingStep('Analyzing cover with AI Vision...');
      } else {
        setProcessingStep('Searching book databases...');
      }

      const result = await identifyBook(params);

      setProcessingStep('Validating metadata & confidence...');
      await new Promise((resolve) => setTimeout(resolve, 300));

      stopCameraStream();
      onIdentified(result);
    } catch (err) {
      console.error('Identification failed:', err);
      setCameraError('Could not identify book. Try another photo or search manually.');
    } finally {
      setProcessing(false);
    }
  };

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera API is not supported in this browser environment.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // Start scanning barcode loop
        if (codeReaderRef.current) {
          codeReaderRef.current.decodeFromVideoDevice(
            null,
            videoRef.current,
            async (result, err) => {
              if (result && !processing) {
                const detectedText = result.getText();
                if (/^\d{10,13}$/.test(detectedText)) {
                  await handleIdentificationPipeline({ isbn: detectedText });
                }
              }
            }
          );
        }
      }
    } catch (err: unknown) {
      console.error('Camera stream error:', err);
      setCameraError('Camera access denied or unavailable. You can upload a photo or search manually.');
    }
  }, [processing]);

  useEffect(() => {
    if (isOpen && activeMode === 'camera') {
      startCamera();
    } else {
      stopCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [isOpen, activeMode, startCamera, stopCameraStream]);

  if (!isOpen) return null;

  // Capture current video frame for photo submission
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL('image/jpeg', 0.85);
    await handleIdentificationPipeline({ imageData });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageData = event.target?.result as string;
      await handleIdentificationPipeline({ imageData });
    };
    reader.readAsDataURL(file);
  };

  const handleManualSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery && !manualIsbn) return;
    setSearching(true);
    await handleIdentificationPipeline({ isbn: manualIsbn || undefined, query: searchQuery || undefined });
    setSearching(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white safe-padding-top safe-padding-bottom animate-fade-in">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 backdrop-blur border-b border-slate-800">
        <span className="text-sm font-semibold tracking-wide flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          Add Book to Library
        </span>
        <button
          onClick={() => {
            stopCameraStream();
            onClose();
          }}
          className="p-2 rounded-full hover:bg-slate-800 active:scale-95 transition"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-center p-2 bg-slate-900 border-b border-slate-800/80 gap-2">
        <button
          onClick={() => setActiveMode('camera')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
            activeMode === 'camera'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'text-slate-400 hover:text-white bg-slate-800/50'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          Camera
        </button>
        <button
          onClick={() => setActiveMode('upload')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
            activeMode === 'upload'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'text-slate-400 hover:text-white bg-slate-800/50'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Cover
        </button>
        <button
          onClick={() => setActiveMode('search')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
            activeMode === 'search'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'text-slate-400 hover:text-white bg-slate-800/50'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          Manual Search
        </button>
      </div>

      {/* Mode Views */}
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden bg-black">
        {/* Processing Loading Overlay */}
        {processing && (
          <div className="absolute inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <Sparkles className="w-6 h-6 text-blue-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-white">{processingStep}</p>
              <p className="text-xs text-slate-400">Combining AI Vision & Global Book Databases</p>
            </div>
          </div>
        )}

        {/* 1. CAMERA VIEW */}
        {activeMode === 'camera' && (
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            {cameraError ? (
              <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm space-y-3">
                <AlertCircle className="w-12 h-12 text-amber-400" />
                <p className="text-sm font-medium text-slate-200">{cameraError}</p>
                <div className="flex gap-2">
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-xl flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Camera
                  </button>
                  <button
                    onClick={() => setActiveMode('upload')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-medium rounded-xl"
                  >
                    Upload Photo
                  </button>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Viewfinder Frame Guide Overlay */}
                <div className="absolute inset-0 border-2 border-dashed border-white/30 m-8 rounded-3xl pointer-events-none flex flex-col items-center justify-between p-4">
                  <div className="bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 text-[11px] text-slate-300">
                    Align book cover or barcode in frame
                  </div>
                  <div className="w-12 h-0.5 bg-blue-500/80 rounded-full animate-pulse" />
                </div>

                {/* Shutter Button */}
                <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center">
                  <button
                    onClick={capturePhoto}
                    disabled={processing}
                    className="w-18 h-18 rounded-full border-4 border-white bg-blue-600 hover:bg-blue-500 active:scale-95 transition flex items-center justify-center shadow-xl"
                  >
                    <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                      <Camera className="w-7 h-7 text-white" />
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 2. UPLOAD VIEW */}
        {activeMode === 'upload' && (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 text-blue-400 flex items-center justify-center border border-slate-700">
              <Upload className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Upload Book Photo</h3>
              <p className="text-xs text-slate-400">
                Select a photo of the book cover or ISBN barcode from your device gallery.
              </p>
            </div>
            <label className="cursor-pointer px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <span>Choose Image</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* 3. MANUAL SEARCH VIEW */}
        {activeMode === 'search' && (
          <div className="w-full max-w-sm p-6 space-y-5">
            <div className="text-center space-y-1">
              <h3 className="text-base font-semibold">Search Book</h3>
              <p className="text-xs text-slate-400">
                Enter title, author name, or ISBN number manually.
              </p>
            </div>

            <form onSubmit={handleManualSearchSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Book Title or Author</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Dune or Frank Herbert"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">ISBN Number (Optional)</label>
                <input
                  type="text"
                  value={manualIsbn}
                  onChange={(e) => setManualIsbn(e.target.value)}
                  placeholder="e.g. 9780441172719"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={searching || (!searchQuery && !manualIsbn)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 active:scale-95 transition flex items-center justify-center gap-2"
              >
                {searching ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Search Library Database</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
