import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NO_BRIDGE_TIMEOUT,
  callAndroidBridge,
} from "../../src/deps/clients/android/bridge.js";

const originalWindow = globalThis.window;

const installBridge = (respond) => {
  const bridge = {
    postMessage: vi.fn((messageData) => {
      const request = JSON.parse(messageData);
      queueMicrotask(() => {
        bridge.onmessage({
          data: JSON.stringify(respond(request)),
        });
      });
    }),
  };
  globalThis.window = { RouteVNAndroid: bridge };
  return bridge;
};

afterEach(() => {
  globalThis.window = originalWindow;
  vi.restoreAllMocks();
});

describe("Android WebMessage bridge client", () => {
  it("uses the versioned asynchronous request and response protocol", async () => {
    const bridge = installBridge((request) => ({
      version: 1,
      id: request.id,
      ok: true,
      value: { stored: true },
    }));

    await expect(
      callAndroidBridge("ensureProjectStorage", { projectId: "project-1" }),
    ).resolves.toEqual({ stored: true });

    const request = JSON.parse(bridge.postMessage.mock.calls[0][0]);
    expect(request).toMatchObject({
      version: 1,
      method: "ensureProjectStorage",
      payload: { projectId: "project-1" },
    });
    expect(request.id).toEqual(expect.any(String));
  });

  it("rejects native errors without exposing a synchronous method surface", async () => {
    const bridge = installBridge((request) => ({
      version: 1,
      id: request.id,
      ok: false,
      error: {
        code: "IllegalArgumentException",
        message: "Unsupported Android bridge method.",
      },
    }));

    const error = await callAndroidBridge("notAllowed").catch(
      (caughtError) => caughtError,
    );

    expect(error.message).toBe("Unsupported Android bridge method.");
    expect(error.code).toBe("IllegalArgumentException");
    expect(Object.keys(bridge)).toEqual(["postMessage", "onmessage"]);
  });

  describe("response timeout", () => {
    const installSilentBridge = () => {
      const bridge = { postMessage: vi.fn() };
      globalThis.window = { RouteVNAndroid: bridge };
      return bridge;
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("rejects a call that gets no response within the default 30 minutes", async () => {
      installSilentBridge();

      const pending = callAndroidBridge("slowCall").catch((error) => error);
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

      expect((await pending).message).toBe(
        "Android bridge call timed out: slowCall",
      );
    });

    it("never times out a call that opts out, and still resolves it", async () => {
      const bridge = installSilentBridge();
      let settled = false;

      const pending = callAndroidBridge(
        "downloadImportFile",
        {},
        { timeoutMs: NO_BRIDGE_TIMEOUT },
      ).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
      expect(settled).toBe(false);

      const request = JSON.parse(bridge.postMessage.mock.calls[0][0]);
      bridge.onmessage({
        data: JSON.stringify({
          version: 1,
          id: request.id,
          ok: true,
          value: { id: "project-one" },
        }),
      });
      await expect(pending).resolves.toEqual({ id: "project-one" });
    });
  });
});
