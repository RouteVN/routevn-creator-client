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
  it("delivers each event only to the subscriber of its staging folder", () => {
    const client = createClient();
    const first = vi.fn();
    const second = vi.fn();

    client.subscribe({ stagingId: "staging-one", onProgress: first });
    client.subscribe({ stagingId: "staging-two", onProgress: second });
    window[CALLBACK]({ stagingId: "staging-two", current: 3, total: 4 });
    window[CALLBACK]({ current: 1, total: 2 });

    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toEqual([[{ current: 3, total: 4 }]]);
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
});
