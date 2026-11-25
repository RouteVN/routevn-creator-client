import { describe, expect, it } from "vitest";
import { isDeviceId } from "../../src/deps/clients/deviceIdentity.js";
import {
  createDeviceFactsClient,
  createSupportDeviceFactsClient,
} from "../../src/deps/clients/deviceFacts.js";

const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";

// The app database's key-value entries, as each platform's database keeps
// them: a value written once stays across launches.
const keyValueStore = (values = new Map()) => ({
  get: async (key) => values.get(key) ?? null,
  getOrSet: async (key, value) => {
    if (!values.has(key)) values.set(key, value);
    return values.get(key);
  },
});

const navigator = {
  languages: ["ja-JP", "en-US"],
  language: "ja-JP",
  userAgent: MAC,
  maxTouchPoints: 0,
};

describe("device facts client", () => {
  it("sends the app's own device ID with what the device is", async () => {
    const id = "123456789ABC123456789ABC";
    const client = createDeviceFactsClient({
      keyValueStore: keyValueStore(new Map([["deviceId", id]])),
      platform: "tauri",
      distribution: "direct",
      appVersion: "1.22.1",
      getUiLanguage: () => "en",
      navigator,
    });

    expect(await client.get()).toEqual({
      id,
      language: "ja",
      uiLanguage: "en",
      os: "macos",
      formFactor: "desktop",
      client: "desktopApp",
      channel: "direct",
      app: "routevn-creator",
      appVersion: "1.22.1",
    });
  });

  it("makes a device ID on first use and keeps it across launches", async () => {
    const values = new Map();
    const launch = () =>
      createDeviceFactsClient({
        keyValueStore: keyValueStore(values),
        platform: "web",
        appVersion: "1.22.1",
        getUiLanguage: () => "en",
        navigator,
      });

    const { id } = await launch().get();

    expect(isDeviceId(id)).toBe(true);
    expect(values.get("deviceId")).toBe(id);
    expect((await launch().get()).id).toBe(id);
  });

  it("leaves out only a fact it can't read, and still sends the rest", async () => {
    const id = "123456789ABC123456789ABC";
    const failing = () => {
      throw new Error("unavailable");
    };
    const client = createDeviceFactsClient({
      keyValueStore: keyValueStore(new Map([["deviceId", id]])),
      platform: "tauri",
      distribution: "direct",
      appVersion: "1.22.1",
      getUiLanguage: failing,
      navigator: {
        ...navigator,
        get languages() {
          return failing();
        },
      },
    });

    expect(await client.get()).toEqual({
      id,
      language: "unknown",
      os: "macos",
      formFactor: "desktop",
      client: "desktopApp",
      channel: "direct",
      app: "routevn-creator",
      appVersion: "1.22.1",
    });
  });

  it("reads the app's language afresh each time", async () => {
    let uiLanguage = "en";
    const client = createDeviceFactsClient({
      keyValueStore: keyValueStore(),
      platform: "web",
      appVersion: "1.22.1",
      getUiLanguage: () => uiLanguage,
      navigator,
    });

    expect((await client.get()).uiLanguage).toBe("en");
    uiLanguage = "zh-hans";
    expect((await client.get()).uiLanguage).toBe("zh-hans");
  });
});

describe("support device facts client", () => {
  const deviceFacts = {
    get: async () => ({ id: "123456789ABC123456789ABC", os: "linux" }),
  };

  // A window whose WebGL context answers with `gl`, or has no WebGL.
  const fakeWindow = (gl) => ({
    document: {
      createElement: () => ({ getContext: () => gl }),
    },
    screen: { width: 2560, height: 1440 },
    devicePixelRatio: 2,
  });

  const webgl = () => {
    const lost = { loseContext: () => {} };
    const gl = {
      MAX_TEXTURE_SIZE: 3379,
      RENDERER: 7937,
      getExtension: (name) =>
        name === "WEBGL_debug_renderer_info"
          ? { UNMASKED_RENDERER_WEBGL: 37446 }
          : name === "WEBGL_lose_context"
            ? lost
            : null,
      getParameter: (parameter) =>
        ({ 3379: 16384, 37446: "ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)" })[
          parameter
        ],
    };
    return { gl, lost };
  };

  it("adds the system's facts for the project's drive, the GPU and the screen", async () => {
    const readNativeFacts = async ({ projectPath }) => ({
      osVersion: "14.5",
      model: "MacBookPro18,3",
      arch: "aarch64",
      memoryBytes: 17179869184,
      freeDiskBytes: projectPath === "/projects/one" ? 1000 : undefined,
    });
    const { gl, lost } = webgl();
    let released = false;
    lost.loseContext = () => {
      released = true;
    };
    const client = createSupportDeviceFactsClient({
      deviceFacts,
      readNativeFacts,
      window: fakeWindow(gl),
    });

    expect(await client.get({ projectPath: "/projects/one" })).toEqual({
      id: "123456789ABC123456789ABC",
      os: "linux",
      osVersion: "14.5",
      model: "MacBookPro18,3",
      arch: "aarch64",
      memoryBytes: 17179869184,
      freeDiskBytes: 1000,
      gpu: "ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)",
      maxTextureSize: 16384,
      screenWidth: 2560,
      screenHeight: 1440,
      pixelRatio: 2,
    });
    expect(released).toBe(true);
  });

  it("still sends the rest when the system or WebGL can't be read", async () => {
    const client = createSupportDeviceFactsClient({
      deviceFacts,
      readNativeFacts: async () => {
        throw new Error("Command get_support_device_facts not found");
      },
      window: fakeWindow(null),
    });

    expect(await client.get({ projectPath: "/projects/one" })).toEqual({
      id: "123456789ABC123456789ABC",
      os: "linux",
      screenWidth: 2560,
      screenHeight: 1440,
      pixelRatio: 2,
    });
  });
});
