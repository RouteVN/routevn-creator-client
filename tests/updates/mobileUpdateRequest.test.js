import { describe, expect, it, vi } from "vitest";
import {
  createMobileUpdateRequest,
  resolveMobileUpdateUrl,
} from "../../src/deps/clients/mobileUpdateRequest.js";

describe("mobile update HTTP capability", () => {
  it("keeps production on the configured HTTPS API", () => {
    expect(resolveMobileUpdateUrl()).toBe(
      "https://api1.routevn.com/system/rpc",
    );
    expect(
      resolveMobileUpdateUrl({
        debug: false,
        override: "http://127.0.0.1:8787/system/rpc",
      }),
    ).toBe("https://api1.routevn.com/system/rpc");
  });

  it("uses localhost by default and permits a LAN override in development", () => {
    expect(resolveMobileUpdateUrl({ debug: true })).toBe(
      "http://127.0.0.1:8787/system/rpc",
    );
    expect(
      resolveMobileUpdateUrl({
        debug: true,
        override: "http://dev-mac.local:8787/system/rpc",
      }),
    ).toBe("http://dev-mac.local:8787/system/rpc");
  });

  it.each([
    "file:///tmp/update.json",
    "http://user@dev-mac.local:8787/system/rpc",
    "http://dev-mac.local:8787/other",
    "http://dev-mac.local:8787/system/rpc?token=1",
    "http://example.com:8787/system/rpc",
    "https://staging.example.com/system/rpc",
  ])("rejects invalid development endpoints %s", (override) => {
    expect(() => resolveMobileUpdateUrl({ debug: true, override })).toThrow();
  });

  it("passes only transport data through the native bridge", async () => {
    const bridge = vi.fn().mockResolvedValue({ status: 200, body: "{}" });
    const request = createMobileUpdateRequest({ bridge, debug: true });
    const body = '{"jsonrpc":"2.0"}';

    await request(body);

    expect(bridge).toHaveBeenCalledExactlyOnceWith("httpRequest", {
      url: "http://127.0.0.1:8787/system/rpc",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RouteVN-RPC": "1",
      },
      body,
    });
  });

  it("defers invalid debug configuration until an update check", () => {
    const bridge = vi.fn();
    const request = createMobileUpdateRequest({
      bridge,
      debug: true,
      override: "file:///tmp/update.json",
    });

    expect(() => request("{}")).toThrow("Invalid client update endpoint.");
    expect(bridge).not.toHaveBeenCalled();
  });
});
