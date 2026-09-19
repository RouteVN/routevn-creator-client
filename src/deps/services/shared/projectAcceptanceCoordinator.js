import {
  STRICT_COMMAND_ENVELOPE_VERSION,
  STRICT_MODEL_SCHEMA_VERSION,
} from "../../../internal/projectCompatibility.js";
import {
  commandDomainIdentity,
  decodeCommandEnvelope,
  encodeCommandEnvelope,
  readCommandEnvelopeVersion,
} from "./collab/commandCodec.js";
import {
  digestProjectRecords,
  orderProjectHistory,
} from "./projectAuthority.js";

const failure = (code, message, details = {}) => ({
  valid: false,
  error: { code, message, details },
});
const throwFailure = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};
const ordered = orderProjectHistory;
const rows = (history) => [...history.committed, ...history.drafts];
const sameCommand = (a, b) =>
  commandDomainIdentity(a) === commandDomainIdentity(b);
const encoder = new TextEncoder();
const assertDataArray = (value) => {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > 16_384 ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    throwFailure(
      "invalid_command_batch",
      "Command batches must contain at most 16384 data entries",
    );
  for (let index = 0; index < value.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(value, String(index));
    if (!entry?.enumerable || !Object.hasOwn(entry, "value"))
      throwFailure(
        "invalid_command_batch",
        "Command batches must not contain empty slots or accessors",
      );
  }
};
const assertMetadata = (value, maxBytes = 16_384) => {
  let bytes = 0;
  const ancestors = new Set();
  const pending = [{ value, depth: 0 }];
  while (pending.length) {
    const entry = pending.pop();
    if (entry.leave) {
      ancestors.delete(entry.value);
      continue;
    }
    const item = entry.value;
    if (
      item === null ||
      ["string", "number", "boolean"].includes(typeof item)
    ) {
      if (typeof item === "number" && !Number.isFinite(item))
        throwFailure(
          "invalid_command_metadata",
          "Command metadata must contain finite numbers",
        );
      if (typeof item === "string" && item.length > maxBytes)
        throwFailure(
          "command_input_limit",
          "Command input exceeds the byte limit",
        );
      bytes += encoder.encode(JSON.stringify(item)).length;
    } else if (item && typeof item === "object") {
      const array = Array.isArray(item);
      if (
        entry.depth > 128 ||
        ancestors.has(item) ||
        !(array
          ? Object.getPrototypeOf(item) === Array.prototype
          : [Object.prototype, null].includes(Object.getPrototypeOf(item)))
      )
        throwFailure(
          "invalid_command_metadata",
          "Command metadata must be bounded JSON data",
        );
      const keys = Reflect.ownKeys(item).filter(
        (key) => !(array && key === "length"),
      );
      if (keys.length > 16384 || (array && keys.length !== item.length))
        throwFailure(
          "command_input_limit",
          "Command metadata exceeds the container limit",
        );
      ancestors.add(item);
      pending.push({ value: item, leave: true });
      bytes += 2 + Math.max(0, keys.length - 1);
      for (const [index, key] of keys.entries()) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (
          typeof key !== "string" ||
          !descriptor.enumerable ||
          !Object.hasOwn(descriptor, "value") ||
          (array && key !== String(index))
        )
          throwFailure(
            "invalid_command_metadata",
            "Command metadata must contain only JSON data properties",
          );
        if (key.length > 1024)
          throwFailure(
            "command_input_limit",
            "Command metadata key exceeds its limit",
          );
        if (!array) bytes += encoder.encode(JSON.stringify(key)).length + 1;
        pending.push({ value: descriptor.value, depth: entry.depth + 1 });
      }
    } else
      throwFailure(
        "invalid_command_metadata",
        "Command metadata must contain JSON values",
      );
    if (bytes > maxBytes)
      throwFailure(
        "command_input_limit",
        "Command input exceeds the byte limit",
      );
  }
};

