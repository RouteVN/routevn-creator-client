const requestResult = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const completed = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = transaction.onabort = () =>
      reject(transaction.error ?? new Error("Transaction aborted"));
  });
const bytesToText = (bytes) => {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
};
const textToBytes = (text) =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
export async function encodeIdbValue(value) {
  if (value === undefined) return ["undefined"];
  if (value === null) return ["null"];
  if (typeof File !== "undefined" && value instanceof File)
    return [
      "file",
      { name: value.name, type: value.type, lastModified: value.lastModified },
      bytesToText(new Uint8Array(await value.arrayBuffer())),
    ];
  if (value instanceof Blob)
    return [
      "blob",
      value.type,
      bytesToText(new Uint8Array(await value.arrayBuffer())),
    ];
  if (value instanceof ArrayBuffer)
    return ["buffer", bytesToText(new Uint8Array(value))];
  if (ArrayBuffer.isView(value))
    return [
      "view-buffer",
      {
        name: value.constructor.name,
        byteOffset: value.byteOffset,
        byteLength: value.byteLength,
      },
      bytesToText(new Uint8Array(value.buffer)),
    ];
  if (value instanceof Date) return ["date", value.toISOString()];
  if (Array.isArray(value))
    return [
      "array",
      value.length,
      await Promise.all(
        Object.entries(value).map(async ([key, item]) => [
          key,
          await encodeIdbValue(item),
        ]),
      ),
    ];
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype)
      throw new Error("Unsupported structured-clone type in fixture");
    return [
      "object",
      await Promise.all(
        Object.entries(value).map(async ([key, item]) => [
          key,
          await encodeIdbValue(item),
        ]),
      ),
    ];
  }
  if (typeof value === "number" && !Number.isFinite(value))
    return ["special-number", String(value)];
  if (Object.is(value, -0)) return ["special-number", "-0"];
  if (typeof value === "bigint") return ["bigint", value.toString()];
  return [typeof value, value];
}
export function decodeIdbValue([type, value, extra]) {
  switch (type) {
    case "undefined":
      return undefined;
    case "null":
      return null;
    case "blob":
      return new Blob([textToBytes(extra)], { type: value });
    case "file":
      return new File([textToBytes(extra)], value.name, {
        type: value.type,
        lastModified: value.lastModified,
      });
    case "bigint":
      return BigInt(value);
    case "buffer":
      return textToBytes(value).buffer;
    case "view":
    case "view-buffer": {
      const constructors = {
        Uint8Array,
        Uint8ClampedArray,
        Uint16Array,
        Uint32Array,
        Int8Array,
        Int16Array,
        Int32Array,
        Float32Array,
        Float64Array,
        DataView,
      };
      const name = type === "view" ? value : value.name;
      if (!Object.hasOwn(constructors, name))
        throw new Error(`Unsupported byte view ${name}`);
      const Constructor = constructors[name];
      if (type === "view") return new Constructor(textToBytes(extra).buffer);
      return new Constructor(
        textToBytes(extra).buffer,
        value.byteOffset,
        name === "DataView"
          ? value.byteLength
          : value.byteLength / Constructor.BYTES_PER_ELEMENT,
      );
    }
    case "date":
      return new Date(value);
    case "array": {
      const array = [];
      array.length = value;
      for (const [key, item] of extra)
        Object.defineProperty(array, key, {
          value: decodeIdbValue(item),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      return array;
    }
    case "object":
      return Object.fromEntries(
        value.map(([key, item]) => [key, decodeIdbValue(item)]),
      );
    case "special-number":
      return value === "-0" ? -0 : Number(value);
    case "string":
    case "number":
    case "boolean":
      return value;
    default:
      throw new Error(`Unknown fixture value type ${type}`);
  }
}

export async function dumpDatabases(names) {
  const dumps = [];
  for (const name of names) {
    const database = await requestResult(indexedDB.open(name));
    try {
      const stores = [];
      for (const storeName of database.objectStoreNames) {
        const transaction = database.transaction(storeName, "readonly");
        const done = completed(transaction);
        const store = transaction.objectStore(storeName);
        const schema = {
          name: storeName,
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement,
          indexes: [...store.indexNames].map((indexName) => {
            const index = store.index(indexName);
            return {
              name: index.name,
              keyPath: index.keyPath,
              unique: index.unique,
              multiEntry: index.multiEntry,
            };
          }),
        };
        const [keys, values] = await Promise.all([
          requestResult(store.getAllKeys()),
          requestResult(store.getAll()),
        ]);
        await done;
        schema.rows = await Promise.all(
          keys.map(async (key, index) => [
            await encodeIdbValue(key),
            await encodeIdbValue(values[index]),
          ]),
        );
        if (schema.autoIncrement) {
          // Reading the generator has no public API. Probe within an aborted
          // transaction so capture never mutates the old source database.
          const probe = database.transaction(storeName, "readwrite");
          const aborted = new Promise((resolve) => {
            probe.onabort = resolve;
          });
          schema.nextKey = await requestResult(
            probe.objectStore(storeName).add({}),
          );
          probe.abort();
          await aborted;
        }
        stores.push(schema);
      }
      dumps.push({ name, version: database.version, stores });
    } finally {
      database.close();
    }
  }
  return dumps;
}

export async function restoreDatabases(dumps) {
  for (const dump of dumps) {
    await requestResult(indexedDB.deleteDatabase(dump.name));
    const request = indexedDB.open(dump.name, dump.version);
    request.onupgradeneeded = () => {
      for (const schema of dump.stores) {
        const store = request.result.createObjectStore(schema.name, {
          keyPath: schema.keyPath,
          autoIncrement: schema.autoIncrement,
        });
        for (const index of schema.indexes)
          store.createIndex(index.name, index.keyPath, index);
      }
    };
    const database = await requestResult(request);
    try {
      for (const schema of dump.stores) {
        const decoded = schema.rows.map(([key, value]) => [
          decodeIdbValue(key),
          decodeIdbValue(value),
        ]);
        const transaction = database.transaction(schema.name, "readwrite");
        const done = completed(transaction);
        const store = transaction.objectStore(schema.name);
        let writeError;
        for (const [key, value] of decoded) {
          const request =
            schema.keyPath === null ? store.put(value, key) : store.put(value);
          request.onerror = () => {
            writeError = `${JSON.stringify(key)}: ${request.error?.name}: ${request.error?.message}`;
          };
        }
        if (schema.autoIncrement && schema.nextKey > 1) {
          const key = schema.nextKey - 1;
          if (!decoded.some(([existing]) => existing === key)) {
            const marker = {};
            if (schema.keyPath === null) store.put(marker, key);
            else {
              // Current project stores have flat key paths. Do not silently
              // corrupt a future nested schema; add explicit support first.
              if (
                typeof schema.keyPath !== "string" ||
                schema.keyPath.includes(".")
              )
                throw new Error("Unsupported generator key path");
              Object.defineProperty(marker, schema.keyPath, {
                value: key,
                enumerable: true,
              });
              store.put(marker);
            }
            store.delete(key);
          }
        }
        try {
          await done;
        } catch (error) {
          throw new Error(
            `Restoring ${dump.name}/${schema.name}: ${writeError ?? error.message}`,
            { cause: error },
          );
        }
      }
    } finally {
      database.close();
    }
  }
}
