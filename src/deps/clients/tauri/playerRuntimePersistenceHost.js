import { createDb } from "./db.js";
import { createPlayerRuntimePersistenceHost as createSharedPlayerRuntimePersistenceHost } from "../shared/playerRuntimePersistenceHost.js";

export const createPlayerRuntimePersistenceHost = ({
  createDatabase = createDb,
} = {}) => createSharedPlayerRuntimePersistenceHost({ createDatabase });

globalThis.__ROUTEVN_PLAYER_HOST__ = Object.freeze(
  createPlayerRuntimePersistenceHost(),
);
