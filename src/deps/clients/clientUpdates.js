import {
  compareUpdateVersions,
  isUpdateVersion,
} from "../../internal/updateVersion.js";
import { isDeviceMetadataText, getDeviceId } from "./deviceIdentity.js";
import {
  isValidDeviceLanguage,
  isValidFormFactor,
  isValidUiLanguage,
  isValidUiLanguageSource,
  isValidUpdateTrigger,
  isValidWebViewVersion,
  normalizeDeviceLanguage,
} from "../../internal/updateUsage.js";
import {
  ROUTEVN_CREATOR_PLAY_STORE_URL,
  ROUTEVN_DOWNLOAD_DOMAIN,
} from "../../internal/routevnUrls.js";

const playStoreDestination = new URL(ROUTEVN_CREATOR_PLAY_STORE_URL);

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

const validDownloadUrl = (value) => {
  if (!validInstallationUrl(value)) return false;
  const { hostname } = new URL(value);
  return (
    hostname === ROUTEVN_DOWNLOAD_DOMAIN ||
    hostname.endsWith(`.${ROUTEVN_DOWNLOAD_DOMAIN}`)
  );
};

const validPlayStoreUrl = (value) => {
  if (!validInstallationUrl(value)) return false;
  const url = new URL(value);
  const ids = url.searchParams.getAll("id");
  return (
    url.origin === playStoreDestination.origin &&
    url.pathname === playStoreDestination.pathname &&
    ids.length === 1 &&
    ids[0] === playStoreDestination.searchParams.get("id")
  );
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
  validateContextDevice(context.device);
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

// Optional usage fields may be absent, and any value that is present is
// revalidated and omitted at send time; the shape check only rejects
// unexpected device keys.
const validateContextDevice = (device) => {
  const optionalFields = ["formFactor", "language", "webViewVersion"];
  if (
    !device ||
    typeof device !== "object" ||
    Array.isArray(device) ||
    !["model", "osVersion"].every((field) => Object.hasOwn(device, field)) ||
    Object.keys(device).some(
      (field) => !["model", "osVersion", ...optionalFields].includes(field),
    )
  )
    invalid();
};

// Older installed shells do not expose the metadata bridge yet, and shells
// that predate the usage fields report the installation facts without them.
export const readClientUpdateContext = async (bridge, target) => {
  try {
    const info = await bridge("getAppUpdateDeviceInfo", {});
    const requiredFields =
      target === "android"
        ? ["version", "arch", "distribution", "build", "model", "osVersion"]
        : ["version", "arch", "model", "osVersion"];
    const allowedFields = [
      ...requiredFields,
      "formFactor",
      "language",
      ...(target === "android" ? ["webViewVersion"] : []),
    ];
    if (
      !info ||
      typeof info !== "object" ||
      Array.isArray(info) ||
      !requiredFields.every((field) => Object.hasOwn(info, field)) ||
      Object.keys(info).some((field) => !allowedFields.includes(field))
    )
      invalid();
    const device = {
      model: isDeviceMetadataText(info.model) ? info.model : "unknown",
      osVersion: isDeviceMetadataText(info.osVersion)
        ? info.osVersion
        : "unknown",
    };
    // Each usage field is optional: it is kept only when valid, so a wrong
    // value never invalidates the context. An absent language is an older
    // shell; a present-but-unreadable one reports "unknown".
    if (info.language !== undefined)
      device.language = normalizeDeviceLanguage(info.language);
    if (isValidFormFactor(info.formFactor)) device.formFactor = info.formFactor;
    if (target === "android" && isValidWebViewVersion(info.webViewVersion))
      device.webViewVersion = info.webViewVersion;
    const context = {
      appId: "routevn-creator",
      currentVersion: info.version,
      target,
      arch: info.arch,
      distribution: target === "android" ? info.distribution : "app-store",
      channel: "stable",
      device,
    };
    if (target === "android") context.currentBuild = info.build;
    return validateContext(context);
  } catch {
    return undefined;
  }
};

const validateResult = (result, context) => {
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
        !validPlayStoreUrl(action.url) ||
        !validBuild(action.build) ||
        Number(action.build) <= Number(context.currentBuild) ||
        compareUpdateVersions(release.version, context.currentVersion) < 0
      )
        invalid();
    } else if (
      context.target === "android" &&
      context.distribution === "direct"
    ) {
      // A direct build is updated from a RouteVN download page in the browser.
      exactFields(action, ["type", "url", "build"]);
      if (
        action.type !== "download" ||
        !validDownloadUrl(action.url) ||
        !validBuild(action.build) ||
        Number(action.build) <= Number(context.currentBuild) ||
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

// The API rejects the whole check when an optional usage field is present
// but invalid, so every field is validated here, immediately before the
// request, and omitted when it fails or cannot be read.
const applyUsageParams = async (params, context, options, getLocaleUsage) => {
  const { device } = context;
  if (isValidFormFactor(device.formFactor))
    params.device.formFactor = device.formFactor;
  if (isValidDeviceLanguage(device.language))
    params.device.language = device.language;
  if (isValidWebViewVersion(device.webViewVersion))
    params.device.webViewVersion = device.webViewVersion;
  let localeUsage;
  try {
    localeUsage = await getLocaleUsage?.();
  } catch {
    localeUsage = undefined;
  }
  if (isValidUiLanguage(localeUsage?.uiLanguage))
    params.uiLanguage = localeUsage.uiLanguage;
  if (isValidUiLanguageSource(localeUsage?.uiLanguageSource))
    params.uiLanguageSource = localeUsage.uiLanguageSource;
  if (isValidUpdateTrigger(options?.trigger)) params.trigger = options.trigger;
};

export const createClientUpdates = ({
  context,
  request,
  keyValueStore,
  getLocaleUsage,
  now = Date.now,
}) => {
  validateContext(context);
  let retryAt = 0;
  return {
    async check(options = {}) {
      if (now() < retryAt)
        throw new Error("Client update check is temporarily deferred.");
      const params = {
        appId: context.appId,
        currentVersion: context.currentVersion,
        target: context.target,
        arch: context.arch,
        distribution: context.distribution,
        channel: context.channel,
        device: {
          id: await getDeviceId(keyValueStore),
          model: context.device.model,
          osVersion: context.device.osVersion,
        },
      };
      if (context.target === "android")
        params.currentBuild = context.currentBuild;
      await applyUsageParams(params, context, options, getLocaleUsage);
      const response = await request(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "system.getClientUpdate",
          params,
        }),
      );
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
      return validateResult(envelope.result, context);
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
