// Runs several catalogs against each other and answers with the first result
// good enough, instead of asking one after another. Kept free of fetch and
// book types so the timing rules can be tested on their own.

export interface RaceSource<T> {
  name: string;
  run: (signal: AbortSignal) => Promise<T[]>;
  // Answers are taken at once. Other sources' answers wait up to graceMs for
  // a preferred one that is still running.
  preferred: boolean;
  // Only started when the first wave is slow or empty.
  backup?: boolean;
}

export interface RaceOptions {
  hedgeMs: number; // start the backups after this long
  graceMs: number; // how long a non-preferred answer waits for a preferred one
  deadlineMs: number; // give up and answer with whatever is there
}

export function raceSources<T>(sources: RaceSource<T>[], { hedgeMs, graceMs, deadlineMs }: RaceOptions): Promise<T[]> {
  return new Promise((resolve) => {
    const abort = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const running = new Set<RaceSource<T>>();
    let waiting = sources.filter((s) => s.backup);
    let fallback: T[] | null = null;
    let graceStarted = false;
    let done = false;

    const finish = (results: T[]) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      abort.abort();
      resolve(results);
    };

    const start = (source: RaceSource<T>) => {
      running.add(source);
      source
        .run(abort.signal)
        .catch(() => [] as T[])
        .then((results) => {
          running.delete(source);
          if (done) return;
          if (results.length) {
            if (source.preferred) return finish(results);
            fallback = fallback ?? results;
          }
          step();
        });
    };

    const startBackups = () => {
      const batch = waiting;
      waiting = [];
      batch.forEach(start);
    };

    const step = () => {
      if (done) return;
      const preferredRunning = [...running].some((s) => s.preferred);
      if (fallback) {
        if (!preferredRunning) return finish(fallback);
        if (!graceStarted) {
          graceStarted = true;
          timers.push(setTimeout(() => finish(fallback ?? []), graceMs));
        }
        return;
      }
      if (running.size === 0) {
        if (waiting.length) startBackups();
        else finish([]);
      }
    };

    sources.filter((s) => !s.backup).forEach(start);
    timers.push(
      setTimeout(() => {
        if (!done && !fallback) startBackups();
      }, hedgeMs)
    );
    timers.push(setTimeout(() => finish(fallback ?? []), deadlineMs));
  });
}
