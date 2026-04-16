import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCollabDebugEnabled } from "../../src/deps/services/web/collab/connectionRuntime.js";

const originalLocalStorage = globalThis.localStorage;

describe("collab connection runtime debug flag", () => {
  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
  });

  it("defaults to false without reading localStorage", () => {
    globalThis.localStorage = {
      getItem: vi.fn(() => "true"),
    };

    expect(resolveCollabDebugEnabled()).toBe(false);
    expect(globalThis.localStorage.getItem).not.toHaveBeenCalled();
  });

  it("respects the explicit enabled override", () => {
    expect(resolveCollabDebugEnabled({ enabled: true })).toBe(true);
    expect(resolveCollabDebugEnabled({ enabled: false })).toBe(false);
  });
});
