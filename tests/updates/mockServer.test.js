import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  createClientUpdates,
  readClientUpdateContext,
} from "../../src/deps/clients/clientUpdates.js";
import { createMobileUpdateRequest } from "../../src/deps/clients/mobileUpdateRequest.js";
import {
  createMockUpdateServer,
  createMockReleases,
} from "../../scripts/mock-updates.js";

const metadata = {
  id: "123456789ABC",
  model: "Example device",
  osVersion: "18.0",
};
const desktopFetch = fetch;
const servers = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});
const start = async (options) => {
  const server = createMockUpdateServer(options);
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
};
const desktopParams = {
  currentVersion: "1.15.1",
  target: "windows",
  arch: "x86_64",
  distribution: "direct",
  channel: "stable",
  bundleType: "nsis",
  "device.id": metadata.id,
  "device.model": metadata.model,
  "device.osVersion": metadata.osVersion,
};
const desktopPath = (params = desktopParams) =>
  `/system/updates/v1/routevn-creator/tauri?${new URLSearchParams(params)}`;
const androidParams = {
  device: metadata,
  appId: "routevn-creator",
  currentVersion: "1.15.1",
  currentBuild: "9",
  availableBuild: "10",
  target: "android",
  arch: "aarch64",
  distribution: "google-play",
  channel: "stable",
};
const rpc = (origin, params) =>
  fetch(`${origin}/system/updates/v1/routevn-creator/mobile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-RouteVN-RPC": "1" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "system.getClientUpdate",
      params,
    }),
  });

describe("mock update protocol over HTTP", () => {
  it("allows credential-free mobile preflight from an opaque app origin", async () => {
    const origin = await start();
    const response = await fetch(
      `${origin}/system/updates/v1/routevn-creator/mobile`,
      {
        method: "OPTIONS",
        headers: {
          Origin: "null",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,x-routevn-rpc",
        },
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("access-control-expose-headers")).toBe(
      "Retry-After",
    );
  });

  it("accepts the shared JS request through browser fetch", async () => {
    const origin = await start();
    const bridge = vi.fn(async () => ({
      version: "1.15.1",
      arch: "aarch64",
      distribution: "google-play",
      build: "9",
      model: "Example device",
      osVersion: "18.0",
    }));
    const fetchImpl = vi.fn((...args) => fetch(...args));
    const context = await readClientUpdateContext(bridge, "android");
    const request = createMobileUpdateRequest({
      debug: true,
      override: `${origin}/system/updates/v1/routevn-creator/mobile`,
      fetchImpl,
    });
    const client = createClientUpdates({
      context,
      request,
      keyValueStore: { get: async () => "123456789ABC" },
    });

    const result = await client.check();

    expect(result.status).toBe("updateAvailable");
    expect(result.release.installation.build).toBe("10");
    expect(bridge).toHaveBeenCalledExactlyOnceWith(
      "getAppUpdateDeviceInfo",
      {},
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      `${origin}/system/updates/v1/routevn-creator/mobile`,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"method":"system.getClientUpdate"'),
      }),
    );
  });

  it("requires bounded device metadata on both transports", async () => {
    const origin = await start();
    for (const patch of [
      { device: undefined },
      { device: { ...metadata, id: "123456789ABC\n" } },
      { device: { ...metadata, id: "not-valid" } },
      { device: { ...metadata, model: "" } },
      { device: { ...metadata, model: "x".repeat(257) } },
      { device: { ...metadata, osVersion: undefined } },
      { device: { ...metadata, osVersion: "18\n0" } },
      { deviceId: metadata.id },
    ]) {
      const result = await (
        await rpc(origin, { ...androidParams, ...patch })
      ).json();
      expect(result.error.code).toBe(-32602);
    }
    expect(
      (await fetch(origin + desktopPath({ currentVersion: "1.15.1" }))).status,
    ).toBe(400);
    for (const params of [
      { ...desktopParams, "device.model": "" },
      { ...desktopParams, "device.osVersion": "18\n0" },
      { ...desktopParams, "device.id": "invalid" },
    ]) {
      expect((await fetch(origin + desktopPath(params))).status).toBe(400);
    }
    expect(
      (
        await fetch(
          origin +
            desktopPath({
              ...desktopParams,
              "device.model": "Device 模型 / 2",
            }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await desktopFetch(origin + desktopPath() + "&device.id=123456789ABC"))
        .status,
    ).toBe(400);
  });

  it("serves flat Tauri fields and a byte-empty 204 for equal/newer versions", async () => {
    const origin = await start();
    const response = await desktopFetch(origin + desktopPath());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const release = await response.json();
    expect(Object.keys(release).sort()).toEqual([
      "notes",
      "pub_date",
      "signature",
      "url",
      "version",
    ]);
    expect(release.version).toBe("1.16.0");
    for (const version of ["1.16.0", "1.17.0", "1.16.0+local.1"]) {
      const result = await desktopFetch(
        origin + desktopPath({ ...desktopParams, currentVersion: version }),
      );
      expect(result.status).toBe(204);
      expect(await result.text()).toBe("");
      expect(result.headers.has("content-type")).toBe(false);
    }
  });

  it.each(["x86_64", "aarch64"])(
    "maps the Mac custom target for %s",
    async (arch) => {
      const origin = await start();
      const result = await desktopFetch(
        origin +
          desktopPath({ ...desktopParams, target: "macos-universal", arch }),
      );
      expect(result.status).toBe(200);
      expect((await result.json()).version).toBe("1.16.0");
    },
  );

  it("selects the exact Play offer, ordering Android builds numerically", async () => {
    const releases = createMockReleases();
    releases.push({
      ...releases[3],
      version: "1.17.0",
      installation: { ...releases[3].installation, build: "100" },
    });
    const origin = await start({ releases });
    const exact = await (await rpc(origin, androidParams)).json();
    expect(exact.result.release.installation.build).toBe("10");
    expect(exact.result.release.installation).not.toHaveProperty("signature");
    const latestParams = { ...androidParams, currentBuild: "10" };
    delete latestParams.availableBuild;
    const latest = await (await rpc(origin, latestParams)).json();
    expect(latest.result.release.installation.build).toBe("100");
    const unknown = await (
      await rpc(origin, { ...androidParams, availableBuild: "11" })
    ).json();
    expect(unknown.result).toEqual({
      status: "noUpdate",
      reason: "noCompatibleRelease",
    });
  });

  it("returns iOS store metadata and never a direct installer to another distribution", async () => {
    const origin = await start();
    const ios = {
      device: metadata,
      appId: "routevn-creator",
      currentVersion: "1.15.1",
      target: "ios",
      arch: "aarch64",
      distribution: "app-store",
    };
    expect(
      (await (await rpc(origin, ios)).json()).result.release.installation,
    ).toEqual({
      type: "appStore",
      url: "https://apps.apple.com/sg/app/id6810571721",
    });
    const direct = { ...androidParams, distribution: "direct" };
    delete direct.availableBuild;
    expect((await (await rpc(origin, direct)).json()).result).toEqual({
      status: "unsupportedClient",
    });
    expect(
      (
        await desktopFetch(
          origin + desktopPath({ ...desktopParams, distribution: "steam" }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await desktopFetch(
          origin + desktopPath({ ...desktopParams, channel: "beta" }),
        )
      ).status,
    ).toBe(204);
  });

  it.each(["unavailable", "rate-limited"])(
    "keeps %s distinct from no-update with retry headers",
    async (scenario) => {
      const origin = await start({ scenario });
      for (const response of [
        await desktopFetch(origin + desktopPath()),
        await rpc(origin, androidParams),
      ]) {
        expect(response.status).toBe(scenario === "unavailable" ? 503 : 429);
        expect(response.headers.get("retry-after")).toBe("60");
        expect(await response.json()).toHaveProperty("error");
      }
    },
  );

  it("rejects duplicate/unknown/malformed selectors and invalid RPC params", async () => {
    const origin = await start();
    for (const suffix of [
      "&arch=x86_64",
      "&appId=other",
      "&extra=yes",
      "&bad=%zz",
    ]) {
      expect((await desktopFetch(origin + desktopPath() + suffix)).status).toBe(
        400,
      );
    }
    const response = await rpc(origin, {
      ...androidParams,
      currentBuild: "09",
    });
    expect((await response.json()).error.code).toBe(-32602);
    expect(
      (
        await desktopFetch(origin + "/system/rpc", {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(400);
    expect((await desktopFetch(origin + "/system/rpc")).status).toBe(405);
  });

  it("uses localhost for development and the API host for production", () => {
    const load = (name) =>
      JSON.parse(
        readFileSync(
          new URL(`../../src-tauri/${name}`, import.meta.url),
          "utf8",
        ),
      ).plugins.updater;
    const development = load("tauri.conf.json");
    const production = load("tauri.prod.conf.json");
    for (const config of [development, production]) {
      const url = new URL(config.endpoints[0]);
      expect(url.pathname).toBe("/system/updates/v1/routevn-creator/tauri");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        currentVersion: "{{current_version}}",
        target: "{{target}}",
        arch: "{{arch}}",
        distribution: "direct",
        channel: "stable",
        bundleType: "{{bundle_type}}",
      });
    }
    expect(new URL(development.endpoints[0]).hostname).toBe("127.0.0.1");
    expect(new URL(production.endpoints[0]).hostname).toBe("api1.routevn.com");
    expect(development.pubkey).not.toBe(production.pubkey);
    expect(production.dangerousInsecureTransportProtocol).toBe(false);
    expect(development.dangerousInsecureTransportProtocol).toBe(true);
    expect(load("tauri.steam.conf.json").endpoints).toEqual([]);
  });
});
