import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  compareUpdateVersions,
  isUpdateVersion,
} from "../src/internal/updateVersion.js";

import {
  isDeviceId,
  isDeviceMetadataText,
} from "../src/deps/clients/deviceIdentity.js";

const tauriPath = "/system/updates/v1/routevn-creator/tauri";
const fields = [
  "appId",
  "currentVersion",
  "target",
  "arch",
  "distribution",
  "channel",
  "currentBuild",
  "availableBuild",
  "bundleType",
  "device",
];
const targets = [
  "windows",
  "linux",
  "darwin",
  "macos-universal",
  "android",
  "ios",
];
const architectures = ["x86_64", "i686", "aarch64", "armv7"];
const distributions = ["direct", "google-play", "app-store", "steam"];
const scenarios = [
  "available",
  "no-update",
  "no-compatible-release",
  "unavailable",
  "rate-limited",
];
const validBuild = (value) =>
  typeof value === "string" &&
  /^[1-9][0-9]{0,9}$/.test(value) &&
  Number(value) <= 2_100_000_000 &&
  String(Number(value)) === value;

// Metadata-only fixtures: the desktop URL/signature deliberately cannot install.
export const createMockReleases = () => {
  const common = {
    appId: "routevn-creator",
    channel: "stable",
    version: "1.16.0",
    changelog: "Improved editor performance.\nFixed project export failures.",
    publishedAt: "2026-09-18T08:00:00Z",
  };
  return [
    ...["windows", "linux", "darwin"].map((target) => ({
      ...common,
      target,
      arch: target === "darwin" ? "universal" : "x86_64",
      distribution: "direct",
      installation: {
        type: "tauri",
        url: "https://example.invalid/mock-update-not-an-installer",
        signature: "mock-signature-not-for-installation",
      },
    })),
    {
      ...common,
      target: "android",
      arch: "universal",
      distribution: "google-play",
      installation: {
        type: "googlePlay",
        url: "https://play.google.com/store/apps/details?id=com.routevn.creator",
        build: "10",
      },
    },
    {
      ...common,
      target: "ios",
      arch: "aarch64",
      distribution: "app-store",
      installation: {
        type: "appStore",
        url: "https://apps.apple.com/sg/app/id6810571721",
      },
    },
  ];
};

const validParams = (params, desktop) => {
  if (!params || typeof params !== "object" || Array.isArray(params))
    return false;
  if (Object.keys(params).some((key) => !fields.includes(key))) return false;
  if (
    !params.device ||
    typeof params.device !== "object" ||
    Array.isArray(params.device)
  )
    return false;
  if (
    Object.keys(params.device).length !== 3 ||
    ["id", "model", "osVersion"].some(
      (key) => !Object.hasOwn(params.device, key),
    ) ||
    Object.entries(params).some(
      ([key, value]) =>
        key !== "device" && (typeof value !== "string" || value.length === 0),
    )
  )
    return false;
  if (
    !isDeviceId(params.device.id) ||
    !isDeviceMetadataText(params.device.model) ||
    !isDeviceMetadataText(params.device.osVersion)
  )
    return false;
  if (desktop) {
    if (!/^[a-z0-9]{1,32}$/.test(params.bundleType ?? "")) return false;
  } else if (params.bundleType !== undefined) return false;
  if (!params.appId || !isUpdateVersion(params.currentVersion)) return false;
  if (!targets.includes(params.target) || !architectures.includes(params.arch))
    return false;
  if (!distributions.includes(params.distribution)) return false;
  if (
    params.channel !== undefined &&
    !["stable", "beta"].includes(params.channel)
  )
    return false;
  if (params.target === "android") {
    if (!validBuild(params.currentBuild)) return false;
    if (
      params.availableBuild !== undefined &&
      (params.distribution !== "google-play" ||
        !validBuild(params.availableBuild) ||
        Number(params.availableBuild) <= Number(params.currentBuild))
    )
      return false;
  } else if (
    params.currentBuild !== undefined ||
    params.availableBuild !== undefined
  )
    return false;
  return true;
};

const isSupported = ({ target, distribution, arch }) => {
  if (distribution === "steam") return false;
  if (target === "android") return distribution === "google-play";
  if (target === "ios")
    return distribution === "app-store" && arch === "aarch64";
  if (
    ["darwin", "macos-universal"].includes(target) &&
    !["aarch64", "x86_64"].includes(arch)
  )
    return false;
  return distribution === "direct";
};

export const selectMockUpdate = (params, releases, scenario = "available") => {
  if (!isSupported(params)) return { status: "unsupportedClient" };
  if (scenario === "no-update")
    return { status: "noUpdate", reason: "upToDate" };
  if (scenario === "no-compatible-release")
    return { status: "noUpdate", reason: "noCompatibleRelease" };
  const target = params.target === "macos-universal" ? "darwin" : params.target;
  const matching = releases.filter(
    (release) =>
      release.appId === params.appId &&
      release.target === target &&
      release.distribution === params.distribution &&
      release.channel === (params.channel ?? "stable") &&
      Date.parse(release.publishedAt) <= Date.now() &&
      (params.target === "macos-universal"
        ? release.arch === "universal"
        : release.arch === params.arch || release.arch === "universal") &&
      (params.availableBuild === undefined ||
        release.installation.build === params.availableBuild),
  );
  const eligible = matching.filter((release) =>
    params.target === "android"
      ? Number(release.installation.build) > Number(params.currentBuild)
      : compareUpdateVersions(release.version, params.currentVersion) > 0,
  );
  eligible.sort((a, b) => {
    const version =
      params.target === "android"
        ? Number(b.installation.build) - Number(a.installation.build)
        : compareUpdateVersions(b.version, a.version);
    return (
      version || Number(b.arch === params.arch) - Number(a.arch === params.arch)
    );
  });
  const release = eligible[0];
  if (!release)
    return {
      status: "noUpdate",
      reason: matching.length ? "upToDate" : "noCompatibleRelease",
    };
  return {
    status: "updateAvailable",
    release: {
      version: release.version.replace(/^v/, ""),
      changelog: release.changelog,
      publishedAt: release.publishedAt,
      installation: release.installation,
    },
  };
};

