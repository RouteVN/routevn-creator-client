import { describe, expect, it, vi } from "vitest";
import {
  createClientUpdates,
  readClientUpdateContext,
} from "../../src/deps/clients/clientUpdates.js";
import { ROUTEVN_CREATOR_APP_STORE_URL } from "../../src/internal/routevnUrls.js";

const ios = {
  appId: "routevn-creator",
  currentVersion: "1.15.1",
  target: "ios",
  arch: "aarch64",
  distribution: "app-store",
  channel: "stable",
  deviceModel: "iPhone17,1",
  osVersion: "18.0",
};
const android = {
  ...ios,
  target: "android",
  distribution: "google-play",
  currentBuild: "9",
};
const release = () => ({
  version: "1.16.0",
  changelog: "Release notes",
  publishedAt: "2026-09-01T00:00:00Z",
  installation: { type: "appStore", url: ROUTEVN_CREATOR_APP_STORE_URL },
});
const response = (result) => ({
  status: 200,
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, result }),
});
const deviceId = "123456789ABC";
const keyValueStore = { get: async () => deviceId };
const setup = (result, context = ios) => {
  const request = vi.fn().mockResolvedValue(response(result));
  return {
    request,
    client: createClientUpdates({ context, request, keyValueStore }),
  };
};

describe("mobile update metadata protocol", () => {
  it("reads native context and tolerates older shells", async () => {
    const bridge = vi.fn().mockResolvedValue(android);
    expect(await readClientUpdateContext(bridge)).toEqual(android);
    expect(bridge).toHaveBeenCalledWith("getAppUpdateContext", {});
    bridge.mockRejectedValue(new Error("Unknown method"));
    expect(await readClientUpdateContext(bridge)).toBeUndefined();
    bridge.mockResolvedValue({ ...ios, currentVersion: "invalid" });
    expect(await readClientUpdateContext(bridge)).toBeUndefined();
  });

  it.each([
    { deviceModel: "" },
    { deviceModel: " " },
    { deviceModel: "x".repeat(257) },
    { deviceModel: "device\nname" },
    { osVersion: undefined },
    { osVersion: 18 },
  ])("rejects invalid native device metadata %j", async (patch) => {
    expect(
      await readClientUpdateContext(async () => ({ ...ios, ...patch })),
    ).toBeUndefined();
  });

  it("does not send a request before device identity is persisted", async () => {
    const request = vi.fn();
    const client = createClientUpdates({
      context: ios,
      request,
      keyValueStore: {
        get: async () => undefined,
        getOrSet: async () => {
          throw new Error("Disk full");
        },
      },
    });
    await expect(client.check()).rejects.toThrow("Disk full");
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { status: "noUpdate", reason: "upToDate" },
    { status: "noUpdate", reason: "noCompatibleRelease" },
    { status: "unsupportedClient" },
    { status: "updateAvailable", release: release() },
  ])("keeps the result decision $status distinct", async (result) => {
    const { client, request } = setup(result);
    expect(await client.check()).toEqual(result);
    expect(request).toHaveBeenCalledExactlyOnceWith({ deviceId });
  });

  it.each([
    null,
    { status: "noUpdate" },
    { status: "noUpdate", reason: "unknown" },
    { status: "noUpdate", reason: "upToDate", release: null },
    { status: "unsupportedClient", reason: "old" },
    { status: "unknown" },
  ])("rejects malformed or extended result %j", async (result) => {
    await expect(setup(result).client.check()).rejects.toThrow();
  });

  it.each([
    {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32602, message: "Invalid params" },
    },
    { jsonrpc: "2.0", id: 2, result: { status: "unsupportedClient" } },
    { id: 1, result: { status: "unsupportedClient" } },
    [{ jsonrpc: "2.0", id: 1, result: { status: "unsupportedClient" } }],
  ])(
    "does not convert malformed/error envelopes to no update",
    async (envelope) => {
      const { client, request } = setup();
      request.mockResolvedValue({
        status: 200,
        body: JSON.stringify(envelope),
      });
      await expect(client.check()).rejects.toThrow();
    },
  );

  it.each([
    { version: "1.15.1+same" },
    { version: "1.14.0" },
    { version: "1.16.0-beta.1" },
    { version: "invalid" },
    { changelog: "é".repeat(16385) },
    { publishedAt: "yesterday" },
    { installation: { type: "appStore", url: "https://example.com/app" } },
    {
      installation: {
        type: "appStore",
        url: ROUTEVN_CREATOR_APP_STORE_URL,
        signature: "unexpected",
      },
    },
    {
      installation: {
        type: "tauri",
        url: ROUTEVN_CREATOR_APP_STORE_URL,
        signature: "wrong-platform",
      },
    },
  ])("rejects invalid release fields %j", async (patch) => {
    await expect(
      setup({
        status: "updateAvailable",
        release: { ...release(), ...patch },
      }).client.check(),
    ).rejects.toThrow();
  });

  it("accepts Android build upgrades with unchanged marketing versions and exact Play matches", async () => {
    const next = release();
    next.version = android.currentVersion;
    next.installation = {
      type: "googlePlay",
      url: "https://play.google.com/store/apps/details?id=com.routevn.creator",
      build: "10",
    };
    const { client, request } = setup(
      { status: "updateAvailable", release: next },
      android,
    );
    expect(await client.check({ availableBuild: "10" })).toMatchObject({
      release: next,
    });
    expect(request).toHaveBeenCalledWith({ availableBuild: "10", deviceId });
    await expect(client.check({ availableBuild: "11" })).rejects.toThrow();
    for (const build of ["9", "01", "0", "2100000001", "10\n"]) {
      await expect(client.check({ availableBuild: build })).rejects.toThrow();
    }
  });

  it("never offers an installer to direct Android or an iOS simulator", async () => {
    const result = { status: "updateAvailable", release: release() };
    await expect(
      setup(result, { ...android, distribution: "direct" }).client.check(),
    ).rejects.toThrow();
    await expect(
      setup(result, { ...ios, arch: "x86_64" }).client.check(),
    ).rejects.toThrow();
  });

  it.each([429, 503])(
    "respects HTTP %s Retry-After even on manual retries",
    async (status) => {
      let now = 1000;
      const request = vi.fn().mockResolvedValue({ status, retryAfter: "60" });
      const client = createClientUpdates({
        context: ios,
        keyValueStore,
        request,
        now: () => now,
      });
      await expect(client.check()).rejects.toThrow();
      now = 60999;
      await expect(client.check()).rejects.toThrow(/deferred/);
      expect(request).toHaveBeenCalledTimes(1);
      now = 61000;
      request.mockResolvedValue(
        response({ status: "noUpdate", reason: "upToDate" }),
      );
      await expect(client.check()).resolves.toMatchObject({
        status: "noUpdate",
      });
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects invalid JSON and oversized response envelopes", async () => {
    const { client, request } = setup();
    for (const body of ["{", " ".repeat(65537)]) {
      request.mockResolvedValue({ status: 200, body });
      await expect(client.check()).rejects.toThrow();
    }
  });
});
