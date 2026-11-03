import { describe, it, expect, vi, afterEach } from 'vitest';
import { toast, dismissToast, getToasts, subscribeToasts } from '@/lib/toast';

describe('toast store', () => {
  afterEach(() => {
    getToasts().forEach((t) => dismissToast(t.id));
    vi.useRealTimers();
  });

  it('notifies subscribers and expires toasts after their duration', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const unsubscribe = subscribeToasts((list) => seen.push(list.length));
    toast('Uloženo', { tone: 'success', duration: 1000 });
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(1001);
    expect(getToasts()).toHaveLength(0);
    expect(seen).toEqual([0, 1, 0]);
    unsubscribe();
  });

  it('keeps only the three newest toasts and gives undo toasts more time', () => {
    vi.useFakeTimers();
    ['a', 'b', 'c', 'd'].forEach((m) => toast(m));
    expect(getToasts().map((t) => t.message)).toEqual(['b', 'c', 'd']);
    const id = toast('Smazáno', { action: { label: 'Vrátit', onClick: () => {} } });
    expect(getToasts().find((t) => t.id === id)?.duration).toBe(6000);
  });
});
