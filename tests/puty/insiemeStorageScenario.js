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
import { applyCommandToRepositoryState } from "../../src/deps/services/shared/projectRepository.js";
import {
  createInMemoryServerTransport,
  parseToken,
  sleep,
} from "../../scripts/collabTestSupport.js";

const DEFAULT_PROJECT_NAME = "Puty Storage Test";
const DEFAULT_PROJECT_DESCRIPTION = "Puty sqlite sync store scenario";

const asNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const uniqueStrings = (values = []) => [
  ...new Set(
    values.filter((value) => typeof value === "string" && value.length > 0),
  ),
];

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
  { includeCreated = false, includeCommandVersionMeta = false } = {},
) => {
  const rows = database
    .prepare(
      `
        SELECT
          committed_id,
          id,
          project_id,
          user_id,
          partitions,
          type,
          payload,
          meta,
          created
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
      partitions: JSON.parse(row.partitions),
      type: row.type,
      payload: JSON.parse(row.payload),
      meta: JSON.parse(row.meta),
    };

    if (!includeCommandVersionMeta && event.meta?.commandVersion === 1) {
      delete event.meta.commandVersion;
    }

    if (includeCreated) {
      event.created = row.created;
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
      commandVersion: command.commandVersion ?? 1,
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

const buildSessionPartitions = (scenario, commands) => {
  if (
    Array.isArray(scenario.sessionPartitions) &&
    scenario.sessionPartitions.length > 0
  ) {
    return uniqueStrings(scenario.sessionPartitions);
  }

  return uniqueStrings(commands.flatMap((command) => command.partitions || []));
};

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
    includeCommandVersionMeta: input.includeCommandVersionMeta === true,
    sessionPartitions: buildSessionPartitions(input, commands),
    clock: createClock(input.clock),
  };
};

const createServer = ({ projectId, store, clock }) => {
  const projectStates = new Map();

  const createInitialRepositoryState = (nextProjectId) => ({
    project: { id: nextProjectId, name: "", description: "" },
    story: { initialSceneId: "" },
    scenes: { items: {}, tree: [] },
    images: { items: {}, tree: [] },
    tweens: { items: {}, tree: [] },
    sounds: { items: {}, tree: [] },
    videos: { items: {}, tree: [] },
    characters: { items: {}, tree: [] },
    fonts: { items: {}, tree: [] },
    transforms: { items: {}, tree: [] },
    colors: { items: {}, tree: [] },
    typography: { items: {}, tree: [] },
    variables: { items: {}, tree: [] },
    components: { items: {}, tree: [] },
    layouts: { items: {}, tree: [] },
    model_version: 2,
  });

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
      authorizePartitions: async (_identity, partitions) => {
        if (!Array.isArray(partitions) || partitions.length === 0) return false;
        return partitions.every((partition) =>
          partition.startsWith(`project:${projectId}:`),
        );
      },
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
          createInitialRepositoryState(command.projectId);
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
    partitions: scenario.sessionPartitions,
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
      includeCommandVersionMeta: scenario.includeCommandVersionMeta,
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
