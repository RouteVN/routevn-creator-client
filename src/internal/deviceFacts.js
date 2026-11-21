import { isValidUiLanguage, normalizeDeviceLanguage } from "./updateUsage.js";
import { isUpdateVersion } from "./updateVersion.js";

// How the app was opened, by the platform it runs on.
const CLIENTS = Object.freeze({
  web: "web",
  tauri: "desktopApp",
  android: "mobileApp",
  ios: "mobileApp",
});
// Where an installed app came from. The web app has none.
const CHANNELS = Object.freeze([
  "direct",
  "google-play",
  "app-store",
  "steam",
  "galaxy-store",
]);

// The device's system, from the web view's user agent and touch points, or
// undefined for one the asset store doesn't take (ChromeOS) or can't be read.
// Safari on an iPad asks for desktop sites as a Mac with a touch screen.
export const osOf = ({ userAgent = "", maxTouchPoints = 0 } = {}) => {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/.test(userAgent)) return "android";
  if (/Windows/.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/.test(userAgent)) return "macos";
  if (/CrOS/.test(userAgent)) return undefined;
  if (/Linux|X11/.test(userAgent)) return "linux";
  return undefined;
};

// The kind of device, from the same: an Android web view says Mobile only on
// a phone. Undefined when it can't be read.
export const formFactorOf = ({ userAgent = "", maxTouchPoints = 0 } = {}) => {
  if (/iPhone|iPod/.test(userAgent)) return "phone";
  if (/iPad/.test(userAgent)) return "tablet";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "tablet";
  if (/Android/.test(userAgent)) {
    return /Mobile/.test(userAgent) ? "phone" : "tablet";
  }
  if (/Windows|Macintosh|Mac OS X|CrOS|Linux|X11/.test(userAgent)) {
    return "desktop";
  }
  return undefined;
};

// What a view of an asset pack says of the device it was made on, beside the
// device ID: the device's language and the app's, the system, the kind of
// device, how the app was opened, where it was installed from and its
// version. A fact that can't be told, or that the asset store doesn't take,
// is left out; the device's language is `unknown` when it can't be read. The
// desktop app is always a desktop.
export const createDeviceFacts = ({
  platform,
  distribution,
  appVersion,
  language,
  uiLanguage,
  userAgent,
  maxTouchPoints,
}) => {
  const facts = { language: normalizeDeviceLanguage(language) };
  const appLanguage = normalizeDeviceLanguage(uiLanguage);
  if (isValidUiLanguage(appLanguage)) facts.uiLanguage = appLanguage;
  const browser = { userAgent, maxTouchPoints };
  const os = osOf(browser);
  if (os) facts.os = os;
  const formFactor = platform === "tauri" ? "desktop" : formFactorOf(browser);
  if (formFactor) facts.formFactor = formFactor;
  const client = CLIENTS[platform];
  if (client) facts.client = client;
  if (platform !== "web" && CHANNELS.includes(distribution)) {
    facts.channel = distribution;
  }
  facts.app = "routevn-creator";
  if (isUpdateVersion(appVersion)) {
    facts.appVersion = appVersion.replace(/^v/, "");
  }
  return facts;
};
