export interface Throttled<T> {
  /** Passes `value` on now, or, if the last pass was under `intervalMs` ago, keeps only the newest until the interval is up. */
  push(value: T): void;
  /** Drops a pending value without passing it on. */
  cancel(): void;
}

/** Limits how often `sink` runs while always passing on the newest value, which suits progress updates. */
export function throttleLatest<T>(
  sink: (value: T) => void,
  intervalMs: number,
  now: () => number = Date.now,
): Throttled<T> {
  let lastPassedAt = Number.NEGATIVE_INFINITY;
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const pass = (value: T) => {
    lastPassedAt = now();
    sink(value);
  };

  return {
    push(value) {
      const wait = lastPassedAt + intervalMs - now();
      if (wait <= 0 && timer === null) {
        pass(value);
        return;
      }
      pending = { value };
      timer ??= setTimeout(
        () => {
          timer = null;
          if (pending) {
            const { value: latest } = pending;
            pending = null;
            pass(latest);
          }
        },
        Math.max(wait, 0),
      );
    },
    cancel() {
      pending = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
