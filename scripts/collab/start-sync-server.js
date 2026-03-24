import { createSyncServer, createSqliteSyncStore } from "insieme/server";
import { validateCommandSubmitItem } from "insieme/client";
import { committedEventToCommand } from "../../src/deps/services/shared/collab/mappers.js";
import {
  applyCommandToRepositoryState,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";

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

const projectStates = new Map();

const ensureProjectState = (projectId) => {
  if (!projectStates.has(projectId)) {
    projectStates.set(projectId, structuredClone(initialProjectData));
  }
  return projectStates.get(projectId);
};

const commandFromItem = (item) => {
  validateCommandSubmitItem(item);
  const command = committedEventToCommand(item);
  if (!command) {
    throw new Error("failed to convert normalized submit item to command");
  }
  return command;
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
    authorizeProject: async (identity, projectId) => {
      // Replace with project membership ACL check.
      return Boolean(identity?.claims?.userId && projectId);
    },
  },
  validation: {
    validate: async (item) => {
      const command = commandFromItem(item);
      if (!command.projectId) {
        const error = new Error("missing projectId");
        error.code = "validation_failed";
        throw error;
      }

      const currentState = ensureProjectState(command.projectId);
      const applyResult = applyCommandToRepositoryState({
        repositoryState: currentState,
        command,
        projectId: command.projectId,
      });
      if (!applyResult.valid) {
        const error = new Error(
          applyResult.error?.message || "command validation failed",
        );
        error.code = applyResult.error?.code || "validation_failed";
        error.details = applyResult.error?.details ?? {};
        throw error;
      }
      projectStates.set(command.projectId, applyResult.repositoryState);
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
  "RouteVN sync server runtime initialized. Integrate with websocket gateway to attach connections.",
);

export { server };
