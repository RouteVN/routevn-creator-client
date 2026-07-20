import { isValidNativeApplicationIdentifier } from "./nativeApplicationIdentifier.js";

const MACOS_CATEGORY_PATTERN =
  /^public\.app-category\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const WEB_APPLICATION_IDENTIFIER_PATTERN = /^(?=.*[A-Za-z0-9])[A-Za-z0-9.-]+$/;

export const validatePlatformDetails = ({ platform, applicationInfo } = {}) => {
  if (!applicationInfo.applicationName.trim()) {
    return { valid: false, code: "application-name-required" };
  }

  if (platform === "windows" && !applicationInfo.iconFileId) {
    return { valid: false, code: "windows-icon-required" };
  }
  if (platform === "macos" && !applicationInfo.iconFileId) {
    return { valid: false, code: "macos-icon-required" };
  }

  if (platform === "web") {
    if (!applicationInfo.applicationIdentifier?.trim()) {
      return { valid: false, code: "web-identifier-required" };
    }
    if (
      applicationInfo.applicationIdentifier !==
        applicationInfo.applicationIdentifier.trim() ||
      !WEB_APPLICATION_IDENTIFIER_PATTERN.test(
        applicationInfo.applicationIdentifier,
      )
    ) {
      return { valid: false, code: "web-identifier-invalid" };
    }
  }

  if (
    platform === "windows" &&
    applicationInfo.applicationIdentifier &&
    !isValidNativeApplicationIdentifier(applicationInfo.applicationIdentifier)
  ) {
    return { valid: false, code: "windows-identifier-invalid" };
  }

  if (platform === "macos") {
    if (!applicationInfo.applicationIdentifier) {
      return { valid: false, code: "macos-identifier-required" };
    }
    if (
      !isValidNativeApplicationIdentifier(applicationInfo.applicationIdentifier)
    ) {
      return { valid: false, code: "macos-identifier-invalid" };
    }
    if (
      applicationInfo.category &&
      !MACOS_CATEGORY_PATTERN.test(applicationInfo.category)
    ) {
      return { valid: false, code: "macos-category-invalid" };
    }
  }

  return { valid: true };
};
