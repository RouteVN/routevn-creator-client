import { isValidAndroidApplicationId } from "./androidApplicationId.js";
import { isValidAndroidBackgroundColor } from "./androidExport.js";
import { isValidIosBundleIdentifier } from "./iosExport.js";
import { isValidNativeApplicationIdentifier } from "./nativeApplicationIdentifier.js";

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

  if (platform === "windows") {
    if (!applicationInfo.applicationIdentifier) {
      return { valid: false, code: "windows-identifier-required" };
    }
    if (
      !isValidNativeApplicationIdentifier(applicationInfo.applicationIdentifier)
    ) {
      return { valid: false, code: "windows-identifier-invalid" };
    }
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
  }

  if (platform === "ios") {
    if (!applicationInfo.iconFileId) {
      return { valid: false, code: "ios-icon-required" };
    }
    if (!applicationInfo.applicationIdentifier) {
      return { valid: false, code: "ios-identifier-required" };
    }
    if (!isValidIosBundleIdentifier(applicationInfo.applicationIdentifier)) {
      return { valid: false, code: "ios-identifier-invalid" };
    }
  }

  if (platform === "android") {
    if (!applicationInfo.iconFileId) {
      return { valid: false, code: "android-icon-required" };
    }
    if (!applicationInfo.applicationIdentifier) {
      return { valid: false, code: "android-identifier-required" };
    }
    if (!isValidAndroidApplicationId(applicationInfo.applicationIdentifier)) {
      return { valid: false, code: "android-identifier-invalid" };
    }
    if (
      !isValidAndroidBackgroundColor(applicationInfo.iconBackgroundColor) ||
      !isValidAndroidBackgroundColor(applicationInfo.splashBackgroundColor)
    ) {
      return { valid: false, code: "android-color-invalid" };
    }
  }

  return { valid: true };
};
