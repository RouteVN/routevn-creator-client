import { afterEach, describe, expect, it, vi } from "vitest";
import { createAutomaticUpdateChecks } from "../../src/deps/clients/automaticUpdateChecks.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shared automatic update strategy", () => {
  const setup = (shouldCheck) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
    let lastCheckTime = Date.now();
    const keyValueStore = {
      get: vi.fn(async () => lastCheckTime),
      set: vi.fn(async (_, value) => {
        lastCheckTime = value;
      }),
    };
    const checkForUpdates = vi.fn(async () => {});
    const start = createAutomaticUpdateChecks({
      checkForUpdates,
      keyValueStore,
      shouldCheck,
    });
    return { start, checkForUpdates, keyValueStore };
  };

  it("checks at startup, then polls every ten minutes with the existing two-hour threshold", async () => {
    const { start, checkForUpdates, keyValueStore } = setup();
    let copy = { title: "English" };
    start({ getCopy: () => copy });
    await vi.advanceTimersByTimeAsync(0);
    expect(checkForUpdates).toHaveBeenCalledWith(true, { copy });
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    copy = { title: "Japanese" };
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(checkForUpdates).toHaveBeenLastCalledWith(true, { copy });
    expect(checkForUpdates).toHaveBeenCalledTimes(2);
    expect(keyValueStore.set).toHaveBeenCalledWith("lastCheckTime", Date.now());
  });

  it("does not create duplicate timers or overlapping checks", async () => {
    const { start, checkForUpdates } = setup();
    let finish;
    checkForUpdates.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    start();
    start();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("does not count skipped background checks against the two-hour threshold", async () => {
    const shouldCheck = vi.fn(() => true);
    const { start, checkForUpdates, keyValueStore } = setup(shouldCheck);
    start();
    await vi.advanceTimersByTimeAsync(0);
    shouldCheck.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(130 * 60 * 1000);
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(keyValueStore.set).toHaveBeenCalledTimes(1);
    shouldCheck.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("records failed checks and retries later without an unhandled rejection", async () => {
    const { start, checkForUpdates, keyValueStore } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    checkForUpdates.mockRejectedValueOnce(new Error("Offline"));
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(keyValueStore.set).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(130 * 60 * 1000);
    expect(checkForUpdates).toHaveBeenCalledTimes(2);
  });
});
