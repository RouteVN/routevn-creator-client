import { sanitizeArtifactFileName } from "./artifactFileName.js";
import { requireProjectResolution } from "./projectResolution.js";

// Android APK export is not released yet. Until it is, the Versions page hides
// its export button and Platform Details hides the Android platform.
export const ANDROID_EXPORT_RELEASED = false;

export const isValidAndroidBackgroundColor = (value) =>
  typeof value === "string" &&
  value.length === 7 &&
  /^#[0-9a-f]{6}$/i.test(value);

export const normalizeAndroidBackgroundColor = (value) => {
  if (!isValidAndroidBackgroundColor(value)) {
    throw new Error(
      "Android background colors must use opaque #RRGGBB values.",
    );
  }
  return value.toUpperCase();
};

export const createAndroidApkFileName = (applicationName, version) =>
  `${sanitizeArtifactFileName(`${applicationName}-${version}-unsigned`)}.apk`;

export const getAndroidExportOrientation = (resolution) => {
  const { width, height } = requireProjectResolution(resolution);
  return height > width ? "portrait" : "landscape";
};
