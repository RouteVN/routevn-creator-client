import { describe, expect, it } from "vitest";
import {
  addHardwareFacts,
  createDeviceFacts,
  formFactorOf,
  osOf,
} from "../../src/internal/deviceFacts.js";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
const LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 15; Pixel Tablet; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Safari/537.36";
const CHROMEOS =
  "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const facts = (overrides) =>
  createDeviceFacts({
    platform: "web",
    appVersion: "1.22.1",
    language: "en-US",
    uiLanguage: "en",
    userAgent: WINDOWS,
    maxTouchPoints: 0,
    ...overrides,
  });

describe("device facts", () => {
  it("reads the system and the kind of device from the user agent", () => {
    const cases = [
      [IPHONE, 5, "ios", "phone"],
      [IPAD, 5, "ios", "tablet"],
      // Safari on an iPad asks for desktop sites as a Mac with a touch screen.
      [MAC, 5, "ios", "tablet"],
      [MAC, 0, "macos", "desktop"],
      [WINDOWS, 0, "windows", "desktop"],
      [LINUX, 0, "linux", "desktop"],
      [ANDROID_PHONE, 5, "android", "phone"],
      // An Android browser says Mobile only on a phone.
      [ANDROID_TABLET, 5, "android", "tablet"],
      // The API takes no ChromeOS.
      [CHROMEOS, 0, undefined, "desktop"],
      ["", 0, undefined, undefined],
    ];
    for (const [userAgent, maxTouchPoints, os, formFactor] of cases) {
      expect(osOf({ userAgent, maxTouchPoints })).toBe(os);
      expect(formFactorOf({ userAgent, maxTouchPoints })).toBe(formFactor);
    }
  });

  it("names a browser as the web client, with no channel", () => {
    expect(
      facts({
        platform: "web",
        distribution: "direct",
        userAgent: IPHONE,
        maxTouchPoints: 5,
      }),
    ).toEqual({
      language: "en",
      uiLanguage: "en",
      os: "ios",
      formFactor: "phone",
      client: "web",
      app: "routevn-creator",
      appVersion: "1.22.1",
    });
  });

  it("names the desktop app a desktop, with the channel it was installed from", () => {
    expect(
      facts({ platform: "tauri", distribution: "steam", userAgent: MAC }),
    ).toEqual({
      language: "en",
      uiLanguage: "en",
      os: "macos",
      formFactor: "desktop",
      client: "desktopApp",
      channel: "steam",
      app: "routevn-creator",
      appVersion: "1.22.1",
    });
    expect(
      facts({ platform: "tauri", distribution: "direct", userAgent: LINUX }),
    ).toMatchObject({ os: "linux", channel: "direct" });
  });

  it("names the Android and iOS apps the mobile app, with their store", () => {
    expect(
      facts({
        platform: "android",
        distribution: "google-play",
        userAgent: ANDROID_TABLET,
        maxTouchPoints: 5,
      }),
    ).toMatchObject({
      os: "android",
      formFactor: "tablet",
      client: "mobileApp",
      channel: "google-play",
    });
    expect(
      facts({
        platform: "ios",
        distribution: "app-store",
        userAgent: IPHONE,
        maxTouchPoints: 5,
      }),
    ).toMatchObject({
      os: "ios",
      formFactor: "phone",
      client: "mobileApp",
      channel: "app-store",
    });
  });

  it("sends the device's language and the app's language in the API's form", () => {
    expect(facts({ language: "en-US", uiLanguage: "ja" })).toMatchObject({
      language: "en",
      uiLanguage: "ja",
    });
    expect(facts({ language: "zh-TW", uiLanguage: "zh-hant" })).toMatchObject({
      language: "zh-hant",
      uiLanguage: "zh-hant",
    });
    // The API takes `unknown` for the device's language only.
    const unreadable = facts({ language: undefined, uiLanguage: "?" });
    expect(unreadable.language).toBe("unknown");
    expect(unreadable).not.toHaveProperty("uiLanguage");
  });

  it("names the Creator, with its version without a leading v", () => {
    expect(facts({ appVersion: "v1.22.1" })).toMatchObject({
      app: "routevn-creator",
      appVersion: "1.22.1",
    });
    expect(facts({ appVersion: "1.23.0-beta.1" }).appVersion).toBe(
      "1.23.0-beta.1",
    );
  });

  it("leaves out a fact it can't tell or the API doesn't take", () => {
    const unknown = facts({
      platform: "tauri",
      distribution: "unknown-store",
      appVersion: "dev",
      userAgent: CHROMEOS,
    });
    expect(unknown).toEqual({
      language: "en",
      uiLanguage: "en",
      formFactor: "desktop",
      client: "desktopApp",
      app: "routevn-creator",
    });
    expect(facts({ platform: "other" })).not.toHaveProperty("client");
  });
});

describe("hardware facts sent to support", () => {
  it("adds each fact that is in range to the device facts", () => {
    expect(
      addHardwareFacts(
        { os: "windows" },
        {
          osVersion: "10.0.22631",
          model: "Laptop Model 14",
          arch: "x86_64",
          webViewVersion: "131.0.2903.112",
          memoryBytes: 17179869184,
          freeDiskBytes: 0,
          gpu: "ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
          maxTextureSize: 16384,
          screenWidth: 1920,
          screenHeight: 1080,
          pixelRatio: 1.25,
        },
      ),
    ).toEqual({
      os: "windows",
      osVersion: "10.0.22631",
      model: "Laptop Model 14",
      arch: "x86_64",
      webViewVersion: "131.0.2903.112",
      memoryBytes: 17179869184,
      freeDiskBytes: 0,
      gpu: "ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
      maxTextureSize: 16384,
      screenWidth: 1920,
      screenHeight: 1080,
      pixelRatio: 1.25,
    });
  });

  it("leaves out facts that can't be read or are out of range", () => {
    expect(
      addHardwareFacts(
        { os: "linux" },
        {
          osVersion: "   ",
          model: "x".repeat(257),
          arch: "riscv64",
          webViewVersion: "2.46\u0007",
          memoryBytes: 0,
          freeDiskBytes: -1,
          gpu: undefined,
          maxTextureSize: 65537,
          screenWidth: 1.5,
          screenHeight: 100001,
          pixelRatio: 17,
        },
      ),
    ).toEqual({ os: "linux" });
  });

  it("counts text in characters, not UTF-16 units", () => {
    const model = "電".repeat(256);
    expect(addHardwareFacts({}, { model }).model).toBe(model);
    expect(addHardwareFacts({}, { model: "😀".repeat(256) }).model).toBe(
      "😀".repeat(256),
    );
  });
});
