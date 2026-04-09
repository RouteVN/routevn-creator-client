export const COMMAND_ENVELOPE_VERSION = 1;

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
