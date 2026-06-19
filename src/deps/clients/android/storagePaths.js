const ANDROID_STORAGE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const assertSafeAndroidStorageSegment = (
  value,
  { label = "Android storage id" } = {},
) => {
  const segment = typeof value === "string" ? value.trim() : "";

  if (!ANDROID_STORAGE_SEGMENT_PATTERN.test(segment)) {
    throw new Error(`${label} is invalid.`);
  }

  return segment;
};
