import { describe, expect, it, vi } from "vitest";
import {
  createMobileUpdateRequest,
  resolveMobileUpdateUrl,
} from "../../src/deps/clients/mobileUpdateRequest.js";

describe("mobile update HTTP capability", () => {
  it("keeps production on the configured HTTPS API", () => {
    expect(resolveMobileUpdateUrl()).toBe(
      "https://api1.routevn.com/system/updates/v1/routevn-creator/mobile",
    );
    expect(
      resolveMobileUpdateUrl({
        debug: false,
        override:
          "http://127.0.0.1:8787/system/updates/v1/routevn-creator/mobile",
      }),
    ).toBe("https://api1.routevn.com/system/updates/v1/routevn-creator/mobile");
  });

  it("uses localhost by default and permits a LAN override in development", () => {
    expect(resolveMobileUpdateUrl({ debug: true })).toBe(
      "http://127.0.0.1:8787/system/updates/v1/routevn-creator/mobile",
    );
    expect(
      resolveMobileUpdateUrl({
        debug: true,
        override:
          "http://dev-mac.local:8787/system/updates/v1/routevn-creator/mobile",
      }),
    ).toBe(
      "http://dev-mac.local:8787/system/updates/v1/routevn-creator/mobile",
    );
  });

  it.each([
    "file:///tmp/update.json",
    "http://user@dev-mac.local:8787/system/updates/v1/routevn-creator/mobile",
    "http://dev-mac.local:8787/other",
    "http://dev-mac.local:8787/system/updates/v1/routevn-creator/mobile?token=1",
    "http://example.com:8787/system/updates/v1/routevn-creator/mobile",
    "https://staging.example.com/system/updates/v1/routevn-creator/mobile",
    "http://fc.example.com:8787/system/updates/v1/routevn-creator/mobile",
    "http://fd.example.com:8787/system/updates/v1/routevn-creator/mobile",
  ])("rejects invalid development endpoints %s", (override) => {
    expect(() => resolveMobileUpdateUrl({ debug: true, override })).toThrow();
  });

  it("uses a bounded, cookie-free browser request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"jsonrpc":"2.0"}', {
        status: 200,
        headers: { "Retry-After": "60" },
      }),
    );
    const request = createMobileUpdateRequest({ fetchImpl, debug: true });
    const body = '{"jsonrpc":"2.0"}';

    const result = await request(body);

    expect(result).toEqual({
      status: 200,
      body: '{"jsonrpc":"2.0"}',
      retryAfter: "60",
    });
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      "http://127.0.0.1:8787/system/updates/v1/routevn-creator/mobile",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RouteVN-RPC": "1",
        },
        body,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("defers invalid debug configuration until an update check", async () => {
    const fetchImpl = vi.fn();
    const request = createMobileUpdateRequest({
      fetchImpl,
      debug: true,
      override: "file:///tmp/update.json",
    });

    await expect(request("{}")).rejects.toThrow(
      "Invalid client update endpoint.",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects oversized responses before parsing them", async () => {
    const request = createMobileUpdateRequest({
      debug: true,
      fetchImpl: vi.fn().mockResolvedValue(new Response("x".repeat(65537))),
    });

    await expect(request("{}")).rejects.toThrow("too large");
  });

  it("aborts a check that exceeds the request deadline", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_url, { signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () =>
              reject(new Error("Request aborted")),
            );
          }),
      );
      const request = createMobileUpdateRequest({ debug: true, fetchImpl });
      const rejected = expect(request("{}")).rejects.toThrow("Request aborted");

      await vi.advanceTimersByTimeAsync(10_000);

      await rejected;
      expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
