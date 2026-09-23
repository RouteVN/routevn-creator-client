export const COMMAND_ENVELOPE_VERSION = 1;
export const STRICT_COMMAND_ENVELOPE_VERSION = 2;
export const STRICT_MODEL_SCHEMA_VERSION = 16;
export const SUPPORTED_STRICT_MODEL_VERSIONS = Object.freeze([16]);

export const deriveProjectFormatVersionFromAppVersion = (appVersion) => {
  if (typeof appVersion !== "string" || appVersion.length === 0) {
    throw new Error("appVersion must be a non-empty string");
  }

  const match = appVersion.match(/^(\d+)\./);
  if (!match) {
    throw new Error(
      `Cannot derive project format version from appVersion '${appVersion}'`,
    );
  }

  return Number.parseInt(match[1], 10);
};
