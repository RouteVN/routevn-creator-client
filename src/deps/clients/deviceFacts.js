import { createDeviceFacts } from "../../internal/deviceFacts.js";
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