// The repository service creates one coordinator per canonical storage key.
// All callbacks are local operations; network work runs after this queue exits.
export const createProjectAcceptanceCoordinator = ({
  storageKey,
  projectId,
  actor,
  generateId,
  now,
  withLock,
  isCurrent,
  readHistory,
  readCursor,
  resolveState,
  validateCommand,
  validatePayload,
  validateHistory = async () => {},
  persistDrafts,
  persistCommittedBatch,
  persistSubmitResult,
  publish,
  onRefresh = async () => {},
  bootstrap = false,
}) => {
  if (typeof withLock !== "function") {
    throw new Error("Project acceptance requires platform coordination");
  }
  let tail = Promise.resolve();
  let paused = false;
  let closed = false;
  const enqueue = (operation) => {
    const pending = tail.then(() => withLock(storageKey, operation));
    tail = pending.catch(() => {});
    return pending;
  };
  const refresh = async () => {
    const history = ordered(await readHistory());
    const state = await resolveState(history);
    await onRefresh({ history, state });
    return { history, state };
  };
  const publishStored = async () => {
    const actual = await refresh();
    await publish(actual);
    return actual;
  };
  const checkContext = () => {
    if (closed || !isCurrent()) {
      throwFailure(
        "stale_project_context",
        "The selected project changed before saving",
      );
    }
    if (paused) {
      throwFailure(
        "write_outcome_unknown",
        "Reconcile stored project changes before saving again",
      );
    }
  };
  const reconcile = async (attempted, writeError) => {
    let actual;
    try {
      actual = await publishStored();
    } catch (error) {
      paused = true;
      return failure(
        "write_outcome_unknown",
        "The save outcome could not be determined",
        {
          attemptedIds: attempted.map((record) => record.id),
          causeCode: error.code,
        },
      );
    }
    const byId = new Map(
      rows(actual.history).map((record) => [record.id, record]),
    );
    const persistedIds = [];
    const unpersistedIds = [];
    let gap = false;
    for (const record of attempted) {
      const stored = byId.get(record.id);
      if (!stored) {
        gap = true;
        unpersistedIds.push(record.id);
        continue;
      }
      if (!sameCommand(record, stored)) {
        paused = true;
        return failure(
          "command_identity_conflict",
          "A command identity has different stored content",
          { commandId: record.id },
        );
      }
      if (gap) {
        paused = true;
        return failure(
          "write_reconciliation_failed",
          "Stored commands do not form the attempted prefix",
          { attemptedIds: attempted.map((entry) => entry.id) },
        );
      }
      persistedIds.push(record.id);
    }
    if (unpersistedIds.length === 0) {
      return {
        valid: true,
        commandIds: persistedIds,
        repositoryState: actual.state,
        acceptedByCoordinator: true,
      };
    }
    return failure(
      persistedIds.length ? "partial_write" : "write_failed",
      persistedIds.length
        ? "Only part of the change was saved"
        : "The change was not saved",
      { persistedIds, unpersistedIds, causeCode: writeError?.code },
    );
  };
  const prepare = (requests, author) => {
    assertDataArray(requests);
    const ids = new Set();
    let bytes = 2;
    return requests.map((request, index) => {
      if (
        !request ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(request))
      ) {
        throwFailure(
          "invalid_command_request",
          "Each command request must be an object",
        );
      }
      const allowed = new Set(["id", "type", "payload", "partition"]);
      for (const key of Reflect.ownKeys(request)) {
        const property = Object.getOwnPropertyDescriptor(request, key);
        if (
          !allowed.has(key) ||
          !property.enumerable ||
          !Object.hasOwn(property, "value")
        ) {
          throwFailure(
            "invalid_command_request",
            "Command requests accept only id, type, payload and partition",
          );
        }
      }
      const command = {
        id: request.id ?? generateId(),
        projectId,
        actor: author,
        clientTs: now(),
        type: request.type,
        payload: request.payload,
        partition: request.partition,
        schemaVersion: STRICT_COMMAND_ENVELOPE_VERSION,
        modelSchemaVersion: STRICT_MODEL_SCHEMA_VERSION,
      };
      for (const field of ["id", "type", "partition"]) {
        if (typeof command[field] !== "string" || !command[field].length) {
          throwFailure(
            "invalid_command_request",
            `Command ${field} is required`,
          );
        }
      }
      const result = validatePayload(command);
      if (!result.valid) {
        const error = new Error(result.error.message);
        Object.assign(error, result.error);
        throw error;
      }
      if (ids.has(command.id))
        throwFailure(
          "command_identity_conflict",
          "A command batch contains duplicate identities",
        );
      ids.add(command.id);
      const record = encodeCommandEnvelope(command);
      const outer = { ...record };
      delete outer.payload;
      assertMetadata(outer);
      bytes += encoder.encode(JSON.stringify(record)).length + (index ? 1 : 0);
      if (bytes > 67_108_864)
        throwFailure(
          "command_input_limit",
          "Command batch exceeds the byte limit",
        );
      // Validation precedes cloning/serialization of domain values.
      return structuredClone(command);
    });
  };
  const submit = async (requests, { actor: author = actor } = {}) => {
    let commands;
    try {
      commands = prepare(requests, author);
    } catch (error) {
      return failure(
        error.code ?? "validation_failed",
        error.message,
        error.details,
      );
    }
    return enqueue(async () => {
      try {
        checkContext();
        const { history, state } = await refresh();
        checkContext();
        if (
          bootstrap &&
          (commands.length !== 1 ||
            commands[0].type !== "project.create" ||
            rows(history).length !== 0)
        ) {
          return failure(
            "project_storage_not_empty",
            "Project initialization requires empty project history",
          );
        }
        if (
          !bootstrap &&
          commands.some((command) => command.type === "project.create")
        ) {
          return failure(
            "invalid_command_request",
            "Project creation is only available during initialization",
          );
        }
        let next = state;
        let work = 0;
        const existing = new Map(rows(history).map((row) => [row.id, row]));
        const records = [];
        const attempted = [];
        for (const command of commands) {
          const record = encodeCommandEnvelope(command);
          attempted.push(record);
          const stored = existing.get(record.id);
          if (stored) {
            if (!sameCommand(record, stored))
              return failure(
                "command_identity_conflict",
                "A command identity has different stored content",
                { commandId: record.id },
              );
            continue;
          }
          const result = validateCommand({ state: next, command });
          if (!result.valid) return result;
          work += result.validationWork ?? 0;
          if (work > 16_000_000)
            return failure(
              "command_input_limit",
              "Command batch exceeds the validation work limit",
            );
          next = result.state;
          records.push({ ...record, createdAt: command.clientTs });
        }
        checkContext();
        if (records.length) {
          const firstClock = history.drafts.at(-1)?.draftClock ?? 0;
          await validateHistory({
            committed: history.committed,
            drafts: [
              ...history.drafts,
              ...records.map((record, index) => ({
                ...record,
                draftClock: firstClock + index + 1,
              })),
            ],
          });
        }
        checkContext();
        let writeError;
        try {
          if (records.length) await persistDrafts(records);
        } catch (error) {
          writeError = error;
        }
        const result = await reconcile(attempted, writeError);
        if (!result.valid) {
          // Keep authored identities and the unsaved payloads available in the
          // service result / session error. A retry must not mint new IDs.
          result.error.details.retryRequests = commands.map(
            ({ id, type, payload, partition }) => ({
              id,
              type,
              payload: structuredClone(payload),
              partition,
            }),
          );
        }
        return result;
      } catch (error) {
        return failure(
          error.code ?? "command_acceptance_failed",
          error.message,
          error.details,
        );
      }
    });
  };
  const ingest = (operation) =>
    enqueue(async () => {
      checkContext();
      const current = await refresh();
      const candidate = ordered(await operation.plan(current.history));
      await resolveState(candidate, { maxValidationWork: 16_000_000 });
      checkContext();
      let writeError;
      try {
        await operation.persist();
      } catch (error) {
        writeError = error;
      }
      let actual;
      try {
        actual = await refresh();
      } catch {
        paused = true;
        throwFailure(
          "write_outcome_unknown",
          "The synchronization outcome could not be determined",
        );
      }
      if (
        digestProjectRecords(actual.history) === digestProjectRecords(candidate)
      ) {
        await publish(actual);
        return;
      }
      // An atomic promotion/rejection either persisted or did not. A batch may
      // persist a prefix; every unchanged row must retain its previous identity.
      const keyed = (history) =>
        new Map([
          ...history.committed.map((row) => [
            row.id,
            JSON.stringify([
              "committed",
              row.committedId,
              commandDomainIdentity(row),
            ]),
          ]),
          ...history.drafts.map((row) => [
            row.id,
            JSON.stringify([
              "draft",
              row.draftClock,
              commandDomainIdentity(row),
            ]),
          ]),
        ]);
      const before = keyed(current.history),
        after = keyed(candidate),
        stored = keyed(actual.history);
      const changed = operation.ids.filter(
        (id, index, ids) =>
          ids.indexOf(id) === index && before.get(id) !== after.get(id),
      );
      const affected = new Set(changed);
      let gap = false,
        invalid = false,
        persisted = 0;
      for (const id of changed) {
        if (stored.get(id) === after.get(id)) {
          if (gap) invalid = true;
          persisted++;
        } else if (stored.get(id) === before.get(id)) gap = true;
        else invalid = true;
      }
      for (const id of new Set([...before.keys(), ...stored.keys()])) {
        if (!affected.has(id) && before.get(id) !== stored.get(id))
          invalid = true;
      }
      if (invalid) {
        paused = true;
        throwFailure(
          "write_reconciliation_failed",
          "Stored synchronization changes do not match the attempted prefix",
        );
      }
      await publish(actual);
      const error = new Error(
        persisted
          ? "Only part of the synchronization was saved"
          : "The synchronization was not saved",
      );
      error.code = persisted ? "partial_write" : "write_failed";
      error.cause = writeError;
      throw error;
    });
  const prepareIncoming = (events) => {
    assertDataArray(events);
    let bytes = 2;
    for (const event of events) {
      if (
        !event ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(event))
      )
        throwFailure(
          "invalid_committed_event",
          "Committed events must be objects",
        );
      const outer = {};
      for (const key of Reflect.ownKeys(event)) {
        const descriptor = Object.getOwnPropertyDescriptor(event, key);
        if (
          typeof key !== "string" ||
          !descriptor.enumerable ||
          !Object.hasOwn(descriptor, "value") ||
          ["rawSchemaVersion", "modelSchemaVersion", "__proto__"].includes(key)
        )
          throwFailure(
            "invalid_committed_event",
            "Received event metadata must not override storage or model versions",
          );
        if (key !== "payload") outer[key] = descriptor.value;
      }
      assertMetadata(outer);
      for (const field of ["id", "partition", "type"]) {
        if (typeof event[field] !== "string" || !event[field])
          throwFailure(
            "invalid_committed_event",
            `Committed event ${field} is required`,
          );
      }
      if (event.projectId !== undefined && event.projectId !== projectId)
        throwFailure(
          "invalid_committed_event",
          "Committed event belongs to a different project",
        );
      const command = decodeCommandEnvelope(event);
      if (command.schemaVersion === 2) {
        const validation = validatePayload(command);
        if (!validation.valid) {
          const error = new Error(validation.error.message);
          Object.assign(error, validation.error);
          throw error;
        }
      } else assertMetadata(command.payload, 8_388_608);
      bytes += encoder.encode(JSON.stringify(event)).length + 1;
      if (bytes > 67_108_864)
        throwFailure(
          "command_input_limit",
          "Incoming batch exceeds the byte limit",
        );
    }
    return structuredClone(events);
  };
  return {
    submit,
    applyCommittedBatch: async ({ events: inputEvents, nextCursor }) => {
      const events = prepareIncoming(inputEvents);
      if (
        nextCursor !== undefined &&
        (!Number.isSafeInteger(nextCursor) || nextCursor < 0)
      )
        throwFailure(
          "invalid_committed_cursor",
          "Committed cursor must be a nonnegative safe integer",
        );
      return ingest({
        ids: events.map((event) => event.id),
        plan: async (history) => {
          const byId = new Map(rows(history).map((row) => [row.id, row]));
          const committed = new Map(
            history.committed.map((row) => [row.id, row]),
          );
          for (const event of events) {
            const version = readCommandEnvelopeVersion(event);
            const existing = byId.get(event.id);
            if (version === 1 && !existing)
              throwFailure(
                "unversioned_live_command",
                "Unseen live commands must use the current schema",
              );
            if (existing && !sameCommand(existing, event))
              throwFailure(
                "command_identity_conflict",
                "Received command differs from its stored identity",
              );
            const existingCommit = committed.get(event.id);
            if (
              existingCommit &&
              existingCommit.committedId !== event.committedId
            )
              throwFailure(
                "command_identity_conflict",
                "Received command has a conflicting committed order",
              );
            if (
              !Number.isSafeInteger(event.committedId) ||
              event.committedId <= 0
            )
              throwFailure(
                "invalid_committed_order",
                "Committed command order must be a positive safe integer",
              );
            committed.set(event.id, event);
            byId.set(event.id, event);
          }
          const values = [...committed.values()];
          if (
            new Set(values.map((event) => event.committedId)).size !==
            values.length
          )
            throwFailure(
              "invalid_committed_order",
              "Two commands have the same committed order",
            );
          const latestCommittedId = values.reduce(
            (latest, event) => Math.max(latest, event.committedId),
            0,
          );
          const cursor = Math.max(
            readCursor ? await readCursor() : 0,
            history.committed.at(-1)?.committedId ?? 0,
          );
          if (
            nextCursor === undefined &&
            events.some(
              (event) =>
                !history.committed.some((known) => known.id === event.id) &&
                event.committedId > cursor + 1,
            )
          )
            throwFailure(
              "missing_committed_history",
              "Fetch the missing committed range before accepting this broadcast",
            );
          if (nextCursor !== undefined && nextCursor > latestCommittedId)
            throwFailure(
              "missing_committed_history",
              "Fetch missing committed history before advancing the cursor",
            );
          return {
            committed: values,
            drafts: history.drafts.filter((draft) => !committed.has(draft.id)),
          };
        },
        persist: () => persistCommittedBatch({ events, nextCursor }),
      });
    },
    applySubmitResult: async ({ result: inputResult }) => {
      assertMetadata(inputResult);
      const result = structuredClone(inputResult);
      if (
        !result ||
        typeof result !== "object" ||
        Array.isArray(result) ||
        typeof result.id !== "string" ||
        !result.id ||
        !["committed", "rejected", "not_processed"].includes(result.status)
      )
        throwFailure(
          "invalid_submit_result",
          "Unsupported command acknowledgment",
        );
      const allowed =
        result.status === "committed"
          ? ["id", "status", "committedId", "serverTs"]
          : ["id", "status", "reason", "errors", "created", "blockedById"];
      if (
        Object.keys(result).some((key) => !allowed.includes(key)) ||
        (result.status === "committed" &&
          (!Number.isSafeInteger(result.serverTs) || result.serverTs < 0))
      )
        throwFailure(
          "invalid_submit_result",
          "Invalid command acknowledgment metadata",
        );
      return ingest({
        ids: [result.id],
        plan: async (history) => {
          const draft = history.drafts.find(
            (record) => record.id === result.id,
          );
          const known = history.committed.find(
            (record) => record.id === result.id,
          );
          if (result.status === "not_processed") {
            if (!draft)
              throwFailure(
                "invalid_submit_result",
                "Acknowledgment has no matching draft",
              );
            return history;
          }
          if (!draft) {
            if (
              !known ||
              result.status !== "committed" ||
              known.committedId !== result.committedId
            )
              throwFailure(
                "invalid_submit_result",
                "Acknowledgment has no matching command",
              );
            return history;
          }
          const committed = [...history.committed];
          if (result.status === "committed") {
            if (
              !Number.isSafeInteger(result.committedId) ||
              result.committedId <= 0 ||
              committed.some(
                (record) => record.committedId === result.committedId,
              )
            )
              throwFailure(
                "invalid_committed_order",
                "Acknowledgment has an invalid committed order",
              );
            const cursor = Math.max(
              readCursor ? await readCursor() : 0,
              history.committed.at(-1)?.committedId ?? 0,
            );
            if (result.committedId > cursor + 1)
              throwFailure(
                "missing_committed_history",
                "Fetch the missing committed range before promoting this draft",
              );
            committed.push({
              ...draft,
              committedId: result.committedId,
              serverTs: result.serverTs,
            });
          }
          return {
            committed,
            drafts: history.drafts.filter((record) => record.id !== result.id),
          };
        },
        persist: () =>
          result.status === "not_processed"
            ? undefined
            : persistSubmitResult({ result }),
      });
    },
    reconcile: () =>
      enqueue(async () => {
        const actual = await publishStored();
        paused = false;
        return actual;
      }),
    close: async () => {
      closed = true;
      await tail;
    },
    isPaused: () => paused,
  };
};
