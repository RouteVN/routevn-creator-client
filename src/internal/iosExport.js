import { sanitizeArtifactFileName } from "./artifactFileName.js";
import { isValidNativeApplicationIdentifier } from "./nativeApplicationIdentifier.js";
import { isValidNativeApplicationVersion } from "./nativeApplicationVersion.js";

// Switches iOS export off: when false, the Versions page hides its export
// button and Platform Details hides the iOS platform.
export const IOS_EXPORT_RELEASED = false;

// The App Store icon size. The exporter scales other sizes to it.
export const IOS_APPLICATION_ICON_OUTPUT_SIZE = 1024;

// Where the Xcode setup dialog sends the creator.
export const IOS_XCODE_DOWNLOAD_URL =
  "https://apps.apple.com/app/xcode/id497799835";

// Apple's bundle IDs: reverse-domain segments of letters, digits, and
// hyphens.
export const isValidIosBundleIdentifier = (value) =>
  isValidNativeApplicationIdentifier(value) && value.length <= 155;

const isShortInteger = (value) => /^(?:0|[1-9]\d{0,8})$/.test(value);

// CFBundleShortVersionString: three numbers of up to nine digits.
export const isValidIosVersion = (value) =>
  isValidNativeApplicationVersion(value) &&
  value.split(".").every(isShortInteger);

// CFBundleVersion: a positive number of up to nine digits.
export const isValidIosBuildNumber = (value) =>
  typeof value === "string" && /^[1-9]\d{0,8}$/.test(value);

// An Apple Developer team ID.
export const isValidIosTeamId = (value) =>
  typeof value === "string" && /^[A-Z0-9]{10}$/.test(value);

export const createIosIpaFileName = (applicationName, version) =>
  `${sanitizeArtifactFileName(`${applicationName}-${version}`)}.ipa`;

// The team the export dialog selects first: the one the game last used when
// Xcode still has it, else the first team that can publish to the App Store.
export const pickIosTeamId = (teams, rememberedTeamId) => {
  if (teams.some((team) => team.id === rememberedTeamId)) {
    return rememberedTeamId;
  }
  return (teams.find((team) => !team.free) ?? teams[0])?.id;
};
