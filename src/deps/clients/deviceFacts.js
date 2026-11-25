import {
  addHardwareFacts,
  createDeviceFacts,
} from "../../internal/deviceFacts.js";
import { getDeviceId } from "./deviceIdentity.js";
import { getDeviceLanguages } from "./deviceLanguages.js";

// A fact read from the device or the app, or none when reading it fails:
// one fact that can't be read is left out, and the view keeps the rest.
const readOrNone = (read) => {
  try {
    return read();
  } catch {
    return undefined;
  }
};

// The device a view of an asset pack is made on: the app's own device ID,
// the one update checks send, made on first use and kept in the app
// database, and what the device is. The device's language and the app's are
// read afresh each time; `getUiLanguage` answers the app's.
export const createDeviceFactsClient = ({
  keyValueStore,
  platform,
  distribution,
  appVersion,
  getUiLanguage,
  navigator = globalThis.navigator,
}) => ({
  async get() {
    const id = await getDeviceId(keyValueStore);
    const facts = createDeviceFacts({
      platform,
      distribution,
      appVersion,
      language: readOrNone(() => getDeviceLanguages(navigator)[0]),
      uiLanguage: readOrNone(getUiLanguage),
      userAgent: readOrNone(() => navigator?.userAgent),
      maxTouchPoints: readOrNone(() => navigator?.maxTouchPoints),
    });
    return { id, ...facts };
  },
});

// The GPU's name and the largest texture it can draw, from a WebGL context
// made for the read and released right after. Empty without WebGL.
const readGraphicsFacts = (document) => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return {};
  try {
    const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      gpu: gl.getParameter(
        rendererInfo ? rendererInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
      ),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
};

// What a project sent to support says of the device: the facts of
// `deviceFacts`, what `readNativeFacts({ projectPath })` reads from the
// system (its version, the model, processor, WebView version, memory and the
// free space on the project's drive), the GPU and the screen. Each part that
// can't be read is left out, and the rest is still sent.
export const createSupportDeviceFactsClient = ({
  deviceFacts,
  readNativeFacts,
  window = globalThis.window,
}) => ({
  async get({ projectPath }) {
    const facts = await deviceFacts.get();
    let native = {};
    try {
      native = await readNativeFacts({ projectPath });
    } catch {
      // Sent without the system's facts.
    }
    const graphics = readOrNone(() => readGraphicsFacts(window.document)) ?? {};
    return addHardwareFacts(facts, {
      osVersion: native.osVersion,
      model: native.model,
      arch: native.arch,
      webViewVersion: native.webViewVersion,
      memoryBytes: native.memoryBytes,
      freeDiskBytes: native.freeDiskBytes,
      gpu: graphics.gpu,
      maxTextureSize: graphics.maxTextureSize,
      screenWidth: readOrNone(() => window.screen.width),
      screenHeight: readOrNone(() => window.screen.height),
      pixelRatio: readOrNone(() => window.devicePixelRatio),
    });
  },
});
