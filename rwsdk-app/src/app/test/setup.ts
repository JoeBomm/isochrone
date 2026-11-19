import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Vitest globals are off, so Testing Library cannot register cleanup itself.
afterEach(() => {
  cleanup();
});

// Testing Library's async act wrapper waits on a setTimeout(0) and only
// advances it itself when it detects *Jest* fake timers (a global `jest` plus
// a faked setTimeout). Without this shim every user-event call hangs under
// vi.useFakeTimers(). Vitest's faked setTimeout carries the `clock` property
// Testing Library checks for, so exposing advanceTimersByTime is enough.
(globalThis as { jest?: unknown }).jest = {
  advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
};
