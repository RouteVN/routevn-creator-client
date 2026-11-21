export const RESERVED_ANDROID_APPLICATION_IDS = Object.freeze([
  "vn.routevn.androidplayer.template",
  "com.routevn.creator",
]);

export const isValidAndroidApplicationId = (value) =>
  typeof value === "string" &&
  value === value.trim() &&
  /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value) &&
  !RESERVED_ANDROID_APPLICATION_IDS.includes(value);
