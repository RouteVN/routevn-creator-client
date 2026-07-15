export const createMacosNativeVersion = (actionIndex) => {
  const normalizedActionIndex = Number(actionIndex);

  if (
    !Number.isSafeInteger(normalizedActionIndex) ||
    normalizedActionIndex < 0 ||
    normalizedActionIndex === Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      "macOS export requires a valid non-negative release action index.",
    );
  }

  return {
    shortVersion: `1.0.${normalizedActionIndex}`,
    bundleVersion: String(normalizedActionIndex + 1),
  };
};
