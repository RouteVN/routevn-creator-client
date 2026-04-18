import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDefaultApiBaseUrl } from "../../src/deps/services/apiService.js";

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

describe("apiService base URL resolution", () => {
  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  });

  it("ignores query param overrides on non-local hosts", () => {
    globalThis.localStorage = {
      getItem: vi.fn(() => "https://stored.example"),
      setItem: vi.fn(),
    };
    globalThis.window = {
      location: {
        hostname: "example.com",
        search: "?apiBaseUrl=https%3A%2F%2Fapi.example.com%2F",
      },
    };

    expect(resolveDefaultApiBaseUrl()).toBe("https://127.0.0.1:8787");
    expect(globalThis.localStorage.getItem).not.toHaveBeenCalled();
    expect(globalThis.localStorage.setItem).not.toHaveBeenCalled();
  });

  it("allows loopback query param overrides on local hosts", () => {
    globalThis.window = {
      location: {
        hostname: "localhost",
        search: "?apiBaseUrl=http%3A%2F%2Flocalhost%3A9999%2F",
      },
    };

    expect(resolveDefaultApiBaseUrl()).toBe("http://localhost:9999");
  });

  it("ignores non-loopback query param overrides on local hosts", () => {
    globalThis.window = {
      location: {
        hostname: "localhost",
        search: "?apiBaseUrl=https%3A%2F%2Fapi.example.com%2F",
      },
    };

    expect(resolveDefaultApiBaseUrl()).toBe("http://127.0.0.1:8787");
  });

  it("falls back to the host-based default", () => {
    globalThis.window = {
      location: {
        hostname: "localhost",
        search: "",
      },
    };

    expect(resolveDefaultApiBaseUrl()).toBe("http://127.0.0.1:8787");
  });
});
