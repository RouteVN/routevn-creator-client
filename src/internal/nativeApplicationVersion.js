const MAX_SEMVER_COMPONENT = 18_446_744_073_709_551_615n;

export const isValidNativeApplicationVersion = (value) => {
  if (typeof value !== "string") {
    return false;
  }

  const components = value.split(".");
  return (
    components.length === 3 &&
    components.every(
      (component) =>
        /^(?:0|[1-9]\d*)$/.test(component) &&
        BigInt(component) <= MAX_SEMVER_COMPONENT,
    )
  );
};

export const isValidMacosBuildNumber = (value) => {
  return (
    typeof value === "string" &&
    /^[1-9]\d*$/.test(value) &&
    BigInt(value) <= MAX_SEMVER_COMPONENT
  );
};

export const createMacosNativeVersion = (applicationVersion, buildNumber) => {
  if (!isValidNativeApplicationVersion(applicationVersion)) {
    throw new Error("macOS export requires a three-component numeric version.");
  }
  if (!isValidMacosBuildNumber(buildNumber)) {
    throw new Error("macOS export requires a positive numeric build number.");
  }

  return {
    shortVersion: applicationVersion,
    bundleVersion: buildNumber,
  };
};

export const isValidAndroidVersionCode = (value) =>
  typeof value === "string" &&
  value === value.trim() &&
  /^[1-9]\d*$/.test(value) &&
  BigInt(value) <= 2_100_000_000n;

export const createAndroidNativeVersion = (versionName, versionCode) => {
  if (!isValidNativeApplicationVersion(versionName)) {
    throw new Error(
      "Android export requires a three-component numeric version.",
    );
  }
  if (!isValidAndroidVersionCode(versionCode)) {
    throw new Error(
      "Android build number must be an integer from 1 to 2100000000.",
    );
  }
  return { versionName, versionCode: Number(versionCode) };
};
