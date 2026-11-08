import { createAndroidAudioRuntime } from "./audioRuntime.js";
import { createPlayerRuntimePersistenceHost } from "../shared/playerRuntimePersistenceHost.js";
import {
  callPlayerRuntimeBridge,
  createPlayerRuntimeDb,
} from "./playerRuntimeDb.js";

const host = createPlayerRuntimePersistenceHost({
  createDatabase: createPlayerRuntimeDb,
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
