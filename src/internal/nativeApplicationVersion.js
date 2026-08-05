const MAX_SEMVER_COMPONENT = 18_446_744_073_709_551_615n;

export const isValidMacosApplicationVersion = (value) => {
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
  if (!isValidMacosApplicationVersion(applicationVersion)) {
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
