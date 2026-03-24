import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { validateCommandSubmitItem } from "insieme/client";
import { createSqliteSyncStore, createSyncServer } from "insieme/server";
import {
  committedEventToCommand,
  createCommandEnvelope,
  createProjectCollabService,
} from "../../src/deps/services/shared/collab/index.js";
import {
  applyCommandToRepositoryState,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";
import {
  createInMemoryServerTransport,
  parseToken,
  sleep,
} from "../../scripts/collabTestSupport.js";

const DEFAULT_PROJECT_NAME = "Puty Storage Test";
const DEFAULT_PROJECT_DESCRIPTION = "Puty sqlite sync store scenario";

const asNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const createClock = ({ start = 1000, step = 1 } = {}) => {
  let current = start;
  return {
    now() {
      const value = current;
      current += step;
      return value;
    },
  };
};

const readStoredEvents = (
  database,
  { includeCreated = false } = {},
) => {
  const rows = database
    .prepare(
      `
        SELECT
          committed_id,
          id,
          project_id,
          user_id,
          partition,
          schema_version,
          type,
          payload,
          client_ts,
          server_ts,
          created_at
        FROM committed_events
        ORDER BY committed_id ASC
      `,
    )
    .all();

  return rows.map((row) => {
    const event = {
      committedId: row.committed_id,
      id: row.id,
      projectId: row.project_id || undefined,
      userId: row.user_id || undefined,
      partition: row.partition,
      schemaVersion: row.schema_version,
      type: row.type,
      payload: JSON.parse(row.payload),
      meta: {
        clientTs: row.client_ts,
      },
    };

    if (includeCreated) {
      event.createdAt = row.created_at;
    }

    return event;
  });
};

const buildCommands = (scenario, commands = []) => {
  const actor = scenario.actor;
  const baseClientTs = Number.isFinite(scenario.clientTsStart)
    ? scenario.clientTsStart
    : 1;

  return commands.map((command, index) =>
    createCommandEnvelope({
      projectId: command.projectId ?? scenario.projectId,
      actor: command.actor ?? actor,
      clientTs: command.clientTs ?? baseClientTs + index,
      ...command,
    }),
  );
};

const buildCommandBatches = (input, actor) => {
  if (Array.isArray(input?.batches) && input.batches.length > 0) {
    return input.batches.map((batch) => {
      const commands = Array.isArray(batch?.commands) ? batch.commands : [];
      if (commands.length === 0) {
        throw new Error(
          "each scenario batch must include a non-empty commands array",
        );
      }
      return buildCommands(
        {
          ...input,
          actor,
          clientTsStart: batch.clientTsStart ?? input.clientTsStart,
        },
        commands,
      );
    });
  }

  if (Array.isArray(input?.commands) && input.commands.length > 0) {
    return [buildCommands({ ...input, actor }, input.commands)];
  }

  throw new Error("scenario.commands or scenario.batches must be provided");
};

const flattenCommandBatches = (commandBatches) => commandBatches.flat();

const buildScenario = (input) => {
  const actor = input?.actor;
  if (!actor?.userId || !actor?.clientId) {
    throw new Error(
      "scenario.actor.userId and scenario.actor.clientId are required",
    );
  }

  const commandBatches = buildCommandBatches(input, actor);
  const commands = flattenCommandBatches(commandBatches);
  const projectId = input.projectId ?? commands[0]?.projectId;
  if (!projectId) {
    throw new Error("scenario.projectId is required");
  }

  return {
    actor,
    commandBatches,
    projectId,
    projectName: asNonEmptyString(input.projectName) ?? DEFAULT_PROJECT_NAME,
    projectDescription:
      asNonEmptyString(input.projectDescription) ?? DEFAULT_PROJECT_DESCRIPTION,
    token:
      asNonEmptyString(input.token) ??
      `user:${actor.userId}:client:${actor.clientId}`,
    connectionId:
      asNonEmptyString(input.connectionId) ?? `${projectId}-puty-connection`,
    timeoutMs: Number.isFinite(input.timeoutMs) ? input.timeoutMs : 1000,
    settleMs: Number.isFinite(input.settleMs) ? input.settleMs : 30,
    includeCreated: input.includeCreated === true,
    clock: createClock(input.clock),
  };
};

const createServer = ({ projectId, store, clock }) => {
  const projectStates = new Map();

  return createSyncServer({
    auth: {
      verifyToken: async (token) => {
        const identity = parseToken(token);
        return {
          clientId: identity.clientId,
          claims: { userId: identity.userId },
        };
      },
    },
    authz: {
      authorizeProject: async (_identity, requestedProjectId) =>
        requestedProjectId === projectId,
    },
    validation: {
      validate: async (item) => {
        validateCommandSubmitItem(item);
        const command = committedEventToCommand(item);
        if (!command) {
          throw new Error(
            "failed to convert normalized submit item to command",
          );
        }
        const currentState =
          projectStates.get(command.projectId) ||
          structuredClone(initialProjectData);
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
    clock,
  });
};

export const runInsiemeStorageScenario = async (input) => {
  const scenario = buildScenario(input);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "routevn-puty-"));
  const databasePath =
    asNonEmptyString(input.databasePath) ??
    path.join(tempDir, "insieme-sync-store.sqlite");
  const sqlite = new Database(databasePath);
  const store = createSqliteSyncStore(sqlite);
  const server = createServer({
    projectId: scenario.projectId,
    store,
    clock: scenario.clock,
  });
  const collab = createProjectCollabService({
    projectId: scenario.projectId,
    projectName: scenario.projectName,
    projectDescription: scenario.projectDescription,
    token: scenario.token,
    actor: scenario.actor,
    transport: createInMemoryServerTransport({
      server,
      connectionId: scenario.connectionId,
    }),
  });

  try {
    await collab.start();

    for (const batch of scenario.commandBatches) {
      for (const command of batch) {
        await collab.submitCommand(command);
        await collab.flushDrafts();
        await collab.syncNow({ timeoutMs: scenario.timeoutMs });
        await sleep(scenario.settleMs);
      }
    }

    const storedEvents = readStoredEvents(sqlite, {
      includeCreated: scenario.includeCreated,
    });

    return {
      storedEvents,
    };
  } finally {
    try {
      await collab.stop();
    } catch {}

    try {
      await server.shutdown();
    } catch {}

    sqlite.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};
