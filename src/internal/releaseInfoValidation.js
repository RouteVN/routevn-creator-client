import { isValidNativeApplicationIdentifier } from "./nativeApplicationIdentifier.js";

const MACOS_CATEGORY_PATTERN =
  /^public\.app-category\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const hasColor = (availableColorIds, colorId) => {
  if (!colorId || availableColorIds === undefined) {
    return true;
  }

  return availableColorIds.has(colorId);
};

export const validatePlatformReleaseInfo = ({
  platform,
  applicationInfo,
  availableColorIds,
} = {}) => {
  if (!applicationInfo.applicationName.trim()) {
    return { valid: false, code: "application-name-required" };
  }

  if (platform === "web") {
    if (!hasColor(availableColorIds, applicationInfo.themeColorId)) {
      return { valid: false, code: "theme-color-not-found" };
    }
    if (!hasColor(availableColorIds, applicationInfo.backgroundColorId)) {
      return { valid: false, code: "background-color-not-found" };
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
