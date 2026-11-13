import { createMobileAudioRuntime } from "../mobileAudioRuntime.js";
import { createPlayerRuntimePersistenceHost } from "../shared/playerRuntimePersistenceHost.js";
import {
  createLazyPlayerRuntimeBridge,
  createPlayerRuntimeDb,
} from "../shared/mobilePlayerRuntimeDb.js";

// The host of the exported iOS player. The player's web view installs
// RouteVNPlayerIOS before the page runs; it answers the same requests as the
// Android player.
const NAME = "iOS player";
const callPlayerRuntimeBridge = createLazyPlayerRuntimeBridge({
  getBridge: () => globalThis.RouteVNPlayerIOS,
  name: NAME,
});

const host = createPlayerRuntimePersistenceHost({
  createDatabase: (options) =>
    createPlayerRuntimeDb({
      ...options,
      call: callPlayerRuntimeBridge,
      name: NAME,
    }),
});

const audioRuntime = createMobileAudioRuntime();

globalThis.__ROUTEVN_PLAYER_HOST__ = Object.freeze({
  audioRuntime: audioRuntime.graphicsRuntime,
  createPersistence: host.createPersistence,
  async onReady() {
    try {
      await callPlayerRuntimeBridge("player.ready", {});
    } catch (error) {
      console.warn(
        "Could not notify the iOS player that startup finished.",
        error,
      );
    }
  },
});
