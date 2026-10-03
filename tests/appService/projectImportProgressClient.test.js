import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectImportProgressClient } from "../../src/deps/clients/projectImportProgress.js";

const CALLBACK = "__routeVNTestProjectImportProgress";

const createClient = () =>
  createProjectImportProgressClient({ callbackName: CALLBACK });

beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("project import progress client", () => {
  it("delivers the events of its own staging folder", () => {
    const onProgress = vi.fn();

    createClient().subscribe({ stagingId: "staging-one", onProgress });
    window[CALLBACK]({ stagingId: "staging-one", current: 5, total: 10 });

    expect(onProgress).toHaveBeenCalledWith({ current: 5, total: 10 });
  });

  it("ignores the events of another staging folder", () => {
    const onProgress = vi.fn();

    createClient().subscribe({ stagingId: "staging-one", onProgress });
    window[CALLBACK]({ stagingId: "staging-two", current: 1, total: 2 });
    window[CALLBACK]({ current: 1, total: 2 });

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("serves several subscribers at once, each with its own events", () => {
    const client = createClient();
    const first = vi.fn();
    const second = vi.fn();

    client.subscribe({ stagingId: "staging-one", onProgress: first });
    client.subscribe({ stagingId: "staging-two", onProgress: second });
    window[CALLBACK]({ stagingId: "staging-two", current: 3, total: 4 });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ current: 3, total: 4 });
  });

  it("stops delivering after unsubscribe", () => {
    const onProgress = vi.fn();

    const unsubscribe = createClient().subscribe({
      stagingId: "staging-one",
      onProgress,
    });
    unsubscribe();
    window[CALLBACK]({ stagingId: "staging-one", current: 1, total: 2 });

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("keeps delivering to other subscribers when one throws", () => {
    const client = createClient();
    const failing = vi.fn(() => {
      throw new Error("view failed");
    });
    const healthy = vi.fn();

    client.subscribe({ stagingId: "staging-one", onProgress: failing });
    client.subscribe({ stagingId: "staging-one", onProgress: healthy });

    expect(() =>
      window[CALLBACK]({ stagingId: "staging-one", current: 1, total: 2 }),
    ).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it("does not install the callback without a listener", () => {
    const unsubscribe = createClient().subscribe({});

    expect(window[CALLBACK]).toBeUndefined();
    expect(() => unsubscribe()).not.toThrow();
  });
});
