import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { raceSources, type RaceSource } from '@/lib/lookupRace';

const after = (ms: number, value: string[] | Error) => () =>
  new Promise<string[]>((resolve, reject) => setTimeout(() => (value instanceof Error ? reject(value) : resolve(value)), ms));
const src = (name: string, preferred: boolean, run: RaceSource<string>['run'], backup = false): RaceSource<string> => ({ name, preferred, run, backup });
const opts = { hedgeMs: 700, graceMs: 1500, deadlineMs: 9000 };

async function timed(sources: RaceSource<string>[]) {
  const start = Date.now();
  const p = raceSources(sources, opts).then((r) => ({ r, ms: Date.now() - start }));
  await vi.advanceTimersByTimeAsync(30000);
  return p;
}

describe('raceSources', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('takes a preferred answer at once and cancels the rest', async () => {
    let aborted = false;
    const slow = src('slow', false, (signal) => {
      signal.addEventListener('abort', () => (aborted = true));
      return new Promise(() => {});
    });
    expect(await timed([src('mzk', true, after(300, ['cz'])), slow])).toEqual({ r: ['cz'], ms: 300 });
    expect(aborted).toBe(true);
  });

  it('lets a foreign answer wait for the preferred one, but not for long', async () => {
    expect(await timed([src('mzk', true, after(800, ['cz'])), src('ol', false, after(200, ['en']))])).toEqual({ r: ['cz'], ms: 800 });
    expect(await timed([src('mzk', true, after(8000, ['cz'])), src('ol', false, after(200, ['en']))])).toEqual({ r: ['en'], ms: 1700 });
  });

  it('starts backups only when the first wave is slow or empty', async () => {
    const backup = vi.fn(after(100, ['backup']));
    await timed([src('mzk', true, after(300, ['cz'])), src('k', true, backup, true)]);
    expect(backup).not.toHaveBeenCalled();
    expect(await timed([src('mzk', true, after(200, [])), src('k', true, backup, true)])).toEqual({ r: ['backup'], ms: 300 });
    expect(await timed([src('mzk', true, after(5000, ['cz'])), src('k', true, backup, true)])).toEqual({ r: ['backup'], ms: 800 });
  });

  it('survives failures, empty answers and the deadline', async () => {
    expect((await timed([src('a', true, after(100, new Error('x'))), src('b', false, after(100, []))])).r).toEqual([]);
    expect(await timed([src('never', true, () => new Promise(() => {}))])).toEqual({ r: [], ms: 9000 });
  });
});
