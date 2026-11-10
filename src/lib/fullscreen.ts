// Fullscreen across browsers. Safari before 16.4 only has the webkit-prefixed
// API, and Safari on iPhone has none at all for page elements (only <video>),
// so calling document.documentElement.requestFullscreen() there threw and the
// button did nothing.

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function fullscreenElement(): Element | null {
  const doc = document as WebkitDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function isFullscreenSupported(): boolean {
  const el = document.documentElement as WebkitElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

// Installed to the home screen (PWA): the app already fills the screen.
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function enterFullscreen(): Promise<void> {
  const el = document.documentElement as WebkitElement;
  if (el.requestFullscreen) await el.requestFullscreen();
  else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  else throw new Error('Fullscreen API not supported');
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as WebkitDocument;
  if (doc.exitFullscreen) await doc.exitFullscreen();
  else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
}

// Calls `listener` whenever fullscreen starts or ends, including Esc and the
// browser's own exit gesture. Returns the unsubscribe function.
export function onFullscreenChange(listener: () => void): () => void {
  document.addEventListener('fullscreenchange', listener);
  document.addEventListener('webkitfullscreenchange', listener);
  return () => {
    document.removeEventListener('fullscreenchange', listener);
    document.removeEventListener('webkitfullscreenchange', listener);
  };
}
