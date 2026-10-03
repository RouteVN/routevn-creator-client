import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectImportProgressClient } from "../../src/deps/clients/projectImportProgress.js";

const CALLBACK = "__routeVNTestProjectImportProgress";

beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("project import progress client", () => {
  it("delivers native events to a subscriber", () => {
    const client = createProjectImportProgressClient({
      callbackName: CALLBACK,
    });
    const onProgress = vi.fn();

    client.subscribe({ onProgress });
    window[CALLBACK]({
      projectId: "project-one",
      stage: "downloading",
      current: 5,
      total: 10,
    });

    expect(onProgress).toHaveBeenCalledWith({
      stage: "downloading",
      current: 5,
      total: 10,
    });
  });

  it("only delivers events for the subscribed project id", () => {
    const client = createProjectImportProgressClient({
      callbackName: CALLBACK,
    });
    const onProgress = vi.fn();

    client.subscribe({ projectId: "project-one", onProgress });
    window[CALLBACK]({
      projectId: "project-two",
      stage: "extracting",
      current: 1,
      total: 2,
    });
    window[CALLBACK]({
      projectId: "project-one",
      stage: "extracting",
      current: 2,
      total: 2,
    });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      stage: "extracting",
      current: 2,
      total: 2,
    });
  });

  it("accepts events without a project id when none is required", () => {
    const client = createProjectImportProgressClient({
      callbackName: CALLBACK,
    });
    const onProgress = vi.fn();

    client.subscribe({ onProgress });
    window[CALLBACK]({ stage: "finishing", current: 0, total: 0 });

    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after unsubscribe", () => {
    const client = createProjectImportProgressClient({
      callbackName: CALLBACK,
    });
    const onProgress = vi.fn();

    const unsubscribe = client.subscribe({ onProgress });
    unsubscribe();
    window[CALLBACK]({ stage: "downloading", current: 1, total: 2 });

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("keeps delivering to other subscribers when one throws", () => {
    const client = createProjectImportProgressClient({
      callbackName: CALLBACK,
    });
    const failing = vi.fn(() => {
      throw new Error("view failed");
    });
    const healthy = vi.fn();

    client.subscribe({ onProgress: failing });
    client.subscribe({ onProgress: healthy });

    expect(() =>
      window[CALLBACK]({ stage: "downloading", current: 1, total: 2 }),
    ).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it("does not install the callback without a listener", () => {
    const client = createProjectImportProgressClient({
      callbackName: CALLBACK,
    });

    const unsubscribe = client.subscribe({});

    expect(window[CALLBACK]).toBeUndefined();
    expect(() => unsubscribe()).not.toThrow();
  });
});
