import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  commandDomainIdentity,
  decodeCommandEnvelope,
} from "./collab/commandCodec.js";
import {
  loadCommittedEventsFromClientStore,
  loadDraftEventsFromClientStore,
} from "./collab/clientStoreHistory.js";

const encoder = new TextEncoder();
export const orderProjectHistory = ({ committed, drafts }) => ({
  committed: [...committed].sort((a, b) => a.committedId - b.committedId),
  drafts: [...drafts].sort(
    (a, b) =>
      a.draftClock - b.draftClock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  ),
});

export const readProjectHistory = async (store) =>
  orderProjectHistory({
    committed: await loadCommittedEventsFromClientStore(store),
    drafts: await loadDraftEventsFromClientStore(store),
  });

export const projectHistoryStats = ({ committed, drafts }) => ({
  committedCount: committed.length,
  latestCommittedId: committed.at(-1)?.committedId ?? 0,
  draftCount: drafts.length,
  latestDraftClock: drafts.at(-1)?.draftClock ?? 0,
});

// Hash length-delimited records incrementally. Payload dictionary order matters
// (for example atlas frame indices); storage wrapper property order does not.
export const digestProjectRecords = (history) => {
  const hash = sha256.create();
  const length = new Uint8Array(8);
  const view = new DataView(length.buffer);
  for (const [kind, records] of [
    ["committed", history.committed],
    ["draft", history.drafts],
  ]) {
    for (const record of records) {
      const bytes = encoder.encode(
        JSON.stringify([
          kind,
          kind === "committed" ? record.committedId : record.draftClock,
          commandDomainIdentity(record),
        ]),
      );
      view.setBigUint64(0, BigInt(bytes.length));
      hash.update(length).update(bytes);
    }
  }
  return bytesToHex(hash.digest());
};

// Legacy normalization can produce own undefined properties. Preserve both the
// property and its enumeration position through JSON-backed disposable caches.
export const encodeProjectCacheValue = (value) => {
  const root = { value: structuredClone(value) };
  const undefinedPaths = [];
  const pending = [{ parent: root, key: "value", path: [] }];
  while (pending.length) {
    const { parent, key, path } = pending.pop();
    const entry = parent[key];
    if (entry === undefined) {
      parent[key] = null;
      undefinedPaths.push(path);
    } else if (entry && typeof entry === "object") {
      for (const child of Object.keys(entry).reverse())
        pending.push({ parent: entry, key: child, path: [...path, child] });
    }
  }
  return { value: root.value, undefinedPaths };
};
export const decodeProjectCacheValue = (encoded) => {
  const root = { value: structuredClone(encoded.value) };
  for (const path of encoded.undefinedPaths) {
    let parent = root;
    const keys = ["value", ...path];
    for (const key of keys.slice(0, -1)) {
      if (!parent || !Object.hasOwn(parent, key))
        throw new Error("Invalid cache path");
      parent = parent[key];
    }
    const key = keys.at(-1);
    if (!parent || !Object.hasOwn(parent, key) || parent[key] !== null)
      throw new Error("Invalid cache marker");
    Object.defineProperty(parent, key, {
      value: undefined,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return root.value;
};
export const digestProjectValue = (value) =>
  bytesToHex(
    sha256(encoder.encode(JSON.stringify(encodeProjectCacheValue(value)))),
  );

export const projectHistoryPrefix = (history, count) => ({
  committed: history.committed.slice(0, count),
  drafts: history.drafts.slice(
    0,
    Math.max(0, count - history.committed.length),
  ),
});

// The legacy resolver is the existing reader, operating on a read-only history
// snapshot. Its recovered projection is authoritative for that legacy prefix.
// A strict failure is never passed back to it for recovery or skipped as a draft.
export const createProjectAuthority = ({
  storageKey,
  projectId,
  resolveLegacy,
  createInitialState,
  processCommand,
  validatePayload,
  loadCache = async () => undefined,
  yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0)),
}) => {
  let cached;
  let recoveryPrefix;
  return {
    async resolve(sourceHistory, { maxValidationWork = Infinity } = {}) {
      const history = orderProjectHistory(sourceHistory);
      const records = [...history.committed, ...history.drafts];
      if (
        recoveryPrefix &&
        digestProjectRecords(
          projectHistoryPrefix(history, recoveryPrefix.count),
        ) !== recoveryPrefix.digest
      ) {
        const error = new Error(
          "The original checkpoint recovery prefix must remain intact",
        );
        error.code = "recovery_source_changed";
        throw error;
      }
      const decoded = [];
      let firstStrict = records.length;
      for (const [index, record] of records.entries()) {
        const command = decodeCommandEnvelope(record);
        if (command.schemaVersion === 2) {
          firstStrict = Math.min(firstStrict, index);
          const validation = validatePayload(command);
          if (!validation.valid) {
            const error = new Error(validation.error.message);
            Object.assign(error, validation.error);
            throw error;
          }
        }
        decoded.push(command);
      }
      const frontier = {
        storageKey,
        projectId,
        ...projectHistoryStats(history),
        digest: digestProjectRecords(history),
      };
      if (cached?.frontier.digest === frontier.digest)
        return structuredClone(cached);

      let state;
      let legacyPrefix;
      let replayFrom = firstStrict;
      const cachedCount = cached
        ? cached.frontier.committedCount + cached.frontier.draftCount
        : 0;
      const extendsCached =
        cachedCount > 0 &&
        firstStrict < cachedCount &&
        records.length > cachedCount &&
        digestProjectRecords(projectHistoryPrefix(history, cachedCount)) ===
          cached.frontier.digest;
      if (extendsCached) {
        state = structuredClone(cached.state);
        legacyPrefix = cached.legacyPrefix;
        replayFrom = cachedCount;
      } else if (firstStrict > 0) {
        const prefix = projectHistoryPrefix(history, firstStrict);
        const resolved = await resolveLegacy(prefix, {
          completeHistory: firstStrict === records.length,
        });
        state = resolved.state;
        legacyPrefix = {
          count: firstStrict,
          digest: digestProjectRecords(prefix),
        };
        if (resolved.recovery) {
          legacyPrefix.recoverySourceDigest = resolved.recoverySourceDigest;
          recoveryPrefix = { count: firstStrict, digest: legacyPrefix.digest };
        }
      } else {
        state = createInitialState();
      }
      if (!extendsCached && firstStrict < records.length) {
        const warm = await loadCache({ frontier, legacyPrefix });
        if (warm) {
          cached = warm;
          return structuredClone(cached);
        }
      }
      let validationWork = 0;
      for (let index = replayFrom; index < records.length; index++) {
        const result = processCommand({ state, command: decoded[index] });
        if (!result.valid) {
          const error = new Error(result.error.message);
          Object.assign(error, result.error);
          error.details = {
            ...result.error.details,
            commandId: records[index].id,
            commandIndex: index,
          };
          throw error;
        }
        validationWork += result.validationWork ?? 0;
        if (validationWork > maxValidationWork) {
          const error = new Error(
            "Command batch exceeds the validation work limit",
          );
          error.code = "command_work_limit";
          throw error;
        }
        state = result.state;
        if ((index - replayFrom + 1) % 128 === 0) await yieldToUi();
      }
      cached = { state, frontier, legacyPrefix };
      return structuredClone(cached);
    },
    invalidate() {
      cached = undefined;
    },
  };
};
