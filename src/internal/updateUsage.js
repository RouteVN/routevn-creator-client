const uiLanguagePattern = /^[a-z]{2,3}(-[a-z]{4})?$/;
const webViewVersionPattern = /^[0-9]{1,4}(\.[0-9]{1,4})?$/;

const FORM_FACTORS = ["phone", "tablet", "desktop"];
const UI_LANGUAGE_SOURCES = ["default", "selected"];
const UPDATE_TRIGGERS = ["launch", "periodic", "manual"];

const isLowercaseLetters = (value) =>
  typeof value === "string" && /^[a-z]+$/.test(value);

// A single letter or digit starts an extension or private-use block; no
// region or script subtag appears after it.
const isSingletonSubtag = (value) =>
  typeof value === "string" && /^[a-z0-9]$/.test(value);

const chineseScriptForRegion = (region) => {
  if (["cn", "sg"].includes(region)) return "hans";
  if (["tw", "hk", "mo"].includes(region)) return "hant";
  return undefined;
};

// The API's language rules: lowercase 2-3 letters, optionally "-" plus a
// 4-letter script. Only Chinese keeps a script; every other language drops
// region, script, and extensions. Anything unreadable becomes "unknown",
// which the API accepts only for device.language.
export const normalizeDeviceLanguage = (value) => {
  if (typeof value !== "string") return "unknown";
  const parts = value
    .trim()
    .toLowerCase()
    .split(/[-_]/)
    .filter((part) => part !== "");
  const language = parts[0];
  if (!isLowercaseLetters(language) || ![2, 3].includes(language.length))
    return "unknown";
  if (language !== "zh") return language;
  const second = parts[1];
  if (second === "hans" || second === "hant") return `zh-${second}`;
  const extensionStart = parts.slice(1).findIndex(isSingletonSubtag);
  const knownParts =
    extensionStart === -1 ? parts : parts.slice(0, extensionStart + 1);
  if (!isLowercaseLetters(second) || second.length !== 4) {
    const script = chineseScriptForRegion(second);
    if (script) return `zh-${script}`;
    const region = knownParts
      .slice(1)
      .find((part) => isLowercaseLetters(part) && part.length === 2);
    const regionScript = region ? chineseScriptForRegion(region) : undefined;
    return regionScript ? `zh-${regionScript}` : "zh-hans";
  }
  return "zh-hans";
};

export const isValidUiLanguage = (value) =>
  typeof value === "string" && uiLanguagePattern.test(value);

export const isValidDeviceLanguage = (value) =>
  value === "unknown" || isValidUiLanguage(value);

export const isValidWebViewVersion = (value) =>
  typeof value === "string" && webViewVersionPattern.test(value);

export const isValidFormFactor = (value) => FORM_FACTORS.includes(value);

export const isValidUiLanguageSource = (value) =>
  UI_LANGUAGE_SOURCES.includes(value);

export const isValidUpdateTrigger = (value) => UPDATE_TRIGGERS.includes(value);
