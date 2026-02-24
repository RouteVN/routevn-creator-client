import { createSyncServer, createSqliteSyncStore } from "insieme";
import { processCommand } from "../../src/domain/v2/engine.js";
import { createEmptyProjectState } from "../../src/domain/v2/model.js";
import { validateCommand } from "../../src/domain/v2/validateCommand.js";
import { validateEventPayload } from "../../src/deps/infra/domainStructure/validation.js";

let Database;
try {
  // Optional dependency for local bootstrap.
  ({ default: Database } = await import("better-sqlite3"));
} catch {
  throw new Error(
    "better-sqlite3 is required to run start-sync-server.js (npm i -D better-sqlite3)",
  );
}

const dbPath = process.env.ROUTEVN_SYNC_DB || "./routevn-sync.db";
const db = new Database(dbPath);

const store = createSqliteSyncStore(db, {
  applyPragmas: true,
  journalMode: "WAL",
  synchronous: "FULL",
  busyTimeoutMs: 5000,
});

await store.init();

const parseProjectIdFromPartitions = (partitions = []) => {
  const first = partitions[0] || "";
  // Expected partition format: project:{projectId}:{scope}
  const parts = first.split(":");
  return parts.length >= 3 ? parts[1] : null;
};

const projectStates = new Map();

const ensureProjectState = (projectId) => {
  if (!projectStates.has(projectId)) {
    projectStates.set(
      projectId,
      createEmptyProjectState({
        projectId,
      }),
    );
  }
  return projectStates.get(projectId);
};

const commandFromItem = (item) => {
  const payload = item?.event?.payload || {};
  const partitions = Array.isArray(item?.partitions) ? item.partitions : [];
  return {
    id: payload.commandId || item.id,
    projectId: payload.projectId || parseProjectIdFromPartitions(partitions),
    partition: partitions[0],
    partitions,
    type: payload.schema,
    payload: payload.data,
    commandVersion: payload.commandVersion,
    actor: payload.actor,
    clientTs: payload.clientTs,
  };
};

const server = createSyncServer({
  auth: {
    verifyToken: async (token) => {
      // Replace with real auth provider.
      // Demo token: "user:<userId>:client:<clientId>"
      const chunks = String(token || "").split(":");
      if (chunks.length < 4 || chunks[0] !== "user" || chunks[2] !== "client") {
        throw new Error("invalid token");
      }
      return {
        clientId: chunks[3],
        claims: {
          userId: chunks[1],
        },
      };
    },
  },
  authz: {
    authorizePartitions: async (identity, partitions) => {
      // Replace with project membership ACL check.
      const projectId = parseProjectIdFromPartitions(partitions);
      return Boolean(identity?.claims?.userId && projectId);
    },
  },
  validation: {
    validate: async (item) => {
      if (!item?.event || item.event.type !== "event") {
        const error = new Error("invalid event");
        error.code = "validation_failed";
        throw error;
      }

      const command = commandFromItem(item);
      if (!command.projectId) {
        const error = new Error("missing projectId");
        error.code = "validation_failed";
        throw error;
      }

      if (command.type === "legacy.event.apply") {
        const legacyEvent = command?.payload?.event;
        if (!legacyEvent || typeof legacyEvent !== "object") {
          const error = new Error("legacy command missing event payload");
          error.code = "validation_failed";
          throw error;
        }
        validateEventPayload(legacyEvent.type, legacyEvent.payload);
        return;
      }

      validateCommand(command);
      const currentState = ensureProjectState(command.projectId);
      const { state: nextState } = processCommand({
        state: currentState,
        command,
      });
      projectStates.set(command.projectId, nextState);
    },
  },
  store,
  clock: {
    now: () => Date.now(),
  },
  limits: {
    maxInboundMessagesPerWindow: 200,
    rateWindowMs: 1000,
    maxEnvelopeBytes: 256 * 1024,
    closeOnRateLimit: true,
    closeOnOversize: true,
  },
  logger: (entry) => {
    console.log(JSON.stringify(entry));
  },
});

console.log(
  "RouteVN V2 sync server runtime initialized. Integrate with websocket gateway to attach connections.",
);

export { server };
