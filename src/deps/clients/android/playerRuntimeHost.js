import { createAndroidAudioRuntime } from "./audioRuntime.js";
import { createPlayerRuntimePersistenceHost } from "../shared/playerRuntimePersistenceHost.js";
import {
  createLazyPlayerRuntimeBridge,
  createPlayerRuntimeDb,
} from "../shared/mobilePlayerRuntimeDb.js";

const NAME = "Android player";
const callPlayerRuntimeBridge = createLazyPlayerRuntimeBridge({
  getBridge: () => globalThis.RouteVNPlayerAndroid,
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

const audioRuntime = createAndroidAudioRuntime();

globalThis.__ROUTEVN_PLAYER_HOST__ = Object.freeze({
  audioRuntime: audioRuntime.graphicsRuntime,
  createPersistence: host.createPersistence,
  async onReady() {
    try {
      await callPlayerRuntimeBridge("player.ready", {});
    } catch (error) {
      console.warn(
        "Could not notify the Android player that startup finished.",
        error,
      );
    }
  },
});
