import {
  compareUpdateVersions,
  isUpdateVersion,
} from "../../internal/updateVersion.js";
import { getDeviceId, isDeviceMetadataText } from "./deviceIdentity.js";

const invalid = () => {
  throw new Error("Invalid client update metadata.");
};
const exactFields = (value, fields) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  )
    invalid();
};
const validBuild = (value) =>
  typeof value === "string" &&
  /^[1-9][0-9]{0,9}$/.test(value) &&
  Number(value) <= 2100000000 &&
  String(Number(value)) === value;
const byteLength = (value) => new TextEncoder().encode(value).length;
const validInstallationUrl = (value) => {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("https://") ||
    !/^[\x21-\x7e]+$/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname !== "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
};

const validateContext = (context) => {
  const fields = [
    "appId",
    "currentVersion",
    "target",
    "arch",
    "distribution",
    "channel",
    "device",
  ];
  if (context?.target === "android") fields.push("currentBuild");
  exactFields(context, fields);
  exactFields(context.device, ["model", "osVersion"]);
  if (
    !isDeviceMetadataText(context.device.model) ||
    !isDeviceMetadataText(context.device.osVersion) ||
    context.appId !== "routevn-creator" ||
    !isUpdateVersion(context.currentVersion) ||
    !["stable", "beta"].includes(context.channel) ||
    !["aarch64", "x86_64", "i686", "armv7"].includes(context.arch)
  )
    invalid();
  if (context.target === "android") {
    if (
      !validBuild(context.currentBuild) ||
      !["google-play", "direct"].includes(context.distribution)
    )
      invalid();
  } else if (context.target !== "ios" || context.distribution !== "app-store") {
    invalid();
  }
  return context;
};

// Older installed shells do not expose the metadata bridge yet.
export const readClientUpdateContext = async (bridge) => {
  try {
    return validateContext(await bridge("getAppUpdateContext", {}));
  } catch {
    return undefined;
  }
};

const validateResult = (result, context, availableBuild) => {
  if (result?.status === "unsupportedClient") {
    exactFields(result, ["status"]);
  } else if (result?.status === "noUpdate") {
    exactFields(result, ["status", "reason"]);
    if (!["upToDate", "noCompatibleRelease"].includes(result.reason)) invalid();
  } else if (result?.status === "updateAvailable") {
    exactFields(result, ["status", "release"]);
    const { release } = result;
    exactFields(release, [
      "version",
      "changelog",
      "publishedAt",
      "installation",
    ]);
    if (
      !isUpdateVersion(release.version) ||
      typeof release.changelog !== "string" ||
      byteLength(release.changelog) > 32768 ||
      typeof release.publishedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(
        release.publishedAt,
      ) ||
      !Number.isFinite(Date.parse(release.publishedAt)) ||
      (context.channel === "stable" &&
        release.version.split("+")[0].includes("-"))
    )
      invalid();
    const action = release.installation;
    if (
      context.target === "android" &&
      context.distribution === "google-play"
    ) {
      exactFields(action, ["type", "url", "build"]);
      if (
        action.type !== "googlePlay" ||
        !validInstallationUrl(action.url) ||
        !validBuild(action.build) ||
        Number(action.build) <= Number(context.currentBuild) ||
        (availableBuild !== undefined && action.build !== availableBuild) ||
        compareUpdateVersions(release.version, context.currentVersion) < 0
      )
        invalid();
    } else if (context.target === "ios" && context.arch === "aarch64") {
      exactFields(action, ["type", "url"]);
      if (
        action.type !== "appStore" ||
        !validInstallationUrl(action.url) ||
        compareUpdateVersions(release.version, context.currentVersion) <= 0
      )
        invalid();
    } else invalid();
  } else invalid();
  return result;
};

export const createClientUpdates = ({
  context,
  request,
  keyValueStore,
  now = Date.now,
}) => {
  validateContext(context);
  let retryAt = 0;
  return {
    async check({ availableBuild } = {}) {
      if (now() < retryAt)
        throw new Error("Client update check is temporarily deferred.");
      const params = {};
      if (availableBuild !== undefined) {
        if (
          context.target !== "android" ||
          context.distribution !== "google-play" ||
          !validBuild(availableBuild) ||
          Number(availableBuild) <= Number(context.currentBuild)
        )
          invalid();
        params.availableBuild = availableBuild;
      }
      params.deviceId = await getDeviceId(keyValueStore);
      const response = await request(params);
      if (
        [429, 503].includes(response?.status) &&
        /^[1-9][0-9]*$/.test(response.retryAfter ?? "")
      ) {
        const seconds = Number(response.retryAfter);
        if (
          String(seconds) === response.retryAfter &&
          Number.isSafeInteger(seconds) &&
          Number.isSafeInteger(now() + seconds * 1000)
        ) {
          retryAt = now() + seconds * 1000;
        }
      }
      if (response?.status !== 200)
        throw new Error("Client update service unavailable.");
      if (
        typeof response.body !== "string" ||
        byteLength(response.body) > 65536
      )
        invalid();
      const envelope = JSON.parse(response.body);
      exactFields(envelope, ["jsonrpc", "id", "result"]);
      if (envelope.jsonrpc !== "2.0" || envelope.id !== 1) invalid();
      return validateResult(envelope.result, context, availableBuild);
    },
  };
};

export const formatUpdateMessage = (copy, release) =>
  (
    copy.updateAvailableMessage ??
    "Update {version} is available!\n\nRelease notes:\n{releaseNotes}"
  ).replace(/\{(version|releaseNotes)\}/g, (_, key) =>
    key === "version" ? release.version : release.changelog,
  );
