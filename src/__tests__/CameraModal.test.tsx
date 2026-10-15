import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CameraModal } from '@/components/CameraModal';
import * as scanner from '@/lib/scanner';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Camera: () => <div data-testid="camera-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  X: () => <div data-testid="x-icon" />,
  Check: () => <div data-testid="check-icon" />,
  Sparkles: () => <div data-testid="sparkles-icon" />,
}));

// Mock scanner module
vi.mock('@/lib/scanner', async (importOriginal) => {
  const actual = await importOriginal<typeof scanner>();
  return {
    ...actual,
    processImageOrQuery: vi.fn().mockResolvedValue({
      result: {
        title: 'Mocked Book',
        author: 'Mock Author',
        coverUrl: 'http://example.com/cover.jpg',
      },
    }),
  };
});

// Helper mock MediaStream Track
class MockMediaStreamTrack {
  kind = 'video';
  stop = vi.fn();
}

// Helper mock MediaStream
class MockMediaStream {
  tracks: MockMediaStreamTrack[];
  constructor() {
    this.tracks = [new MockMediaStreamTrack()];
  }
  getTracks() {
    return this.tracks;
  }
}

describe('CameraModal Component Lifecycle & Regression Tests', () => {
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    getUserMediaMock = vi.fn().mockImplementation(async () => new MockMediaStream());

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    });

    // Mock HTMLMediaElement play and readyState
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      writable: true,
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      writable: true,
      configurable: true,
      value: 4, // HAVE_ENOUGH_DATA
    });

    // Mock HTMLCanvasElement getContext & toDataURL
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
      }),
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue('data:image/jpeg;base64,mockdata'),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Opening the modal starts a camera session without restart loops', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    });

    // Expect single getUserMedia call, no endless loop
    expect(getUserMediaMock).toHaveBeenCalledWith({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  });

  it('2. Updating stream state does not create a camera restart loop', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    const { rerender } = render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    });

    // Rerender with same props to simulate component updates
    await act(async () => {
      rerender(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);
    });

    // Wait short time to ensure no extra getUserMedia calls were queued
    await new Promise((r) => setTimeout(r, 50));

    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
  });

  it('3. Retaking a photograph does not call getUserMedia twice due to duplicate startup logic', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    });

    // Simulate video loadedmetadata event so capture is enabled
    const video = document.querySelector('video');
    if (video) {
      await act(async () => {
        fireEvent(video, new Event('loadedmetadata'));
      });
    }

    // Capture photo
    await waitFor(() => {
      const captureBtn = screen.getByTestId('camera-icon').parentElement as HTMLButtonElement;
      expect(captureBtn).not.toBeDisabled();
      fireEvent.click(captureBtn);
    });

    // Check Retake ("Znova") button is visible
    const retakeBtn = await screen.findByText('Znova');
    expect(retakeBtn).toBeInTheDocument();

    const initialCalls = getUserMediaMock.mock.calls.length;

    // Click Retake
    await act(async () => {
      fireEvent.click(retakeBtn);
    });

    await waitFor(() => {
      // getUserMedia should be called exactly once more (for the retake stream restart), NOT twice!
      expect(getUserMediaMock).toHaveBeenCalledTimes(initialCalls + 1);
    });
  });

  it('4. The video element receives the stream after it is mounted', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    await waitFor(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      expect(video).not.toBeNull();
      expect(video.srcObject).toBeInstanceOf(MockMediaStream);
    });
  });

  it('5. Capture is disabled until the video element is ready', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    });

    const video = document.querySelector('video');
    expect(video).not.toBeNull();

    const captureBtn = screen.getByTestId('camera-icon').parentElement as HTMLButtonElement;

    // Trigger loadedmetadata event on video inside act
    await act(async () => {
      fireEvent(video!, new Event('loadedmetadata'));
    });

    await waitFor(() => {
      expect(captureBtn).not.toBeDisabled();
    });
  });

  it('6. Closing the modal stops all active tracks', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    let createdStream: MockMediaStream | null = null;
    getUserMediaMock.mockImplementation(async () => {
      createdStream = new MockMediaStream();
      return createdStream;
    });

    const { rerender } = render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    await waitFor(() => {
      expect(createdStream).not.toBeNull();
    });

    const track = createdStream!.getTracks()[0];

    // Close modal by setting isOpen = false
    await act(async () => {
      rerender(<CameraModal isOpen={false} onClose={handleClose} onRecognized={handleRecognized} />);
    });

    expect(track.stop).toHaveBeenCalled();
  });

  it('7. Closing while a camera request is pending does not leave an orphaned stream', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    let resolveStreamPromise: (stream: MockMediaStream) => void;
    const streamPromise = new Promise<MockMediaStream>((resolve) => {
      resolveStreamPromise = resolve;
    });

    getUserMediaMock.mockReturnValue(streamPromise);

    const { rerender } = render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    // Immediately close modal before getUserMedia resolves
    await act(async () => {
      rerender(<CameraModal isOpen={false} onClose={handleClose} onRecognized={handleRecognized} />);
    });

    const lateStream = new MockMediaStream();
    const track = lateStream.getTracks()[0];

    // Late resolution of getUserMedia
    await act(async () => {
      resolveStreamPromise!(lateStream);
    });

    // Track should have been immediately stopped upon resolution because session ID changed
    expect(track.stop).toHaveBeenCalled();
  });

  it('8. Reopening the modal creates a fresh session correctly', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    const { rerender } = render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    });

    // Close modal
    await act(async () => {
      rerender(<CameraModal isOpen={false} onClose={handleClose} onRecognized={handleRecognized} />);
    });

    // Reopen modal
    await act(async () => {
      rerender(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);
    });

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(2);
    });
  });

  it('9. Permission denial produces a useful error message', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    const permError = new Error('Permission denied');
    permError.name = 'NotAllowedError';
    getUserMediaMock.mockRejectedValue(permError);

    render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    await waitFor(() => {
      expect(
        screen.getByText('Přístup ke kameře byl odepřen. Můžete vybrat fotografii ze souborů.')
      ).toBeInTheDocument();
    });
  });

  it('10. Client image upload & OCR pipeline works cleanly', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    });

    // Upload image file
    const file = new File(['dummy content'], 'test.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    // Analyze button should appear
    await waitFor(() => {
      expect(screen.getByText('Vyhodnotit')).toBeInTheDocument();
    });

    // Click Analyze button
    const analyzeBtn = screen.getByText('Vyhodnotit');
    await act(async () => {
      fireEvent.click(analyzeBtn);
    });

    await waitFor(() => {
      expect(handleRecognized).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Mocked Book',
          author: 'Mock Author',
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('11. Displays cameraError overlay when video.play() fails during streaming', async () => {
    const handleClose = vi.fn();
    const handleRecognized = vi.fn();

    // Mock play to reject
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      writable: true,
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('Autoplay prevented')),
    });

    render(<CameraModal isOpen={true} onClose={handleClose} onRecognized={handleRecognized} />);

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    });

    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();

    await act(async () => {
      fireEvent(video, new Event('loadedmetadata'));
    });

    await waitFor(() => {
      expect(screen.getByText('Chyba při přehrávání videa z kamery.')).toBeInTheDocument();
    });
  });
});