const readJson = async (request) => {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16 * 1024) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

export const createMockUpdateServer = ({
  scenario = "available",
  releases = createMockReleases(),
} = {}) => {
  if (!scenarios.includes(scenario)) throw new Error("Unknown mock scenario");
  if (
    !Array.isArray(releases) ||
    releases.some(
      (release) =>
        !isUpdateVersion(release.version) ||
        !Number.isFinite(Date.parse(release.publishedAt)) ||
        typeof release.changelog !== "string" ||
        !release.installation ||
        (release.channel === "stable" &&
          release.version.split("+")[0].includes("-")) ||
        (release.target === "android" &&
          !validBuild(release.installation.build)),
    )
  )
    throw new Error("Invalid mock release catalog");
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    // Development-only server. Native production RPC retains the API host's policy.
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Expose-Headers", "Retry-After");
    const send = (status, body) => {
      response.statusCode = status;
      if (body !== undefined)
        response.setHeader("Content-Type", "application/json");
      response.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const httpError = (status, code) => send(status, { error: { code } });
    if ((request.url ?? "").length > 2048)
      return httpError(414, "requestTooLong");
    const url = new URL(request.url, "http://localhost");
    const desktop = url.pathname === tauriPath;
    if (!desktop && url.pathname !== "/system/rpc")
      return httpError(404, "notFound");
    if (request.method === "OPTIONS") {
      response.setHeader(
        "Access-Control-Allow-Methods",
        desktop ? "GET" : "POST",
      );
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-RouteVN-RPC",
      );
      return send(204);
    }
    if (request.method !== (desktop ? "GET" : "POST")) {
      response.setHeader("Allow", desktop ? "GET, OPTIONS" : "POST, OPTIONS");
      return httpError(405, "methodNotAllowed");
    }
    if (["unavailable", "rate-limited"].includes(scenario)) {
      response.setHeader("Retry-After", "60");
      return httpError(
        scenario === "unavailable" ? 503 : 429,
        scenario === "unavailable" ? "updateServiceUnavailable" : "rateLimited",
      );
    }
    let params;
    let id;
    const rpcError = (code, message, data) => {
      const error = { code, message };
      if (data !== undefined) error.data = data;
      send(200, { jsonrpc: "2.0", id: id ?? null, error });
    };
    if (desktop) {
      if (/%(?![0-9a-f]{2})/i.test(url.search))
        return httpError(400, "invalidRequest");
      params = { appId: "routevn-creator", device: {} };
      for (const [key, value] of url.searchParams) {
        if (key.startsWith("device.")) {
          const field = key.slice("device.".length);
          if (Object.hasOwn(params.device, field))
            return httpError(400, "invalidRequest");
          params.device[field] = value;
        } else {
          if (Object.hasOwn(params, key))
            return httpError(400, "invalidRequest");
          params[key] = value;
        }
      }
    } else {
      if (
        request.headers["x-routevn-rpc"] !== "1" ||
        request.headers["content-type"]?.split(";")[0].trim() !==
          "application/json"
      )
        return httpError(400, "invalidRequest");
      let rpc;
      try {
        rpc = await readJson(request);
      } catch {
        return rpcError(-32700, "Parse error");
      }
      if (
        !rpc ||
        rpc.jsonrpc !== "2.0" ||
        !Object.hasOwn(rpc, "id") ||
        !["string", "number"].includes(typeof rpc.id)
      )
        return rpcError(-32600, "Invalid Request");
      id = rpc.id;
      if (rpc.method !== "system.getClientUpdate")
        return rpcError(-32601, "Method not found");
      params = rpc.params;
    }
    if (!validParams(params, desktop))
      return desktop
        ? httpError(400, "invalidRequest")
        : rpcError(-32602, "Invalid params");
    if (params.appId !== "routevn-creator")
      return rpcError(-32000, "RESOURCE_NOT_FOUND", {
        resourceType: "CLIENT_APP",
      });
    if (desktop && ["android", "ios"].includes(params.target))
      return httpError(422, "unsupportedClient");
    const result = selectMockUpdate(params, releases, scenario);
    if (!desktop) return send(200, { jsonrpc: "2.0", id, result });
    if (result.status === "unsupportedClient")
      return httpError(422, "unsupportedClient");
    if (result.status === "noUpdate") return send(204);
    const { release } = result;
    return send(200, {
      version: release.version,
      notes: release.changelog,
      pub_date: release.publishedAt,
      url: release.installation.url,
      signature: release.installation.signature,
    });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return server;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { values } = parseArgs({
    options: {
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "8787" },
      scenario: { type: "string", default: "available" },
      catalog: { type: "string" },
    },
  });
  const options = { scenario: values.scenario };
  if (values.catalog)
    options.releases = JSON.parse(await readFile(values.catalog, "utf8"));
  const server = createMockUpdateServer(options);
  server.listen(Number(values.port), values.host, () => {
    console.log(
      `Update mock listening on http://${values.host}:${server.address().port} (${values.scenario}).`,
    );
    console.log(
      "Built-in desktop releases are metadata-only: they cannot be installed.",
    );
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.close());
}
