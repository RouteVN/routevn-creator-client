import { describe, expect, it } from "vitest";
import {
  isValidAndroidApplicationId,
  RESERVED_ANDROID_APPLICATION_IDS,
} from "../../src/internal/androidApplicationId.js";

describe("Android application IDs", () => {
  it.each(["com.example.game", "a.b", "Com.Team_1.Game2", "org.example.a_b"])(
    "accepts %s",
    (value) => {
      expect(isValidAndroidApplicationId(value)).toBe(true);
    },
  );
  it.each([
    undefined,
    12,
    "",
    "game",
    ".com.game",
    "com..game",
    "com.game.",
    "com.1game",
    "com._game",
    "com.my-game",
    "com.gáme",
    " com.game",
    "com.game ",
    "com.game\n",
    ...RESERVED_ANDROID_APPLICATION_IDS,
  ])("rejects %s", (value) => {
    expect(isValidAndroidApplicationId(value)).toBe(false);
  });
});
