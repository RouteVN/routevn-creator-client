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
  device: { model: "iPhone17,1", osVersion: "18.0" },
};
const android = {
  ...ios,
  target: "android",
  distribution: "google-play",
  currentBuild: "9",
};
const iosInfo = {
  version: "1.15.1",
  arch: "aarch64",
  model: "iPhone17,1",
  osVersion: "18.0",
};
const androidInfo = {
  ...iosInfo,
  distribution: "google-play",
  build: "9",
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
const deviceId = "123456789ABC123456789ABC";
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
    const bridge = vi.fn().mockResolvedValue(androidInfo);
    expect(await readClientUpdateContext(bridge, "android")).toEqual(android);
    expect(bridge).toHaveBeenCalledWith("getAppUpdateDeviceInfo", {});
    bridge.mockResolvedValue(iosInfo);
    expect(await readClientUpdateContext(bridge, "ios")).toEqual(ios);
    bridge.mockRejectedValue(new Error("Unknown method"));
    expect(await readClientUpdateContext(bridge, "ios")).toBeUndefined();
    bridge.mockResolvedValue({ ...iosInfo, version: "invalid" });
    expect(await readClientUpdateContext(bridge, "ios")).toBeUndefined();
  });

  it.each([
    { patch: { model: "" }, field: "model" },
    { patch: { model: " " }, field: "model" },
    { patch: { model: "x".repeat(257) }, field: "model" },
    { patch: { model: "device\nname" }, field: "model" },
    { patch: { osVersion: undefined }, field: "osVersion" },
    { patch: { osVersion: 18 }, field: "osVersion" },
  ])(
    "normalizes unavailable native device metadata %j",
    async ({ patch, field }) => {
      const context = await readClientUpdateContext(
        async () => ({ ...iosInfo, ...patch }),
        "ios",
      );
      expect(context?.device).toEqual({
        model: field === "model" ? "unknown" : iosInfo.model,
        osVersion: field === "osVersion" ? "unknown" : iosInfo.osVersion,
      });
    },
  );

  it("rejects app fields in native device facts", async () => {
    expect(
      await readClientUpdateContext(
        async () => ({
          ...iosInfo,
          appId: "routevn-creator",
        }),
        "ios",
      ),
    ).toBeUndefined();
    expect(
      await readClientUpdateContext(
        async () => ({
          ...iosInfo,
          target: "ios",
        }),
        "ios",
      ),
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
    expect(JSON.parse(request.mock.calls[0][0])).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "system.getClientUpdate",
      params: {
        ...ios,
        device: { ...ios.device, id: deviceId },
      },
    });
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

  it.each([
    "http://apps.apple.com/app/id6810571721",
    "https://",
    "https://user@apps.apple.com/app/id6810571721",
    "https://user:pass@apps.apple.com/app/id6810571721",
    "https://apps.apple.com/app/has space",
    "https://apps.apple.com/app/line\nbreak",
    "https://apps.apple.com/app/é",
    "https://apps.apple.com/app/\x7f",
    `https://apps.apple.com/${"a".repeat(2049)}`,
  ])("rejects invalid installation URLs %j", async (url) => {
    const iosRelease = release();
    iosRelease.installation.url = url;
    await expect(
      setup({ status: "updateAvailable", release: iosRelease }).client.check(),
    ).rejects.toThrow();

    const androidRelease = release();
    androidRelease.installation = { type: "googlePlay", url, build: "10" };
    await expect(
      setup(
        { status: "updateAvailable", release: androidRelease },
        android,
      ).client.check(),
    ).rejects.toThrow();
  });

  it("accepts changed HTTPS store URLs within the API length limit", async () => {
    const next = release();
    next.installation.url = `https://apps.apple.com/${"a".repeat(2048 - "https://apps.apple.com/".length)}`;
    await expect(
      setup({ status: "updateAvailable", release: next }).client.check(),
    ).resolves.toMatchObject({ release: next });
  });

  it("accepts Android build upgrades with unchanged marketing versions and changed Play URLs", async () => {
    const next = release();
    next.version = android.currentVersion;
    next.installation = {
      type: "googlePlay",
      url: "https://play.google.com/store/apps/details?id=com.routevn.creator&hl=en",
      build: "10",
    };
    const { client, request } = setup(
      { status: "updateAvailable", release: next },
      android,
    );
    expect(await client.check()).toMatchObject({
      release: next,
    });
    expect(JSON.parse(request.mock.calls[0][0])).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "system.getClientUpdate",
      params: {
        ...android,
        device: { ...android.device, id: deviceId },
      },
    });
    for (const build of ["9", "01", "0", "2100000001", "10\n"]) {
      next.installation.build = build;
      const invalid = setup(
        { status: "updateAvailable", release: next },
        android,
      );
      await expect(invalid.client.check()).rejects.toThrow();
    }
  });

  it.each([
    "https://example.com/update",
    "https://play.google.com/store/apps/details?id=com.example.other",
    "https://play.google.com/store/apps/details?id=com.routevn.creator&id=com.example.other",
    "https://play.google.com/store/apps/other?id=com.routevn.creator",
  ])(
    "rejects a Google Play action for the wrong destination %s",
    async (url) => {
      const next = release();
      next.installation = { type: "googlePlay", url, build: "10" };
      await expect(
        setup(
          { status: "updateAvailable", release: next },
          android,
        ).client.check(),
      ).rejects.toThrow();
    },
  );

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
