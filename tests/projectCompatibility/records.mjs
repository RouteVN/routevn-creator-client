import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const fileHash = (path) => sha256(readFileSync(path));

// Ordered property entries preserve atlas frame enumeration. Type tags keep
// undefined, null, bytes, numeric keys and strings distinct in frozen oracles.
export const encodeValue = (value) => {
  if (value === undefined) return ["undefined"];
  if (value === null) return ["null"];
  if (ArrayBuffer.isView(value))
    return [
      "bytes",
      Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString(
        "base64",
      ),
    ];
  if (Array.isArray(value)) return ["array", value.map(encodeValue)];
  if (typeof value === "object")
    return [
      "object",
      Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)]),
    ];
  return [typeof value, value];
};

export function decodeValue([type, value]) {
  if (type === "undefined") return undefined;
  if (type === "null") return null;
  if (type === "array") return value.map(decodeValue);
  if (type === "object")
    return Object.fromEntries(
      value.map(([key, item]) => [key, decodeValue(item)]),
    );
  if (type === "bytes") return Uint8Array.from(Buffer.from(value, "base64"));
  if (["string", "number", "boolean"].includes(type)) return value;
  throw new Error(`Unknown native observation type ${type}`);
}

export function readSourceRecords(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const read = (table, order) => {
      const columns = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => row.name);
      if (columns.length === 0)
        throw new Error(`Missing source table ${table}`);
      const select = columns.flatMap((column) => [
        `"${column}"`,
        `typeof("${column}") AS "${column}__storage_type"`,
      ]);
      return db
        .prepare(`SELECT ${select.join(", ")} FROM ${table} ORDER BY ${order}`)
        .all()
        .map(encodeValue);
    };
    return {
      drafts: read("local_drafts", "draft_clock, id"),
      committed: read("committed_events", "committed_id"),
      checkpoints: read("materialized_view_state", "view_name, partition"),
      app: read("app_state", "key"),
    };
  } finally {
    db.close();
  }
}

export function firstDifference(expected, actual, path = "$") {
  if (Object.is(expected, actual)) return undefined;
  if (
    expected === null ||
    actual === null ||
    typeof expected !== "object" ||
    typeof actual !== "object"
  )
    return { path, expected, actual };
  if (Array.isArray(expected) !== Array.isArray(actual))
    return { path, expected, actual };
  const left = Object.keys(expected),
    right = Object.keys(actual);
  if (JSON.stringify(left) !== JSON.stringify(right))
    return { path: `${path}.[keys]`, expected: left, actual: right };
  for (const key of left) {
    const difference = firstDifference(
      expected[key],
      actual[key],
      `${path}.${key}`,
    );
    if (difference) return difference;
  }
}

export function assertEquivalent(expected, actual, context) {
  const difference = firstDifference(expected, actual);
  if (difference) {
    const error = new Error(
      `${context}: first difference at ${difference.path}`,
    );
    error.difference = difference;
    throw error;
  }
}

export function assertPreservedSourceRecords(
  before,
  after,
  context,
  { legacyCheckpointMetadata, recoveredSceneHistoryStats } = {},
) {
  assertEquivalent(before.drafts, after.drafts, `${context}: raw drafts`);
  assertEquivalent(before.app, after.app, `${context}: raw app rows`);
  assertEquivalent(
    before.committed,
    after.committed,
    `${context}: raw committed rows`,
  );
  const checkpointValues = (rows) =>
    new Map(
      rows.map(([, entries]) => {
        const fields = Object.fromEntries(entries);
        return [
          JSON.stringify([fields.view_name, fields.partition]),
          fields.value,
        ];
      }),
    );
  const current = checkpointValues(after.checkpoints);
  for (const [key, value] of checkpointValues(before.checkpoints)) {
    // The old reader refreshes scene checkpoint history counts after hydration.
    // Only this exact metadata transition is allowed; embedded data stays exact.
    if (
      recoveredSceneHistoryStats &&
      JSON.parse(key)[0][1] === "project_repository_scene_state" &&
      value[0] === "string" &&
      firstDifference(value, current.get(key))
    ) {
      const parsed = JSON.parse(value[1]);
      const envelope = parsed.__routevnCheckpoint;
      if (
        envelope?.version === 1 &&
        !firstDifference(
          recoveredSceneHistoryStats.before,
          envelope.meta?.historyStats,
        )
      ) {
        envelope.meta.historyStats = recoveredSceneHistoryStats.after;
        assertEquivalent(
          encodeValue(JSON.stringify(parsed)),
          current.get(key),
          `${context}: exact recovered scene checkpoint metadata ${key}`,
        );
        continue;
      }
    }
    if (
      legacyCheckpointMetadata &&
      value[0] === "string" &&
      firstDifference(value, current.get(key))
    ) {
      const parsed = JSON.parse(value[1]);
      const envelope = parsed.__routevnCheckpoint;
      if (envelope?.version === 1 && !Object.hasOwn(envelope, "meta")) {
        envelope.meta = legacyCheckpointMetadata;
        assertEquivalent(
          encodeValue(JSON.stringify(parsed)),
          current.get(key),
          `${context}: exact legacy checkpoint metadata normalization ${key}`,
        );
        continue;
      }
    }
    assertEquivalent(
      value,
      current.get(key),
      `${context}: recovery source ${key}`,
    );
  }
}
