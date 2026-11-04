import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { throttleLatest } from "./throttle";

describe("throttleLatest", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("passes the first value on at once and only the newest of a burst after the interval", () => {
    const seen: number[] = [];
    const throttled = throttleLatest<number>(
      value => seen.push(value),
      100,
      () => Date.now(),
    );
    throttled.push(1);
    throttled.push(2);
    throttled.push(3);
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(100);
    expect(seen).toEqual([1, 3]);
  });

  it("passes a value on at once when the interval has already passed", () => {
    const seen: number[] = [];
    const throttled = throttleLatest<number>(
      value => seen.push(value),
      100,
      () => Date.now(),
    );
    throttled.push(1);
    vi.advanceTimersByTime(150);
    throttled.push(2);
    expect(seen).toEqual([1, 2]);
  });

  it("drops a pending value when cancelled", () => {
    const seen: number[] = [];
    const throttled = throttleLatest<number>(
      value => seen.push(value),
      100,
      () => Date.now(),
    );
    throttled.push(1);
    throttled.push(2);
    throttled.cancel();
    vi.advanceTimersByTime(500);
    expect(seen).toEqual([1]);
  });
});
