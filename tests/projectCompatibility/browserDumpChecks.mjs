import { dumpDatabases, restoreDatabases } from "./indexedDbDump.mjs";

// Exercise the capture transport itself before trusting it as a storage oracle.
export async function verifyBrowserDump() {
  const name = "compatibility-dump-self-test";
  const request = indexedDB.open(name, 3);
  request.onupgradeneeded = () => {
    const auto = request.result.createObjectStore("auto", {
      keyPath: "id",
      autoIncrement: true,
    });
    auto.createIndex("group", "group", { unique: false });
    request.result.createObjectStore("values");
  };
  const database = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const buffer = Uint8Array.from([9, 1, 2, 8]).buffer;
  const sparse = [];
  sparse.length = 3;
  sparse[1] = undefined;
  const data = {
    absent: {},
    explicit: { value: undefined },
    empty: null,
    sparse,
    ordered: { second: 2, first: 1 },
    buffer,
    view: new Uint8Array(buffer, 1, 2),
    dataView: new DataView(buffer, 1, 2),
    blob: new Blob([buffer], { type: "application/octet-stream" }),
    file: new File([buffer], "asset-one.bin", {
      type: "application/octet-stream",
      lastModified: 1000,
    }),
    date: new Date(1000),
    special: [NaN, Infinity, -Infinity, -0],
    integer: 123n,
    ownData: JSON.parse('{"__proto__":{"literal":true}}'),
  };
  try {
    const transaction = database.transaction(["auto", "values"], "readwrite");
    const done = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = transaction.onerror = () =>
        reject(transaction.error);
    });
    transaction.objectStore("auto").put({ id: 1, group: "one" });
    transaction.objectStore("auto").put({ id: 42, group: "removed" });
    transaction.objectStore("auto").delete(42);
    transaction.objectStore("values").put(data, ["one", 2]);
    await done;
  } finally {
    database.close();
  }
  const expected = await dumpDatabases([name]);
  if (expected[0].stores.find((store) => store.name === "auto").nextKey !== 43)
    throw new Error("Dump failed to preserve the advanced key generator");
  await restoreDatabases(expected);
  const actual = await dumpDatabases([name]);
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error(
      "IndexedDB dump round trip lost typed values, order, schema or generator state",
    );
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}
