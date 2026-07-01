import { base64ToUint8Array, callAndroidBridge } from "./bridge.js";
import {
  getNavigationTimingNow,
  logAndroidBridgeTiming,
} from "../../../internal/navigationTiming.js";

const isByteNumber = (value) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 255;

const toUint8Array = (value) => {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (Array.isArray(value) && value.every(isByteNumber)) {
    return Uint8Array.from(value);
  }

  if (
    value &&
    typeof value === "object" &&
    Array.isArray(value.data) &&
    value.data.every(isByteNumber)
  ) {
    return Uint8Array.from(value.data);
  }

  return undefined;
};

const normalizeSqlArg = (value) => {
  const bytes = toUint8Array(value);
  if (bytes) {
    return {
      __routevn_sql_type: "bytes",
      data: [...bytes],
    };
  }

  return value;
};

const normalizeSqlResultValue = (value) => {
  if (
    value &&
    typeof value === "object" &&
    value.__routevn_sql_type === "bytes" &&
    typeof value.base64 === "string"
  ) {
    return base64ToUint8Array(value.base64);
  }

  return value;
};

const normalizeSqlResultRow = (row = {}) => {
  const normalizedRow = {};
  for (const [key, value] of Object.entries(row)) {
    normalizedRow[key] = normalizeSqlResultValue(value);
  }
  return normalizedRow;
};

const normalizeSqlResultRows = (rows) => {
  return Array.isArray(rows) ? rows.map(normalizeSqlResultRow) : rows;
};

export const createAndroidSqliteConnection = ({ dbPath }) => {
  if (!dbPath) {
    throw new Error("dbPath is required for Android SQLite.");
  }

  const normalizeArgs = (args = []) =>
    Array.isArray(args) ? args.map(normalizeSqlArg) : [];

  return {
    async init() {
      callAndroidBridge("sqliteOpen", { dbPath });
    },

    async select(sql, args = []) {
      const startedAt = getNavigationTimingNow();
      let ok = false;
      let resultSize;
      try {
        const rows = callAndroidBridge("sqliteQuery", {
          dbPath,
          sql,
          args: normalizeArgs(args),
        });
        const normalizedRows = normalizeSqlResultRows(rows);
        resultSize = Array.isArray(normalizedRows)
          ? normalizedRows.length
          : undefined;
        ok = true;
        return normalizedRows;
      } finally {
        logAndroidBridgeTiming({
          method: "sqlite.select.total",
          durationMs: getNavigationTimingNow() - startedAt,
          resultSize,
          ok,
        });
      }
    },

    async execute(sql, args = []) {
      return callAndroidBridge("sqliteExec", {
        dbPath,
        sql,
        args: normalizeArgs(args),
      });
    },

    async close() {
      callAndroidBridge("sqliteClose", { dbPath });
    },
  };
};
