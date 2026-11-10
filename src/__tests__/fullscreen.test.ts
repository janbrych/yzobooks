import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enterFullscreen,
  exitFullscreen,
  fullscreenElement,
  isFullscreenSupported,
  onFullscreenChange,
} from '@/lib/fullscreen';

type Loose = Record<string, unknown>;
const el = document.documentElement as unknown as Loose;
const doc = document as unknown as Loose;

afterEach(() => {
  for (const k of ['requestFullscreen', 'webkitRequestFullscreen']) delete el[k];
  for (const k of ['exitFullscreen', 'webkitExitFullscreen', 'webkitFullscreenElement']) delete doc[k];
});

describe('fullscreen helpers', () => {
  it('reports no support when the page has no fullscreen API (Safari on iPhone)', async () => {
    el.requestFullscreen = undefined;
    expect(isFullscreenSupported()).toBe(false);
    await expect(enterFullscreen()).rejects.toThrow();
  });

  it('uses the standard API when present', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    el.requestFullscreen = request;
    expect(isFullscreenSupported()).toBe(true);
    await enterFullscreen();
    expect(request).toHaveBeenCalled();
  });

  it('falls back to the webkit-prefixed API (older Safari, iPad)', async () => {
    el.requestFullscreen = undefined;
    const request = vi.fn();
    el.webkitRequestFullscreen = request;
    const exit = vi.fn();
    doc.exitFullscreen = undefined;
    doc.webkitExitFullscreen = exit;
    doc.webkitFullscreenElement = document.body;

    expect(isFullscreenSupported()).toBe(true);
    expect(fullscreenElement()).toBe(document.body);
    await enterFullscreen();
    await exitFullscreen();
    expect(request).toHaveBeenCalled();
    expect(exit).toHaveBeenCalled();
  });

  it('notifies on both standard and webkit change events until unsubscribed', () => {
    const listener = vi.fn();
    const off = onFullscreenChange(listener);
    document.dispatchEvent(new Event('fullscreenchange'));
    document.dispatchEvent(new Event('webkitfullscreenchange'));
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
